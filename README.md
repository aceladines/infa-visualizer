# INFA Flow Visualizer

Informatica PowerCenter XML Workflow Visualizer & Field Mapper.

Parses PowerCenter XML exports (from Repository Manager or `pmrep`) and renders:

- **Flow** — Pannable (drag) and zoomable (scroll wheel / pinch / buttons) SVG DAG with minimap, fit-to-view, clickable nodes, and auto-fit on load
- **Workflows** — Expandable workflow view with sessions, tasks, execution order, and workflow variables
- **Field Mapping** — Table-by-table source→target field mapping with transformation paths, DB/owner labels
- **Sources / Targets** — Full schema details with DB name, owner, datatypes, keys, nullability, table attributes

### Supported XML Elements

`POWERMART`, `REPOSITORY`, `FOLDER`, `SOURCE`/`SOURCEFIELD`, `TARGET`/`TARGETFIELD`,
`MAPPING`, `MAPPLET`, `TRANSFORMATION`/`TRANSFORMFIELD`, `CONNECTOR`, `INSTANCE`,
`SHORTCUT`, `WORKFLOW`, `WORKFLOWLINK`, `WORKFLOWVARIABLE`, `TASKINSTANCE`,
`SESSION`, `SESSTRANSFORMATIONINST`, `ASSOCIATED_SOURCE_INSTANCE`,
`CONFIGREFERENCE`, `POWERCENTER_CONNECTION`, `TABLEATTRIBUTE`, `METAEXTENSION`

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and drop an Informatica XML export onto the upload zone.

## Project Structure

```
infa-visualizer/
├── app/
│   ├── layout.jsx              # Root layout (fonts, metadata)
│   └── page.jsx                # Main page (state orchestration, tabs)
│
├── components/
│   ├── icons/
│   │   └── index.jsx           # All SVG icon components
│   ├── ui/
│   │   └── index.jsx           # Backdrop, SortArrow (small reusables)
│   ├── FlowCanvas.jsx          # SVG DAG flow visualization
│   ├── NodeDetailDrawer.jsx    # Slide-in panel for node details
│   ├── FieldMappingTable.jsx   # Source→Target field mapping tables
│   ├── EntityDetailPanel.jsx   # Expandable source/target schema view
│   ├── WorkflowOverview.jsx    # Workflow sessions & execution order
│   ├── SummaryBar.jsx          # Stat counters row
│   ├── FileUpload.jsx          # Drag-and-drop XML upload zone
│   └── index.js                # Barrel export
│
├── lib/
│   ├── parseXml.js             # XML → structured data parser
│   ├── buildFieldMappings.js   # Connector path tracer (source→target)
│   ├── buildFlowGraph.js       # DAG builder + topological layout
│   ├── constants.js            # Theme colors, layout config, fonts
│   └── index.js                # Barrel export
│
├── styles/
│   ├── globals.css             # Reset, scrollbars, base styles
│   └── ui.module.css           # Animations (drawer slide, backdrop fade)
│
├── jsconfig.json               # Path aliases (@/*)
├── next.config.mjs             # Next.js config
└── package.json
```

## Architecture

| Layer          | Responsibility                                       |
| -------------- | ---------------------------------------------------- |
| `lib/`         | Pure functions — parsing, graph building, constants.  |
| `components/`  | Presentational React components. Each is self-contained. |
| `app/page.jsx` | State orchestration — wires data into components.     |

### Key Design Decisions

- **Exact name matching** for source/target resolution (not substring `includes()`)
- **O(1) edge deduplication** via `Set` instead of O(n) `Array.find()`
- **Metadata attached to graph nodes** at build time so the detail drawer doesn't re-scan
- **SortArrow extracted** as a standalone component (not recreated per render)
- **Single `<defs>` block** in SVG (no duplicates)
- **Fat invisible hit areas** on edge paths for easier hover targeting
- **Pan/zoom** via pointer drag + wheel/pinch with `passive: false` for `preventDefault`
- **Auto-fit on load** calculates optimal zoom to fit the entire graph
- **Minimap** renders scaled-down node positions + viewport rectangle
- **Mapplet-aware** node classification checks instance types, mapplet definitions, and reusable flags
- **Shared parser** for MAPPING and MAPPLET since their XML structure is identical
