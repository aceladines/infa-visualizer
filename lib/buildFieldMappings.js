/**
 * Build field-level mappings by tracing connector paths via BFS.
 *
 * Handles multi-hop transformation chains (source → SQ → transform → ... → target).
 * Uses INSTANCE TYPE within each mapping for proper source/target classification.
 * Classifies lineage type: DIRECT_PASS_THROUGH, DERIVED_EXPRESSION,
 * PARAMETER_DRIVEN, CONSTANT, SEQUENCE_GENERATED, CUSTOM_TRANSFORMATION_OUTPUT, UNKNOWN.
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

    function getDefName(instanceName) {
      const inst = instanceMap.get(instanceName);
      return inst?.transformationName || instanceName;
    }

    // Build forward adjacency: (instance\0field) → [(instance, field)]
    const adj = new Map();
    mapping.connectors.forEach((c) => {
      if (!c.fromInstance || !c.toInstance) return;
      const key = `${c.fromInstance}\0${c.fromField}`;
      if (!adj.has(key)) adj.set(key, []);
      adj.get(key).push({ instance: c.toInstance, field: c.toField });
    });

    // Find all unique source starting points
    const sourceStarts = new Set();
    mapping.connectors.forEach((c) => {
      if (isSourceInstance(c.fromInstance)) {
        sourceStarts.add(`${c.fromInstance}\0${c.fromField}`);
      }
    });

    // BFS from each source field to find all reachable target fields
    sourceStarts.forEach((startKey) => {
      const [startInstance, startField] = startKey.split("\0");
      const srcDefName = getDefName(startInstance);
      const srcDef = sourceDefs.get(srcDefName) || sourceDefs.get(startInstance);
      if (!srcDef) return;

      const queue = [{ instance: startInstance, field: startField, path: [], steps: [] }];
      const visited = new Set();
      let safety = 0;

      while (queue.length > 0 && safety < 10000) {
        safety++;
        const { instance, field, path, steps } = queue.shift();
        const visitKey = `${instance}\0${field}`;
        if (visited.has(visitKey)) continue;
        visited.add(visitKey);

        // Reached a target instance (not the starting source)
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
              });
            }
          }
          continue; // Don't continue past target
        }

        // Follow forward adjacency
        const neighbors = adj.get(`${instance}\0${field}`) || [];
        neighbors.forEach((next) => {
          // Add current instance to path if it's a transform (not a source)
          if (isSourceInstance(instance)) {
            queue.push({ instance: next.instance, field: next.field, path, steps });
          } else {
            // Resolve expression for this field at this transformation
            const inst = instanceMap.get(instance);
            const defName = inst?.transformationName || instance;
            const xformDef = xformDefs.get(defName) || xformDefs.get(instance);
            let step = { instance, type: xformDef?.type || inst?.type || "", field };

            if (xformDef) {
              // Look for output port matching the outgoing field name
              const outPort = xformDef.fields.find(
                (f) => f.name === next.field && (f.porttype || "").includes("OUTPUT")
              );
              // Fall back to any port matching the field name
              const port = outPort || xformDef.fields.find((f) => f.name === next.field);

              // Check for SQL override on Source Qualifiers
              const sqlOverride = (xformDef.tableAttributes || []).find(
                (a) => a.name === "Sql Query" && a.value
              );

              step = {
                instance,
                type: xformDef.type || "",
                inputField: field,
                outputField: next.field,
                expression: port?.expression || "",
                porttype: port?.porttype || "",
                datatype: port?.datatype || "",
                hasSqlOverride: !!sqlOverride,
              };
            }

            queue.push({
              instance: next.instance,
              field: next.field,
              path: [...path, instance],
              steps: [...steps, step],
            });
          }
        });
      }
    });
  });

  return mappings;
}

/**
 * Classify the lineage type for a field mapping based on its transformation steps.
 *
 * Categories:
 *   DIRECT_PASS_THROUGH — field flows unchanged through all hops
 *   DERIVED_EXPRESSION — output from expression/calculation
 *   PARAMETER_DRIVEN — expression references $$parameters
 *   CONSTANT — expression is a literal string or number
 *   SEQUENCE_GENERATED — from Sequence Generator transformation
 *   CUSTOM_TRANSFORMATION_OUTPUT — from Custom/Stored Proc transformation
 *   UNKNOWN — can't determine
 */
function classifyLineage(steps) {
  if (steps.length === 0) return "DIRECT_PASS_THROUGH";

  let hasSequence = false;
  let hasCustom = false;
  let hasParameter = false;
  let hasConstant = false;
  let hasDerived = false;
  let hasSqlOverride = false;

  for (const step of steps) {
    const expr = (step.expression || "").trim();
    const type = (step.type || "").toLowerCase();

    if (type.includes("sequence generator")) hasSequence = true;
    if (type.includes("custom transformation") || type.includes("stored procedure")) hasCustom = true;
    if (step.hasSqlOverride) hasSqlOverride = true;

    if (expr && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(expr)) {
      // Expression contains logic beyond a simple field reference
      if (/\$\$\w/.test(expr)) hasParameter = true;
      else if (/^'[^']*'$/.test(expr) || /^\d+(\.\d+)?$/.test(expr.replace(/\s/g, ""))) hasConstant = true;
      else hasDerived = true;
    }
  }

  // Priority: most specific classification wins
  if (hasSequence) return "SEQUENCE_GENERATED";
  if (hasParameter) return "PARAMETER_DRIVEN";
  if (hasConstant && !hasDerived) return "CONSTANT";
  if (hasCustom && !hasDerived) return "CUSTOM_TRANSFORMATION_OUTPUT";
  if (hasDerived) return "DERIVED_EXPRESSION";
  if (hasSqlOverride) return "UNKNOWN";
  return "DIRECT_PASS_THROUGH";
}
