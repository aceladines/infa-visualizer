export function DBIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <ellipse cx="8" cy="4" rx="6" ry="2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M2 4v8c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V4" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M2 8c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

export function FlowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="10" y="1" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5.5" y="11" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.5 5v3h4.5v3M12.5 5v3h-4.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function TableIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="1" y1="6" x2="15" y2="6" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6" y1="6" x2="6" y2="14" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function UploadIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <path d="M20 28V12m0 0l-6 6m6-6l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 24v6a2 2 0 002 2h20a2 2 0 002-2v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function WfIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="3" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="13" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 8h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9 5.5L11 8l-2 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mapplet icon — nested boxes indicating a reusable sub-flow */
export function MappletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5" />
      <path d="M4 8h4m-2-2v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Shortcut icon — arrow pointing to a reference */
export function ShortcutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 12L12 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7 4h5v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5" />
    </svg>
  );
}
