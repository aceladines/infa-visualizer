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

The parser interprets PowerCenter XML as twelve semantic layers. Understanding these is critical when modifying parsing or graph-building logic.

1. **Definitions layer** — `SOURCE`, `TARGET`, reusable `TRANSFORMATION`, `MAPPLET`, and `CONFIG` define metadata objects at the FOLDER level. These are definitions, *not* execution order. A physical table may appear as a `TARGET` in one mapping and as a `SOURCE` in another.

2. **Mapping layer** — `MAPPING` is a directed dataflow graph. `INSTANCE` nodes represent uses of sources, targets, mapplets, and transformations. `CONNECTOR` edges define the authoritative field/port lineage. Do not infer lineage from name similarity, business meaning, or proximity in the XML. A mapping may contain multiple source branches, intermediate stage sources, mapplets, custom transformations, sorters, lookups, joins, filters, routers, and one or more targets.

3. **Field lineage resolution rules** — Resolve target lineage by walking `CONNECTOR` chains backward from the target port. If lineage passes through Expression / Lookup / Mapplet / Custom / Sorter / other transformations, recursively trace upstream ports until reaching: (a) a source field, (b) a mapping variable/parameter, (c) a literal constant, (d) a sequence-generated field, or (e) a lookup return value. Treat `CONNECTOR` lineage as authoritative over semantic similarity. Never map source-to-target by guessing. Expression-aware port resolution ensures only referenced input ports produce edges to output ports (eliminates false source attributions). Intra-instance port traversal connects input ports to output ports within transformations where names differ (e.g., Lookup input key → return value).

