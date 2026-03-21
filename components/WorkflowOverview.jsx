"use client";

import { useState, useMemo } from "react";
import { FONT_MONO } from "@/lib/constants";
import { WfIcon } from "@/components/icons";

// ─── Task type styling ────────────────────────────────────────────
const TASK_STYLES = {
  Start: { label: "START", color: "#6b7280", bg: "#1e1e2e" },
  Session: { label: "SESSION", color: "#60a5fa", bg: "#1e3a5f" },
  Command: { label: "COMMAND", color: "#f59e0b", bg: "#78350f" },
  Timer: { label: "TIMER", color: "#a78bfa", bg: "#4c1d95" },
  Decision: { label: "DECISION", color: "#f472b6", bg: "#831843" },
  Assignment: { label: "ASSIGN", color: "#2dd4bf", bg: "#115e59" },
  Email: { label: "EMAIL", color: "#fbbf24", bg: "#78350f" },
  Control: { label: "CONTROL", color: "#fb923c", bg: "#7c2d12" },
  "Event-Wait": { label: "EVENT", color: "#34d399", bg: "#065f46" },
};

function getTaskStyle(type) {
  return TASK_STYLES[type] || { label: (type || "TASK").toUpperCase(), color: "#93c5fd", bg: "#1e3a5f" };
}

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

  // Add orphan tasks not reached by the graph
  const staged = new Set(stages.flat().map((t) => t.name));
  const orphans = wf.tasks.filter((t) => !staged.has(t.name));
  if (orphans.length > 0) {
    stages.push(
      orphans.map((t) => ({
        ...t,
        session: sessions.find(
          (s) => s.name === t.name || s.name === t.transformationName
        ),
        incoming: incomingEdges.get(t.name) || [],
      }))
    );
  }

  return stages;
}

