import { FLOW_LAYOUT } from "./constants";

/**
 * Build a directed graph of nodes and edges from parsed mapping/workflow data.
 * Supports sources, targets, transformations, mapplets, shortcuts, and tasks.
 *
 * @param {object} data - Parsed XML result
 * @returns {{ nodes: Array, edges: Array }}
 */
export function buildFlowGraph(data) {
  const nodeMap = {};
  const edgeSet = new Set();
  const edges = [];

  const sourceNames = new Set(data.sources.map((s) => s.name));
  const targetNames = new Set(data.targets.map((t) => t.name));
  const mappletNames = new Set((data.mapplets || []).map((m) => m.name));
  const shortcutNames = new Set((data.shortcuts || []).map((s) => s.name));

  // Instance types that indicate mapplet usage
  const mappletInstanceNames = new Set();
  data.mappings.forEach((m) => {
    (m.mappletInstances || []).forEach((mi) => {
      mappletInstanceNames.add(mi.name);
      mappletInstanceNames.add(mi.transformationName);
    });
  });

  // Metadata lookup maps
  const sourceMeta = Object.fromEntries(data.sources.map((s) => [s.name, s]));
  const targetMeta = Object.fromEntries(data.targets.map((t) => [t.name, t]));
  const xformMeta = Object.fromEntries(data.transformations.map((x) => [x.name, x]));
  const mappletMeta = Object.fromEntries((data.mapplets || []).map((m) => [m.name, m]));
  const shortcutMeta = Object.fromEntries((data.shortcuts || []).map((s) => [s.name, s]));

  function classifyNode(name, instanceType) {
    if (sourceNames.has(name)) return "source";
    if (targetNames.has(name)) return "target";
    if (mappletNames.has(name) || mappletInstanceNames.has(name)) return "mapplet";
    if (shortcutNames.has(name)) return "shortcut";
    // Check instanceType string for hints
    const itLower = (instanceType || "").toLowerCase();
    if (itLower === "mapplet") return "mapplet";
    return "transform";
  }

  function getNodeMeta(name) {
    return (
      sourceMeta[name] ||
      targetMeta[name] ||
      xformMeta[name] ||
      mappletMeta[name] ||
      shortcutMeta[name] ||
      null
    );
  }

  // Process mapping + mapplet connectors
  data.mappings.forEach((m) => {
    m.transformations.forEach((t) => {
      if (!xformMeta[t.name]) xformMeta[t.name] = t;
    });

    m.connectors.forEach((c) => {
      // Register from-node
      if (!nodeMap[c.fromInstance]) {
        const type = classifyNode(c.fromInstance, c.fromInstanceType);
        nodeMap[c.fromInstance] = {
          id: c.fromInstance,
          label: c.fromInstance,
          type,
          instanceType: c.fromInstanceType || type,
          meta: getNodeMeta(c.fromInstance),
        };
      }
      // Register to-node
      if (!nodeMap[c.toInstance]) {
        const type = classifyNode(c.toInstance, c.toInstanceType);
        nodeMap[c.toInstance] = {
          id: c.toInstance,
          label: c.toInstance,
          type,
          instanceType: c.toInstanceType || type,
          meta: getNodeMeta(c.toInstance),
        };
      }

      // Register edge (deduplicated)
      const edgeKey = `${c.fromInstance}->${c.toInstance}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push({ from: c.fromInstance, to: c.toInstance, fields: [] });
      }

      const lastEdge = edges[edges.length - 1];
      const edge =
        lastEdge?.from === c.fromInstance && lastEdge?.to === c.toInstance
          ? lastEdge
          : edges.find((e) => e.from === c.fromInstance && e.to === c.toInstance);
      if (edge) {
        edge.fields.push({ from: c.fromField, to: c.toField });
      }
    });
  });

  // Workflow-level tasks and links
  data.workflows.forEach((wf) => {
    wf.tasks.forEach((t) => {
      if (!nodeMap[t.name]) {
        nodeMap[t.name] = {
          id: t.name,
          label: t.name,
          type: "task",
          instanceType: t.type || "Task",
          meta: { name: t.name, type: t.type, description: t.description || "" },
        };
      }
    });

    wf.links.forEach((l) => {
      if (!l.from || !l.to) return;
      const edgeKey = `${l.from}->${l.to}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push({ from: l.from, to: l.to, fields: [], condition: l.condition });
      }
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
