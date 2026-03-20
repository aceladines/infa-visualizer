"use client";

import { useState } from "react";
import { FONT_MONO } from "@/lib/constants";
import { DBIcon } from "@/components/icons";

const COLOR_MAP = {
  source: { main: "#10b981", bg: "#0a2e1f", text: "#6ee7b7", badge: "#065f46", sub: "#064e3b" },
  target: { main: "#a78bfa", bg: "#1e1434", text: "#c4b5fd", badge: "#4c1d95", sub: "#3b0764" },
};

export default function EntityDetailPanel({ entities, type }) {
  const [expanded, setExpanded] = useState(null);
  const color = COLOR_MAP[type] || COLOR_MAP.source;

  if (entities.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#4a4a6a", fontFamily: FONT_MONO, fontSize: 13 }}>
        No {type}s found in this export
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {entities.map((entity, i) => (
        <div key={i} style={{ border: "1px solid #1e1e2e", borderRadius: 10, overflow: "hidden" }}>
          {/* Accordion header */}
          <div
            onClick={() => setExpanded(expanded === i ? null : i)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px",
              background: expanded === i ? color.bg : "#0a0a0f",
              cursor: "pointer",
              transition: "background 0.2s",
            }}
          >
            <span style={{ color: color.main }}>
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
                    <span style={{ fontSize: 9, background: color.sub, color: color.text + "99", padding: "1px 6px", borderRadius: 3, fontFamily: FONT_MONO }}>
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
            <span style={{ color: "#4a4a6a", fontSize: 11, fontFamily: FONT_MONO }}>
              {entity.fields.length} cols
            </span>
            <span
              style={{
                color: "#4a4a6a",
                transform: expanded === i ? "rotate(180deg)" : "rotate(0)",
                transition: "transform 0.2s",
              }}
            >
              ▾
            </span>
          </div>

          {/* Description */}
          {entity.description && expanded === i && (
            <div style={{ padding: "6px 16px 0", fontSize: 10, color: "#6b7280", fontFamily: FONT_MONO, background: color.bg }}>
              {entity.description}
            </div>
          )}

          {/* Fields table */}
          {expanded === i && entity.fields.length > 0 && (
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT_MONO }}>
                <thead>
                  <tr style={{ background: "#0d0d15" }}>
                    {["#", "Field", "Datatype", "Precision", "Scale", "Key", "Nullable"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "8px 12px",
                          textAlign: "left",
                          color: "#4a4a6a",
                          fontWeight: 500,
                          borderBottom: "1px solid #1e1e2e",
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
                    <tr key={fi} style={{ background: fi % 2 === 0 ? "#08080d" : "#0b0b12" }}>
                      <td style={{ padding: "6px 12px", color: "#4a4a6a", borderBottom: "1px solid #12121f" }}>
                        {f.fieldNumber || fi + 1}
                      </td>
                      <td style={{ padding: "6px 12px", color: "#e2e8f0", borderBottom: "1px solid #12121f", fontWeight: 500 }}>
                        {f.name}
                      </td>
                      <td style={{ padding: "6px 12px", color: color.text, borderBottom: "1px solid #12121f" }}>
                        {f.datatype}
                      </td>
                      <td style={{ padding: "6px 12px", color: "#6b7280", borderBottom: "1px solid #12121f" }}>
                        {f.precision || "—"}
                      </td>
                      <td style={{ padding: "6px 12px", color: "#6b7280", borderBottom: "1px solid #12121f" }}>
                        {f.scale || "—"}
                      </td>
                      <td style={{ padding: "6px 12px", borderBottom: "1px solid #12121f" }}>
                        {f.keyType && f.keyType !== "NOT A KEY" ? (
                          <span style={{ fontSize: 9, background: "#78350f", color: "#fcd34d", padding: "2px 6px", borderRadius: 3 }}>
                            {f.keyType}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "6px 12px", color: f.nullable === "NOTNULL" ? "#f87171" : "#6b7280", borderBottom: "1px solid #12121f" }}>
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
