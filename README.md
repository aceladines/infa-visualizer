# INFA Visualizer — Informatica PowerCenter XML Visualizer & Field Mapper

> A free, open-source, browser-based tool to visualize Informatica PowerCenter XML exports as interactive flow diagrams, workflow execution graphs, and field-level source-to-target mappings. No server required — everything runs in your browser.

[![Built with Next.js](https://img.shields.io/badge/Built_with-Next.js_15-black?logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Why INFA Visualizer?

Working with Informatica PowerCenter XML exports (`pmrep` dumps, Repository Manager exports) is painful. The XML is deeply nested, hard to read, and there's no easy way to see how data flows from source to target. INFA Visualizer solves this by turning raw XML into interactive, visual documentation in seconds.

- **No installation on a server** — pure client-side Next.js app, your XML never leaves the browser
- **Instant parsing** — drop an XML file and see results immediately
- **Complete lineage** — traces field-level paths through every transformation, lookup, mapplet, and expression
- **Works with real exports** — handles multi-mapping, multi-workflow XML files with hundreds of transformations

---

## Features

### Flow Diagram
Interactive SVG DAG (directed acyclic graph) of your mapping data flow. Pan, zoom, click nodes to inspect ports, expressions, and connections. Includes minimap, fit-to-view, and auto-layout via topological sort.

### Workflow Execution Graph
Visualizes workflow task execution order using Kahn's algorithm. Shows parallel branches, conditional links, session-to-mapping references, auxiliary/unlinked tasks, and workflow variables.

### Field Mapping Table
Source-to-target field mapping with full transformation pipeline. Expand any row to see the complete chain: source field → Source Qualifier → Expression → Lookup → Filter → target field. Includes lineage classification (pass-through, expression-derived, lookup return, etc.) and confidence levels.

### Source & Target Schemas
Browse every source and target definition with datatypes, precision/scale, primary keys, nullability, and table attributes (SQL overrides, filter conditions, etc.).

---

## Supported Informatica XML Elements

`POWERMART`, `REPOSITORY`, `FOLDER`, `SOURCE` / `SOURCEFIELD`, `TARGET` / `TARGETFIELD`, `MAPPING`, `MAPPLET`, `TRANSFORMATION` / `TRANSFORMFIELD`, `CONNECTOR`, `INSTANCE`, `SHORTCUT`, `WORKFLOW`, `WORKFLOWLINK`, `WORKFLOWVARIABLE`, `TASKINSTANCE`, `SESSION`, `SESSTRANSFORMATIONINST`, `ASSOCIATED_SOURCE_INSTANCE`, `CONFIGREFERENCE`, `POWERCENTER_CONNECTION`, `TABLEATTRIBUTE`, `METAEXTENSION`

---

## Quick Start

```bash
git clone https://github.com/your-org/infa-visualizer.git
cd infa-visualizer
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and drop an Informatica PowerCenter XML export onto the upload zone.

### Commands

| Command         | Description              |
| --------------- | ------------------------ |
| `npm run dev`   | Dev server on port 3000  |
| `npm run build` | Production build         |
| `npm run start` | Production server        |
| `npm run lint`  | ESLint                   |

---

## Tech Stack

| Technology | Purpose |
| ---------- | ------- |
| [Next.js 15](https://nextjs.org/) | React framework, routing, build |
| [React 19](https://react.dev/) | UI components |
| SVG | Flow diagram rendering (no D3/external charting lib) |
| CSS Modules | Scoped styling |
| DOMParser | Client-side XML parsing (no server) |

Zero external visualization dependencies — the SVG DAG, pan/zoom, minimap, and layout are built from scratch.

---

## Project Structure

```
infa-visualizer/
├── app/
│   ├── layout.jsx              # Root layout (fonts, metadata)
│   └── page.jsx                # Main page (state orchestration, tabs)
│
├── components/
│   ├── icons/                  # SVG icon components
│   ├── ui/                     # Shared UI primitives (expandable text, modals)
│   ├── FlowCanvas.jsx          # SVG DAG flow visualization
│   ├── NodeDetailDrawer.jsx    # Slide-in panel for node details
│   ├── FieldMappingTable.jsx   # Source→Target field mapping tables
│   ├── EntityDetailPanel.jsx   # Expandable source/target schema view
│   ├── WorkflowOverview.jsx    # Workflow sessions & execution order
│   ├── SummaryBar.jsx          # Stat counters row
│   └── FileUpload.jsx          # Drag-and-drop XML upload zone
│
├── lib/
│   ├── parseXml.js             # XML → structured data parser
│   ├── buildFieldMappings.js   # BFS connector path tracer (source→target)
│   ├── buildFlowGraph.js       # DAG builder + topological layout (Kahn's)
│   └── constants.js            # Theme colors, layout config, fonts
│
└── styles/
    ├── globals.css             # Reset, scrollbars, base styles, theme vars
    └── ui.module.css           # Drawer, modal, animation styles
```

## Architecture

| Layer | Responsibility |
| -------------- | ---------------------------------------------------- |
| `lib/` | Pure functions — XML parsing, graph building, field mapping tracing. No side effects. |
| `components/` | Presentational React components. Each is self-contained. |
| `app/page.jsx` | State orchestration — wires parsed data into components, manages tab/selection state. |

**Data flow:** XML upload → `parseXml` → `buildFlowGraph` + `buildFieldMappings` → render tabs

### Key Design Decisions

- **Instance-based node classification** via `INSTANCE.TYPE` attribute (not name matching against global lists)
- **BFS multi-hop field tracing** — follows `CONNECTOR` chains through any number of transformations
- **Expression-aware port resolution** — only output ports whose expression references the input port produce edges
- **Intra-instance port traversal** — connects input to output ports within transformations where names differ (Lookup key → return value)
- **Mapplet internal tracing** — loads mapplet definitions and runs sub-BFS to classify actual internal lineage
- **Filter discovery across 7 locations** — Filter Condition, Source Filter, SQL Query, Lookup overrides, Join Condition, Router groups
- **Generator BFS** — traces non-source-originated fields (Sequence Generator, constants) separately
- **FIELDDEPENDENCY parsing** for custom/union transformations with branch-preserving lineage
- **O(1) edge deduplication** via `Map` for field accumulation
- **Topological sort** (Kahn's algorithm) for both flow layout and workflow execution staging
- **Single `<defs>` block** in SVG to avoid duplicate gradient/marker definitions
- **Fat invisible hit areas** on SVG edge paths for easier hover targeting
- **Pan/zoom** via pointer drag + wheel/pinch with `passive: false` for `preventDefault`
- **Auto-fit on load** with minimap showing scaled-down viewport rectangle
- **Light/dark theme support** with CSS custom properties

---

## Use Cases

- **Data lineage documentation** — generate visual documentation of your PowerCenter mappings for audits, compliance, or onboarding
- **Impact analysis** — see which targets are affected when a source field changes
- **Migration planning** — understand existing ETL logic before migrating to Informatica Cloud (IICS), dbt, or other tools
- **Code review** — visually review mapping changes instead of diffing raw XML
- **Troubleshooting** — trace a field from target back to source through every transformation step

---

## FAQ

**What XML format does it accept?**
Standard Informatica PowerCenter XML exports — the same files produced by `pmrep ObjectExport`, Repository Manager export, or version control XML dumps. The root element should be `POWERMART` or `REPOSITORY`.

**Does my data leave the browser?**
No. All parsing and rendering happens client-side. No data is uploaded to any server.

**Can it handle large exports?**
Yes. It handles multi-mapping, multi-workflow files with hundreds of transformations. The SVG renderer and BFS tracers are optimized for performance.

**Does it support Informatica Cloud (IICS)?**
Not yet — this tool is specifically for PowerCenter XML exports. IICS uses a different format.

---

## Contributing

Contributions are welcome. Please open an issue first to discuss the change you'd like to make.

## License

[MIT](LICENSE)
