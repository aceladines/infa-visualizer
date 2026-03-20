"use client";

import { useState, useMemo } from "react";
import { FONT_MONO } from "@/lib/constants";
import { WfIcon } from "@/components/icons";
import { buildSessionDependencies } from "@/lib/buildFlowGraph";

export default function WorkflowOverview({ data }) {
  const [expanded, setExpanded] = useState(null);
  const sessionDeps = useMemo(() => buildSessionDependencies(data), [data]);

  if (data.workflows.length === 0) {
    return <div style={{ padding: 32, textAlign: "center", color: "#4a4a6a", fontFamily: FONT_MONO, fontSize: 13 }}>No workflows found</div>;
  }

  function findSession(task) {
    const tn = (task.transformationName || "").toLowerCase();
    const iname = (task.name || "").toLowerCase();
    return data.sessions.find((s) => {
      const sn = s.name.toLowerCase();
      return sn === tn || sn === iname;
    }) || null;
  }

  // Get dependencies relevant to a workflow's sessions
  function getWorkflowDeps(wf) {
    const sessionNames = new Set(wf.tasks.filter((t) => t.type === "Session").map((t) => t.name));
    return sessionDeps.filter((d) => sessionNames.has(d.producerSession) || sessionNames.has(d.consumerSession));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.workflows.map((wf, wi) => {
        const sessionTasks = wf.tasks.filter((t) => t.type === "Session");
        const otherTasks = wf.tasks.filter((t) => t.type !== "Session" && t.type !== "Start");
        const deps = getWorkflowDeps(wf);

        return (
          <div key={wi} style={{ border: "1px solid #1e1e2e", borderRadius: 10, overflow: "hidden" }}>
            <div onClick={() => setExpanded(expanded === wi ? null : wi)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: expanded === wi ? "#2a1a0e" : "#0a0a0f", cursor: "pointer", transition: "background 0.2s" }}>
              <span style={{ color: "#f59e0b" }}><WfIcon /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#fcd34d", fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600 }}>{wf.name}</div>
                {wf.description && <div style={{ fontSize: 10, color: "#6b728099", fontFamily: FONT_MONO, marginTop: 2 }}>{wf.description}</div>}
              </div>
              {wf.isValid && <span style={{ fontSize: 9, padding: "3px 8px", borderRadius: 4, fontFamily: FONT_MONO, fontWeight: 600, background: wf.isValid === "YES" ? "#065f46" : "#7f1d1d", color: wf.isValid === "YES" ? "#6ee7b7" : "#fca5a5" }}>{wf.isValid === "YES" ? "VALID" : "INVALID"}</span>}
              <span style={{ color: "#f59e0b", fontSize: 11, fontFamily: FONT_MONO }}>{sessionTasks.length} session{sessionTasks.length !== 1 ? "s" : ""}</span>
              <span style={{ color: "#4a4a6a", transform: expanded === wi ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▾</span>
            </div>

            {expanded === wi && (
              <div style={{ padding: "12px 16px", background: "#08080d", borderTop: "1px solid #1e1e2e" }}>
                {/* Cross-session table dependencies */}
                {deps.length > 0 && (
                  <Section title={`Table Dependencies (${deps.length})`}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {deps.map((d, di) => (
                        <div key={di} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#1a0a0a", borderRadius: 6, border: "1px solid #7f1d1d44", flexWrap: "wrap", fontSize: 10, fontFamily: FONT_MONO }}>
                          <span style={{ color: "#fcd34d", fontWeight: 600 }}>{d.producerSession}</span>
                          <span style={{ color: "#4a4a6a" }}>writes →</span>
                          <span style={{ color: "#f87171", fontWeight: 600, background: "#7f1d1d33", padding: "1px 6px", borderRadius: 3 }}>{d.sharedTable}</span>
                          <span style={{ color: "#4a4a6a" }}>→ reads</span>
                          <span style={{ color: "#93c5fd", fontWeight: 600 }}>{d.consumerSession}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Sessions */}
                {sessionTasks.length > 0 && (
                  <Section title="Sessions">
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {sessionTasks.map((t, ti) => {
                        const session = findSession(t);
                        return (
                          <div key={ti} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#0b0b12", borderRadius: 6, border: "1px solid #1e1e2e", flexWrap: "wrap" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: session ? "#60a5fa" : "#f87171", flexShrink: 0 }} />
                            <span style={{ color: "#e2e8f0", fontSize: 11, fontFamily: FONT_MONO, fontWeight: 500 }}>{t.name}</span>
                            {t.transformationName && t.transformationName !== t.name && (
                              <span style={{ fontSize: 8, background: "#1e1e2e", color: "#6b7280", padding: "2px 6px", borderRadius: 3, fontFamily: FONT_MONO }}>ref: {t.transformationName}</span>
                            )}
                            {session?.mappingName && <span style={{ fontSize: 8, background: "#1e3a5f", color: "#93c5fd", padding: "2px 6px", borderRadius: 3, fontFamily: FONT_MONO }}>→ {session.mappingName}</span>}
                            {!session && <span style={{ fontSize: 8, background: "#7f1d1d", color: "#fca5a5", padding: "2px 6px", borderRadius: 3, fontFamily: FONT_MONO }}>session not found</span>}
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
                        <span key={ti} style={{ fontSize: 10, background: "#78350f33", color: "#fcd34d", padding: "4px 8px", borderRadius: 4, fontFamily: FONT_MONO, border: "1px solid #78350f55" }}>{t.type}: {t.name}</span>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Execution order */}
                {wf.links.length > 0 && (
                  <Section title={`Execution Order (${wf.links.length} links)`}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {wf.links.map((l, li) => (
                        <div key={li} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontFamily: FONT_MONO, padding: "4px 8px", background: "#0d0d15", borderRadius: 4, flexWrap: "wrap" }}>
                          <span style={{ color: "#e2e8f0" }}>{l.from}</span>
                          <span style={{ color: "#4a4a6a" }}>→</span>
                          <span style={{ color: "#e2e8f0" }}>{l.to}</span>
                          {l.condition && <span style={{ color: "#f59e0b", fontSize: 8, opacity: 0.7, wordBreak: "break-all" }}>{l.condition.length > 80 ? l.condition.slice(0, 78) + "…" : l.condition}</span>}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Worklets */}
                {wf.worklets && wf.worklets.length > 0 && (
                  <Section title={`Worklets (${wf.worklets.length})`}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {wf.worklets.map((wl, wli) => (
                        <div key={wli} style={{ padding: "8px 12px", background: "#0b0b12", borderRadius: 6, border: "1px solid #1e1e2e" }}>
                          <div style={{ color: "#fcd34d", fontSize: 11, fontFamily: FONT_MONO, fontWeight: 500 }}>{wl.name}</div>
                          <div style={{ fontSize: 9, color: "#4a4a6a", fontFamily: FONT_MONO, marginTop: 2 }}>{wl.tasks.length} tasks · {wl.links.length} links</div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Variables */}
                {wf.variables && wf.variables.length > 0 && (
                  <Section title={`Variables (${wf.variables.length})`} noMargin>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {wf.variables.map((v, vi) => (
                        <span key={vi} style={{ fontSize: 9, background: "#1e1e2e", color: "#6b7280", padding: "3px 8px", borderRadius: 3, fontFamily: FONT_MONO }}>{v.name}: {v.datatype} = {v.defaultValue || "null"}</span>
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
      <div style={{ fontSize: 9, color: "#6b7280", fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}
