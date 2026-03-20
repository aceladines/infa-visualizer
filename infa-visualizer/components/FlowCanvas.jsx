"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { buildFlowGraph, assignLayers, computeLayout } from "@/lib/buildFlowGraph";
import { TYPE_COLORS, FONT_MONO, ZOOM_CONFIG } from "@/lib/constants";

export default function FlowCanvas({ data, onNodeClick, selectedMapping }) {
  const graph = useMemo(() => buildFlowGraph(data, selectedMapping), [data, selectedMapping]);
  const layers = useMemo(() => assignLayers(graph.nodes, graph.edges), [graph]);
  const layout = useMemo(() => computeLayout(graph.nodes, layers), [graph, layers]);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);

  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(ZOOM_CONFIG.DEFAULT);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const fitToView = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const s = Math.min(rect.width / layout.totalW, rect.height / layout.totalH, 1) * 0.92;
    const z = Math.max(ZOOM_CONFIG.MIN, Math.min(ZOOM_CONFIG.MAX, s));
    setZoom(z);
    setPan({ x: (rect.width - layout.totalW * z) / 2, y: (rect.height - layout.totalH * z) / 2 });
  }, [layout]);

  useEffect(() => { fitToView(); }, [fitToView]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const delta = -e.deltaY * ZOOM_CONFIG.WHEEL_SENSITIVITY;
    setZoom((prev) => {
      const next = Math.max(ZOOM_CONFIG.MIN, Math.min(ZOOM_CONFIG.MAX, prev + delta * prev));
      const sc = next / prev;
      setPan((p) => ({ x: mx - sc * (mx - p.x), y: my - sc * (my - p.y) }));
      return next;
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handlePointerDown = useCallback((e) => {
    if (e.target.closest("[data-node]") || e.target.closest("[data-edge]")) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    e.currentTarget.style.cursor = "grabbing";
  }, [pan]);
  const handlePointerMove = useCallback((e) => {
    if (!isDragging) return;
    setPan({ x: dragStart.current.panX + (e.clientX - dragStart.current.x), y: dragStart.current.panY + (e.clientY - dragStart.current.y) });
  }, [isDragging]);
  const handlePointerUp = useCallback(() => { setIsDragging(false); if (containerRef.current) containerRef.current.style.cursor = "grab"; }, []);

  const minimapW = 160, minimapH = 100;
  const mmScale = Math.min(minimapW / layout.totalW, minimapH / layout.totalH);

  if (graph.nodes.length === 0) {
    return (<div style={{ padding: 60, textAlign: "center", color: "#4a4a6a", fontFamily: FONT_MONO, fontSize: 13, background: "#0a0a0f", borderRadius: 12, border: "1px solid #1e1e2e" }}>
      {selectedMapping && selectedMapping !== "all" ? `No flow data for "${selectedMapping}"` : "No mapping connectors found"}
    </div>);
  }

  return (
    <div style={{ position: "relative" }}>
      <div ref={containerRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
        style={{ overflow: "hidden", borderRadius: 12, background: "#0a0a0f", border: "1px solid #1e1e2e", height: "70vh", minHeight: 400, cursor: isDragging ? "grabbing" : "grab", touchAction: "none", position: "relative" }}>
        <svg width={layout.totalW} height={layout.totalH} style={{ display: "block", transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0", transition: isDragging ? "none" : "transform 0.08s ease-out" }}>
          <defs>
            <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#4a4a6a"/></marker>
            <marker id="ahh" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#60a5fa"/></marker>
            <filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0L0 0 0 24" fill="none" stroke="#12121f" strokeWidth="0.5"/></pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)"/>
          {graph.edges.map((e, i) => { const from = layout.positions[e.from], to = layout.positions[e.to]; if (!from || !to) return null; const hl = hoveredEdge === i || hoveredNode === e.from || hoveredNode === e.to; const x1=from.x+from.w,y1=from.y+from.h/2,x2=to.x,y2=to.y+to.h/2; const cx1=x1+(x2-x1)*0.4,cx2=x1+(x2-x1)*0.6; const d=`M${x1} ${y1}C${cx1} ${y1},${cx2} ${y2},${x2} ${y2}`; const mx=(x1+x2)/2,my=(y1+y2)/2; return (<g key={`e${i}`} data-edge="true"><path d={d} fill="none" stroke="transparent" strokeWidth="14" style={{cursor:"pointer"}} onMouseEnter={()=>setHoveredEdge(i)} onMouseLeave={()=>setHoveredEdge(null)}/><path d={d} fill="none" stroke={hl?"#60a5fa":"#2a2a3e"} strokeWidth={hl?2.5:1.5} markerEnd={hl?"url(#ahh)":"url(#ah)"} style={{transition:"all 0.2s",pointerEvents:"none"}}/>{hl&&<g><rect x={mx-28} y={my-18} width="56" height="18" rx="4" fill="#1a1a2e" stroke="#60a5fa" strokeWidth="0.5"/><text x={mx} y={my-6} textAnchor="middle" fontSize="9" fill="#93c5fd" fontFamily={FONT_MONO}>{e.fields.length} field{e.fields.length!==1?"s":""}</text></g>}{e.condition&&hl&&<text x={mx} y={my+10} textAnchor="middle" fontSize="8" fill="#f59e0b" fontFamily={FONT_MONO}>{e.condition.length>40?e.condition.slice(0,38)+"…":e.condition}</text>}</g>); })}
          {graph.nodes.map((n) => { const pos = layout.positions[n.id]; if (!pos) return null; const c = TYPE_COLORS[n.type]||TYPE_COLORS.transform; const hv = hoveredNode===n.id; const m=n.meta; const db=m?.dbdName||m?.databaseType||null; const defName=n.definitionName&&n.definitionName!==n.label?n.definitionName:null; return (<g key={n.id} data-node="true" onMouseEnter={()=>setHoveredNode(n.id)} onMouseLeave={()=>setHoveredNode(null)} onClick={(e)=>{e.stopPropagation();onNodeClick?.(n);}} style={{cursor:"pointer"}}>{hv&&<rect x={pos.x-3} y={pos.y-3} width={pos.w+6} height={pos.h+6} rx="10" fill="none" stroke={c.border} strokeWidth="1" opacity="0.4" filter="url(#glow)"/>}<rect x={pos.x} y={pos.y} width={pos.w} height={pos.h} rx="8" fill={c.bg} stroke={hv?c.border:"#1e1e2e"} strokeWidth={hv?2:1} style={{transition:"all 0.2s"}}/><rect x={pos.x+8} y={pos.y+6} width={n.type.length*6.5+10} height={16} rx="4" fill={c.badge}/><text x={pos.x+13} y={pos.y+17} fontSize="9" fill={c.text} fontFamily={FONT_MONO} fontWeight="600">{n.type.toUpperCase()}</text>{db&&<><rect x={pos.x+8+n.type.length*6.5+14} y={pos.y+6} width={Math.min(db.length*5.5+10,pos.w-n.type.length*6.5-30)} height={16} rx="4" fill={c.sub}/><text x={pos.x+8+n.type.length*6.5+19} y={pos.y+17} fontSize="8" fill={c.text} opacity="0.7" fontFamily={FONT_MONO} fontWeight="500">{db.length>18?db.slice(0,16)+"…":db}</text></>}<text x={pos.x+10} y={pos.y+38} fontSize="11.5" fill="#e2e8f0" fontFamily={FONT_MONO} fontWeight="500">{n.label.length>22?n.label.slice(0,20)+"…":n.label}</text>{defName?<text x={pos.x+10} y={pos.y+52} fontSize="8" fill="#6b7280" fontFamily={FONT_MONO}>def: {defName.length>24?defName.slice(0,22)+"…":defName}</text>:m?.ownerName?<text x={pos.x+10} y={pos.y+52} fontSize="9" fill="#4a4a6a" fontFamily={FONT_MONO}>{m.ownerName}</text>:n.instanceType&&n.instanceType!==n.type?<text x={pos.x+10} y={pos.y+52} fontSize="9" fill="#4a4a6a" fontFamily={FONT_MONO}>{n.instanceType.length>28?n.instanceType.slice(0,26)+"…":n.instanceType}</text>:null}{hv&&<text x={pos.x+pos.w-10} y={pos.y+52} textAnchor="end" fontSize="8" fill={c.text} opacity="0.5" fontFamily={FONT_MONO}>click ↗</text>}</g>); })}
        </svg>
      </div>
      <div style={{position:"absolute",top:12,right:12,display:"flex",flexDirection:"column",gap:2,zIndex:10}}>
        {[{l:"+",fn:()=>setZoom(z=>Math.min(ZOOM_CONFIG.MAX,z+ZOOM_CONFIG.STEP)),t:"Zoom in"},{l:"−",fn:()=>setZoom(z=>Math.max(ZOOM_CONFIG.MIN,z-ZOOM_CONFIG.STEP)),t:"Zoom out"},{l:"⊞",fn:fitToView,t:"Fit",s:1},{l:"1:1",fn:()=>{setZoom(1);setPan({x:0,y:0});},t:"Reset",s:1}].map(b=><button key={b.l} onClick={b.fn} title={b.t} style={{width:32,height:32,background:"#0a0a0fcc",border:"1px solid #1e1e2e",borderRadius:6,color:"#6b7280",fontSize:b.s?10:18,fontFamily:FONT_MONO,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>{b.l}</button>)}
      </div>
      <div style={{position:"absolute",top:12,left:12,fontSize:10,fontFamily:FONT_MONO,color:"#4a4a6a",background:"#0a0a0fcc",padding:"4px 8px",borderRadius:4,border:"1px solid #1e1e2e",zIndex:10,userSelect:"none"}}>{Math.round(zoom*100)}%<span style={{color:"#2a2a3e",margin:"0 4px"}}>|</span><span style={{color:"#6b7280"}}>scroll zoom · drag pan</span></div>
      <div style={{position:"absolute",bottom:12,right:12,width:minimapW,height:minimapH,background:"#08080ddd",border:"1px solid #1e1e2e",borderRadius:6,overflow:"hidden",zIndex:10}}>
        <svg width={minimapW} height={minimapH}>
          {graph.nodes.map(n=>{const p=layout.positions[n.id];if(!p)return null;const cl=TYPE_COLORS[n.type]||TYPE_COLORS.transform;return<rect key={n.id} x={p.x*mmScale} y={p.y*mmScale} width={p.w*mmScale} height={p.h*mmScale} fill={cl.border} opacity={0.6} rx={1}/>;})}{graph.edges.map((e,i)=>{const f=layout.positions[e.from],t=layout.positions[e.to];if(!f||!t)return null;return<line key={`m${i}`} x1={(f.x+f.w)*mmScale} y1={(f.y+f.h/2)*mmScale} x2={t.x*mmScale} y2={(t.y+t.h/2)*mmScale} stroke="#2a2a3e" strokeWidth={0.5}/>;})}</svg>
      </div>
    </div>
  );
}
