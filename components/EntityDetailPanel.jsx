"use client";

import { useState } from "react";
import { FONT_MONO, getTypeColors } from "@/lib/constants";
import { useTheme } from "@/lib/ThemeContext";
import { DBIcon } from "@/components/icons";

export default function EntityDetailPanel({ entities, type }) {
  const [expanded, setExpanded] = useState(null);
  const { theme } = useTheme();
  const typeColors = getTypeColors(theme);
  const color = type === "target" ? typeColors.target : typeColors.source;

  if (entities.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontFamily: FONT_MONO, fontSize: 13 }}>
        No {type}s found in this export
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {entities.map((entity, i) => (
        <div key={i} style={{ border: "1px solid var(--border-primary)", borderRadius: 10, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
          {/* Accordion header */}
          <div
            onClick={() => setExpanded(expanded === i ? null : i)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px",
              background: expanded === i ? color.bg : "var(--bg-tertiary)",
              cursor: "pointer",
              transition: "background 0.2s",
            }}
          >
            <span style={{ color: color.border }}>
              <DBIcon />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: color.text, fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600 }}>
                {entity.name}
              </div>
              {(entity.dbdName || entity.ownerName) && (
                <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
                  {entity.dbdName && (
                    <span style={{ fontSize: 9, background: color.badge, color: color.text, padding: "1px 6px", borderRadius: 3, fontFamily: FONT_MONO }}>
                      {entity.dbdName}
                    </span>
                  )}
                  {entity.ownerName && (
                    <span style={{ fontSize: 9, background: color.sub, color: color.text, padding: "1px 6px", borderRadius: 3, fontFamily: FONT_MONO, opacity: 0.8 }}>
                      {entity.ownerName}
                    </span>
                  )}
                </div>
              )}
            </div>
            {entity.databaseType && (
              <span style={{ fontSize: 9, background: color.badge, color: color.text, padding: "3px 8px", borderRadius: 4, fontFamily: FONT_MONO }}>
                {entity.databaseType}
              </span>
            )}
            <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: FONT_MONO }}>
              {entity.fields.length} cols
            </span>
            <span
              style={{
                color: "var(--text-muted)",
                transform: expanded === i ? "rotate(180deg)" : "rotate(0)",
                transition: "transform 0.2s",
              }}
            >
              ▾
            </span>
          </div>

          {/* Description */}
          {entity.description && expanded === i && (
            <div style={{ padding: "6px 16px 0", fontSize: 10, color: "var(--text-secondary)", fontFamily: FONT_MONO, background: color.bg }}>
              {entity.description}
            </div>
          )}

          {/* Fields table */}
          {expanded === i && entity.fields.length > 0 && (
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT_MONO }}>
                <thead>
                  <tr style={{ background: "var(--bg-table-header)" }}>
                    {["#", "Field", "Datatype", "Precision", "Scale", "Key", "Nullable"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "8px 12px",
                          textAlign: "left",
                          color: "var(--text-muted)",
                          fontWeight: 500,
                          borderBottom: "1px solid var(--border-primary)",
                          fontSize: 9,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entity.fields.map((f, fi) => (
                    <tr key={fi} style={{ background: fi % 2 === 0 ? "var(--bg-table-even)" : "var(--bg-table-odd)" }}>
                      <td style={{ padding: "6px 12px", color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}>
                        {f.fieldNumber || fi + 1}
                      </td>
                      <td style={{ padding: "6px 12px", color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)", fontWeight: 500 }}>
                        {f.name}
                      </td>
                      <td style={{ padding: "6px 12px", color: color.text, borderBottom: "1px solid var(--border-subtle)" }}>
                        {f.datatype}
                      </td>
                      <td style={{ padding: "6px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                        {f.precision || "—"}
                      </td>
                      <td style={{ padding: "6px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                        {f.scale || "—"}
                      </td>
                      <td style={{ padding: "6px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                        {f.keyType && f.keyType !== "NOT A KEY" ? (
                          <span style={{ fontSize: 9, background: "#78350f", color: "#fcd34d", padding: "2px 6px", borderRadius: 3 }}>
                            {f.keyType}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "6px 12px", color: f.nullable === "NOTNULL" ? "#f87171" : "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                        {f.nullable === "NOTNULL" ? "NOT NULL" : f.nullable || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
