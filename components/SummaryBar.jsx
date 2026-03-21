"use client";

import { SUMMARY_STATS, FONT_MONO } from "@/lib/constants";

export default function SummaryBar({ data }) {
  // Filter to only show stats with at least 1 item
  const visible = SUMMARY_STATS.filter((s) => {
    const arr = data[s.key];
    return Array.isArray(arr) && arr.length > 0;
  });

  if (visible.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "14px 0" }}>
      {visible.map((s) => (
        <div
          key={s.key}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border-primary)",
            borderRadius: 8,
            minWidth: 100,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: FONT_MONO }}>
            {data[s.key]?.length ?? 0}
          </span>
          <span
            style={{
              fontSize: 10,
              color: "var(--text-secondary)",
              fontFamily: FONT_MONO,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}
