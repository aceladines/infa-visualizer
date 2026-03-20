import { FLOW_LAYOUT } from "./constants";

/**
 * Build a directed graph using instanceMap for proper node classification.
 *
 * CRITICAL FIX: Uses INSTANCE.TYPE from instanceMap to classify nodes.
 * "Source Definition" → source, "Target Definition" → target, everything else → transform.
 * Resolves INSTANCE.TRANSFORMATION_NAME to find metadata from definitions.
 */
export function buildFlowGraph(data, selectedMapping = "all") {
  const nodeMap = {};
  const edgeSet = new Set();
  const edges = [];

  // Definition metadata lookups
  const sourceMeta = Object.fromEntries(data.sources.map((s) => [s.name, s]));
  const targetMeta = Object.fromEntries(data.targets.map((t) => [t.name, t]));
  const xformMeta = {};
  data.transformations.forEach((x) => { if (!xformMeta[x.name]) xformMeta[x.name] = x; });
  const mappletMeta = Object.fromEntries((data.mapplets || []).map((m) => [m.name, m]));

  const mappingsToProcess = selectedMapping && selectedMapping !== "all"
    ? data.mappings.filter((m) => m.name === selectedMapping)
    : data.mappings;

  mappingsToProcess.forEach((m) => {
    const imap = m.instanceMap || {};

    // Register transforms from this mapping
    m.transformations.forEach((t) => { if (!xformMeta[t.name]) xformMeta[t.name] = t; });

    /**
     * Classify a node using INSTANCE.TYPE from instanceMap.
     * This is the critical fix — no more guessing from name matching.
     */
    function classifyInstance(instanceName) {
      const inst = imap[instanceName];
      if (inst) {
        const t = (inst.type || "").toLowerCase();
        if (t.includes("source definition")) return "source";
        if (t.includes("target definition")) return "target";
        if (t === "mapplet") return "mapplet";
      }
      // Fallback for instances not in instanceMap (shouldn't happen in well-formed XML)
      if (sourceMeta[instanceName]) return "source";
      if (targetMeta[instanceName]) return "target";
      if (mappletMeta[instanceName]) return "mapplet";
      return "transform";
    }

    /** Resolve metadata for a node via instanceMap → definition lookup */
    function getNodeMeta(instanceName) {
      const inst = imap[instanceName];
      const defName = inst?.transformationName || instanceName;
      return sourceMeta[defName] || targetMeta[defName] || xformMeta[defName] ||
             xformMeta[instanceName] || mappletMeta[defName] || mappletMeta[instanceName] || null;
    }

    m.connectors.forEach((c) => {
      // Register from-node
      if (!nodeMap[c.fromInstance]) {
        const type = classifyInstance(c.fromInstance);
        const inst = imap[c.fromInstance];
        nodeMap[c.fromInstance] = {
          id: c.fromInstance,
          label: c.fromInstance,
          type,
          instanceType: c.fromInstanceType || inst?.type || type,
          definitionName: inst?.transformationName || c.fromInstance,
          meta: getNodeMeta(c.fromInstance),
        };
      }
      // Register to-node
      if (!nodeMap[c.toInstance]) {
        const type = classifyInstance(c.toInstance);
        const inst = imap[c.toInstance];
        nodeMap[c.toInstance] = {
          id: c.toInstance,
          label: c.toInstance,
          type,
          instanceType: c.toInstanceType || inst?.type || type,
          definitionName: inst?.transformationName || c.toInstance,
          meta: getNodeMeta(c.toInstance),
        };
      }

      // Deduplicated edge
      const ek = `${c.fromInstance}->${c.toInstance}`;
      if (!edgeSet.has(ek)) {
        edgeSet.add(ek);
        edges.push({ from: c.fromInstance, to: c.toInstance, fields: [] });
      }
      const edge = edges.find((e) => e.from === c.fromInstance && e.to === c.toInstance);
      if (edge) edge.fields.push({ from: c.fromField, to: c.toField });
    });
  });

  return { nodes: Object.values(nodeMap), edges };
}

/**
 * Build cross-session table dependency map.
 * Finds where a session's source table is another session's target table.
 */
