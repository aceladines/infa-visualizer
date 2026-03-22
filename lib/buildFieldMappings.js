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
 * SEQUENCE_GENERATED, CUSTOM_TRANSFORMATION_OUTPUT, NOT_USED_FOR_TARGET,
 * INVALID_FANOUT, UNKNOWN.
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

  // Global transformation definitions (collected from all mappings and mapplets by parseXml)
  // Used as fallback when a reusable transformation isn't defined inside the MAPPING element
  const globalXformDefs = new Map((data.transformations || []).map((t) => [t.name, t]));

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
      return xformDefs.get(defName) || xformDefs.get(instanceName)
        || globalXformDefs.get(defName) || globalXformDefs.get(instanceName);
    }

    // ── Build forward adjacency: (instance\0field) → [{instance, field}] ──
    const adj = new Map();
    (mapping.connectors || []).forEach((c) => {
      if (!c.fromInstance || !c.toInstance) return;
      const key = `${c.fromInstance}\0${c.fromField}`;
      if (!adj.has(key)) adj.set(key, []);
      adj.get(key).push({ instance: c.toInstance, field: c.toField });
    });

    // ── Reverse adjacency: (instance\0field) → [{instance, field}] (for backward validation) ──
    const revAdj = new Map();
    (mapping.connectors || []).forEach((c) => {
      if (!c.fromInstance || !c.toInstance) return;
      const key = `${c.toInstance}\0${c.toField}`;
      if (!revAdj.has(key)) revAdj.set(key, []);
      revAdj.get(key).push({ instance: c.fromInstance, field: c.fromField });
    });

    // ── Instance output ports: instance → Set<fromField> ──
    const instanceOutPorts = new Map();
    (mapping.connectors || []).forEach((c) => {
      if (!c.fromInstance) return;
      if (!instanceOutPorts.has(c.fromInstance))
        instanceOutPorts.set(c.fromInstance, new Set());
      instanceOutPorts.get(c.fromInstance).add(c.fromField);
    });

    // ── Instance input ports: instance → Set<toField> ──
    const instanceInPorts = new Map();
    (mapping.connectors || []).forEach((c) => {
      if (!c.toInstance) return;
      if (!instanceInPorts.has(c.toInstance))
        instanceInPorts.set(c.toInstance, new Set());
      instanceInPorts.get(c.toInstance).add(c.toField);
    });

    // ── Source starting points ──
    const sourceStarts = new Set();
    (mapping.connectors || []).forEach((c) => {
      if (isSourceInstance(c.fromInstance)) {
        sourceStarts.add(`${c.fromInstance}\0${c.fromField}`);
      }
    });

    // ── Phase 2: Generator instances (output but no input, e.g. Sequence Generator) ──
    const generatorStarts = new Set();
    const allInstWithOutput = new Set();
    const allInstWithInput = new Set();
    (mapping.connectors || []).forEach((c) => {
      if (c.fromInstance) allInstWithOutput.add(c.fromInstance);
      if (c.toInstance) allInstWithInput.add(c.toInstance);
    });
    for (const instName of allInstWithOutput) {
      if (allInstWithInput.has(instName)) continue;
      if (isSourceInstance(instName)) continue;
      if (isTargetInstance(instName)) continue;
      (mapping.connectors || []).forEach((c) => {
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

      // ── Sorter: lineage-transparent, only same-name pass-through ──
      if (type.includes("sorter")) {
        if (outPorts.has(inputField)) {
          const portDef = xformDef.fields.find((f) => f.name === inputField);
          reachable.push({ port: inputField, expression: "", isDirectMatch: true, portDef });
        }
        return reachable;
      }

      // ── Joiner: same-name pass-through + prefix-stripped alignment ──
      // Joiners merge rows from Master/Detail but pass fields through unchanged.
      // Do not broadcast all joiner inputs to all downstream targets.
      if (type.includes("joiner")) {
        if (outPorts.has(inputField)) {
          const portDef = xformDef.fields.find((f) => f.name === inputField);
          reachable.push({ port: inputField, expression: "", isDirectMatch: true, portDef });
        }
        // Also check for output ports matching after stripping Master/Detail prefixes
        for (const op of outPorts) {
          if (op === inputField) continue;
          const portDef = xformDef.fields.find(
            (f) => f.name === op && (f.porttype || "").includes("OUTPUT")
          );
          if (!portDef) continue;
          const inputBase = inputField.replace(/^(MASTER|DETAIL|IN|OUT|INPUT|OUTPUT)_/i, "");
          const outputBase = op.replace(/^(MASTER|DETAIL|IN|OUT|INPUT|OUTPUT)_/i, "");
          if (inputBase === outputBase) {
            reachable.push({ port: op, expression: "", isDirectMatch: false, portDef });
          }
        }
        return reachable;
      }

      // ── Custom/UNION: branch-preserving, not many-to-many ──
      if (type.includes("custom") || type.includes("union") || type.includes("stored procedure")) {
        // Same-name match first
        if (outPorts.has(inputField)) {
          const portDef = xformDef.fields.find((f) => f.name === inputField);
          reachable.push({ port: inputField, expression: portDef?.expression || "", isDirectMatch: true, portDef });
        }

        if (xformDef.fieldDependencies && xformDef.fieldDependencies.length > 0) {
          // FIELDDEPENDENCY is authoritative
          const deps = xformDef.fieldDependencies.filter(
            (fd) => fd.inputField === inputField
          );
          for (const dep of deps) {
            if (outPorts.has(dep.outputField) && dep.outputField !== inputField) {
              const pd = xformDef.fields.find((f) => f.name === dep.outputField);
              reachable.push({
                port: dep.outputField,
                expression: pd?.expression || "",
                isDirectMatch: false,
                portDef: pd,
                usedFieldDependency: true,
              });
            }
          }
        } else {
          // Fallback: group alignment or suffix/name alignment
          const inputPortDef = xformDef.fields.find((f) => f.name === inputField);
          const inputGroup = inputPortDef?.group || "";

          for (const op of outPorts) {
            if (op === inputField) continue; // Already added above
            const pd =
              xformDef.fields.find((f) => f.name === op && (f.porttype || "").includes("OUTPUT")) ||
              xformDef.fields.find((f) => f.name === op);
            if (!pd) continue;

            const outputGroup = pd.group || "";

            // Group alignment: if both have groups, they must align
            if (inputGroup && outputGroup) {
              if (inputGroup === outputGroup || outputGroup === "OUTPUT") {
                reachable.push({ port: op, expression: pd.expression || "", isDirectMatch: false, portDef: pd, usedBranchAlignment: true });
              }
              continue;
            }

            // Suffix/name alignment: strip common prefixes and compare
            const inputBase = inputField.replace(/^(IN|INPUT|GRP\d+)_/i, "");
            const outputBase = op.replace(/^(OUT|OUTPUT|GRP\d+)_/i, "");
            if (inputBase === outputBase) {
              reachable.push({ port: op, expression: pd.expression || "", isDirectMatch: false, portDef: pd, usedBranchAlignment: true });
            }
          }
        }

        // If nothing matched, return just the same-name match (or empty)
        return reachable;
      }

      // ── General transformation types ──
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

        // Types that return values without input-referencing expressions
        if (!expr) {
          if (
            type.includes("lookup") ||
            type === "mapplet" ||
            type.includes("rank") ||
            type.includes("aggregator") ||
            type.includes("normalizer") ||
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

        // Skip pure parameter references ($$VAR) — PARAMETER_DRIVEN, not source-derived
        if (/^\$\$\w+$/i.test(expr)) {
          continue;
        }

        // Skip system variable references — not source-derived
        if (/^(SYSDATE|SYSTIMESTAMP|SESSSTARTTIME|WORKFLOWSTARTTIME|SESSDATETIME)$/i.test(expr.replace(/\s/g, ""))) {
          continue;
        }

        // Check if expression references the input field by name
        const escaped = inputField.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const fieldPattern = new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "i");
        if (fieldPattern.test(expr)) {
          reachable.push({ port: op, expression: expr, isDirectMatch: false, portDef });
          continue;
        }

        // Expression references other ports, not this one — skip
      }

      // Fallback: if nothing reachable for lookup/mapplet, allow all outputs
      if (reachable.length === 0) {
        if (type.includes("lookup") || type === "mapplet") {
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
      while (queue.length > 0 && safety < 5000) {
        safety++;
        const { instance, field, steps } = queue.shift();
        const vk = `${instance}\0${field}`;
        if (visited.has(vk)) continue;
        visited.add(vk);

        // Get downstream neighbors via direct adjacency
        const neighbors = mAdj.get(vk) || [];

        // Expression-aware intra-instance output port resolution within mapplet
        const mInst = mInstanceMap.get(instance);
        const isInput = (mInst?.type || "").toLowerCase().includes("input");
        const outPs = mOutPorts.get(instance) || new Set();

        const allNeighbors = [...neighbors];

        if (!isInput && outPs.size > 0) {
          const mDefName = mInst?.transformationName || instance;
          const mXf = mXformDefs.get(mDefName) || mXformDefs.get(instance);
          const mType = (mXf?.type || "").toLowerCase();

          // Build set of reachable output ports using expression-aware logic
          const reachableOuts = new Set();
          reachableOuts.add(field); // Same-name always reachable

          for (const op of outPs) {
            if (op === field) continue;
            const pd =
              mXf?.fields?.find((f) => f.name === op && (f.porttype || "").includes("OUTPUT")) ||
              mXf?.fields?.find((f) => f.name === op);
            if (!pd) continue;

            // Sorter: only same-name pass-through (already added above)
            if (mType.includes("sorter")) continue;

            // Joiner: same-name pass-through only (already added above)
            if (mType.includes("joiner")) continue;

            // Custom/union: branch isolation via FIELDDEPENDENCY or name alignment
            if (mType.includes("custom") || mType.includes("union") || mType.includes("stored procedure")) {
              if (mXf.fieldDependencies && mXf.fieldDependencies.length > 0) {
                if (mXf.fieldDependencies.some((fd) => fd.inputField === field && fd.outputField === op)) {
                  reachableOuts.add(op);
                }
              } else {
                const inputBase = field.replace(/^(IN|INPUT|GRP\d+)_/i, "");
                const outputBase = op.replace(/^(OUT|OUTPUT|GRP\d+)_/i, "");
                if (inputBase === outputBase) reachableOuts.add(op);
              }
              continue;
            }

            const expr = (pd.expression || "").trim();
            if (!expr) {
              // Types that return values without input-referencing expressions
              if (
                mType.includes("lookup") ||
                mType.includes("rank") || mType.includes("aggregator") ||
                mType.includes("normalizer") || mType.includes("router") ||
                mType === "mapplet"
              ) {
                reachableOuts.add(op);
              }
              continue;
            }

            // Check if expression references the input field
            const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            if (new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "i").test(expr)) {
              reachableOuts.add(op);
            }
          }

          // Only follow downstream neighbors from reachable output ports
          for (const rop of reachableOuts) {
            if (rop === field) continue; // Direct neighbors already in allNeighbors
            const extra = mAdj.get(`${instance}\0${rop}`) || [];
            extra.forEach((n) => {
              if (!allNeighbors.some((x) => x.instance === n.instance && x.field === n.field)) {
                allNeighbors.push(n);
              }
            });
          }
        }

        if (allNeighbors.length === 0 && steps.length > 0) {
          bestSteps.push(...steps);
          continue;
        }

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
      // Track visited with previous-instance context to allow multi-path convergence
      const visited = new Map();
      let safety = 0;

      while (queue.length > 0 && safety < 80000) {
        safety++;
        const { instance, field, path, steps } = queue.shift();
        const prevInst = steps.length > 0 ? steps[steps.length - 1].instance : "__start__";
        const visitKey = `${prevInst}\0${instance}\0${field}`;
        if (visited.has(visitKey)) continue;
        visited.set(visitKey, path.length);

        // ── Reached a target instance ──
        if (isTargetInstance(instance) && instance !== startInstance) {
          const tgtDefName = getDefName(instance);
          const tgtDef = targetDefs.get(tgtDefName) || targetDefs.get(instance);
          if (tgtDef) {
            const dedupKey = `${mapping.name}\0${srcDef.name}\0${startField}\0${tgtDef.name}\0${field}\0${isGenerator ? "G" : "S"}`;
            if (!seen.has(dedupKey)) {
              seen.add(dedupKey);
              const lineageType = classifyLineage(steps);
              const confidence = classifyConfidence(steps, lineageType);
              const evidenceChain = buildEvidenceChain(startField, field, steps);
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
                lineageType,
                confidence,
                evidenceChain,
                isGeneratorOrigin: isGenerator || false,
                // Dual lineage: technical (all hops) + business (deepest valid origin)
                technicalLineage: steps.map((s) => ({
                  instance: s.instance,
                  type: s.type,
                  inputField: s.inputField,
                  outputField: s.outputField,
                })),
                businessLineage: null, // populated by backward validation
                backwardValidated: null, // populated by backward validation
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
              ...(rp.usedFieldDependency ? { usedFieldDependency: true } : {}),
              ...(rp.usedBranchAlignment ? { usedBranchAlignment: true } : {}),
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

            const portDef = xformDef?.fields?.find(
              (f) => f.name === field && (f.porttype || "").includes("OUTPUT")
            ) || xformDef?.fields?.find((f) => f.name === field);

            const step = {
              instance,
              type,
              inputField: field,
              outputField: field,
              expression: portDef?.expression || "",
              porttype: portDef?.porttype || "",
              datatype: portDef?.datatype || "",
              hasSqlOverride: (xformDef?.tableAttributes || []).some(
                (a) => a.name === "Sql Query" && a.value
              ),
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

  // ── Post-processing Phase A: Backward validation ──
  // For each mapping, walk the transformation steps backward from the target
  // to verify the producing output port actually depends on the traced source field.
  for (const m of mappings) {
    const steps = m.transformationSteps || [];
    if (steps.length === 0) {
      // Direct mapping: no intermediate transformations
      m.backwardValidated = true;
      m.businessLineage = `${m.sourceTable}.${m.sourceField}`;
      continue;
    }

    let validated = true;
    let businessOrigin = `${m.sourceTable}.${m.sourceField}`;

    // Walk steps backward: check each step's output port dependency on its input
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i];
      const stepType = (step.type || "").toLowerCase();
      const inputField = step.inputField;
      const outputField = step.outputField;

      // Sorter: only same-name pass-through is valid
      if (stepType.includes("sorter")) {
        if (inputField !== outputField) {
          validated = false;
          break;
        }
        continue;
      }

      // Joiner: same-name or prefix-stripped alignment
      if (stepType.includes("joiner")) {
        if (inputField !== outputField) {
          const inBase = inputField.replace(/^(MASTER|DETAIL|IN|OUT|INPUT|OUTPUT)_/i, "");
          const outBase = outputField.replace(/^(MASTER|DETAIL|IN|OUT|INPUT|OUTPUT)_/i, "");
          if (inBase !== outBase) {
            validated = false;
            break;
          }
        }
        continue;
      }

      // Same-name pass-through is always valid
      if (inputField === outputField) continue;

      // FIELDDEPENDENCY is authoritative
      if (step.usedFieldDependency) continue;

      // Check if expression references the input field
      const expr = (step.expression || "").trim();
      if (expr) {
        const escaped = inputField.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const fieldPattern = new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "i");
        if (fieldPattern.test(expr)) continue;

        // Expression exists but doesn't reference input — check if it's a type
        // that returns values without referencing inputs (lookup, mapplet, etc.)
        if (
          stepType.includes("lookup") || stepType === "mapplet" ||
          stepType.includes("rank") || stepType.includes("aggregator") ||
          stepType.includes("normalizer") || stepType.includes("router")
        ) {
          continue;
        }

        // Expression doesn't reference the input field
        validated = false;
        break;
      }

      // No expression and different names — check if type allows implicit pass-through
      if (
        stepType.includes("lookup") || stepType === "mapplet" ||
        stepType.includes("rank") || stepType.includes("aggregator") ||
        stepType.includes("normalizer") || stepType.includes("router") ||
        stepType.includes("custom") || stepType.includes("union") ||
        stepType.includes("stored procedure")
      ) {
        continue;
      }

      // Branch alignment is acceptable evidence
      if (step.usedBranchAlignment) continue;

      // No evidence for this hop — validation fails
      validated = false;
      break;
    }

    // Compute business lineage: deepest valid origin
    const lastStep = steps[steps.length - 1];
    const lastStepType = (lastStep?.type || "").toLowerCase();
    if (lastStepType.includes("sequence generator")) {
      businessOrigin = `SEQ(${lastStep.instance}.NEXTVAL)`;
    } else if (lastStepType.includes("lookup")) {
      businessOrigin = `LOOKUP(${lastStep.instance}.${lastStep.outputField})`;
    } else {
      const lastExpr = (lastStep?.expression || "").trim();
      if (lastExpr && /^\$\$\w/.test(lastExpr)) {
        businessOrigin = lastExpr;
      } else if (lastExpr && (/^'[^']*'$/.test(lastExpr) || /^\d+(\.\d+)?$/.test(lastExpr.replace(/\s/g, "")))) {
        businessOrigin = lastExpr;
      }
      // Check mapplet internal steps for deeper origin
      if (lastStep?.mappletSteps && lastStep.mappletSteps.length > 0) {
        const deepest = lastStep.mappletSteps[lastStep.mappletSteps.length - 1];
        const deepType = (deepest?.type || "").toLowerCase();
        if (deepType.includes("lookup")) {
          businessOrigin = `LOOKUP(${deepest.instance}.${deepest.outputField})`;
        }
      }
    }

    m.backwardValidated = validated;
    m.businessLineage = businessOrigin;

    if (!validated) {
      m.lineageType = "NOT_USED_FOR_TARGET";
      m.confidence = "LOW";
      m.evidenceChain += " [backward validation: source not referenced by producing output]";
    }
  }

  // ── Post-processing Phase B: INVALID_FANOUT detection ──
  // If a single source field maps to many unrelated target fields through the
  // same transformation path with no per-field expression evidence AND backward
  // validation failed, classify as INVALID_FANOUT.
  const fanOutGroups = new Map();
  for (const m of mappings) {
    if (m.lineageType === "NOT_USED_FOR_TARGET") continue;
    const groupKey = `${m.mappingName}\0${m.sourceTable}\0${m.sourceField}\0${m.transformation}`;
    if (!fanOutGroups.has(groupKey)) fanOutGroups.set(groupKey, []);
    fanOutGroups.get(groupKey).push(m);
  }

  for (const [, group] of fanOutGroups) {
    if (group.length <= 3) continue; // Small fan-out is normal

    for (const m of group) {
      if (m.sourceField === m.targetField) continue; // Same-name is legitimate

      const hasPerFieldEvidence = (m.transformationSteps || []).some((s) => {
        const expr = (s.expression || "").trim();
        if (!expr || /^[A-Za-z_][A-Za-z0-9_]*$/.test(expr)) return false;
        // Check if this specific mapping's source field is referenced
        const escaped = m.sourceField.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "i").test(expr);
      });

      if (!hasPerFieldEvidence) {
        m.lineageType = "INVALID_FANOUT";
        m.confidence = "LOW";
        m.evidenceChain += " [invalid fan-out: no per-field evidence for this target]";
      }
    }
  }

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
function buildEvidenceChain(sourceField, targetField, steps) {
  if (steps.length === 0) return `${targetField} <- ${sourceField} (direct)`;
  const chain = [targetField];
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    chain.push(`${s.instance}[${s.outputField}]`);
  }
  chain.push(sourceField);
  return chain.join(" <- ");
}

function classifyConfidence(steps, lineageType) {
  if (lineageType === "UNKNOWN") return "UNKNOWN";
  if (steps.length === 0) return "HIGH";

  const hasFieldDependency = steps.some((s) => s.usedFieldDependency === true);
  const hasExplicitExpression = steps.some(
    (s) => s.expression && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(s.expression.trim())
  );
  const hasSqlOverride = steps.some((s) => s.hasSqlOverride);
  const hasMappletOpaque = steps.some(
    (s) => (s.type || "").toLowerCase() === "mapplet" && !s.mappletSteps
  );
  const hasBranchAlignment = steps.some((s) => s.usedBranchAlignment === true);

  if (hasFieldDependency || hasExplicitExpression) return "HIGH";
  if (lineageType === "DIRECT_PASS_THROUGH") return "HIGH";
  if (lineageType === "SEQUENCE_GENERATED") return "HIGH";
  if (lineageType === "CONSTANT") return "HIGH";

  if (hasBranchAlignment || hasMappletOpaque) return "MEDIUM";
  if (lineageType === "LOOKUP_RETURN" || lineageType === "MAPLET_OUTPUT") return "MEDIUM";

  if (hasSqlOverride) return "LOW";

  return "HIGH";
}

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
