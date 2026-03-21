/**
 * Build field-level mappings by tracing connector paths via BFS.
 *
 * Handles multi-hop transformation chains (source → SQ → transform → ... → target).
 * Uses INSTANCE TYPE within each mapping for proper source/target classification.
 * Expression-aware port resolution ensures only referenced input ports produce
 * edges to output ports (Phase 9), eliminating false source attributions.
 * Traces through mapplet internals (Phase 8) for accurate lineage classification.
 * Extracts filter conditions from all known filter locations (Phase 4).
 * Handles non-source-originated fields like Sequence Generators (Phase 2).
 *
 * Lineage types: DIRECT_PASS_THROUGH, EXPRESSION_DERIVED, LOOKUP_RETURN,
 * LOOKUP_DERIVED, MAPLET_OUTPUT, PARAMETER_DRIVEN, CONSTANT,
 * SEQUENCE_GENERATED, CUSTOM_TRANSFORMATION_OUTPUT, UNKNOWN.
 *
 * Deduplicates using Set-based key tracking.
 *
 * @param {object} data - Parsed XML result
 * @returns {Array} Field mapping records
 */
export function buildFieldMappings(data) {
  const mappings = [];
  const seen = new Set();

  // Definition lookups
  const sourceDefs = new Map(data.sources.map((s) => [s.name, s]));
  const targetDefs = new Map(data.targets.map((t) => [t.name, t]));
  const mappletDefs = new Map((data.mapplets || []).map((m) => [m.name, m]));

  data.mappings.forEach((mapping) => {
    // Build instance lookup for this mapping
    const instanceMap = new Map();
    (mapping.instances || []).forEach((inst) => {
      instanceMap.set(inst.name, inst);
    });

    // Build transformation definition lookup for expression resolution
    const xformDefs = new Map();
    (mapping.transformations || []).forEach((t) => {
      xformDefs.set(t.name, t);
    });

    function isSourceInstance(name) {
      const inst = instanceMap.get(name);
      if (inst) {
        const t = (inst.type || "").toLowerCase();
        return t.includes("source definition") || t === "source";
      }
      return sourceDefs.has(name);
    }

    function isTargetInstance(name) {
      const inst = instanceMap.get(name);
      if (inst) {
        const t = (inst.type || "").toLowerCase();
        return t.includes("target definition") || t === "target";
      }
      return targetDefs.has(name);
    }

    function isMappletInstance(name) {
      const inst = instanceMap.get(name);
      return inst ? (inst.type || "").toLowerCase() === "mapplet" : false;
    }

    function getDefName(instanceName) {
      const inst = instanceMap.get(instanceName);
      return inst?.transformationName || instanceName;
    }

    function getXformDef(instanceName) {
      const inst = instanceMap.get(instanceName);
      const defName = inst?.transformationName || instanceName;
      return xformDefs.get(defName) || xformDefs.get(instanceName);
    }

    // ── Build forward adjacency: (instance\0field) → [{instance, field}] ──
    const adj = new Map();
    mapping.connectors.forEach((c) => {
      if (!c.fromInstance || !c.toInstance) return;
      const key = `${c.fromInstance}\0${c.fromField}`;
      if (!adj.has(key)) adj.set(key, []);
      adj.get(key).push({ instance: c.toInstance, field: c.toField });
    });

    // ── Instance output ports: instance → Set<fromField> ──
    const instanceOutPorts = new Map();
    mapping.connectors.forEach((c) => {
      if (!c.fromInstance) return;
      if (!instanceOutPorts.has(c.fromInstance))
        instanceOutPorts.set(c.fromInstance, new Set());
      instanceOutPorts.get(c.fromInstance).add(c.fromField);
    });

    // ── Instance input ports: instance → Set<toField> ──
    const instanceInPorts = new Map();
    mapping.connectors.forEach((c) => {
      if (!c.toInstance) return;
      if (!instanceInPorts.has(c.toInstance))
        instanceInPorts.set(c.toInstance, new Set());
      instanceInPorts.get(c.toInstance).add(c.toField);
    });

    // ── Source starting points ──
    const sourceStarts = new Set();
    mapping.connectors.forEach((c) => {
      if (isSourceInstance(c.fromInstance)) {
        sourceStarts.add(`${c.fromInstance}\0${c.fromField}`);
      }
    });

    // ── Phase 2: Generator instances (output but no input, e.g. Sequence Generator) ──
    const generatorStarts = new Set();
    const allInstWithOutput = new Set();
    const allInstWithInput = new Set();
    mapping.connectors.forEach((c) => {
      if (c.fromInstance) allInstWithOutput.add(c.fromInstance);
      if (c.toInstance) allInstWithInput.add(c.toInstance);
    });
    for (const instName of allInstWithOutput) {
      if (allInstWithInput.has(instName)) continue;
      if (isSourceInstance(instName)) continue;
      if (isTargetInstance(instName)) continue;
      mapping.connectors.forEach((c) => {
        if (c.fromInstance === instName) {
          generatorStarts.add(`${instName}\0${c.fromField}`);
        }
      });
    }

    // ── Phase 9: Expression-aware output port resolution ──
    function getReachableOutputPorts(instanceName, inputField) {
      const xformDef = getXformDef(instanceName);
      const outPorts = instanceOutPorts.get(instanceName) || new Set();

      if (!xformDef || outPorts.size === 0) {
        // No definition — fall back to direct adjacency only
        return [{ port: inputField, expression: "", isDirectMatch: true, portDef: null }];
      }

      const type = (xformDef.type || "").toLowerCase();
      const reachable = [];

      for (const op of outPorts) {
        // Same name = pass-through or combined INPUT/OUTPUT port
        if (op === inputField) {
          const portDef = xformDef.fields.find((f) => f.name === op);
          reachable.push({ port: op, expression: portDef?.expression || "", isDirectMatch: true, portDef });
          continue;
        }

        // Different name — look up the OUTPUT port definition
        const portDef =
          xformDef.fields.find((f) => f.name === op && (f.porttype || "").includes("OUTPUT")) ||
          xformDef.fields.find((f) => f.name === op);
        if (!portDef) continue;

        const expr = (portDef.expression || "").trim();

        // For types that return values without input-referencing expressions
        // (Lookup returns, Joiner outputs, Aggregator, Sorter, etc.)
        if (!expr) {
          if (
            type.includes("lookup") ||
            type === "mapplet" ||
            type.includes("joiner") ||
            type.includes("sorter") ||
            type.includes("rank") ||
            type.includes("aggregator") ||
            type.includes("normalizer") ||
            type.includes("union") ||
            type.includes("custom") ||
            type.includes("stored procedure") ||
            type.includes("router")
          ) {
            reachable.push({ port: op, expression: "", isDirectMatch: false, portDef });
          }
          continue;
        }

        // Skip pure constants — these will be reached by generator BFS if needed
        if (/^'[^']*'$/.test(expr) || /^\d+(\.\d+)?$/.test(expr.replace(/\s/g, ""))) {
          continue;
        }

        // Check if expression references the input field by name
        const escaped = inputField.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const fieldPattern = new RegExp(`\\b${escaped}\\b`, "i");
        if (fieldPattern.test(expr)) {
          reachable.push({ port: op, expression: expr, isDirectMatch: false, portDef });
          continue;
        }

        // Expression references other ports, not this one — skip
      }

      // Fallback: if nothing reachable for special types, allow all outputs
      if (reachable.length === 0) {
        if (
          type.includes("lookup") ||
          type === "mapplet" ||
          type.includes("custom") ||
          type.includes("stored procedure")
        ) {
          for (const op of outPorts) {
            if (op === inputField) continue;
            const portDef = xformDef.fields.find((f) => f.name === op);
            reachable.push({ port: op, expression: portDef?.expression || "", isDirectMatch: false, portDef });
          }
        }
      }

      return reachable;
    }

    // ── Phase 8: Mapplet internal tracing ──
    function traceMappletInternals(mappletInstanceName, inputField, outputPort) {
      const inst = instanceMap.get(mappletInstanceName);
      const mpltDefName = inst?.transformationName || mappletInstanceName;
      const mpltDef = mappletDefs.get(mpltDefName) || mappletDefs.get(mappletInstanceName);

      if (!mpltDef) return [];

      // Build internal adjacency from mapplet's connectors
      const mAdj = new Map();
      (mpltDef.connectors || []).forEach((c) => {
        if (!c.fromInstance || !c.toInstance) return;
        const key = `${c.fromInstance}\0${c.fromField}`;
        if (!mAdj.has(key)) mAdj.set(key, []);
        mAdj.get(key).push({ instance: c.toInstance, field: c.toField });
      });

      // Internal transform/instance lookups
      const mXformDefs = new Map();
      (mpltDef.transformations || []).forEach((t) => {
        mXformDefs.set(t.name, t);
      });
      const mInstanceMap = new Map();
      (mpltDef.instances || []).forEach((mi) => {
        mInstanceMap.set(mi.name, mi);
      });

      // Internal output ports per instance
      const mOutPorts = new Map();
      (mpltDef.connectors || []).forEach((c) => {
        if (!c.fromInstance) return;
        if (!mOutPorts.has(c.fromInstance)) mOutPorts.set(c.fromInstance, new Set());
        mOutPorts.get(c.fromInstance).add(c.fromField);
      });

      // Find starting points in the mapplet that relate to inputField or outputPort
      const startKeys = new Set();
      (mpltDef.connectors || []).forEach((c) => {
        if (c.fromField === inputField || c.fromField === outputPort) {
          startKeys.add(`${c.fromInstance}\0${c.fromField}`);
        }
      });

      // BFS through mapplet internals
      const bestSteps = [];
      const queue = [];
      const visited = new Set();
      startKeys.forEach((sk) => {
        const [si, sf] = sk.split("\0");
        queue.push({ instance: si, field: sf, steps: [] });
      });

      let safety = 0;
      while (queue.length > 0 && safety < 500) {
        safety++;
        const { instance, field, steps } = queue.shift();
        const vk = `${instance}\0${field}`;
        if (visited.has(vk)) continue;
        visited.add(vk);

        // Get downstream neighbors
        const neighbors = mAdj.get(vk) || [];

        // Also check other output ports of this instance (same intra-instance fix)
        const outPs = mOutPorts.get(instance) || new Set();
        const allNeighbors = [...neighbors];
        for (const op of outPs) {
          if (op === field) continue;
          const extra = mAdj.get(`${instance}\0${op}`) || [];
          extra.forEach((n) => {
            if (!allNeighbors.some((x) => x.instance === n.instance && x.field === n.field)) {
              allNeighbors.push(n);
            }
          });
        }

        if (allNeighbors.length === 0 && steps.length > 0) {
          bestSteps.push(...steps);
          continue;
        }

        const mInst = mInstanceMap.get(instance);
        const isInput = (mInst?.type || "").toLowerCase().includes("input");

        allNeighbors.forEach((next) => {
          if (isInput) {
            queue.push({ instance: next.instance, field: next.field, steps });
          } else {
            const mDefName = mInst?.transformationName || instance;
            const mXf = mXformDefs.get(mDefName) || mXformDefs.get(instance);
            const port = mXf?.fields?.find((f) => f.name === field || f.name === next.field);

            const step = {
              instance,
              type: mXf?.type || mInst?.type || "",
              inputField: field,
              outputField: next.field,
              expression: port?.expression || "",
              porttype: port?.porttype || "",
              datatype: port?.datatype || "",
              hasSqlOverride: (mXf?.tableAttributes || []).some(
                (a) => a.name === "Sql Query" && a.value
              ),
            };
            queue.push({ instance: next.instance, field: next.field, steps: [...steps, step] });
          }
        });
      }

      return bestSteps;
    }

    // ── Phase 4: Extract filters from a transformation definition ──
    function extractFilters(xformDef) {
      if (!xformDef) return [];
      const filters = [];
      const filterAttrNames = [
        "Filter Condition",
        "Source Filter",
        "Sql Query",
        "Lookup Sql Override",
        "Lookup Source Filter",
        "Join Condition",
      ];
      (xformDef.tableAttributes || []).forEach((a) => {
        if (filterAttrNames.includes(a.name) && a.value) {
          filters.push({ type: a.name, value: a.value });
        }
      });
      // Phase 10: Router group conditions
      if (xformDef.groups) {
        xformDef.groups.forEach((g) => {
          if (g.expression && g.expression !== "TRUE") {
            filters.push({ type: `Router Group: ${g.name}`, value: g.expression });
          }
        });
      }
      return filters;
    }

    // ── Core BFS (shared between source-originated and generator-originated) ──
    function runBFS(startKey, isGenerator) {
      const [startInstance, startField] = startKey.split("\0");

      let srcDef;
      if (isGenerator) {
        const inst = instanceMap.get(startInstance);
        srcDef = {
          name: startInstance,
          dbdName: "",
          ownerName: "",
          databaseType: inst?.type || "Generator",
        };
      } else {
        const srcDefName = getDefName(startInstance);
        srcDef = sourceDefs.get(srcDefName) || sourceDefs.get(startInstance);
        if (!srcDef) return;
      }

      const queue = [{ instance: startInstance, field: startField, path: [], steps: [] }];
      const visited = new Set();
      let safety = 0;

      while (queue.length > 0 && safety < 10000) {
        safety++;
        const { instance, field, path, steps } = queue.shift();
        const visitKey = `${instance}\0${field}`;
        if (visited.has(visitKey)) continue;
        visited.add(visitKey);

        // ── Reached a target instance ──
        if (isTargetInstance(instance) && instance !== startInstance) {
          const tgtDefName = getDefName(instance);
          const tgtDef = targetDefs.get(tgtDefName) || targetDefs.get(instance);
          if (tgtDef) {
            const dedupKey = `${mapping.name}\0${srcDef.name}\0${startField}\0${tgtDef.name}\0${field}`;
            if (!seen.has(dedupKey)) {
              seen.add(dedupKey);
              mappings.push({
                mappingName: mapping.name,
                sourceTable: srcDef.name,
                sourceField: startField,
                sourceDB: srcDef.dbdName || srcDef.databaseType,
                sourceOwner: srcDef.ownerName,
                targetTable: tgtDef.name,
                targetField: field,
                targetDB: tgtDef.dbdName || tgtDef.databaseType,
                targetOwner: tgtDef.ownerName,
                transformation: path.length > 0 ? path.join(" → ") : "Direct",
                transformationSteps: steps,
                lineageType: classifyLineage(steps),
                isGeneratorOrigin: isGenerator || false,
              });
            }
          }
          continue;
        }

        // ── Source / generator origin: follow adj directly ──
        if (isSourceInstance(instance) || (isGenerator && instance === startInstance)) {
          const neighbors = adj.get(`${instance}\0${field}`) || [];
          neighbors.forEach((next) => {
            queue.push({ instance: next.instance, field: next.field, path, steps });
          });
          continue;
        }

        // ── Transformation instance: resolve output ports and follow ──
        const inst = instanceMap.get(instance);
        const xformDef = getXformDef(instance);
        const type = xformDef?.type || inst?.type || "";
        const filters = extractFilters(xformDef);
        const isMapplet = isMappletInstance(instance);

        // Phase 9: Get reachable output ports from this input port
        const reachablePorts = getReachableOutputPorts(instance, field);
        const processedDownstream = new Set();

        for (const rp of reachablePorts) {
          const downstream = adj.get(`${instance}\0${rp.port}`) || [];

          downstream.forEach((next) => {
            const dKey = `${next.instance}\0${next.field}`;
            if (processedDownstream.has(dKey)) return;
            processedDownstream.add(dKey);

            let step = {
              instance,
              type,
              inputField: field,
              outputField: rp.port,
              expression: rp.expression || rp.portDef?.expression || "",
              porttype: rp.portDef?.porttype || "",
              datatype: rp.portDef?.datatype || "",
              hasSqlOverride: (xformDef?.tableAttributes || []).some(
                (a) => a.name === "Sql Query" && a.value
              ),
              filters: filters.length > 0 ? filters : undefined,
            };

            // Phase 8: Mapplet internal tracing
            if (isMapplet) {
              const mappletSteps = traceMappletInternals(instance, field, rp.port);
              if (mappletSteps.length > 0) {
                step.mappletSteps = mappletSteps;
              }
            }

            // Phase 10: Router group condition on the specific output port
            if (xformDef?.groups && rp.portDef?.group) {
              const group = xformDef.groups.find((g) => g.name === rp.portDef.group);
              if (group && group.expression) {
                step.routerCondition = group.expression;
              }
            }

            queue.push({
              instance: next.instance,
              field: next.field,
              path: [...path, instance],
              steps: [...steps, step],
            });
          });
        }

        // Fallback: if no reachable output ports matched, try direct adjacency
        if (processedDownstream.size === 0) {
          const directNeighbors = adj.get(`${instance}\0${field}`) || [];
          directNeighbors.forEach((next) => {
            const dKey = `${next.instance}\0${next.field}`;
            if (processedDownstream.has(dKey)) return;
            processedDownstream.add(dKey);

            const portDef = xformDef?.fields?.find((f) => f.name === field);

            const step = {
              instance,
              type,
              inputField: field,
              outputField: field,
              expression: portDef?.expression || "",
              porttype: portDef?.porttype || "",
              datatype: portDef?.datatype || "",
              hasSqlOverride: false,
              filters: filters.length > 0 ? filters : undefined,
            };

            if (isMapplet) {
              const mappletSteps = traceMappletInternals(instance, field, field);
              if (mappletSteps.length > 0) {
                step.mappletSteps = mappletSteps;
              }
            }

            queue.push({
              instance: next.instance,
              field: next.field,
              path: [...path, instance],
              steps: [...steps, step],
            });
          });
        }
      }
    }

    // Run BFS from all source fields
    sourceStarts.forEach((startKey) => runBFS(startKey, false));

    // Phase 2: Run BFS from all generator instances
    generatorStarts.forEach((startKey) => runBFS(startKey, true));
  });

  return mappings;
}

