/**
 * Build field-level mappings by tracing connector paths using BFS.
 *
 * CRITICAL FIX: Uses mapping.instanceMap to resolve INSTANCE names to actual
 * SOURCE/TARGET definition names. CONNECTOR.FROMINSTANCE references an INSTANCE.NAME,
 * which maps to a SOURCE/TARGET via INSTANCE.TRANSFORMATION_NAME.
 *
 * Example: INSTANCE NAME="EMPLOYEES_1" TRANSFORMATION_NAME="EMPLOYEES" TYPE="Source Definition"
 * → CONNECTOR FROMINSTANCE="EMPLOYEES_1" should resolve to SOURCE NAME="EMPLOYEES"
 */
export function buildFieldMappings(data) {
  const mappings = [];

  // Build lookups by definition name
  const sourceByName = Object.fromEntries(data.sources.map((s) => [s.name, s]));
  const targetByName = Object.fromEntries(data.targets.map((t) => [t.name, t]));

  data.mappings.forEach((m) => {
    const imap = m.instanceMap || {};

    // Resolve an instance name to a source definition (if it IS a source)
    function resolveSource(instanceName) {
      const inst = imap[instanceName];
      if (!inst) return sourceByName[instanceName] || null;
      // Check type
      const t = (inst.type || "").toLowerCase();
      if (t.includes("source definition") || t === "source definition") {
        return sourceByName[inst.transformationName] || sourceByName[instanceName] || null;
      }
      // Fallback: maybe the instance name itself matches a source
      return sourceByName[instanceName] || sourceByName[inst.transformationName] || null;
    }

    // Resolve an instance name to a target definition (if it IS a target)
    function resolveTarget(instanceName) {
      const inst = imap[instanceName];
      if (!inst) return targetByName[instanceName] || null;
      const t = (inst.type || "").toLowerCase();
      if (t.includes("target definition") || t === "target definition") {
        return targetByName[inst.transformationName] || targetByName[instanceName] || null;
      }
      return targetByName[instanceName] || targetByName[inst.transformationName] || null;
    }

    // Check if instance is a source or target via instanceMap
    function isSourceInstance(instanceName) {
      const inst = imap[instanceName];
      if (inst) {
        const t = (inst.type || "").toLowerCase();
        if (t.includes("source definition")) return true;
      }
      return !!sourceByName[instanceName];
    }

    function isTargetInstance(instanceName) {
      const inst = imap[instanceName];
      if (inst) {
        const t = (inst.type || "").toLowerCase();
        if (t.includes("target definition")) return true;
      }
      return !!targetByName[instanceName];
    }

    // Build reverse adjacency for BFS tracing
    const reverseAdj = {};
    m.connectors.forEach((c) => {
      const key = `${c.toInstance}::${c.toField}`;
      if (!reverseAdj[key]) reverseAdj[key] = [];
      reverseAdj[key].push(c);
    });

    // For every connector arriving at a target instance, trace backward to find sources
    m.connectors.forEach((c) => {
      if (!isTargetInstance(c.toInstance)) return;
      const tgt = resolveTarget(c.toInstance);
      if (!tgt) return;

      const origins = traceBack(c.fromInstance, c.fromField, reverseAdj, isSourceInstance);

      origins.forEach(({ instanceName, field, path }) => {
        const src = resolveSource(instanceName);
        if (!src) return;

        const exists = mappings.some((mp) =>
          mp.mappingName === m.name && mp.sourceTable === src.name &&
          mp.sourceField === field && mp.targetTable === tgt.name && mp.targetField === c.toField
        );
        if (!exists) {
          mappings.push({
            mappingName: m.name,
            sourceTable: src.name, sourceField: field,
            sourceDB: src.dbdName || src.databaseType, sourceOwner: src.ownerName,
            targetTable: tgt.name, targetField: c.toField,
            targetDB: tgt.dbdName || tgt.databaseType, targetOwner: tgt.ownerName,
            transformation: path.length > 0 ? path.join(" → ") : "Direct",
          });
        }
      });
    });
  });

  return mappings;
}

/** BFS backward through the connector graph to find source origins. */
function traceBack(startInstance, startField, reverseAdj, isSource) {
  const results = [];
  const visited = new Set();
  const queue = [{ instanceName: startInstance, field: startField, path: [] }];
  let safety = 0;

  while (queue.length > 0 && safety < 500) {
    safety++;
    const { instanceName, field, path } = queue.shift();
    const vk = `${instanceName}::${field}`;
    if (visited.has(vk)) continue;
    visited.add(vk);

    if (isSource(instanceName)) {
      results.push({ instanceName, field, path });
      continue;
    }

    const feeders = reverseAdj[`${instanceName}::${field}`];
    if (feeders && feeders.length > 0) {
      feeders.forEach((f) => queue.push({ instanceName: f.fromInstance, field: f.fromField, path: [...path, instanceName] }));
    } else {
      // Field rename — trace all inbound to this instance
      const allInbound = new Set();
      Object.keys(reverseAdj).forEach((key) => {
        if (key.startsWith(instanceName + "::")) {
          reverseAdj[key].forEach((f) => {
            const fk = `${f.fromInstance}::${f.fromField}`;
            if (!visited.has(fk) && !allInbound.has(fk)) {
              allInbound.add(fk);
              queue.push({ instanceName: f.fromInstance, field: f.fromField, path: [...path, instanceName] });
            }
          });
        }
      });
    }
  }
  return results;
}
