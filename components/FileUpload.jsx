"use client";

import { useState, useRef, useCallback } from "react";
import { FONT_MONO } from "@/lib/constants";
import { UploadIcon } from "@/components/icons";

export default function FileUpload({ onFileLoad, error }) {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const handleFile = useCallback(
    (file) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => onFileLoad(file.name, e.target.result);
      reader.readAsText(file);
    },
    [onFileLoad]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "70vh",
        padding: 40,
      }}
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          width: "100%",
          maxWidth: 520,
          padding: "60px 40px",
          border: `2px dashed ${dragOver ? "#60a5fa" : "var(--border-primary)"}`,
          borderRadius: 16,
          background: dragOver ? "var(--bg-surface-hover)" : "var(--bg-secondary)",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.3s",
        }}
      >
        <div style={{ color: dragOver ? "#60a5fa" : "var(--border-secondary)", marginBottom: 16 }}>
          <UploadIcon />
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Drop Informatica XML here</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: FONT_MONO, lineHeight: 1.6 }}>
          Supports PowerCenter workflow exports
          <br />
          (.xml files from Repository Manager or pmrep)
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xml"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {error && (
        <div
          style={{
            marginTop: 20,
            padding: "12px 20px",
            background: "#1a0a0a",
            border: "1px solid #7f1d1d",
            borderRadius: 8,
            color: "#fca5a5",
            fontSize: 12,
            fontFamily: FONT_MONO,
            maxWidth: 520,
            width: "100%",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
