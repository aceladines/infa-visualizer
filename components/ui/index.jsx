"use client";

import styles from "@/styles/ui.module.css";

export function Backdrop({ onClick }) {
  return <div className={styles.backdrop} onClick={onClick} />;
}

export function SortArrow({ col, sortCol, sortDir }) {
  if (sortCol !== col) {
    return <span style={{ opacity: 0.3, marginLeft: 4 }}>↕</span>;
  }
  return <span style={{ marginLeft: 4 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
}