// ─── Main component ───────────────────────────────────────────────

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

        return (
          <div key={wi} style={{ border: "1px solid #1e1e2e", borderRadius: 10, overflow: "hidden" }}>
            {/* Header */}
            <div
              onClick={() => setExpanded(expanded === wi ? null : wi)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "14px 16px",
                background: expanded === wi ? "#2a1a0e" : "#0a0a0f",
                cursor: "pointer", transition: "background 0.2s",
              }}
            >
              <span style={{ color: "#f59e0b" }}><WfIcon /></span>
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
                <span style={{
                  fontSize: 9, padding: "3px 8px", borderRadius: 4, fontFamily: FONT_MONO, fontWeight: 600,
                  background: wf.isValid === "YES" ? "#065f46" : "#7f1d1d",
                  color: wf.isValid === "YES" ? "#6ee7b7" : "#fca5a5",
                }}>
                  {wf.isValid === "YES" ? "VALID" : "INVALID"}
                </span>
              )}
              <span style={{ color: "#f59e0b", fontSize: 11, fontFamily: FONT_MONO }}>
                {sessionTasks.length} session{sessionTasks.length !== 1 ? "s" : ""}
              </span>
              <span style={{ color: "#4a4a6a", fontSize: 11, fontFamily: FONT_MONO }}>
                {wf.tasks.length} task{wf.tasks.length !== 1 ? "s" : ""}
              </span>
              <span style={{
                color: "#4a4a6a",
                transform: expanded === wi ? "rotate(180deg)" : "rotate(0)",
                transition: "transform 0.2s",
              }}>
                ▾
              </span>
            </div>

            {/* Expanded: staged execution graph */}
            {expanded === wi && <WorkflowBody wf={wf} sessions={data.sessions} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Expanded body: staged execution graph ────────────────────────

function WorkflowBody({ wf, sessions }) {
  const stages = useMemo(() => buildStages(wf, sessions), [wf, sessions]);

  if (stages.length === 0) {
    return (
      <div style={{ padding: 16, background: "#08080d", borderTop: "1px solid #1e1e2e", textAlign: "center", color: "#4a4a6a", fontFamily: FONT_MONO, fontSize: 11 }}>
        No execution graph available
      </div>
    );
  }

  return (
    <div style={{ padding: 16, background: "#08080d", borderTop: "1px solid #1e1e2e" }}>
      <div style={{ fontSize: 9, color: "#6b7280", fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
        Execution Graph
      </div>

      {stages.map((stage, si) => (
        <div key={si}>
          {/* Connector between stages */}
          {si > 0 && <StageConnector stage={stage} />}

          {/* Stage row */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
            {/* Stage label */}
            <div style={{
              minWidth: 58, paddingTop: 8,
              fontSize: 9, color: "#4a4a6a", fontFamily: FONT_MONO, fontWeight: 500,
              textAlign: "right", flexShrink: 0,
            }}>
              {si === 0 ? "ROOT" : `STAGE ${si}`}
              {stage.length > 1 && (
                <div style={{ fontSize: 7, color: "#78350f", marginTop: 2, fontWeight: 600 }}>PARALLEL</div>
              )}
            </div>

            {/* Tasks in this stage */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
              {stage.map((task, ti) => (
                <TaskCard key={ti} task={task} />
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Workflow variables */}
      {wf.variables && wf.variables.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 9, color: "#6b7280", fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Variables
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {wf.variables.map((v, vi) => (
              <span key={vi} style={{
                fontSize: 9, background: "#581c87", color: "#c084fc", padding: "3px 8px",
                borderRadius: 4, fontFamily: FONT_MONO, border: "1px solid #581c8777",
              }}>
                {v.name}{v.defaultValue ? ` = ${v.defaultValue}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stage connector (line + conditions between stages) ───────────

function StageConnector({ stage }) {
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
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
      <div style={{ minWidth: 58, flexShrink: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <div style={{ width: 1, height: 12, background: "#1e1e2e", marginLeft: 14 }} />
        {conditions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginLeft: 22, marginBottom: 2 }}>
            {conditions.map((c, ci) => (
              <span
                key={ci}
                title={c.condition}
                style={{
                  fontSize: 8, color: "#f59e0b", fontFamily: FONT_MONO, opacity: 0.8,
                  maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {c.condition.length > 70 ? c.condition.slice(0, 68) + "…" : c.condition}
              </span>
            ))}
          </div>
        )}
        <div style={{ width: 1, height: conditions.length > 0 ? 4 : 0, background: "#1e1e2e", marginLeft: 14 }} />
      </div>
    </div>
  );
}

// ─── Task card ────────────────────────────────────────────────────

function TaskCard({ task }) {
  const style = getTaskStyle(task.type);

  return (
    <div style={{
      padding: "8px 12px", background: "#0b0b12", borderRadius: 6,
      border: "1px solid #1e1e2e", minWidth: 140, maxWidth: 300,
    }}>
      {/* Type badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{
          fontSize: 8, background: style.bg, color: style.color, padding: "2px 6px",
          borderRadius: 3, fontFamily: FONT_MONO, fontWeight: 600, letterSpacing: "0.03em",
        }}>
          {style.label}
        </span>
        {task.failParentIfInstanceFails === "YES" && (
          <span style={{ fontSize: 7, color: "#f87171", fontFamily: FONT_MONO }}>FAIL-PARENT</span>
        )}
      </div>
      {/* Task name */}
      <div style={{ color: "#e2e8f0", fontSize: 11, fontFamily: FONT_MONO, fontWeight: 500, wordBreak: "break-all" }}>
        {task.name}
      </div>
      {/* Session → mapping reference */}
      {task.session?.mappingName && (
        <div style={{ marginTop: 3, fontSize: 9, fontFamily: FONT_MONO }}>
          <span style={{ color: "#4a4a6a" }}>→ </span>
          <span style={{ color: "#93c5fd" }}>{task.session.mappingName}</span>
        </div>
      )}
      {/* Incoming conditions (non-trivial) */}
      {task.incoming && task.incoming.length > 0 && task.incoming.some((i) => i.condition && i.condition !== "1=1") && (
        <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
          {task.incoming
            .filter((i) => i.condition && i.condition !== "1=1")
            .map((inc, ii) => (
              <div key={ii} style={{ fontSize: 7, color: "#f59e0b", fontFamily: FONT_MONO, opacity: 0.7 }} title={inc.condition}>
                ← {inc.from}: {inc.condition.length > 35 ? inc.condition.slice(0, 33) + "…" : inc.condition}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
