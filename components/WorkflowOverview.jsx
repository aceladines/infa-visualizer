"use client";

import { useState, useMemo } from "react";
import { FONT_MONO, getTaskStyles } from "@/lib/constants";
import { useTheme } from "@/lib/ThemeContext";
import { WfIcon } from "@/components/icons";
import { ExpandableText, TextViewerModal } from "@/components/ui";

// ─── Build topological stages from workflow links ─────────────────

function buildStages(wf, sessions) {
  const taskByName = new Map();
  wf.tasks.forEach((t) => taskByName.set(t.name, t));

  const adj = new Map();
  const inDeg = new Map();
  const incomingEdges = new Map();

  wf.tasks.forEach((t) => {
    adj.set(t.name, []);
    inDeg.set(t.name, 0);
    incomingEdges.set(t.name, []);
  });

  wf.links.forEach((l) => {
    if (!l.from || !l.to) return;
    if (!adj.has(l.from)) adj.set(l.from, []);
    adj.get(l.from).push(l.to);
    inDeg.set(l.to, (inDeg.get(l.to) || 0) + 1);
    if (!incomingEdges.has(l.to)) incomingEdges.set(l.to, []);
    incomingEdges.get(l.to).push({ from: l.from, condition: l.condition || "" });
  });

  // Kahn's algorithm with level tracking — preserves parallel branches
  const stages = [];
  let current = [];
  wf.tasks.forEach((t) => {
    if ((inDeg.get(t.name) || 0) === 0) current.push(t.name);
  });

  const visited = new Set();
  let safety = 0;
  while (current.length > 0 && safety < 1000) {
    safety++;
    stages.push(
      current.map((name) => {
        const task = taskByName.get(name) || { name, type: "Unknown" };
        const session = sessions.find(
          (s) => s.name === name || s.name === task.transformationName
        );
        return { ...task, session, incoming: incomingEdges.get(name) || [] };
      })
    );

    const next = new Set();
    current.forEach((name) => {
      visited.add(name);
      (adj.get(name) || []).forEach((n) => {
        inDeg.set(n, (inDeg.get(n) || 0) - 1);
        if (inDeg.get(n) <= 0 && !visited.has(n)) next.add(n);
      });
    });

    current = [...next];
  }

  // Separate orphan tasks — these are auxiliary/unlinked, not part of main execution
  const staged = new Set(stages.flat().map((t) => t.name));
  const auxiliaryTasks = wf.tasks
    .filter((t) => !staged.has(t.name))
    .map((t) => ({
      ...t,
      session: sessions.find(
        (s) => s.name === t.name || s.name === t.transformationName
      ),
      incoming: incomingEdges.get(t.name) || [],
    }));

  return { stages, auxiliaryTasks };
}

// ─── Helper to get task style ─────────────────────────────────────

function getTaskStyle(type, taskStyles) {
  return taskStyles[type] || { label: (type || "TASK").toUpperCase(), color: "#93c5fd", bg: "#1e3a5f" };
}

// ─── Main component ───────────────────────────────────────────────

export default function WorkflowOverview({ data }) {
  const [expanded, setExpanded] = useState(null);
  const [viewerText, setViewerText] = useState(null);
  const { theme } = useTheme();
  const taskStyles = getTaskStyles(theme);

  if (data.workflows.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontFamily: FONT_MONO, fontSize: 13 }}>
        No workflows found
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.workflows.map((wf, wi) => {
        const sessionTasks = wf.tasks.filter((t) => t.type === "Session");

        return (
          <div key={wi} style={{ border: "1px solid var(--border-primary)", borderRadius: 10, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
            {/* Header */}
            <div
              onClick={() => setExpanded(expanded === wi ? null : wi)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
                background: expanded === wi ? "var(--bg-expanded)" : "var(--bg-tertiary)",
                cursor: "pointer", transition: "background 0.2s",
              }}
            >
              <span style={{ color: "#f59e0b" }}><WfIcon /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: theme === "light" ? "#c2410c" : "#fcd34d", fontFamily: FONT_MONO, fontSize: 14, fontWeight: 600 }}>
                  {wf.name}
                </div>
                {wf.description && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: FONT_MONO, marginTop: 2 }}>
                    {wf.description}
                  </div>
                )}
              </div>
              {wf.isValid && (
                <span style={{
                  fontSize: 10, padding: "3px 10px", borderRadius: 4, fontFamily: FONT_MONO, fontWeight: 600,
                  background: wf.isValid === "YES" ? "#065f46" : "#7f1d1d",
                  color: wf.isValid === "YES" ? "#6ee7b7" : "#fca5a5",
                }}>
                  {wf.isValid === "YES" ? "VALID" : "INVALID"}
                </span>
              )}
              <span style={{
                fontSize: 10, padding: "3px 10px", borderRadius: 20,
                background: "var(--bg-surface-alt)", border: "1px solid var(--border-primary)",
                color: "#f59e0b", fontFamily: FONT_MONO, fontWeight: 500,
              }}>
                {sessionTasks.length} session{sessionTasks.length !== 1 ? "s" : ""}
              </span>
              <span style={{
                fontSize: 10, padding: "3px 10px", borderRadius: 20,
                background: "var(--bg-surface-alt)", border: "1px solid var(--border-primary)",
                color: "var(--text-secondary)", fontFamily: FONT_MONO, fontWeight: 500,
              }}>
                {wf.tasks.length} task{wf.tasks.length !== 1 ? "s" : ""}
              </span>
              <span style={{
                color: "var(--text-muted)",
                transform: expanded === wi ? "rotate(180deg)" : "rotate(0)",
                transition: "transform 0.2s",
              }}>
                ▾
              </span>
            </div>

            {/* Expanded: staged execution graph */}
            {expanded === wi && <WorkflowBody wf={wf} sessions={data.sessions} taskStyles={taskStyles} theme={theme} onViewText={setViewerText} />}
          </div>
        );
      })}

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

