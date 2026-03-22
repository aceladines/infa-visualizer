"use client";

import { useState } from "react";
import { FONT_MONO, getTypeColors } from "@/lib/constants";
import { useTheme } from "@/lib/ThemeContext";
import { CloseIcon } from "@/components/icons";
import { ExpandableText, TextViewerModal } from "@/components/ui";
import styles from "@/styles/ui.module.css";

export default function NodeDetailDrawer({ node, data, onClose }) {
  const [viewerText, setViewerText] = useState(null);

  if (!node) return null;

  const { theme } = useTheme();
  const typeColors = getTypeColors(theme);
  const meta = node.meta;
  const colors = typeColors[node.type] || typeColors.transform;

  // Gather inbound/outbound connections
  const inbound = [];
  const outbound = [];
  const rawName = node.instanceName || node.id;
  data.mappings.forEach((m) => {
    // When scoped to a specific mapping (all-mappings view), only check that mapping
    if (node.mappingName && node.mappingName !== m.name) return;
    (m.connectors || []).forEach((c) => {
      if (c.toInstance === rawName) inbound.push(c);
      if (c.fromInstance === rawName) outbound.push(c);
    });
  });

  const inboundNodes = [...new Set(inbound.map((c) => c.fromInstance))];
  const outboundNodes = [...new Set(outbound.map((c) => c.toInstance))];
  const fields = meta?.fields || [];
  const isTable = node.type === "source" || node.type === "target";
  const isShortcut = node.type === "shortcut";
  const isMapplet = node.type === "mapplet";
  const tableAttrs = meta?.tableAttributes || [];

  // For shortcuts, find the referenced object
  const shortcutMeta = isShortcut ? meta : null;

  // For mapplets, find the mapplet definition to show nested transforms
  const mappletDef = isMapplet
    ? (data.mapplets || []).find((ml) => ml.name === node.label || ml.name === meta?.name)
    : null;

  return (
    <div
      className={styles.drawer}
      style={{
        width: Math.min(520, typeof window !== "undefined" ? window.innerWidth - 40 : 480),
        borderLeft: `2px solid ${colors.border}`,
      }}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${colors.border}33`, background: colors.bg, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <Badge bg={colors.badge} color={colors.text}>{colors.label.toUpperCase()}</Badge>
              {node.instanceType && node.instanceType !== node.type && (
                <Badge bg="var(--border-primary)" color="var(--text-secondary)">{node.instanceType}</Badge>
              )}
              {meta?.reusable === "YES" && (
                <Badge bg="#115e59" color="#99f6e4">REUSABLE</Badge>
              )}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", fontFamily: FONT_MONO, wordBreak: "break-all" }}>{node.label}</div>
          </div>
          <button onClick={onClose} style={{ background: "var(--border-primary)", border: "none", borderRadius: 6, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-secondary)", flexShrink: 0 }}>
            <CloseIcon />
          </button>
        </div>

        {/* DB / Engine / Owner pills */}
        {meta && (meta.dbdName || meta.databaseType || meta.ownerName) && (
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {meta.dbdName && <InfoPill label="DB" value={meta.dbdName} valueColor={colors.text} />}
            {meta.databaseType && <InfoPill label="Engine" value={meta.databaseType} />}
            {meta.ownerName && <InfoPill label="Owner" value={meta.ownerName} />}
          </div>
        )}

        {/* Shortcut reference info */}
        {shortcutMeta && (
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {shortcutMeta.refObjectName && <InfoPill label="References" value={shortcutMeta.refObjectName} valueColor="#fde68a" />}
            {shortcutMeta.objectType && <InfoPill label="Type" value={shortcutMeta.objectType} />}
            {shortcutMeta.folderName && <InfoPill label="Folder" value={shortcutMeta.folderName} />}
            {shortcutMeta.repositoryName && <InfoPill label="Repo" value={shortcutMeta.repositoryName} />}
          </div>
        )}

        {meta?.description && (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-secondary)", fontFamily: FONT_MONO, lineHeight: 1.5 }}>{meta.description}</div>
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────── */}
      <div className={styles.drawerBody}>
        {/* Connection stats */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <ConnectionBox label="Inbound" count={inboundNodes.length} color="#10b981" bgColor={typeColors.source.bg} nodes={inboundNodes} />
          <ConnectionBox label="Outbound" count={outboundNodes.length} color="#a78bfa" bgColor={typeColors.target.bg} nodes={outboundNodes} />
        </div>

        {/* Mapplet nested transforms */}
        {mappletDef && mappletDef.transformations.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <SectionLabel>Nested Transformations ({mappletDef.transformations.length})</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {mappletDef.transformations.map((t, ti) => (
                <div key={ti} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--bg-surface-alt)", borderRadius: 6, border: "1px solid var(--border-primary)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2dd4bf", flexShrink: 0 }} />
                  <span style={{ color: "var(--text-primary)", fontSize: 11, fontFamily: FONT_MONO, fontWeight: 500, flex: 1 }}>{t.name}</span>
                  <span style={{ fontSize: 8, background: "#115e59", color: "#99f6e4", padding: "2px 6px", borderRadius: 3, fontFamily: FONT_MONO }}>{t.type}</span>
                  <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: FONT_MONO }}>{t.fields.length} ports</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Table attributes (SQL overrides, lookup conditions, etc.) */}
        {tableAttrs.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <SectionLabel>Table Attributes ({tableAttrs.length})</SectionLabel>
            <div style={{ border: "1px solid var(--border-primary)", borderRadius: 8, overflow: "hidden" }}>
              {tableAttrs.map((a, ai) => (
                <div key={ai} style={{ display: "flex", gap: 8, padding: "6px 10px", background: ai % 2 === 0 ? "var(--bg-table-even)" : "var(--bg-table-odd)", borderBottom: "1px solid var(--border-subtle)", fontSize: 10, fontFamily: FONT_MONO }}>
                  <span style={{ color: "var(--text-secondary)", minWidth: 120, flexShrink: 0 }}>{a.name}</span>
                  <span style={{ color: "var(--text-primary)", flex: 1, minWidth: 0, overflow: "hidden" }}>
                    {a.value ? (
                      <ExpandableText text={a.value} onExpand={() => setViewerText({ title: a.name, text: a.value })} />
                    ) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fields / Ports list */}
        {fields.length > 0 && (
          <div>
            <SectionLabel>{fields.length} Fields / Ports</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {fields.map((f, fi) => (
                <FieldCard
                  key={fi}
                  field={f}
                  index={fi}
                  isTable={isTable}
                  colors={colors}
                  typeColors={typeColors}
                  onViewExpression={(name, expr) => setViewerText({ title: `${name} — Expression`, text: expr })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Inbound field connections */}
        {inbound.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <SectionLabel>Inbound Field Connections ({inbound.length})</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {inbound.slice(0, 50).map((c, ci) => (
                <div key={ci} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "6px 10px", background: ci % 2 === 0 ? "var(--bg-table-even)" : "var(--bg-table-odd)", borderRadius: 6, border: "1px solid var(--border-subtle)", fontSize: 10, fontFamily: FONT_MONO, flexWrap: "wrap" }}>
                  <span style={{ color: "#10b981", wordBreak: "break-all" }}>{c.fromInstance}</span>
                  <span style={{ color: "var(--text-muted)" }}>.</span>
                  <span style={{ color: typeColors.source.text, wordBreak: "break-all" }}>{c.fromField}</span>
                  <span style={{ color: "var(--text-muted)" }}>→</span>
                  <span style={{ color: typeColors.target.text, wordBreak: "break-all" }}>{c.toField}</span>
                </div>
              ))}
            </div>
            {inbound.length > 50 && (
              <div style={{ padding: "6px 10px", fontSize: 9, color: "var(--text-muted)", textAlign: "center", fontFamily: FONT_MONO }}>+{inbound.length - 50} more</div>
            )}
          </div>
        )}
      </div>

      {/* ── Text Viewer Modal ──────────────────────────────── */}
      {viewerText && (
        <TextViewerModal
          title={viewerText.title}
          text={viewerText.text}
          onClose={() => setViewerText(null)}
        />
      )}
    </div>
  );
}

// ─── Sub-components (private) ────────────────────────────────────

function Badge({ bg, color, small, children }) {
  return (
    <span style={{ fontSize: small ? 8 : 9, background: bg, color, padding: small ? "2px 5px" : "3px 8px", borderRadius: small ? 3 : 4, fontFamily: FONT_MONO, fontWeight: 600, letterSpacing: "0.05em" }}>
      {children}
    </span>
  );
}

function InfoPill({ label, value, valueColor = "var(--text-primary)" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: FONT_MONO, background: "var(--bg-tab-active)", padding: "4px 10px", borderRadius: 5, border: "1px solid var(--border-primary)" }}>
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ color: valueColor, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function ConnectionBox({ label, count, color, bgColor, nodes }) {
  return (
    <div style={{ flex: 1, padding: "10px 12px", background: "var(--bg-secondary)", borderRadius: 8, border: "1px solid var(--border-primary)" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: FONT_MONO }}>{count}</div>
      <div style={{ fontSize: 9, color: "var(--text-secondary)", fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      {nodes.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {nodes.map((n) => (
            <span key={n} style={{ fontSize: 9, background: bgColor, color, padding: "2px 6px", borderRadius: 3, fontFamily: FONT_MONO, wordBreak: "break-all" }}>{n}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{children}</div>
  );
}

function FieldCard({ field: f, index: fi, isTable, colors, typeColors, onViewExpression }) {
  const precStr = f.precision ? `${f.precision}${f.scale && f.scale !== "0" ? `,${f.scale}` : ""}` : null;
  return (
    <div style={{ padding: "8px 10px", background: fi % 2 === 0 ? "var(--bg-table-even)" : "var(--bg-table-odd)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
      {/* Row 1: number + name + type badges */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: FONT_MONO, minWidth: 18, flexShrink: 0 }}>#{f.fieldNumber || fi + 1}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", fontFamily: FONT_MONO, wordBreak: "break-all" }}>{f.name}</span>
        {f.datatype && <Badge bg={colors.badge} color={colors.text} small>{f.datatype}{precStr ? `(${precStr})` : ""}</Badge>}
        {isTable ? (
          <>
            {f.keyType && f.keyType !== "NOT A KEY" && <Badge bg="#78350f" color="#fcd34d" small>{f.keyType}</Badge>}
            {f.nullable === "NOTNULL" && <Badge bg="#7f1d1d" color="#fca5a5" small>NOT NULL</Badge>}
          </>
        ) : (
          f.porttype && <Badge bg={f.porttype.includes("OUTPUT") ? typeColors.transform.badge : "var(--border-primary)"} color={f.porttype.includes("OUTPUT") ? typeColors.transform.text : "var(--text-secondary)"} small>{f.porttype}</Badge>
        )}
      </div>
      {/* Row 2: expression (for transforms) */}
      {!isTable && f.expression && (
        <div style={{ marginTop: 4, fontSize: 10, fontFamily: FONT_MONO, color: "#f59e0b", lineHeight: 1.4 }}>
          <ExpandableText text={f.expression} onExpand={() => onViewExpression(f.name, f.expression)} />
        </div>
      )}
    </div>
  );
}

