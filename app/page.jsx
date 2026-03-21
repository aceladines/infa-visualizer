"use client";

import { useState, useCallback } from "react";
import { parseInformaticaXML } from "@/lib/parseXml";
import { FONT_MONO } from "@/lib/constants";
import { useTheme } from "@/lib/ThemeContext";
import { FlowIcon, TableIcon, DBIcon, WfIcon, SunIcon, MoonIcon } from "@/components/icons";
import { Backdrop } from "@/components/ui";
import {
  FlowCanvas,
  NodeDetailDrawer,
  FieldMappingTable,
  EntityDetailPanel,
  WorkflowOverview,
  SummaryBar,
  FileUpload,
} from "@/components";

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

  // ── File handling ──────────────────────────────────────────────
  const handleFileLoad = useCallback((name, content) => {
    setFileName(name);
    setError(null);
    try {
      const parsed = parseInformaticaXML(content);
      setData(parsed);
      setTab("flow");
    } catch (err) {
      setError(err.message);
      setData(null);
    }
  }, []);

  const handleReset = useCallback(() => {
    setData(null);
    setFileName("");
    setError(null);
    setSelectedNode(null);
    setSelectedMapping("all");
    setTab("flow");
  }, []);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Node detail drawer overlay */}
      {selectedNode && (
        <>
          <Backdrop onClick={() => setSelectedNode(null)} />
          <NodeDetailDrawer
            node={selectedNode}
            data={data}
            onClose={() => setSelectedNode(null)}
          />
        </>
      )}

      {/* Header */}
      <Header fileName={fileName} hasData={!!data} onReset={handleReset} />

      {/* Main content */}
      {!data ? (
        <FileUpload onFileLoad={handleFileLoad} error={error} />
      ) : (
        <div style={{ padding: "0 28px 40px" }}>
          <RepositoryInfo data={data} />
          <SummaryBar data={data} />
          <TabBar
            tabs={TABS}
            activeTab={tab}
            onTabChange={setTab}
            mappings={data.mappings}
            selectedMapping={selectedMapping}
            onMappingChange={setSelectedMapping}
          />

          {/* Tab panels */}
          {tab === "flow" && (
            <FlowCanvas data={data} selectedMapping={selectedMapping} onNodeClick={setSelectedNode} />
          )}
          {tab === "workflows" && <WorkflowOverview data={data} />}
          {tab === "mapping" && (
            <FieldMappingTable data={data} selectedMapping={selectedMapping} />
          )}
          {tab === "sources" && (
            <EntityDetailPanel entities={data.sources} type="source" />
          )}
          {tab === "targets" && (
            <EntityDetailPanel entities={data.targets} type="target" />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components (page-level, not worth separate files) ───────

function Header({ fileName, hasData, onReset }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div
      style={{
        padding: "20px 28px",
        borderBottom: "1px solid var(--border-primary)",
        display: "flex",
        alignItems: "center",
        gap: 16,
        background: "linear-gradient(180deg, var(--bg-header-from), var(--bg-header-to))",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "linear-gradient(135deg, #10b981, #60a5fa, #a78bfa)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
        }}
      >
        ⚡
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>
          INFA Flow Visualizer
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: FONT_MONO }}>
          PowerCenter XML → Visual Flow + Field Mapping
        </div>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {hasData && (
          <>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: FONT_MONO }}>
              {fileName}
            </span>
            <button
              onClick={onReset}
              style={{
                padding: "6px 14px",
                background: "var(--border-primary)",
                border: "1px solid var(--border-secondary)",
                borderRadius: 6,
                color: "var(--text-secondary)",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: FONT_MONO,
              }}
            >
              New File
            </button>
          </>
        )}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            borderRadius: 8,
            background: "var(--bg-surface-alt)",
            border: "1px solid var(--border-primary)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </div>
  );
}

function RepositoryInfo({ data }) {
  if (!data.repository) return null;
  return (
    <div
      style={{
        padding: "10px 0",
        fontSize: 11,
        color: "var(--text-muted)",
        fontFamily: FONT_MONO,
      }}
    >
      Repository: <span style={{ color: "var(--text-secondary)" }}>{data.repository.name}</span>
      {data.repository.version && <> &middot; v{data.repository.version}</>}
      {data.folders.length > 0 && (
        <>
          {" "}
          &middot; Folder:{" "}
          <span style={{ color: "var(--text-secondary)" }}>{data.folders[0]?.name}</span>
        </>
      )}
    </div>
  );
}

function TabBar({
  tabs,
  activeTab,
  onTabChange,
  mappings,
  selectedMapping,
  onMappingChange,
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        marginBottom: 20,
        background: "var(--bg-tab-bar)",
        padding: 4,
        borderRadius: 10,
        border: "1px solid var(--border-primary)",
        flexWrap: "wrap",
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onTabChange(t.id)}
          style={{
            flex: "1 1 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "10px 14px",
            background: activeTab === t.id ? "var(--bg-tab-active)" : "transparent",
            border:
              activeTab === t.id
                ? "1px solid var(--border-primary)"
                : "1px solid transparent",
            borderRadius: 8,
            color: activeTab === t.id ? "var(--text-primary)" : "var(--text-muted)",
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: FONT_MONO,
            transition: "all 0.2s",
            whiteSpace: "nowrap",
            boxShadow: activeTab === t.id ? "var(--shadow-sm)" : "none",
          }}
        >
          {t.icon}
          {t.label}
        </button>
      ))}

      {mappings.length > 1 && (
        <select
          value={selectedMapping}
          onChange={(e) => onMappingChange(e.target.value)}
          style={{
            padding: "8px 12px",
            background: "var(--bg-input)",
            border: "1px solid var(--border-primary)",
            borderRadius: 8,
            color: "var(--text-secondary)",
            fontSize: 11,
            fontFamily: FONT_MONO,
            cursor: "pointer",
            outline: "none",
          }}
        >
          <option value="all">All Mappings</option>
          {mappings.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
