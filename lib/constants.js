// ─── Node Type Colors ─────────────────────────────────────────────
export const TYPE_COLORS = {
  source: {
    bg: "#0a2e1f",
    border: "#10b981",
    text: "#6ee7b7",
    badge: "#065f46",
    sub: "#064e3b",
    label: "Source Table",
  },
  target: {
    bg: "#1e1434",
    border: "#a78bfa",
    text: "#c4b5fd",
    badge: "#4c1d95",
    sub: "#3b0764",
    label: "Target Table",
  },
  transform: {
    bg: "#1a1a2e",
    border: "#60a5fa",
    text: "#93c5fd",
    badge: "#1e3a5f",
    sub: "#172554",
    label: "Transformation",
  },
  mapplet: {
    bg: "#0a2a2e",
    border: "#2dd4bf",
    text: "#99f6e4",
    badge: "#115e59",
    sub: "#0d4f47",
    label: "Mapplet",
  },
  shortcut: {
    bg: "#2a2a1a",
    border: "#d4a72d",
    text: "#fde68a",
    badge: "#713f12",
    sub: "#5c3310",
    label: "Shortcut",
  },
  task: {
    bg: "#2a1a0e",
    border: "#f59e0b",
    text: "#fcd34d",
    badge: "#78350f",
    sub: "#451a03",
    label: "Task",
  },
};

// ─── Flow Layout Config ──────────────────────────────────────────
export const FLOW_LAYOUT = {
  NODE_W: 200,
  NODE_H: 62,
  H_GAP: 70,
  V_GAP: 28,
  MIN_CANVAS_W: 700,
  MIN_CANVAS_H: 500,
  PADDING: 40,
};

// ─── Pan/Zoom Config ─────────────────────────────────────────────
export const ZOOM_CONFIG = {
  MIN: 0.15,
  MAX: 3,
  STEP: 0.1,
  WHEEL_SENSITIVITY: 0.001,
  DEFAULT: 1,
};

// ─── Summary Stat Definitions ────────────────────────────────────
export const SUMMARY_STATS = [
  { key: "workflows", label: "Workflows", color: "#f59e0b" },
  { key: "mappings", label: "Mappings", color: "#60a5fa" },
  { key: "mapplets", label: "Mapplets", color: "#2dd4bf" },
  { key: "sources", label: "Sources", color: "#10b981" },
  { key: "targets", label: "Targets", color: "#a78bfa" },
  { key: "transformations", label: "Transforms", color: "#60a5fa" },
  { key: "fieldMappings", label: "Field Maps", color: "#f472b6" },
];

// ─── Fonts ───────────────────────────────────────────────────────
export const FONT_MONO = "'JetBrains Mono', monospace";
export const FONT_SANS = "'Space Grotesk', sans-serif";
export const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap";