/**
 * Classify the lineage type for a field mapping based on its transformation steps.
 *
 * Categories (priority order):
 *   SEQUENCE_GENERATED — from Sequence Generator transformation
 *   PARAMETER_DRIVEN — expression references $$parameters
 *   LOOKUP_RETURN — field returned by Lookup, no further expression derivation
 *   LOOKUP_DERIVED — Lookup in chain AND expression derivation present
 *   MAPLET_OUTPUT — passes through Mapplet (internal tracing couldn't resolve further)
 *   CONSTANT — expression is a literal string or number
 *   CUSTOM_TRANSFORMATION_OUTPUT — from Custom/Stored Proc transformation
 *   EXPRESSION_DERIVED — output from expression/calculation
 *   UNKNOWN — can't determine (e.g., SQL override on Source Qualifier)
 *   DIRECT_PASS_THROUGH — field flows unchanged through all hops
 */
function classifyLineage(steps) {
  if (steps.length === 0) return "DIRECT_PASS_THROUGH";

  // Flatten: include mapplet internal steps for classification
  const allSteps = [];
  for (const step of steps) {
    allSteps.push(step);
    if (step.mappletSteps) {
      allSteps.push(...step.mappletSteps);
    }
  }

  let hasSequence = false;
  let hasCustom = false;
  let hasParameter = false;
  let hasConstant = false;
  let hasDerived = false;
  let hasSqlOverride = false;
  let hasLookup = false;
  let hasMappletOpaque = false; // Mapplet with no internal resolution

  for (const step of allSteps) {
    const expr = (step.expression || "").trim();
    const type = (step.type || "").toLowerCase();

    if (type.includes("sequence generator")) hasSequence = true;
    if (type.includes("custom transformation") || type.includes("stored procedure"))
      hasCustom = true;
    if (type.includes("lookup")) hasLookup = true;
    // Only flag as opaque mapplet if we couldn't trace inside
    if (type === "mapplet" && !step.mappletSteps) hasMappletOpaque = true;
    if (step.hasSqlOverride) hasSqlOverride = true;

    if (expr && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(expr)) {
      // Expression contains logic beyond a simple field reference
      if (/\$\$\w/.test(expr)) hasParameter = true;
      else if (/^'[^']*'$/.test(expr) || /^\d+(\.\d+)?$/.test(expr.replace(/\s/g, "")))
        hasConstant = true;
      else hasDerived = true;
    }
  }

  // Priority: most specific classification wins
  if (hasSequence) return "SEQUENCE_GENERATED";
  if (hasParameter) return "PARAMETER_DRIVEN";
  if (hasLookup && !hasDerived) return "LOOKUP_RETURN";
  if (hasLookup && hasDerived) return "LOOKUP_DERIVED";
  if (hasMappletOpaque) return "MAPLET_OUTPUT";
  if (hasConstant && !hasDerived) return "CONSTANT";
  if (hasCustom && !hasDerived) return "CUSTOM_TRANSFORMATION_OUTPUT";
  if (hasDerived) return "EXPRESSION_DERIVED";
  if (hasSqlOverride) return "UNKNOWN";
  return "DIRECT_PASS_THROUGH";
}
