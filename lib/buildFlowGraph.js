import { FLOW_LAYOUT } from "./constants";

/**
 * Build a directed graph of nodes and edges from parsed mapping data.
 *
 * Uses INSTANCE elements within each mapping for proper node classification
 * (via TYPE attribute) instead of matching names against global definitions.
 * Supports per-mapping filtering via selectedMapping parameter.
 *
 * Mapping layer only — workflow links are NOT mixed into the data flow graph.
 *
 * @param {object} data - Parsed XML result
 * @param {string} [selectedMapping="all"] - Mapping name filter
 * @returns {{ nodes: Array, edges: Array }}
 */
export function buildFlowGraph(data, selectedMapping = "all") {
  const nodeMap = {};
  const edgeMap = new Map();
  const edges = [];

  // Definition lookups for metadata
  const sourceDefs = new Map(data.sources.map((s) => [s.name, s]));
  const targetDefs = new Map(data.targets.map((t) => [t.name, t]));
  const xformDefs = new Map(data.transformations.map((x) => [x.name, x]));
  const mappletDefs = new Map((data.mapplets || []).map((m) => [m.name, m]));
  const shortcutDefs = new Map((data.shortcuts || []).map((s) => [s.name, s]));

  // Filter mappings if a specific one is selected
  const mappingsToProcess =
    selectedMapping && selectedMapping !== "all"
      ? data.mappings.filter((m) => m.name === selectedMapping)
      : data.mappings;

  // Scope node IDs by mapping to prevent cross-mapping collisions in "all" mode
  const isAllMappings = !selectedMapping || selectedMapping === "all";
  const scopeId = (mappingName, instanceName) =>
    isAllMappings ? `${mappingName}::${instanceName}` : instanceName;

  mappingsToProcess.forEach((mapping) => {
    // Build instance lookup for this mapping
    const instanceMap = new Map();
    (mapping.instances || []).forEach((inst) => {
      instanceMap.set(inst.name, inst);
    });

    // Classify instance type using INSTANCE TYPE attribute
    function classifyInstance(instanceName, fallbackType) {
      const inst = instanceMap.get(instanceName);
      const typeStr = inst?.type || fallbackType || "";
      const t = typeStr.toLowerCase();
      if (t.includes("source definition") || t === "source") return "source";
      if (t.includes("target definition") || t === "target") return "target";
      if (t === "mapplet") return "mapplet";
      if (shortcutDefs.has(instanceName)) return "shortcut";
      // Fallback: check definition lookups by name
      const defName = inst?.transformationName || instanceName;
      if (sourceDefs.has(defName) || sourceDefs.has(instanceName)) return "source";
      if (targetDefs.has(defName) || targetDefs.has(instanceName)) return "target";
      if (mappletDefs.has(defName) || mappletDefs.has(instanceName)) return "mapplet";
      return "transform";
    }

    // Get definition metadata via instance → transformationName → definition lookup
    function getDefinitionMeta(instanceName) {
      const inst = instanceMap.get(instanceName);
      const defName = inst?.transformationName || instanceName;
      return (
        sourceDefs.get(defName) ||
        targetDefs.get(defName) ||
        xformDefs.get(defName) ||
        mappletDefs.get(defName) ||
        shortcutDefs.get(defName) ||
        sourceDefs.get(instanceName) ||
        targetDefs.get(instanceName) ||
        xformDefs.get(instanceName) ||
        mappletDefs.get(instanceName) ||
        shortcutDefs.get(instanceName) ||
        null
      );
    }

    // Process connectors to build nodes and edges
    (mapping.connectors || []).forEach((c) => {
      if (!c.fromInstance || !c.toInstance) return;

      const fromId = scopeId(mapping.name, c.fromInstance);
      const toId = scopeId(mapping.name, c.toInstance);

      // Register from-node
      if (!nodeMap[fromId]) {
        const type = classifyInstance(c.fromInstance, c.fromInstanceType);
        const inst = instanceMap.get(c.fromInstance);
        nodeMap[fromId] = {
          id: fromId,
          label: c.fromInstance,
          instanceName: c.fromInstance,
          mappingName: isAllMappings ? mapping.name : undefined,
          type,
          instanceType: inst?.type || c.fromInstanceType || type,
          transformationName: inst?.transformationName || "",
          meta: getDefinitionMeta(c.fromInstance),
        };
      }

      // Register to-node
      if (!nodeMap[toId]) {
        const type = classifyInstance(c.toInstance, c.toInstanceType);
        const inst = instanceMap.get(c.toInstance);
        nodeMap[toId] = {
          id: toId,
          label: c.toInstance,
          instanceName: c.toInstance,
          mappingName: isAllMappings ? mapping.name : undefined,
          type,
          instanceType: inst?.type || c.toInstanceType || type,
          transformationName: inst?.transformationName || "",
          meta: getDefinitionMeta(c.toInstance),
        };
      }

      // Register edge (deduplicated via Map for O(1) lookup)
      const edgeKey = `${fromId}->${toId}`;
      if (!edgeMap.has(edgeKey)) {
        const edge = { from: fromId, to: toId, fields: [] };
        edgeMap.set(edgeKey, edge);
        edges.push(edge);
      }
      edgeMap.get(edgeKey).fields.push({ from: c.fromField, to: c.toField });
    });
  });

  return { nodes: Object.values(nodeMap), edges };
}

/**
 * Assign topological layers via BFS (Kahn's algorithm).
 */
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
  nodes.forEach((n) => {
    if (inDegree[n.id] === 0) { queue.push(n.id); layers[n.id] = 0; }
  });

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

/**
 * Compute x/y positions for each node based on their layer assignment.
 */
export function computeLayout(nodes, layers) {
  const { NODE_W, NODE_H, H_GAP, V_GAP, MIN_CANVAS_W, MIN_CANVAS_H, PADDING } = FLOW_LAYOUT;

  const layerGroups = {};
  nodes.forEach((n) => {
    const l = layers[n.id] || 0;
    if (!layerGroups[l]) layerGroups[l] = [];
    layerGroups[l].push(n);
  });

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

  return {
    positions,
    totalW: Math.max(totalW, MIN_CANVAS_W),
    totalH: maxY + PADDING,
  };
}
