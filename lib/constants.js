// ─── Node Type Colors (Dark) ─────────────────────────────────────
const TYPE_COLORS_DARK = {
  source: {
    bg: "#0a2e1f", border: "#10b981", text: "#6ee7b7",
    badge: "#065f46", sub: "#064e3b", label: "Source Table",
  },
  target: {
    bg: "#1e1434", border: "#a78bfa", text: "#c4b5fd",
    badge: "#4c1d95", sub: "#3b0764", label: "Target Table",
  },
  transform: {
    bg: "#1a1a2e", border: "#60a5fa", text: "#93c5fd",
    badge: "#1e3a5f", sub: "#172554", label: "Transformation",
  },
  mapplet: {
    bg: "#0a2a2e", border: "#2dd4bf", text: "#99f6e4",
    badge: "#115e59", sub: "#0d4f47", label: "Mapplet",
  },
  shortcut: {
    bg: "#2a2a1a", border: "#d4a72d", text: "#fde68a",
    badge: "#713f12", sub: "#5c3310", label: "Shortcut",
  },
  task: {
    bg: "#2a1a0e", border: "#f59e0b", text: "#fcd34d",
    badge: "#78350f", sub: "#451a03", label: "Task",
  },
};

// ─── Node Type Colors (Light) ────────────────────────────────────
const TYPE_COLORS_LIGHT = {
  source: {
    bg: "#ecfdf5", border: "#10b981", text: "#047857",
    badge: "#d1fae5", sub: "#a7f3d0", label: "Source Table",
  },
  target: {
    bg: "#ede9fe", border: "#8b5cf6", text: "#6d28d9",
    badge: "#ddd6fe", sub: "#c4b5fd", label: "Target Table",
  },
  transform: {
    bg: "#eff6ff", border: "#3b82f6", text: "#1d4ed8",
    badge: "#dbeafe", sub: "#bfdbfe", label: "Transformation",
  },
  mapplet: {
    bg: "#f0fdfa", border: "#14b8a6", text: "#0f766e",
    badge: "#ccfbf1", sub: "#99f6e4", label: "Mapplet",
  },
  shortcut: {
    bg: "#fefce8", border: "#ca8a04", text: "#a16207",
    badge: "#fef9c3", sub: "#fef08a", label: "Shortcut",
  },
  task: {
    bg: "#fff7ed", border: "#f59e0b", text: "#c2410c",
    badge: "#ffedd5", sub: "#fed7aa", label: "Task",
  },
};

export function getTypeColors(theme) {
  return theme === "light" ? TYPE_COLORS_LIGHT : TYPE_COLORS_DARK;
}

// Default export for backward compat (dark)
export const TYPE_COLORS = TYPE_COLORS_DARK;

// ─── Task Styles (Workflow) ─────────────────────────────────────
const TASK_STYLES_DARK = {
  Start:       { label: "START",   color: "#6b7280", bg: "#1e1e2e" },
  Session:     { label: "SESSION", color: "#60a5fa", bg: "#1e3a5f" },
  Command:     { label: "COMMAND", color: "#f59e0b", bg: "#78350f" },
  Timer:       { label: "TIMER",   color: "#a78bfa", bg: "#4c1d95" },
  Decision:    { label: "DECISION",color: "#f472b6", bg: "#831843" },
  Assignment:  { label: "ASSIGN",  color: "#2dd4bf", bg: "#115e59" },
  Email:       { label: "EMAIL",   color: "#fbbf24", bg: "#78350f" },
  Control:     { label: "CONTROL", color: "#fb923c", bg: "#7c2d12" },
  "Event-Wait":{ label: "EVENT",   color: "#34d399", bg: "#065f46" },
};

const TASK_STYLES_LIGHT = {
  Start:       { label: "START",   color: "#475569", bg: "#f1f5f9" },
  Session:     { label: "SESSION", color: "#1d4ed8", bg: "#dbeafe" },
  Command:     { label: "COMMAND", color: "#b45309", bg: "#fef3c7" },
  Timer:       { label: "TIMER",   color: "#6d28d9", bg: "#ede9fe" },
  Decision:    { label: "DECISION",color: "#be185d", bg: "#fce7f3" },
  Assignment:  { label: "ASSIGN",  color: "#0f766e", bg: "#ccfbf1" },
  Email:       { label: "EMAIL",   color: "#a16207", bg: "#fef3c7" },
  Control:     { label: "CONTROL", color: "#c2410c", bg: "#ffedd5" },
  "Event-Wait":{ label: "EVENT",   color: "#047857", bg: "#d1fae5" },
};

export function getTaskStyles(theme) {
  return theme === "light" ? TASK_STYLES_LIGHT : TASK_STYLES_DARK;
}

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
