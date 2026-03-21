"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { buildFlowGraph, assignLayers, computeLayout } from "@/lib/buildFlowGraph";
import { FONT_MONO, ZOOM_CONFIG, getTypeColors } from "@/lib/constants";
import { useTheme } from "@/lib/ThemeContext";

export default function FlowCanvas({ data, selectedMapping, onNodeClick }) {
  const { theme } = useTheme();
  const typeColors = getTypeColors(theme);
  const graph = useMemo(() => buildFlowGraph(data, selectedMapping), [data, selectedMapping]);
  const layers = useMemo(() => assignLayers(graph.nodes, graph.edges), [graph]);
  const layout = useMemo(() => computeLayout(graph.nodes, layers), [graph, layers]);

  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);

  // ── Pan / Zoom state ──────────────────────────────────────────
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(ZOOM_CONFIG.DEFAULT);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Auto-fit on first load
  useEffect(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = rect.width / layout.totalW;
    const scaleY = rect.height / layout.totalH;
    const fitZoom = Math.min(scaleX, scaleY, 1) * 0.92;
    const clampedZoom = Math.max(ZOOM_CONFIG.MIN, Math.min(ZOOM_CONFIG.MAX, fitZoom));
    setZoom(clampedZoom);
    setPan({
      x: (rect.width - layout.totalW * clampedZoom) / 2,
      y: (rect.height - layout.totalH * clampedZoom) / 2,
    });
  }, [layout]);

  // ── Wheel zoom (pinch-to-zoom also fires wheel events) ────────
  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const delta = -e.deltaY * ZOOM_CONFIG.WHEEL_SENSITIVITY;
      setZoom((prev) => {
        const next = Math.max(ZOOM_CONFIG.MIN, Math.min(ZOOM_CONFIG.MAX, prev + delta * prev));
        const scale = next / prev;
        setPan((p) => ({
          x: mouseX - scale * (mouseX - p.x),
          y: mouseY - scale * (mouseY - p.y),
        }));
        return next;
      });
    },
    []
  );

  // Attach wheel with { passive: false } to allow preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── Mouse drag to pan ─────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e) => {
      // Only start drag from background (not from nodes/edges)
      if (e.target.closest("[data-node]") || e.target.closest("[data-edge]")) return;
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      e.currentTarget.style.cursor = "grabbing";
    },
    [pan]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
    },
    [isDragging]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    if (containerRef.current) containerRef.current.style.cursor = "grab";
  }, []);

  // ── Zoom controls ─────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(ZOOM_CONFIG.MAX, z + ZOOM_CONFIG.STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(ZOOM_CONFIG.MIN, z - ZOOM_CONFIG.STEP));
  }, []);

  const fitToView = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = rect.width / layout.totalW;
    const scaleY = rect.height / layout.totalH;
    const fitZoom = Math.min(scaleX, scaleY, 1) * 0.92;
    const clamped = Math.max(ZOOM_CONFIG.MIN, Math.min(ZOOM_CONFIG.MAX, fitZoom));
    setZoom(clamped);
    setPan({
      x: (rect.width - layout.totalW * clamped) / 2,
      y: (rect.height - layout.totalH * clamped) / 2,
    });
  }, [layout]);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // ── Minimap ───────────────────────────────────────────────────
  const minimapW = 160;
  const minimapH = 100;
  const mmScale = Math.min(minimapW / layout.totalW, minimapH / layout.totalH);

  const viewportRect = useMemo(() => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (-pan.x / zoom) * mmScale,
      y: (-pan.y / zoom) * mmScale,
      w: (rect.width / zoom) * mmScale,
      h: (rect.height / zoom) * mmScale,
    };
  }, [pan, zoom, mmScale]);

  return (
    <div style={{ position: "relative" }}>
      {/* Main canvas */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{
          overflow: "hidden",
          borderRadius: 12,
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border-primary)",
          height: "70vh",
          minHeight: 400,
          cursor: isDragging ? "grabbing" : "grab",
          touchAction: "none",
          position: "relative",
        }}
      >
        <svg
          width={layout.totalW}
          height={layout.totalH}
          style={{
            display: "block",
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            transition: isDragging ? "none" : "transform 0.08s ease-out",
          }}
        >
          <Defs theme={theme} />
          <rect width="100%" height="100%" fill="url(#grid)" />

          {graph.edges.map((e, i) => (
            <Edge
              key={`e-${i}`}
              edge={e}
              index={i}
              positions={layout.positions}
              isHighlighted={hoveredEdge === i || hoveredNode === e.from || hoveredNode === e.to}
              onHover={setHoveredEdge}
              theme={theme}
            />
          ))}

          {graph.nodes.map((n) => (
            <Node
              key={n.id}
              node={n}
              pos={layout.positions[n.id]}
              isHovered={hoveredNode === n.id}
              onHover={setHoveredNode}
              onClick={onNodeClick}
              typeColors={typeColors}
            />
          ))}
        </svg>
      </div>

      {/* Zoom controls (top-right) */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          zIndex: 10,
        }}
      >
        <ZoomBtn onClick={zoomIn} title="Zoom in">+</ZoomBtn>
        <ZoomBtn onClick={zoomOut} title="Zoom out">−</ZoomBtn>
        <ZoomBtn onClick={fitToView} title="Fit to view" small>⊞</ZoomBtn>
        <ZoomBtn onClick={resetZoom} title="Reset zoom" small>1:1</ZoomBtn>
      </div>

      {/* Zoom indicator (top-left) */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          fontSize: 10,
          fontFamily: FONT_MONO,
          color: "var(--text-muted)",
          background: "var(--bg-overlay)",
          padding: "4px 8px",
          borderRadius: 4,
          border: "1px solid var(--border-primary)",
          zIndex: 10,
          userSelect: "none",
        }}
      >
        {Math.round(zoom * 100)}%
        <span style={{ color: "var(--border-secondary)", margin: "0 4px" }}>|</span>
        <span style={{ color: "var(--text-secondary)" }}>scroll to zoom · drag to pan</span>
      </div>

      {/* Minimap (bottom-right) */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          width: minimapW,
          height: minimapH,
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
          borderRadius: 6,
          overflow: "hidden",
          zIndex: 10,
          opacity: 0.9,
        }}
      >
        <svg width={minimapW} height={minimapH}>
          {graph.nodes.map((n) => {
            const pos = layout.positions[n.id];
            if (!pos) return null;
            const colors = typeColors[n.type] || typeColors.transform;
            return (
              <rect
                key={n.id}
                x={pos.x * mmScale}
                y={pos.y * mmScale}
                width={pos.w * mmScale}
                height={pos.h * mmScale}
                fill={colors.border}
                opacity={0.6}
                rx={1}
              />
            );
          })}
          {graph.edges.map((e, i) => {
            const from = layout.positions[e.from];
            const to = layout.positions[e.to];
            if (!from || !to) return null;
            return (
              <line
                key={`me-${i}`}
                x1={(from.x + from.w) * mmScale}
                y1={(from.y + from.h / 2) * mmScale}
                x2={to.x * mmScale}
                y2={(to.y + to.h / 2) * mmScale}
                stroke="var(--border-secondary)"
                strokeWidth={0.5}
              />
            );
          })}
          {viewportRect && (
            <rect
              x={viewportRect.x}
              y={viewportRect.y}
              width={viewportRect.w}
              height={viewportRect.h}
              fill="none"
              stroke="#60a5fa"
              strokeWidth={1}
              rx={1}
            />
          )}
        </svg>
      </div>
    </div>
  );
}

