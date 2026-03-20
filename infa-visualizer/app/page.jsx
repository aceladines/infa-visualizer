"use client";

import { useState, useCallback } from "react";
import { parseInformaticaXML } from "@/lib/parseXml";
import { FONT_MONO } from "@/lib/constants";
import { FlowIcon, TableIcon, DBIcon, WfIcon } from "@/components/icons";
import { Backdrop } from "@/components/ui";
import { FlowCanvas, NodeDetailDrawer, FieldMappingTable, EntityDetailPanel, WorkflowOverview, SummaryBar, FileUpload } from "@/components";

const TABS = [
  { id: "flow", label: "Flow", icon: <FlowIcon /> },
  { id: "workflows", label: "Workflows", icon: <WfIcon /> },
  { id: "mapping", label: "Field Mapping", icon: <TableIcon /> },
  { id: "sources", label: "Sources", icon: <DBIcon /> },
  { id: "targets", label: "Targets", icon: <DBIcon /> },
];

export default function HomePage() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("flow");
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState("");
  const [selectedMapping, setSelectedMapping] = useState("all");
  const [selectedNode, setSelectedNode] = useState(null);

  const handleFileLoad = useCallback((name, content) => {
    setFileName(name); setError(null);
    try { const parsed = parseInformaticaXML(content); setData(parsed); setTab("flow"); setSelectedMapping("all"); }
    catch (err) { setError(err.message); setData(null); }
  }, []);

  const handleReset = useCallback(() => { setData(null); setFileName(""); setError(null); setSelectedNode(null); setSelectedMapping("all"); setTab("flow"); }, []);

  return (
    <div style={{ minHeight: "100vh" }}>
      {selectedNode && <><Backdrop onClick={() => setSelectedNode(null)} /><NodeDetailDrawer node={selectedNode} data={data} onClose={() => setSelectedNode(null)} /></>}
      <Header fileName={fileName} hasData={!!data} onReset={handleReset} />
      {!data ? <FileUpload onFileLoad={handleFileLoad} error={error} /> : (
        <div style={{ padding: "0 28px 40px" }}>
          <RepositoryInfo data={data} />
          <SummaryBar data={data} />
          <TabBar tabs={TABS} activeTab={tab} onTabChange={setTab} mappings={data.mappings} selectedMapping={selectedMapping} onMappingChange={setSelectedMapping} />
          {tab === "flow" && <FlowCanvas data={data} onNodeClick={setSelectedNode} selectedMapping={selectedMapping} />}
          {tab === "workflows" && <WorkflowOverview data={data} />}
          {tab === "mapping" && <FieldMappingTable data={data} selectedMapping={selectedMapping} />}
          {tab === "sources" && <EntityDetailPanel entities={data.sources} type="source" />}
          {tab === "targets" && <EntityDetailPanel entities={data.targets} type="target" />}
        </div>
      )}
    </div>
  );
}

function Header({ fileName, hasData, onReset }) {
  return (<div style={{ padding: "20px 28px", borderBottom: "1px solid #1e1e2e", display: "flex", alignItems: "center", gap: 16, background: "linear-gradient(180deg, #0a0a12, #06060a)" }}>
    <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, #10b981, #60a5fa, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚡</div>
    <div><div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>INFA Flow Visualizer</div><div style={{ fontSize: 11, color: "#4a4a6a", fontFamily: FONT_MONO }}>PowerCenter XML → Visual Flow + Field Mapping</div></div>
    {hasData && <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}><span style={{ fontSize: 11, color: "#4a4a6a", fontFamily: FONT_MONO }}>{fileName}</span><button onClick={onReset} style={{ padding: "6px 14px", background: "#1e1e2e", border: "1px solid #2a2a3e", borderRadius: 6, color: "#6b7280", fontSize: 11, cursor: "pointer", fontFamily: FONT_MONO }}>New File</button></div>}
  </div>);
}

function RepositoryInfo({ data }) {
  if (!data.repository) return null;
  return (<div style={{ padding: "10px 0", fontSize: 11, color: "#4a4a6a", fontFamily: FONT_MONO }}>
    Repository: <span style={{ color: "#6b7280" }}>{data.repository.name}</span>
    {data.repository.version && <> &middot; v{data.repository.version}</>}
    {data.folders.length > 0 && <> &middot; Folder: <span style={{ color: "#6b7280" }}>{data.folders[0]?.name}</span></>}
  </div>);
}

function TabBar({ tabs, activeTab, onTabChange, mappings, selectedMapping, onMappingChange }) {
  return (<div style={{ display: "flex", gap: 2, marginBottom: 20, background: "#08080d", padding: 4, borderRadius: 10, border: "1px solid #1e1e2e", flexWrap: "wrap" }}>
    {tabs.map((t) => <button key={t.id} onClick={() => onTabChange(t.id)} style={{ flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 14px", background: activeTab === t.id ? "#12121f" : "transparent", border: activeTab === t.id ? "1px solid #1e1e2e" : "1px solid transparent", borderRadius: 8, color: activeTab === t.id ? "#e2e8f0" : "#4a4a6a", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: FONT_MONO, transition: "all 0.2s", whiteSpace: "nowrap" }}>{t.icon}{t.label}</button>)}
    {mappings.length > 1 && <select value={selectedMapping} onChange={(e) => onMappingChange(e.target.value)} style={{ padding: "8px 12px", background: "#0a0a0f", border: "1px solid #1e1e2e", borderRadius: 8, color: "#6b7280", fontSize: 11, fontFamily: FONT_MONO, cursor: "pointer", outline: "none" }}><option value="all">All Mappings ({mappings.length})</option>{mappings.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}</select>}
  </div>);
}
