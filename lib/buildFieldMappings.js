/**
 * Build field-level mappings by tracing connector paths using BFS.
 *
 * Strategy: For each connector that ARRIVES at a target, trace backward
 * through the connector graph to find which source(s) the data originated from.
 * This handles chains of any depth: Source → SQ → EXP → LKP → RTR → Target.
 *
 * Previous approach only traced 1 hop (source → transform → target) which missed
 * the vast majority of real Informatica flows.
 */
export function buildFieldMappings(data) {
  const mappings = [];

  const sourceByName = Object.fromEntries(data.sources.map((s) => [s.name, s]));
  const targetByName = Object.fromEntries(data.targets.map((t) => [t.name, t]));
  const sourceNames = new Set(data.sources.map((s) => s.name));
  const targetNames = new Set(data.targets.map((t) => t.name));

  data.mappings.forEach((m) => {
    // Build reverse adjacency: for each (instance, field), which connectors feed INTO it?
    // Key: "instanceName::fieldName" → array of connector objects
    const reverseAdj = {};
    m.connectors.forEach((c) => {
      const key = `${c.toInstance}::${c.toField}`;
      if (!reverseAdj[key]) reverseAdj[key] = [];
      reverseAdj[key].push(c);
    });

    // Also build a map: for each instance, which fields feed into it from which instances
    // (used for tracing through transforms that rename fields)
    const instanceInbound = {};
    m.connectors.forEach((c) => {
      if (!instanceInbound[c.toInstance]) instanceInbound[c.toInstance] = [];
      instanceInbound[c.toInstance].push(c);
    });

    // For each connector that lands on a TARGET, trace backward to find source origins
    m.connectors.forEach((c) => {
      const tgt = targetByName[c.toInstance];
      if (!tgt) return; // not a target

      // BFS backward from (c.fromInstance, c.fromField)
      const origins = traceBackToSources(
        c.fromInstance,
        c.fromField,
        reverseAdj,
        sourceNames,
        targetNames
      );

      origins.forEach(({ sourceName, sourceField, path }) => {
        const src = sourceByName[sourceName];
        if (!src) return;

        // Dedup
        const exists = mappings.some(
          (mp) =>
            mp.mappingName === m.name &&
            mp.sourceTable === src.name &&
            mp.sourceField === sourceField &&
            mp.targetTable === tgt.name &&
            mp.targetField === c.toField
        );

        if (!exists) {
          mappings.push({
            mappingName: m.name,
            sourceTable: src.name,
            sourceField,
            sourceDB: src.dbdName || src.databaseType,
            sourceOwner: src.ownerName,
            targetTable: tgt.name,
            targetField: c.toField,
            targetDB: tgt.dbdName || tgt.databaseType,
            targetOwner: tgt.ownerName,
            transformation: path.length > 0 ? path.join(" → ") : "Direct",
          });
        }
      });
    });
  });

  return mappings;
}

/**
 * BFS backward from a (instance, field) pair to find all source origins.
 * Follows the reverse connector graph. Stops when it reaches a source instance.
 *
 * Also handles field renaming: if we can't find an exact (instance, field) match
 * going backward, we fall back to tracing all inbound connectors to that instance
 * (port-level rename in expressions, lookups, etc.).
 */
function traceBackToSources(startInstance, startField, reverseAdj, sourceNames, targetNames) {
  const results = [];
  const visited = new Set();

  // Queue items: { instance, field, path }
  const queue = [{ instance: startInstance, field: startField, path: [] }];

  let safety = 0;
  while (queue.length > 0 && safety < 500) {
    safety++;
    const { instance, field, path } = queue.shift();
    const visitKey = `${instance}::${field}`;

    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    // If this instance IS a source, we've found an origin
    if (sourceNames.has(instance)) {
      results.push({ sourceName: instance, sourceField: field, path });
      continue;
    }

    // Don't trace through other targets
    if (targetNames.has(instance)) continue;

    // Look for connectors that feed into (instance, field)
    const exactKey = `${instance}::${field}`;
    const feeders = reverseAdj[exactKey];

    if (feeders && feeders.length > 0) {
      // Exact field match — trace backward through each feeder
      feeders.forEach((feeder) => {
        queue.push({
          instance: feeder.fromInstance,
          field: feeder.fromField,
          path: [...path, instance],
        });
      });
    } else {
      // No exact match — the field was likely renamed by this transform.
      // Trace ALL inbound connectors to this instance (best effort).
      // This covers Expression transforms that create new output port names.
      const allInbound = [];
      Object.keys(reverseAdj).forEach((key) => {
        if (key.startsWith(instance + "::")) {
          reverseAdj[key].forEach((f) => allInbound.push(f));
        }
      });

      // Deduplicate by fromInstance (don't trace the same source instance twice for a rename)
      const seenFrom = new Set();
      allInbound.forEach((feeder) => {
        const fk = `${feeder.fromInstance}::${feeder.fromField}`;
        if (!seenFrom.has(fk)) {
          seenFrom.add(fk);
          // Only add if it wouldn't create a cycle and leads somewhere productive
          if (!visited.has(fk)) {
            queue.push({
              instance: feeder.fromInstance,
              field: feeder.fromField,
              path: [...path, instance],
            });
          }
        }
      });
    }
  }

  return results;
}