4. **Output field classification** — For every output field, classify as one of:
   - `DIRECT_PASS_THROUGH` — field flows unchanged
   - `EXPRESSION_DERIVED` — output from expression/calculation
   - `LOOKUP_RETURN` — returned by Lookup, no further expression derivation
   - `LOOKUP_DERIVED` — Lookup in chain AND expression derivation present
   - `MAPLET_OUTPUT` — passes through Mapplet (internal tracing couldn't resolve further)
   - `PARAMETER_DRIVEN` — expression references `$$` parameters
   - `CONSTANT` — literal string or number
   - `SEQUENCE_GENERATED` — from Sequence Generator transformation
   - `CUSTOM_TRANSFORMATION_OUTPUT` — from Custom/Stored Proc transformation
   - `NOT_CARRIED_BY_BRANCH` — source field present upstream but not propagated through a custom/union branch
   - `UNKNOWN` — cannot determine (e.g., SQL override on Source Qualifier)

5. **Rule for OWNER-like fields** — Do not assume an output field has compositional structure such as `<field1>_<field2>` unless an explicit `EXPRESSION` shows concatenation. If a field is returned by a lookup, describe it as a scalar lookup return value, not as a concatenation. If a field is output from a mapplet, explain which nested transformation produces it, whether it is a lookup return, pass-through, or expression-derived, and any lookup condition or filter affecting it.

6. **Mapplet and nested transformation interpretation** — A `MAPPLET` is a reusable subgraph, not a single transformation. The parser traces through mapplet internals to classify output lineage accurately. For each mapplet, the system resolves: (a) port contract (inputs/outputs with datatype), (b) internal flow of nested transformations, (c) output lineage classification, (d) filter/lookup/join points inside. Mapplet internal steps are attached to field mapping records when available.

7. **Filter discovery rules** — Filters may exist in any of these places and are extracted from all:
   - Filter transformation condition (`Filter Condition` table attribute)
   - Source Qualifier Source Filter (`Source Filter` table attribute)
   - Source Qualifier SQL override / WHERE clause (`Sql Query` table attribute)
   - Lookup SQL override / lookup source filter (`Lookup Sql Override`, `Lookup Source Filter`)
   - Expression logic that conditionally emits values (IIF/DECODE patterns)
   - Join condition (`Join Condition` table attribute)
   - Router group conditions (`GROUP` elements with filter expressions)
   Report all filter locations, not only explicit Filter transformations.

8. **Custom transformation and UNION rules** — Do not treat a Custom Transformation path as many-to-many lineage. For UNION-like custom transformations, preserve branch isolation. Each input group contributes only to the corresponding aligned output fields. If `FIELDDEPENDENCY` exists, use it as authoritative. If absent, infer branch alignment only by exact field name match or branch-specific suffix alignment. Never infer that every upstream field in a branch influences every downstream target field. Sorter transformations preserve row order and field identity only; they do not create new source-to-target field mappings. Expression transformations only affect outputs explicitly connected or explicitly referenced in expressions.

9. **Branch-level lineage rules** — Trace lineage per target field, not per shared branch path. If a source field is not selected into a branch output, classify it as `NOT_CARRIED_BY_BRANCH` rather than mapping it to unrelated target fields. In a union branch, list only the fields that are actually carried through that branch. Evidence priority: CONNECTOR > FIELDDEPENDENCY > EXPRESSION > mapplet/lookup flow > branch alignment > field name match > UNKNOWN. Confidence levels: HIGH (explicit connector chain, FIELDDEPENDENCY, direct expression), MEDIUM (branch alignment, opaque mapplet, lookup return), LOW (SQL override, indirect evidence), UNKNOWN (insufficient evidence).

10. **Session layer** — `SESSION` executes one mapping. It provides runtime settings, connection bindings, reader/writer config, commit/recovery/error behavior, and overrides. It does *not* define the core business transformation logic unless an explicit override exists.

11. **Workflow layer** — `WORKFLOW` is a directed execution graph (not a flat list). `TASK`/`TASKINSTANCE` are nodes (deduplicated by name, TASKINSTANCE priority). `WORKFLOWLINK` is the authoritative execution dependency edge. Reconstruct execution by: (a) starting from `Start`, (b) following `FROMTASK→TOTASK`, (c) preserving link conditions, (d) allowing parallel branches, (e) producing a staged topological order rather than one fake linear chain. Only tasks connected by `WORKFLOWLINK` belong in the main execution path. Utility commands or variable-assignment tasks that are defined but not linked are shown separately as auxiliary/unlinked tasks, not forced into the main path. Command tasks (truncate) are often prerequisites for downstream sessions.

12. **Output rules** — For each field mapping, the system outputs the full evidence chain: target field ← producing transformation port ← upstream port ← source/lookup/parameter/constant. For each mapplet output, it explicitly identifies whether the value is concatenated/expression-built, lookup-returned, direct pass-through, or not used. For workflow execution, it outputs: main execution path, parallel branches, auxiliary/unlinked tasks, and condition on each dependency edge. If evidence is incomplete, classify as `UNKNOWN` rather than guessing.

**Critical assumptions to avoid:**
- Do NOT assume one session = one source table = one target table.
- Do NOT assume one workflow = one linear sequence (parallel branches exist).
- Do NOT assume all target fields come from source columns — they may come from parameters, constants, sequences, lookups, or expressions.
- Do NOT assume a `SOURCE` is always a raw source-system table — a stage table may appear as both a `TARGET` and later as a `SOURCE`.
- Do NOT assume every output field has compositional structure — if a field is returned by a lookup, it is a scalar return value unless an explicit expression proves otherwise.
- Do NOT assume every filter appears as a Filter transformation — filters hide in SQ source filter, SQL overrides, lookup conditions, expression logic, join conditions, and router groups.
- Do NOT assume every defined task belongs to the active execution chain — unlinked tasks are shown as auxiliary.
- Do NOT assume a Custom Transformation path creates many-to-many lineage — preserve branch isolation.
- Treat mappings as dataflow graphs, mapplets as reusable subgraphs, and workflows as execution graphs, not lists.
- Instance names (in `CONNECTOR`) reference `INSTANCE.NAME`, not definition names. Classification must use `INSTANCE.TYPE` (e.g., "Source Definition", "Target Definition", "Mapplet"), not name matching against global SOURCE/TARGET lists.
- Scoping matters: use `:scope >` when querying `TRANSFORMATION`, `INSTANCE`, `CONNECTOR` within a `MAPPING`/`MAPPLET` to avoid picking up elements from nested sub-structures.

## Key Design Decisions

- Instance-based node classification via INSTANCE TYPE attribute (not name matching)
- Edge deduplication via Map for O(1) field accumulation
- BFS-based multi-hop field mapping traces source→...→target through any number of transformations
- Intra-instance port traversal: BFS connects input ports to output ports within transformations where names differ (Lookup key→return, Expression renamed ports)
- Expression-aware port resolution: only output ports whose expression references the current input port are followed, eliminating false source attributions
- Generator BFS: non-source-originated fields (Sequence Generator, constants) are traced by a separate BFS from instances with output but no input connectors
- Mapplet internal tracing: when BFS hits a mapplet, it loads the mapplet definition and runs a sub-BFS to classify the actual internal lineage (Lookup return vs expression vs pass-through)
- Mapplet-internal BFS uses the same expression-aware port resolution as the main BFS (prevents false lineage through mapplet internals)
- Filter discovery across 7 locations: Filter Condition, Source Filter, Sql Query, Lookup Sql Override, Lookup Source Filter, Join Condition, Router GROUP conditions
- Router GROUP parsing: GROUP elements and group attribute on TRANSFORMFIELD capture router conditions per output group
- FIELDDEPENDENCY parsing for custom/union transformations: explicit port-to-port dependencies extracted from XML
- Branch-preserving lineage through custom/union: uses FIELDDEPENDENCY when available, otherwise group/suffix alignment (not many-to-many)
- Sorter lineage transparency: sorters only pass through same-named ports (field identity preserved, no new mappings created)
- Confidence level classification (HIGH/MEDIUM/LOW/UNKNOWN) on each field mapping record
- Evidence chain tracking: human-readable backward chain string on each mapping record
- Workflow task deduplication: TASK and TASKINSTANCE merged by name, TASKINSTANCE attributes take priority
- Mapplets kept separate from mappings — their internals don't pollute the main flow graph
- Mapping data flow and workflow control flow are separate graphs (Flow tab vs Workflows tab)
- Workflow auxiliary tasks: orphan tasks not connected via WORKFLOWLINK are displayed separately as "Auxiliary / Unlinked" instead of being forced into the main execution path
- Per-mapping filtering: flow graph and field mapping table both respect the mapping selector
- Metadata attached to graph nodes at build time so the detail drawer doesn't re-scan
- Unique transformation collection via Map deduplication across mappings and mapplets
- Single SVG `<defs>` block to avoid duplicate gradients/markers
- Fat invisible hit areas on SVG edge paths for easier hover interaction
- Pan/zoom uses pointer drag + wheel/pinch with `passive: false` for preventDefault
