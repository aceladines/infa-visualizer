"use client";

import React, { useState, useMemo } from "react";
import { FONT_MONO } from "@/lib/constants";
import { DBIcon } from "@/components/icons";
import { SortArrow } from "@/components/ui";

export default function FieldMappingTable({ data, selectedMapping }) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [collapsed, setCollapsed] = useState({});
  const [expandedRows, setExpandedRows] = useState({});

  const filtered = useMemo(() => {
    let fm = data.fieldMappings;
    if (selectedMapping && selectedMapping !== "all") {
      fm = fm.filter((m) => m.mappingName === selectedMapping);
    }
    if (search) {
      const q = search.toLowerCase();
      fm = fm.filter(
        (m) =>
          m.sourceTable.toLowerCase().includes(q) ||
          m.sourceField.toLowerCase().includes(q) ||
          m.targetTable.toLowerCase().includes(q) ||
          m.targetField.toLowerCase().includes(q) ||
          (m.transformation || "").toLowerCase().includes(q) ||
          (m.sourceDB || "").toLowerCase().includes(q) ||
          (m.targetDB || "").toLowerCase().includes(q) ||
          (m.transformationSteps || []).some(
            (s) => (s.expression || "").toLowerCase().includes(q) || (s.instance || "").toLowerCase().includes(q)
          )
      );
    }
    if (sortCol) {
      fm = [...fm].sort((a, b) => {
        const va = (a[sortCol] || "").toLowerCase();
        const vb = (b[sortCol] || "").toLowerCase();
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return fm;
  }, [data, selectedMapping, search, sortCol, sortDir]);

  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach((m) => {
      const key = `${m.mappingName}::${m.sourceTable}→${m.targetTable}`;
      if (!groups[key]) {
        groups[key] = {
          source: m.sourceTable,
          target: m.targetTable,
          sourceDB: m.sourceDB,
          targetDB: m.targetDB,
          sourceOwner: m.sourceOwner,
          targetOwner: m.targetOwner,
          mappingName: m.mappingName,
          fields: [],
        };
      }
      groups[key].fields.push(m);
    });
    return Object.values(groups);
  }, [filtered]);

  const toggleCollapse = (key) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allCollapsed = grouped.length > 0 && grouped.every((_, i) => collapsed[i]);
  const toggleAll = () => {
    const next = {};
    grouped.forEach((_, i) => { next[i] = !allCollapsed; });
    setCollapsed(next);
  };

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const columns = [
    { key: "sourceField", label: "Source Field" },
    { key: "targetField", label: "Target Field" },
    { key: "transformation", label: "Via" },
  ];

  return (
    <div>
      {/* Search bar */}
      <div style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search fields, tables, databases..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: "10px 16px",
            background: "#0a0a0f",
            border: "1px solid #1e1e2e",
            borderRadius: 8,
            color: "#e2e8f0",
            fontSize: 13,
            fontFamily: FONT_MONO,
            outline: "none",
          }}
        />
        <div
          style={{
            padding: "10px 16px",
            background: "#0a0a0f",
            border: "1px solid #1e1e2e",
            borderRadius: 8,
            color: "#6b7280",
            fontSize: 12,
            fontFamily: FONT_MONO,
            display: "flex",
            alignItems: "center",
          }}
        >
          {filtered.length} mapping{filtered.length !== 1 ? "s" : ""}
        </div>
        {grouped.length > 1 && (
          <button
            onClick={toggleAll}
            style={{
              padding: "10px 16px",
              background: "#0a0a0f",
              border: "1px solid #1e1e2e",
              borderRadius: 8,
              color: "#6b7280",
              fontSize: 11,
              fontFamily: FONT_MONO,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 10 }}>{allCollapsed ? "▶" : "▼"}</span>
            {allCollapsed ? "Expand All" : "Collapse All"}
          </button>
        )}
      </div>

      {/* Results */}
      {grouped.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#4a4a6a", fontFamily: FONT_MONO, fontSize: 13 }}>
          {data.fieldMappings.length === 0
            ? "No field-level connectors found in this export. The XML may only contain workflow-level definitions."
            : "No matches found"}
        </div>
      ) : (
        grouped.map((group, gi) => (
          <div key={gi} style={{ marginBottom: 24 }}>
            {/* Group header */}
            <div
              onClick={() => toggleCollapse(gi)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                padding: "12px 16px",
                background: "linear-gradient(135deg, #0a2e1f, #1a1a2e, #1e1434)",
                borderRadius: collapsed[gi] ? 10 : "10px 10px 0 0",
                border: "1px solid #1e1e2e",
                borderBottom: collapsed[gi] ? "1px solid #1e1e2e" : "none",
                cursor: "pointer",
                userSelect: "none",
                transition: "border-radius 0.15s",
              }}
            >
              <span style={{ color: "#4a4a6a", fontSize: 10, width: 14, textAlign: "center", flexShrink: 0 }}>
                {collapsed[gi] ? "▶" : "▼"}
              </span>
              <TableRef
                icon={<DBIcon />}
                name={group.source}
                db={group.sourceDB}
                owner={group.sourceOwner}
                nameColor="#6ee7b7"
                iconColor="#10b981"
                dbBg="#065f46"
                ownerBg="#064e3b"
              />
              <span style={{ color: "#4a4a6a", fontSize: 16 }}>→</span>
              <TableRef
                icon={<DBIcon />}
                name={group.target}
                db={group.targetDB}
                owner={group.targetOwner}
                nameColor="#c4b5fd"
                iconColor="#a78bfa"
                dbBg="#4c1d95"
                ownerBg="#3b0764"
              />
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                {group.mappingName && (
                  <span
                    style={{
                      fontSize: 8,
                      background: "#1e1e2e",
                      color: "#6b7280",
                      padding: "2px 6px",
                      borderRadius: 3,
                      fontFamily: FONT_MONO,
                    }}
                  >
                    {group.mappingName}
                  </span>
                )}
                <span style={{ color: "#4a4a6a", fontSize: 11, fontFamily: FONT_MONO }}>
                  {group.fields.length} field{group.fields.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Fields table */}
            {!collapsed[gi] && <div style={{ overflow: "auto", border: "1px solid #1e1e2e", borderRadius: "0 0 10px 10px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT_MONO }}>
                <thead>
                  <tr style={{ background: "#0d0d15" }}>
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        style={{
                          padding: "10px 14px",
                          textAlign: "left",
                          color: "#6b7280",
                          fontWeight: 500,
                          borderBottom: "1px solid #1e1e2e",
                          cursor: "pointer",
                          userSelect: "none",
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {col.label}
                        <SortArrow col={col.key} sortCol={sortCol} sortDir={sortDir} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.fields.map((fm, fi) => {
                    const rowKey = `${gi}-${fi}`;
                    const isExpanded = expandedRows[rowKey];
                    const hasSteps = (fm.transformationSteps || []).length > 0;
                    const hasExpressions = hasSteps && fm.transformationSteps.some((s) => s.expression);
                    return (
                      <React.Fragment key={fi}>
                        <tr
                          style={{
                            background: fi % 2 === 0 ? "#08080d" : "#0b0b12",
                            transition: "background 0.15s",
                            cursor: hasSteps ? "pointer" : "default",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#10101a")}
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = fi % 2 === 0 ? "#08080d" : "#0b0b12")
                          }
                          onClick={() => {
                            if (hasSteps) setExpandedRows((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
                          }}
                        >
                          <td style={{ padding: "8px 14px", color: "#6ee7b7", borderBottom: isExpanded ? "none" : "1px solid #12121f" }}>
                            {fm.sourceField}
                          </td>
                          <td style={{ padding: "8px 14px", color: "#c4b5fd", borderBottom: isExpanded ? "none" : "1px solid #12121f" }}>
                            {fm.targetField}
                          </td>
                          <td
                            style={{
                              padding: "8px 14px",
                              color: "#60a5fa",
                              borderBottom: isExpanded ? "none" : "1px solid #12121f",
                              opacity: fm.transformation === "Direct" ? 0.4 : 1,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span>{fm.transformation}</span>
                              {hasExpressions && (
                                <span
                                  style={{
                                    fontSize: 8,
                                    background: isExpanded ? "#f59e0b" : "#78350f",
                                    color: isExpanded ? "#000" : "#fcd34d",
                                    padding: "2px 6px",
                                    borderRadius: 3,
                                    fontFamily: FONT_MONO,
                                    fontWeight: 600,
                                    letterSpacing: "0.03em",
                                    transition: "all 0.15s",
                                  }}
                                >
                                  ƒx
                                </span>
                              )}
                              {hasSteps && (
                                <span style={{ color: "#4a4a6a", fontSize: 10, marginLeft: "auto" }}>
                                  {isExpanded ? "▲" : "▼"}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={3} style={{ padding: 0, borderBottom: "1px solid #12121f" }}>
                              <TransformationPipeline steps={fm.transformationSteps} sourceField={fm.sourceField} targetField={fm.targetField} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>}
          </div>
        ))
      )}
    </div>
  );
}

/** @private Readable transformation type labels */
const XFORM_TYPE_LABELS = {
  "Expression": { label: "Expression", color: "#f59e0b", bg: "#78350f" },
  "Source Qualifier": { label: "Source Qualifier", color: "#6ee7b7", bg: "#065f46" },
  "Lookup Procedure": { label: "Lookup", color: "#93c5fd", bg: "#1e3a5f" },
  "Filter": { label: "Filter", color: "#f87171", bg: "#7f1d1d" },
  "Joiner": { label: "Joiner", color: "#c084fc", bg: "#581c87" },
  "Router": { label: "Router", color: "#fb923c", bg: "#7c2d12" },
  "Aggregator": { label: "Aggregator", color: "#2dd4bf", bg: "#115e59" },
  "Sorter": { label: "Sorter", color: "#a78bfa", bg: "#4c1d95" },
  "Rank": { label: "Rank", color: "#fbbf24", bg: "#78350f" },
  "Sequence Generator": { label: "Sequence", color: "#60a5fa", bg: "#1e3a5f" },
  "Update Strategy": { label: "Update Strategy", color: "#f472b6", bg: "#831843" },
  "Normalizer": { label: "Normalizer", color: "#34d399", bg: "#065f46" },
  "Stored Procedure": { label: "Stored Proc", color: "#c4b5fd", bg: "#4c1d95" },
};

function getXformLabel(type) {
  if (!type) return { label: "Transform", color: "#93c5fd", bg: "#1e3a5f" };
  // Try exact match first, then partial
  for (const [key, val] of Object.entries(XFORM_TYPE_LABELS)) {
    if (type.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return { label: type, color: "#93c5fd", bg: "#1e3a5f" };
}

/** @private Highlight Informatica expression syntax */
function ExpressionDisplay({ expression }) {
  if (!expression) return <span style={{ color: "#4a4a6a", fontStyle: "italic" }}>pass-through</span>;

  // Check if it's just a field reference (no transformation logic)
  const isPassThrough = /^[A-Za-z_][A-Za-z0-9_]*$/.test(expression.trim());
  if (isPassThrough) {
    return (
      <span style={{ color: "#6b7280" }}>
        <span style={{ color: "#6ee7b7" }}>{expression}</span>
        <span style={{ fontSize: 9, marginLeft: 6, color: "#4a4a6a", fontStyle: "italic" }}>(pass-through)</span>
      </span>
    );
  }

  // Tokenize and colorize common Informatica functions
  const funcPattern = /\b(IIF|DECODE|LPAD|RPAD|LTRIM|RTRIM|TRIM|UPPER|LOWER|SUBSTR|INSTR|LENGTH|TO_DATE|TO_CHAR|TO_DECIMAL|TO_INTEGER|TO_FLOAT|TO_BIGINT|IS_DATE|IS_NUMBER|IS_SPACES|ISNULL|NVL|REPLACECHR|REPLACESTR|REG_REPLACE|REG_MATCH|REG_EXTRACT|CONCAT|ROUND|TRUNC|ABS|CEIL|FLOOR|MOD|POWER|SQRT|SYSDATE|SYSTIMESTAMP|ADD_TO_DATE|DATE_DIFF|GET_DATE_PART|LAST_DAY|SET_DATE_PART|MAX|MIN|SUM|COUNT|AVG|FIRST|LAST|LOOKUP|ERROR|ABORT|NEXTVAL|CURRVAL)\b/gi;
  const stringPattern = /'[^']*'/g;
  const numberPattern = /\b\d+(\.\d+)?\b/g;
  const operatorPattern = /(<>|>=|<=|!=|:=|[=<>+\-*/])/g;

  // Build tokens array
  const tokens = [];
  let remaining = expression;
  let pos = 0;

  while (remaining.length > 0) {
    let earliest = null;
    let earliestType = null;
    let earliestMatch = null;

    // Find the earliest match across all patterns
    for (const [pattern, type] of [
      [funcPattern, "func"],
      [stringPattern, "string"],
      [numberPattern, "number"],
      [operatorPattern, "op"],
    ]) {
      pattern.lastIndex = 0;
      const match = pattern.exec(remaining);
      if (match && (earliest === null || match.index < earliest)) {
        earliest = match.index;
        earliestType = type;
        earliestMatch = match[0];
      }
    }

    if (earliest === null) {
      tokens.push({ type: "text", value: remaining });
      break;
    }

    if (earliest > 0) {
      tokens.push({ type: "text", value: remaining.slice(0, earliest) });
    }
    tokens.push({ type: earliestType, value: earliestMatch });
    remaining = remaining.slice(earliest + earliestMatch.length);
  }

  const colorMap = {
    func: "#c084fc",
    string: "#fcd34d",
    number: "#6ee7b7",
    op: "#f59e0b",
    text: "#e2e8f0",
  };

  return (
    <span>
      {tokens.map((t, i) => (
        <span key={i} style={{ color: colorMap[t.type] || "#e2e8f0", fontWeight: t.type === "func" ? 600 : 400 }}>
          {t.value}
        </span>
      ))}
    </span>
  );
}

/** @private Transformation pipeline visualization for expanded rows */
function TransformationPipeline({ steps, sourceField, targetField }) {
  if (!steps || steps.length === 0) return null;

  return (
    <div style={{ padding: "12px 14px 14px", background: "#06060b" }}>
      {/* Source start */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <div style={{ width: 18, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b98166" }} />
        </div>
        <span style={{ fontSize: 10, color: "#6ee7b7", fontFamily: FONT_MONO }}>{sourceField}</span>
        <span style={{ fontSize: 8, color: "#4a4a6a", fontFamily: FONT_MONO }}>SOURCE</span>
      </div>

      {/* Steps */}
      {steps.map((step, si) => {
        const xlabel = getXformLabel(step.type);
        const hasExpression = step.expression && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(step.expression.trim());
        return (
          <div key={si}>
            {/* Connector line */}
            <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
              <div style={{ width: 18, display: "flex", justifyContent: "center" }}>
                <div style={{ width: 1, height: 16, background: "#1e1e2e" }} />
              </div>
            </div>
            {/* Step card */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{ width: 18, display: "flex", justifyContent: "center", paddingTop: 7, flexShrink: 0 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: 2, background: xlabel.bg, border: `1px solid ${xlabel.color}`,
                  boxShadow: hasExpression ? `0 0 6px ${xlabel.color}44` : "none",
                }} />
              </div>
              <div style={{
                flex: 1, background: "#0b0b14", borderRadius: 6, border: `1px solid ${hasExpression ? xlabel.color + "33" : "#1e1e2e"}`,
                overflow: "hidden",
              }}>
                {/* Step header */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: 8, background: xlabel.bg, color: xlabel.color, padding: "2px 6px",
                    borderRadius: 3, fontFamily: FONT_MONO, fontWeight: 600, letterSpacing: "0.03em",
                  }}>
                    {xlabel.label.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 11, color: "#e2e8f0", fontFamily: FONT_MONO, fontWeight: 500 }}>{step.instance}</span>
                  {step.inputField !== step.outputField && (
                    <span style={{ fontSize: 9, color: "#4a4a6a", fontFamily: FONT_MONO, marginLeft: "auto" }}>
                      {step.inputField} → {step.outputField}
                    </span>
                  )}
                </div>
                {/* Expression body */}
                {step.expression && (
                  <div style={{
                    padding: "6px 10px 8px", borderTop: "1px solid #12121f",
                    fontSize: 11, fontFamily: FONT_MONO, lineHeight: 1.6, wordBreak: "break-all",
                  }}>
                    <ExpressionDisplay expression={step.expression} />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Target end */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
        <div style={{ width: 18, display: "flex", justifyContent: "center" }}>
          <div style={{ width: 1, height: 16, background: "#1e1e2e" }} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 18, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#a78bfa", boxShadow: "0 0 6px #a78bfa66" }} />
        </div>
        <span style={{ fontSize: 10, color: "#c4b5fd", fontFamily: FONT_MONO }}>{targetField}</span>
        <span style={{ fontSize: 8, color: "#4a4a6a", fontFamily: FONT_MONO }}>TARGET</span>
      </div>
    </div>
  );
}

/** @private Table name + DB/Owner badge group */
function TableRef({ icon, name, db, owner, nameColor, iconColor, dbBg, ownerBg }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ color: iconColor }}>{icon}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ color: nameColor, fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600 }}>{name}</span>
        {(db || owner) && (
          <div style={{ display: "flex", gap: 4 }}>
            {db && (
              <span style={{ fontSize: 8, background: dbBg, color: nameColor, padding: "1px 5px", borderRadius: 3, fontFamily: FONT_MONO }}>
                {db}
              </span>
            )}
            {owner && (
              <span style={{ fontSize: 8, background: ownerBg, color: nameColor + "99", padding: "1px 5px", borderRadius: 3, fontFamily: FONT_MONO }}>
                {owner}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
