"use client";

import { useState, useMemo } from "react";
import { FONT_MONO } from "@/lib/constants";
import { DBIcon } from "@/components/icons";
import { SortArrow } from "@/components/ui";

export default function FieldMappingTable({ data, selectedMapping }) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

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
          (m.targetDB || "").toLowerCase().includes(q)
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
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                padding: "12px 16px",
                background: "linear-gradient(135deg, #0a2e1f, #1a1a2e, #1e1434)",
                borderRadius: "10px 10px 0 0",
                border: "1px solid #1e1e2e",
                borderBottom: "none",
              }}
            >
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
            <div style={{ overflow: "auto", border: "1px solid #1e1e2e", borderRadius: "0 0 10px 10px" }}>
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
                  {group.fields.map((fm, fi) => (
                    <tr
                      key={fi}
                      style={{ background: fi % 2 === 0 ? "#08080d" : "#0b0b12", transition: "background 0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#10101a")}
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = fi % 2 === 0 ? "#08080d" : "#0b0b12")
                      }
                    >
                      <td style={{ padding: "8px 14px", color: "#6ee7b7", borderBottom: "1px solid #12121f" }}>
                        {fm.sourceField}
                      </td>
                      <td style={{ padding: "8px 14px", color: "#c4b5fd", borderBottom: "1px solid #12121f" }}>
                        {fm.targetField}
                      </td>
                      <td
                        style={{
                          padding: "8px 14px",
                          color: "#60a5fa",
                          borderBottom: "1px solid #12121f",
                          opacity: fm.transformation === "Direct" ? 0.4 : 1,
                        }}
                      >
                        {fm.transformation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
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
