"use client";

import { useState } from "react";
import { FONT_MONO } from "@/lib/constants";
import { CloseIcon } from "@/components/icons";
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

/** Clickable truncated text that opens a full-text viewer modal */
export function ExpandableText({ text, onExpand }) {
  return (
    <span
      title={text}
      onClick={(e) => { e.stopPropagation(); onExpand(); }}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", cursor: "pointer", borderRadius: 3 }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{text}</span>
      <button
        title="View full text"
        style={{
          background: "var(--border-primary)",
          border: "none",
          borderRadius: 3,
          color: "var(--text-secondary)",
          fontSize: 9,
          padding: "1px 4px",
          cursor: "pointer",
          flexShrink: 0,
          fontFamily: FONT_MONO,
          lineHeight: 1.4,
        }}
      >
        ...
      </button>
    </span>
  );
}

/** Full-screen modal for viewing long text values */
export function TextViewerModal({ title, text, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className={styles.textViewerBackdrop} onClick={onClose}>
      <div className={styles.textViewerModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.textViewerHeader}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", fontFamily: FONT_MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{title}</span>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              onClick={handleCopy}
              style={{
                background: copied ? "#065f46" : "var(--border-primary)",
                border: "none",
                borderRadius: 5,
                color: copied ? "#6ee7b7" : "var(--text-secondary)",
                fontSize: 10,
                padding: "4px 10px",
                cursor: "pointer",
                fontFamily: FONT_MONO,
                transition: "all 0.15s",
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={onClose}
              style={{
                background: "var(--border-primary)",
                border: "none",
                borderRadius: 5,
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--text-secondary)",
              }}
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className={styles.textViewerBody}>
          <pre className={styles.textViewerPre} style={{ fontFamily: FONT_MONO }}>{text}</pre>
        </div>
      </div>
    </div>
  );
}