export function buildSessionDependencies(data) {
  const deps = []; // { fromSession, toSession, sharedTable, fromMapping, toMapping }
  const sourceMeta = Object.fromEntries(data.sources.map((s) => [s.name, s]));
  const targetMeta = Object.fromEntries(data.targets.map((t) => [t.name, t]));

  // For each mapping, find which actual table names it reads/writes
  const mappingIO = {};
  data.mappings.forEach((m) => {
    const imap = m.instanceMap || {};
    const sources = new Set();
    const targets = new Set();

    Object.entries(imap).forEach(([instName, info]) => {
      const t = (info.type || "").toLowerCase();
      const defName = info.transformationName || instName;
      if (t.includes("source definition") && sourceMeta[defName]) sources.add(defName);
      if (t.includes("target definition") && targetMeta[defName]) targets.add(defName);
    });

    mappingIO[m.name] = { sources: [...sources], targets: [...targets] };
  });

  // For each session, find its mapping
  const sessionMappings = {};
  data.sessions.forEach((s) => {
    if (s.mappingName) sessionMappings[s.name] = s.mappingName;
  });

  // Check all session pairs for shared tables
  data.sessions.forEach((producerSession) => {
    const producerMapping = sessionMappings[producerSession.name];
    if (!producerMapping || !mappingIO[producerMapping]) return;
    const producerTargets = mappingIO[producerMapping].targets;

    data.sessions.forEach((consumerSession) => {
      if (consumerSession.name === producerSession.name) return;
      const consumerMapping = sessionMappings[consumerSession.name];
      if (!consumerMapping || !mappingIO[consumerMapping]) return;
      const consumerSources = mappingIO[consumerMapping].sources;

      producerTargets.forEach((tbl) => {
        if (consumerSources.includes(tbl)) {
          deps.push({
            producerSession: producerSession.name,
            consumerSession: consumerSession.name,
            sharedTable: tbl,
            producerMapping,
            consumerMapping,
          });
        }
      });
    });
  });

  return deps;
}

/** Topological layer assignment via BFS. */
export function assignLayers(nodes, edges) {
  const inDegree = {};
  const adj = {};
  nodes.forEach((n) => { inDegree[n.id] = 0; adj[n.id] = []; });
  edges.forEach((e) => {
    if (inDegree[e.to] !== undefined) inDegree[e.to]++;
    if (adj[e.from]) adj[e.from].push(e.to);
  });
  const layers = {};
  const queue = [];
  nodes.forEach((n) => { if (inDegree[n.id] === 0) { queue.push(n.id); layers[n.id] = 0; } });
  const visited = new Set();
  let safety = 0;
  while (queue.length > 0 && safety < 10000) {
    safety++;
    const curr = queue.shift();
    if (visited.has(curr)) continue;
    visited.add(curr);
    (adj[curr] || []).forEach((next) => {
      layers[next] = Math.max(layers[next] || 0, (layers[curr] || 0) + 1);
      inDegree[next]--;
      if (inDegree[next] <= 0 && !visited.has(next)) queue.push(next);
    });
  }
  nodes.forEach((n) => { if (layers[n.id] === undefined) layers[n.id] = 0; });
  return layers;
}

/** Compute x/y positions. */
export function computeLayout(nodes, layers) {
  const { NODE_W, NODE_H, H_GAP, V_GAP, MIN_CANVAS_W, MIN_CANVAS_H, PADDING } = FLOW_LAYOUT;
  const layerGroups = {};
  nodes.forEach((n) => { const l = layers[n.id] || 0; if (!layerGroups[l]) layerGroups[l] = []; layerGroups[l].push(n); });
  const maxLayer = Math.max(...Object.keys(layerGroups).map(Number), 0);
  const positions = {};
  for (let l = 0; l <= maxLayer; l++) {
    const group = layerGroups[l] || [];
    const x = PADDING + l * (NODE_W + H_GAP);
    group.forEach((n, i) => {
      const totalH = group.length * NODE_H + (group.length - 1) * V_GAP;
      const startY = Math.max(20, (MIN_CANVAS_H - totalH) / 2);
      positions[n.id] = { x, y: startY + i * (NODE_H + V_GAP), w: NODE_W, h: NODE_H };
    });
  }
  const totalW = PADDING * 2 + (maxLayer + 1) * (NODE_W + H_GAP);
  const maxY = Math.max(...Object.values(positions).map((p) => p.y + p.h), MIN_CANVAS_H);
  return { positions, totalW: Math.max(totalW, MIN_CANVAS_W), totalH: maxY + PADDING };
}
