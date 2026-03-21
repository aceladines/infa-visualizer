# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Informatica PowerCenter XML Workflow Visualizer & Field Mapper. A pure frontend Next.js app that parses PowerCenter XML exports and renders interactive SVG flow diagrams, workflow breakdowns, field-level source→target mappings, and schema details.

## Commands

```bash
npm run dev       # Dev server on http://localhost:3000
npm run build     # Production build
npm run start     # Production server
npm run lint      # ESLint
```

No test framework is configured.

## Architecture

**Data flow:** XML upload → parse → build graph → render tabs

Three layers:
- **`lib/`** — Pure functions, no side effects. `parseXml.js` extracts PowerCenter entities from XML. `buildFlowGraph.js` creates a DAG using Kahn's algorithm for topological sort. `buildFieldMappings.js` traces connector paths from source→transform→target. `constants.js` holds theme colors and layout config.
- **`components/`** — Presentational React components. `FlowCanvas.jsx` renders the SVG DAG with pan/zoom/minimap. `FieldMappingTable.jsx` shows field mappings with search/sort. `WorkflowOverview.jsx` displays workflow sessions and task execution order. `NodeDetailDrawer.jsx` is a slide-in panel for node details. `EntityDetailPanel.jsx` shows source/target schemas in accordions.
- **`app/page.jsx`** — State orchestration. Manages tabs (flow, workflows, mapping, sources, targets), selected node state, and file upload handling.

**Import aliases:** `@/*` maps to project root (configured in `jsconfig.json`).

## Informatica XML Layered Model

The parser interprets PowerCenter XML as five semantic layers. Understanding these is critical when modifying parsing or graph-building logic.

1. **Definitions layer** — `SOURCE`, `TARGET`, reusable `TRANSFORMATION`, `CONFIG` define metadata objects at the FOLDER level. These are definitions, *not* execution order. A physical table may appear as a `TARGET` in one mapping and as a `SOURCE` in another.
2. **Mapping layer** — `MAPPING` is a directed dataflow graph. `INSTANCE` nodes represent uses of sources, targets, and transformations. `CONNECTOR` edges define the authoritative field/port lineage. Do not infer lineage from name similarity or transformation proximity. A mapping may contain multiple source branches, intermediate stage sources, union/sorter/custom transformations, and multiple targets. Mapplets (`MAPPLET`) are encapsulated sub-graphs appearing as single nodes in the parent mapping.
3. **Field lineage resolution** — For any target field, determine lineage by walking `CONNECTOR` chains. Treat `CONNECTOR` lineage as authoritative. Classify lineage type per field:
   - `DIRECT_PASS_THROUGH` — field flows unchanged
   - `DERIVED_EXPRESSION` — output from expression/calculation
   - `PARAMETER_DRIVEN` — expression references `$$` parameters
   - `CONSTANT` — literal string or number
   - `SEQUENCE_GENERATED` — from Sequence Generator transformation
   - `CUSTOM_TRANSFORMATION_OUTPUT` — from Custom/Stored Proc transformation
   - `UNKNOWN` — cannot determine (e.g., SQL override on Source Qualifier)
4. **Session layer** — `SESSION` executes one mapping. It provides runtime settings, connection bindings, reader/writer config, and overrides. It does *not* define the core business transformation logic unless there is an explicit override.
5. **Workflow layer** — `WORKFLOW` is a directed execution graph (not a flat list). `TASK`/`TASKINSTANCE` are nodes. `WORKFLOWLINK` is the authoritative execution dependency edge. Reconstruct execution by starting from `Start`, following `FROMTASK→TOTASK`, preserving link conditions, and allowing parallel branches. Produce a staged topological order rather than collapsing to one linear chain. Command tasks (truncate) are often prerequisites for downstream sessions.

**Critical assumptions to avoid:**
- Do NOT assume one session = one source table = one target table.
- Do NOT assume one workflow = one linear sequence (parallel branches exist).
- Do NOT assume all target fields come from source columns — they may come from parameters, constants, sequences, or expressions.
- Do NOT assume a `SOURCE` is always a raw source-system table — a stage table may appear as both a `TARGET` and later as a `SOURCE`.
- Treat mappings as dataflow graphs and workflows as execution graphs, not lists.
- Instance names (in `CONNECTOR`) reference `INSTANCE.NAME`, not definition names. Classification must use `INSTANCE.TYPE` (e.g., "Source Definition", "Target Definition", "Mapplet"), not name matching against global SOURCE/TARGET lists.
- Scoping matters: use `:scope >` when querying `TRANSFORMATION`, `INSTANCE`, `CONNECTOR` within a `MAPPING`/`MAPPLET` to avoid picking up elements from nested sub-structures.

## Key Design Decisions

- Instance-based node classification via INSTANCE TYPE attribute (not name matching)
- Edge deduplication via Map for O(1) field accumulation
- BFS-based multi-hop field mapping traces source→...→target through any number of transformations
- Mapplets kept separate from mappings — their internals don't pollute the main flow graph
- Mapping data flow and workflow control flow are separate graphs (Flow tab vs Workflows tab)
- Per-mapping filtering: flow graph and field mapping table both respect the mapping selector
- Metadata attached to graph nodes at build time so the detail drawer doesn't re-scan
- Unique transformation collection via Map deduplication across mappings and mapplets
- Single SVG `<defs>` block to avoid duplicate gradients/markers
- Fat invisible hit areas on SVG edge paths for easier hover interaction
- Pan/zoom uses pointer drag + wheel/pinch with `passive: false` for preventDefault
