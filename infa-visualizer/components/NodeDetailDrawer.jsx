"use client";

import { TYPE_COLORS, FONT_MONO } from "@/lib/constants";
import { CloseIcon } from "@/components/icons";
import styles from "@/styles/ui.module.css";

export default function NodeDetailDrawer({ node, data, onClose }) {
  if (!node) return null;
  const meta = node.meta;
  const colors = TYPE_COLORS[node.type] || TYPE_COLORS.transform;
  const defName = node.definitionName && node.definitionName !== node.label ? node.definitionName : null;

  const inbound = [], outbound = [];
  data.mappings.forEach((m) => { m.connectors.forEach((c) => { if (c.toInstance === node.id) inbound.push(c); if (c.fromInstance === node.id) outbound.push(c); }); });
  const inboundNodes = [...new Set(inbound.map((c) => c.fromInstance))];
  const outboundNodes = [...new Set(outbound.map((c) => c.toInstance))];
  const fields = meta?.fields || [];
  const isTable = node.type === "source" || node.type === "target";
  const tableAttrs = meta?.tableAttributes || [];

  return (
    <div className={styles.drawer} style={{ width: Math.min(520, typeof window !== "undefined" ? window.innerWidth - 40 : 480), borderLeft: `2px solid ${colors.border}` }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${colors.border}33`, background: colors.bg, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <Badge bg={colors.badge} color={colors.text}>{colors.label.toUpperCase()}</Badge>
              {node.instanceType && node.instanceType !== node.type && <Badge bg="#1e1e2e" color="#6b7280">{node.instanceType}</Badge>}
              {meta?.reusable === "YES" && <Badge bg="#115e59" color="#99f6e4">REUSABLE</Badge>}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", fontFamily: FONT_MONO, wordBreak: "break-all" }}>{node.label}</div>
            {defName && <div style={{ fontSize: 11, color: "#6b7280", fontFamily: FONT_MONO, marginTop: 4 }}>Definition: <span style={{ color: colors.text }}>{defName}</span></div>}
          </div>
          <button onClick={onClose} style={{ background: "#1e1e2e", border: "none", borderRadius: 6, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6b7280", flexShrink: 0 }}><CloseIcon /></button>
        </div>
        {meta && (meta.dbdName || meta.databaseType || meta.ownerName) && (
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {meta.dbdName && <InfoPill label="DB" value={meta.dbdName} valueColor={colors.text} />}
            {meta.databaseType && <InfoPill label="Engine" value={meta.databaseType} />}
            {meta.ownerName && <InfoPill label="Owner" value={meta.ownerName} />}
          </div>
        )}
        {meta?.description && <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280", fontFamily: FONT_MONO, lineHeight: 1.5 }}>{meta.description}</div>}
      </div>

      {/* Body */}
      <div className={styles.drawerBody}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <ConnBox label="Inbound" count={inboundNodes.length} color="#10b981" bg="#0a2e1f" nodes={inboundNodes} />
          <ConnBox label="Outbound" count={outboundNodes.length} color="#a78bfa" bg="#1e1434" nodes={outboundNodes} />
        </div>

        {tableAttrs.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <SL>Table Attributes ({tableAttrs.length})</SL>
            <div style={{ border: "1px solid #1e1e2e", borderRadius: 8, overflow: "hidden" }}>
              {tableAttrs.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "6px 10px", background: i % 2 === 0 ? "#08080d" : "#0b0b12", borderBottom: "1px solid #12121f", fontSize: 10, fontFamily: FONT_MONO }}>
                  <span style={{ color: "#6b7280", minWidth: 120, flexShrink: 0 }}>{a.name}</span>
                  <span style={{ color: "#e2e8f0", wordBreak: "break-all" }}>{a.value || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {fields.length > 0 && (
          <div>
            <SL>{fields.length} Fields / Ports</SL>
            <div style={{ border: "1px solid #1e1e2e", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT_MONO }}>
                <thead><tr style={{ background: "#0d0d15" }}>
                  {(isTable ? ["#","Field","Type","Prec","Key","Null"] : ["#","Port","Type","Prec","Port Type","Expression"]).map(h => <th key={h} style={{ padding: "7px 10px", textAlign: "left", color: "#4a4a6a", fontWeight: 500, borderBottom: "1px solid #1e1e2e", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {fields.map((f, fi) => (
                    <tr key={fi} style={{ background: fi % 2 === 0 ? "#08080d" : "#0b0b12" }}>
                      <td style={{ padding: "5px 10px", color: "#4a4a6a", borderBottom: "1px solid #12121f" }}>{f.fieldNumber || fi + 1}</td>
                      <td style={{ padding: "5px 10px", color: "#e2e8f0", borderBottom: "1px solid #12121f", fontWeight: 500 }}>{f.name}</td>
                      <td style={{ padding: "5px 10px", color: colors.text, borderBottom: "1px solid #12121f" }}>{f.datatype || "—"}</td>
                      <td style={{ padding: "5px 10px", color: "#6b7280", borderBottom: "1px solid #12121f" }}>{f.precision ? `${f.precision}${f.scale && f.scale !== "0" ? `,${f.scale}` : ""}` : "—"}</td>
                      {isTable ? (<>
                        <td style={{ padding: "5px 10px", borderBottom: "1px solid #12121f" }}>{f.keyType && f.keyType !== "NOT A KEY" ? <Badge bg="#78350f" color="#fcd34d" small>{f.keyType}</Badge> : "—"}</td>
                        <td style={{ padding: "5px 10px", color: f.nullable === "NOTNULL" ? "#f87171" : "#6b7280", borderBottom: "1px solid #12121f", fontSize: 10 }}>{f.nullable === "NOTNULL" ? "NOT NULL" : f.nullable || "—"}</td>
                      </>) : (<>
                        <td style={{ padding: "5px 10px", borderBottom: "1px solid #12121f" }}>{f.porttype ? <Badge bg={f.porttype.includes("OUTPUT") ? "#1e3a5f" : "#1e1e2e"} color={f.porttype.includes("OUTPUT") ? "#93c5fd" : "#6b7280"} small>{f.porttype}</Badge> : "—"}</td>
                        <td style={{ padding: "5px 10px", color: "#f59e0b", borderBottom: "1px solid #12121f", fontSize: 10, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.expression || ""}>{f.expression || "—"}</td>
                      </>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {inbound.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <SL>Inbound Connections ({inbound.length})</SL>
            <div style={{ border: "1px solid #1e1e2e", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: FONT_MONO }}>
                <thead><tr style={{ background: "#0d0d15" }}>{["From Instance", "From Field", "→ To Field"].map(h => <th key={h} style={{ padding: "7px 10px", textAlign: "left", color: "#4a4a6a", fontWeight: 500, borderBottom: "1px solid #1e1e2e", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>)}</tr></thead>
                <tbody>{inbound.slice(0, 50).map((c, ci) => (
                  <tr key={ci} style={{ background: ci % 2 === 0 ? "#08080d" : "#0b0b12" }}>
                    <td style={{ padding: "5px 10px", color: "#10b981", borderBottom: "1px solid #12121f" }}>{c.fromInstance}</td>
                    <td style={{ padding: "5px 10px", color: "#6ee7b7", borderBottom: "1px solid #12121f" }}>{c.fromField}</td>
                    <td style={{ padding: "5px 10px", color: "#c4b5fd", borderBottom: "1px solid #12121f" }}>{c.toField}</td>
                  </tr>
                ))}</tbody>
              </table>
              {inbound.length > 50 && <div style={{ padding: "6px 10px", fontSize: 9, color: "#4a4a6a", textAlign: "center", fontFamily: FONT_MONO }}>+{inbound.length - 50} more</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ bg, color, small, children }) { return <span style={{ fontSize: small ? 8 : 9, background: bg, color, padding: small ? "2px 5px" : "3px 8px", borderRadius: small ? 3 : 4, fontFamily: FONT_MONO, fontWeight: 600, letterSpacing: "0.05em" }}>{children}</span>; }
function InfoPill({ label, value, valueColor = "#e2e8f0" }) { return <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: FONT_MONO, background: "#12121f", padding: "4px 10px", borderRadius: 5, border: "1px solid #1e1e2e" }}><span style={{ color: "#6b7280" }}>{label}</span><span style={{ color: valueColor, fontWeight: 600 }}>{value}</span></div>; }
function ConnBox({ label, count, color, bg, nodes }) { return <div style={{ flex: 1, padding: "10px 12px", background: "#08080d", borderRadius: 8, border: "1px solid #1e1e2e" }}><div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: FONT_MONO }}>{count}</div><div style={{ fontSize: 9, color: "#6b7280", fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>{nodes.length > 0 && <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>{nodes.map(n => <span key={n} style={{ fontSize: 9, background: bg, color, padding: "2px 6px", borderRadius: 3, fontFamily: FONT_MONO }}>{n.length > 22 ? n.slice(0, 20) + "…" : n}</span>)}</div>}</div>; }
function SL({ children }) { return <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{children}</div>; }