// ─── Expanded body: staged execution graph ────────────────────────

function WorkflowBody({ wf, sessions, taskStyles, theme, onViewText }) {
  const { stages, auxiliaryTasks } = useMemo(() => buildStages(wf, sessions), [wf, sessions]);

  if (stages.length === 0 && auxiliaryTasks.length === 0) {
    return (
      <div style={{ padding: 20, background: "var(--bg-secondary)", borderTop: "1px solid var(--border-primary)", textAlign: "center", color: "var(--text-muted)", fontFamily: FONT_MONO, fontSize: 12 }}>
        No execution graph available
      </div>
    );
  }

  return (
    <div style={{ padding: 20, background: "var(--bg-secondary)", borderTop: "1px solid var(--border-primary)" }}>
      {stages.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16, fontWeight: 600 }}>
            Execution Graph
          </div>

          {stages.map((stage, si) => (
            <div key={si}>
              {/* Connector between stages */}
              {si > 0 && <StageConnector stage={stage} theme={theme} onViewText={onViewText} />}

              {/* Stage section */}
              <div style={{
                border: "1px solid var(--border-primary)",
                borderRadius: 8,
                overflow: "hidden",
                marginBottom: 4,
                boxShadow: "var(--shadow-sm)",
              }}>
                {/* Stage header bar */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 16px",
                  background: "var(--bg-table-header)",
                  borderBottom: "1px solid var(--border-primary)",
                  borderLeft: `3px solid ${si === 0 ? "#6b7280" : "#60a5fa"}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: FONT_MONO, fontWeight: 600 }}>
                      {si === 0 ? "ROOT" : `STAGE ${si}`}
                    </span>
                    {stage.length > 1 && (
                      <span style={{
                        fontSize: 9, padding: "2px 8px", borderRadius: 10,
                        background: theme === "light" ? "#fef3c7" : "#78350f",
                        color: theme === "light" ? "#b45309" : "#fcd34d",
                        fontFamily: FONT_MONO, fontWeight: 600,
                      }}>
                        PARALLEL
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: FONT_MONO }}>
                    {stage.length} task{stage.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Tasks in this stage */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "12px 16px" }}>
                  {stage.map((task, ti) => (
                    <TaskCard key={ti} task={task} taskStyles={taskStyles} onViewText={onViewText} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Auxiliary / Unlinked tasks — not connected via WORKFLOWLINK */}
      {auxiliaryTasks.length > 0 && (
        <div style={{ marginTop: stages.length > 0 ? 24 : 0 }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, fontWeight: 600 }}>
            Auxiliary / Unlinked Tasks
          </div>
          <div style={{
            padding: "12px 16px", background: "var(--bg-primary)", borderRadius: 8,
            border: "1px dashed var(--border-primary)",
          }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", opacity: 0.7 }}>
              {auxiliaryTasks.map((task, ti) => (
                <TaskCard key={ti} task={task} taskStyles={taskStyles} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Workflow variables */}
      {wf.variables && wf.variables.length > 0 && (
        <VariablesTable variables={wf.variables} theme={theme} />
      )}
    </div>
  );
}

// ─── Stage connector (line + conditions between stages) ───────────

function StageConnector({ stage, theme, onViewText }) {
  // Collect non-trivial conditions from incoming edges
  const conditions = [];
  const seen = new Set();
  stage.forEach((task) => {
    (task.incoming || []).forEach((inc) => {
      const cond = (inc.condition || "").trim();
      if (cond && cond !== "1=1") {
        const key = `${cond}`;
        if (!seen.has(key)) {
          seen.add(key);
          conditions.push({ from: inc.from, to: task.name, condition: cond });
        }
      }
    });
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", paddingLeft: 28, marginBottom: 4 }}>
      <div style={{ width: 2, height: 10, background: "var(--border-primary)", marginLeft: 4 }} />
      {conditions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginLeft: 16, marginBottom: 3 }}>
          {conditions.map((c, ci) => (
            <div
              key={ci}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 10, fontFamily: FONT_MONO,
              }}
            >
              <span style={{
                fontSize: 8, padding: "1px 6px", borderRadius: 3, fontWeight: 600,
                background: theme === "light" ? "#fef3c7" : "#78350f",
                color: theme === "light" ? "#b45309" : "#fcd34d",
                letterSpacing: "0.03em",
              }}>
                IF
              </span>
              <span style={{ color: "#f59e0b", flex: 1, minWidth: 0, overflow: "hidden" }}>
                <ExpandableText text={c.condition} onExpand={() => onViewText({ title: `Condition: ${c.from} → ${c.to}`, text: c.condition })} />
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{ width: 2, height: conditions.length > 0 ? 6 : 10, background: "var(--border-primary)", marginLeft: 4 }} />
      <div style={{ marginLeft: 1, color: "var(--border-secondary)", fontSize: 8, lineHeight: 1 }}>▼</div>
    </div>
  );
}

// ─── Task card ────────────────────────────────────────────────────

function TaskCard({ task, taskStyles, onViewText }) {
  const style = getTaskStyle(task.type, taskStyles);

  return (
    <div style={{
      padding: "12px 16px", background: "var(--bg-surface-alt)", borderRadius: 8,
      border: "1px solid var(--border-primary)", minWidth: 200, maxWidth: 450,
      borderLeft: `3px solid ${style.color}`,
      boxShadow: "var(--shadow-sm)",
    }}>
      {/* Type badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, background: style.bg, color: style.color, padding: "3px 8px",
          borderRadius: 4, fontFamily: FONT_MONO, fontWeight: 600, letterSpacing: "0.03em",
        }}>
          {style.label}
        </span>
        {task.failParentIfInstanceFails === "YES" && (
          <span style={{ fontSize: 9, color: "#f87171", fontFamily: FONT_MONO, fontWeight: 600 }}>FAIL-PARENT</span>
        )}
      </div>
      {/* Task name */}
      <div style={{ color: "var(--text-primary)", fontSize: 13, fontFamily: FONT_MONO, fontWeight: 500, wordBreak: "break-all" }}>
        {task.name}
      </div>
      {/* Session → mapping reference */}
      {task.session?.mappingName && (
        <div style={{ marginTop: 4, fontSize: 11, fontFamily: FONT_MONO }}>
          <span style={{ color: "var(--text-muted)" }}>→ </span>
          <span style={{ color: "#60a5fa" }}>{task.session.mappingName}</span>
        </div>
      )}
      {/* Incoming conditions (non-trivial) */}
      {task.incoming && task.incoming.length > 0 && task.incoming.some((i) => i.condition && i.condition !== "1=1") && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
          {task.incoming
            .filter((i) => i.condition && i.condition !== "1=1")
            .map((inc, ii) => (
              <div key={ii} style={{ fontSize: 10, color: "#f59e0b", fontFamily: FONT_MONO, opacity: 0.8, display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                <span style={{ flexShrink: 0 }}>← {inc.from}:</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <ExpandableText text={inc.condition} onExpand={() => onViewText({ title: `Condition: ${inc.from} → ${task.name}`, text: inc.condition })} />
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ─── Variables table ──────────────────────────────────────────────

function VariablesTable({ variables, theme }) {
  const varColor = theme === "light" ? "#7c3aed" : "#c084fc";
  const prefixColor = theme === "light" ? "#a78bfa" : "#7c3aed";

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, fontWeight: 600 }}>
        Variables ({variables.length})
      </div>
      <div style={{ border: "1px solid var(--border-primary)", borderRadius: 8, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT_MONO }}>
          <thead>
            <tr style={{ background: "var(--bg-table-header)" }}>
              <th style={{ padding: "8px 14px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500, borderBottom: "1px solid var(--border-primary)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>Name</th>
              <th style={{ padding: "8px 14px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500, borderBottom: "1px solid var(--border-primary)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>Datatype</th>
              <th style={{ padding: "8px 14px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500, borderBottom: "1px solid var(--border-primary)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>Default Value</th>
            </tr>
          </thead>
          <tbody>
            {variables.map((v, vi) => (
              <tr key={vi} style={{ background: vi % 2 === 0 ? "var(--bg-table-even)" : "var(--bg-table-odd)" }}>
                <td style={{ padding: "7px 14px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ color: prefixColor }}>$$</span>
                  <span style={{ color: varColor, fontWeight: 500 }}>{v.name.replace(/^\$\$/, "")}</span>
                </td>
                <td style={{ padding: "7px 14px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                  {v.datatype || "String"}{v.precision ? `(${v.precision})` : ""}
                </td>
                <td style={{ padding: "7px 14px", borderBottom: "1px solid var(--border-subtle)", color: v.defaultValue ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {v.defaultValue || "(none)"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