// ─── Zoom button ─────────────────────────────────────────────────

function ZoomBtn({ onClick, title, small, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32,
        height: 32,
        background: "var(--bg-overlay)",
        border: "1px solid var(--border-primary)",
        borderRadius: 6,
        color: "var(--text-secondary)",
        fontSize: small ? 10 : 18,
        fontFamily: FONT_MONO,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

// ─── SVG Defs ────────────────────────────────────────────────────

function Defs({ theme }) {
  const arrowColor = theme === "light" ? "#94a3b8" : "#4a4a6a";
  const gridColor = theme === "light" ? "#e2e8f0" : "#12121f";

  return (
    <defs>
      <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill={arrowColor} />
      </marker>
      <marker id="arrowhead-hl" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill="#60a5fa" />
      </marker>
      <filter id="glow">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M 24 0 L 0 0 0 24" fill="none" stroke={gridColor} strokeWidth="0.5" />
      </pattern>
    </defs>
  );
}

// ─── Edge component ──────────────────────────────────────────────

function Edge({ edge, index, positions, isHighlighted, onHover, theme }) {
  const from = positions[edge.from];
  const to = positions[edge.to];
  if (!from || !to) return null;

  const x1 = from.x + from.w, y1 = from.y + from.h / 2;
  const x2 = to.x, y2 = to.y + to.h / 2;
  const cx1 = x1 + (x2 - x1) * 0.4, cx2 = x1 + (x2 - x1) * 0.6;
  const path = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
  const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;

  const defaultStroke = theme === "light" ? "#cbd5e1" : "#2a2a3e";
  const tooltipBg = theme === "light" ? "#eff6ff" : "#1a1a2e";
  const tooltipText = theme === "light" ? "#1d4ed8" : "#93c5fd";

  return (
    <g data-edge="true">
      <path d={path} fill="none" stroke="transparent" strokeWidth="14" style={{ cursor: "pointer" }} onMouseEnter={() => onHover(index)} onMouseLeave={() => onHover(null)} />
      <path d={path} fill="none" stroke={isHighlighted ? "#60a5fa" : defaultStroke} strokeWidth={isHighlighted ? 2.5 : 1.5} markerEnd={isHighlighted ? "url(#arrowhead-hl)" : "url(#arrowhead)"} style={{ transition: "all 0.2s", pointerEvents: "none" }} />
      {isHighlighted && (
        <g>
          <rect x={midX - 28} y={midY - 18} width="56" height="18" rx="4" fill={tooltipBg} stroke="#60a5fa" strokeWidth="0.5" />
          <text x={midX} y={midY - 6} textAnchor="middle" fontSize="9" fill={tooltipText} fontFamily={FONT_MONO}>{edge.fields.length} field{edge.fields.length !== 1 ? "s" : ""}</text>
        </g>
      )}
      {edge.condition && isHighlighted && (
        <text x={midX} y={midY + 10} textAnchor="middle" fontSize="8" fill="#f59e0b" fontFamily={FONT_MONO}>{edge.condition.length > 40 ? edge.condition.slice(0, 38) + "…" : edge.condition}</text>
      )}
    </g>
  );
}

// ─── Node component ──────────────────────────────────────────────

function Node({ node, pos, isHovered, onHover, onClick, typeColors }) {
  if (!pos) return null;
  const colors = typeColors[node.type] || typeColors.transform;
  const meta = node.meta;
  const dbLabel = meta?.dbdName || meta?.databaseType || null;

  return (
    <g data-node="true" onMouseEnter={() => onHover(node.id)} onMouseLeave={() => onHover(null)} onClick={(e) => { e.stopPropagation(); onClick?.(node); }} style={{ cursor: "pointer" }}>
      {isHovered && <rect x={pos.x - 3} y={pos.y - 3} width={pos.w + 6} height={pos.h + 6} rx="10" fill="none" stroke={colors.border} strokeWidth="1" opacity="0.4" filter="url(#glow)" />}
      <rect x={pos.x} y={pos.y} width={pos.w} height={pos.h} rx="8" fill={colors.bg} stroke={isHovered ? colors.border : "var(--border-primary)"} strokeWidth={isHovered ? 2 : 1} style={{ transition: "all 0.2s" }} />
      {/* Type badge */}
      <rect x={pos.x + 8} y={pos.y + 6} width={node.type.length * 6.5 + 10} height={16} rx="4" fill={colors.badge} />
      <text x={pos.x + 13} y={pos.y + 17} fontSize="9" fill={colors.text} fontFamily={FONT_MONO} fontWeight="600">{node.type.toUpperCase()}</text>
      {/* DB badge */}
      {dbLabel && (
        <>
          <rect x={pos.x + 8 + node.type.length * 6.5 + 14} y={pos.y + 6} width={Math.min(dbLabel.length * 5.5 + 10, pos.w - node.type.length * 6.5 - 30)} height={16} rx="4" fill={colors.sub} />
          <text x={pos.x + 8 + node.type.length * 6.5 + 19} y={pos.y + 17} fontSize="8" fill={colors.text} opacity="0.7" fontFamily={FONT_MONO} fontWeight="500">{dbLabel.length > 18 ? dbLabel.slice(0, 16) + "…" : dbLabel}</text>
        </>
      )}
      {/* Name */}
      <text x={pos.x + 10} y={pos.y + 38} fontSize="11.5" fill="var(--text-primary)" fontFamily={FONT_MONO} fontWeight="500">{node.label.length > 22 ? node.label.slice(0, 20) + "…" : node.label}</text>
      {/* Subtitle */}
      {meta?.ownerName ? (
        <text x={pos.x + 10} y={pos.y + 52} fontSize="9" fill="var(--text-muted)" fontFamily={FONT_MONO}>{meta.ownerName}</text>
      ) : node.instanceType && node.instanceType !== node.type ? (
        <text x={pos.x + 10} y={pos.y + 52} fontSize="9" fill="var(--text-muted)" fontFamily={FONT_MONO}>{node.instanceType.length > 28 ? node.instanceType.slice(0, 26) + "…" : node.instanceType}</text>
      ) : null}
      {/* Click hint */}
      {isHovered && <text x={pos.x + pos.w - 10} y={pos.y + 52} textAnchor="end" fontSize="8" fill={colors.text} opacity="0.5" fontFamily={FONT_MONO}>click ↗</text>}
    </g>
  );
}
