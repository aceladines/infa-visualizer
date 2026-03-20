"use client";

import { useState } from "react";
import { FONT_MONO } from "@/lib/constants";
import { WfIcon } from "@/components/icons";

export default function WorkflowOverview({ data }) {
  const [expanded, setExpanded] = useState(null);

  if (data.workflows.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#4a4a6a", fontFamily: FONT_MONO, fontSize: 13 }}>
        No workflows found
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.workflows.map((wf, wi) => {
        const sessionTasks = wf.tasks.filter((t) => t.type === "Session");
        const otherTasks = wf.tasks.filter((t) => t.type !== "Session" && t.type !== "Start");

        return (
          <div key={wi} style={{ border: "1px solid #1e1e2e", borderRadius: 10, overflow: "hidden" }}>
            {/* Header */}
            <div
              onClick={() => setExpanded(expanded === wi ? null : wi)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 16px",
                background: expanded === wi ? "#2a1a0e" : "#0a0a0f",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
            >
              <span style={{ color: "#f59e0b" }}>
                <WfIcon />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#fcd34d", fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600 }}>
                  {wf.name}
                </div>
                {wf.description && (
                  <div style={{ fontSize: 10, color: "#6b728099", fontFamily: FONT_MONO, marginTop: 2 }}>
                    {wf.description}
                  </div>
                )}
              </div>
              {wf.isValid && (
                <span
                  style={{
                    fontSize: 9,
                    padding: "3px 8px",
                    borderRadius: 4,
                    fontFamily: FONT_MONO,
                    fontWeight: 600,
                    background: wf.isValid === "YES" ? "#065f46" : "#7f1d1d",
                    color: wf.isValid === "YES" ? "#6ee7b7" : "#fca5a5",
                  }}
                >
                  {wf.isValid === "YES" ? "VALID" : "INVALID"}
                </span>
              )}
              <span style={{ color: "#f59e0b", fontSize: 11, fontFamily: FONT_MONO }}>
                {sessionTasks.length} session{sessionTasks.length !== 1 ? "s" : ""}
              </span>
              <span
                style={{
                  color: "#4a4a6a",
                  transform: expanded === wi ? "rotate(180deg)" : "rotate(0)",
                  transition: "transform 0.2s",
                }}
              >
                ▾
              </span>
            </div>

            {/* Expanded body */}
            {expanded === wi && (
              <div style={{ padding: "12px 16px", background: "#08080d", borderTop: "1px solid #1e1e2e" }}>
                {/* Sessions */}
                {sessionTasks.length > 0 && (
                  <Section title="Sessions">
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {sessionTasks.map((t, ti) => {
                        const session = data.sessions.find(
                          (s) => s.name === t.name || s.name === t.transformationName
                        );
                        return (
                          <div
                            key={ti}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "8px 12px",
                              background: "#0b0b12",
                              borderRadius: 6,
                              border: "1px solid #1e1e2e",
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#60a5fa", flexShrink: 0 }} />
                            <span style={{ color: "#e2e8f0", fontSize: 11, fontFamily: FONT_MONO, fontWeight: 500 }}>
                              {t.name}
                            </span>
                            {session?.mappingName && (
                              <span
                                style={{
                                  fontSize: 8,
                                  background: "#1e3a5f",
                                  color: "#93c5fd",
                                  padding: "2px 6px",
                                  borderRadius: 3,
                                  fontFamily: FONT_MONO,
                                }}
                              >
                                → {session.mappingName}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Section>
                )}

                {/* Other tasks */}
                {otherTasks.length > 0 && (
                  <Section title="Other Tasks">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {otherTasks.map((t, ti) => (
                        <span
                          key={ti}
                          style={{
                            fontSize: 10,
                            background: "#78350f33",
                            color: "#fcd34d",
                            padding: "4px 8px",
                            borderRadius: 4,
                            fontFamily: FONT_MONO,
                            border: "1px solid #78350f55",
                          }}
                        >
                          {t.type}: {t.name}
                        </span>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Execution order */}
                {wf.links.length > 0 && (
                  <Section title="Execution Order" noMargin>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {wf.links.map((l, li) => (
                        <div
                          key={li}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 10,
                            fontFamily: FONT_MONO,
                            padding: "4px 8px",
                            background: "#0d0d15",
                            borderRadius: 4,
                          }}
                        >
                          <span style={{ color: "#e2e8f0" }}>{l.from}</span>
                          <span style={{ color: "#4a4a6a" }}>→</span>
                          <span style={{ color: "#e2e8f0" }}>{l.to}</span>
                          {l.condition && (
                            <span style={{ color: "#f59e0b", fontSize: 8, marginLeft: 4, opacity: 0.7 }}>
                              {l.condition.length > 50 ? l.condition.slice(0, 48) + "…" : l.condition}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, noMargin, children }) {
  return (
    <div style={{ marginBottom: noMargin ? 0 : 12 }}>
      <div
        style={{
          fontSize: 9,
          color: "#6b7280",
          fontFamily: FONT_MONO,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
