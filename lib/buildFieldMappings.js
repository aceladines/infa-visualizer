/**
 * Build field-level mappings by tracing connector paths.
 *
 * Uses exact name matching (not substring) to avoid false positives
 * when source/target names share prefixes.
 *
 * Traces two paths:
 *   1. Direct: source → target
 *   2. Via transform: source → transform → target
 *
 * @param {object} data - Parsed XML result
 * @returns {Array} Field mapping records
 */
export function buildFieldMappings(data) {
  const mappings = [];
  const sourceNames = new Set(data.sources.map((s) => s.name));
  const targetNames = new Set(data.targets.map((t) => t.name));

  // Build lookup maps for metadata
  const sourceByName = Object.fromEntries(
    data.sources.map((s) => [s.name, s])
  );
  const targetByName = Object.fromEntries(
    data.targets.map((t) => [t.name, t])
  );

  data.mappings.forEach((m) => {
    // Pass 1: Direct source → target connectors
    m.connectors.forEach((c) => {
      const src = sourceByName[c.fromInstance];
      const tgt = targetByName[c.toInstance];
      if (src && tgt) {
        mappings.push(
          createFieldMapping(m.name, src, c.fromField, tgt, c.toField, "Direct")
        );
      }
    });

    // Pass 2: source → transform → target (one hop through)
    m.connectors.forEach((conn) => {
      const isToTransform =
        !targetNames.has(conn.toInstance) &&
        !sourceNames.has(conn.toInstance);
      if (!isToTransform) return;

      const outgoing = m.connectors.filter(
        (c2) => c2.fromInstance === conn.toInstance
      );

      outgoing.forEach((out) => {
        const tgt = targetByName[out.toInstance];
        const src = sourceByName[conn.fromInstance];
        if (!src || !tgt) return;

        const exists = mappings.some(
          (mp) =>
            mp.sourceTable === src.name &&
            mp.sourceField === conn.fromField &&
            mp.targetTable === tgt.name &&
            mp.targetField === out.toField &&
            mp.mappingName === m.name
        );

        if (!exists) {
          mappings.push(
            createFieldMapping(
              m.name,
              src,
              conn.fromField,
              tgt,
              out.toField,
              conn.toInstance
            )
          );
        }
      });
    });
  });

  return mappings;
}

/** @private */
function createFieldMapping(
  mappingName,
  source,
  sourceField,
  target,
  targetField,
  transformation
) {
  return {
    mappingName,
    sourceTable: source.name,
    sourceField,
    sourceDB: source.dbdName || source.databaseType,
    sourceOwner: source.ownerName,
    targetTable: target.name,
    targetField,
    targetDB: target.dbdName || target.databaseType,
    targetOwner: target.ownerName,
    transformation,
  };
}
