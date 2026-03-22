# General Post-Processing Rules for Informatica XML Analysis

Use the following **general, transformation-agnostic post-processing rules** after the LLM produces its first-pass interpretation of an Informatica XML. These rules are designed to stay flexible across simple and complex PowerCenter exports, including mappings with multiple sources, mapplets, custom transformations, sorters, expressions, sessions, and workflows. The XML examples you provided show that Informatica exports commonly contain `SOURCE`, `TARGET`, `MAPPING`, `TRANSFORMATION`, `INSTANCE`, `CONNECTOR`, `MAPPINGVARIABLE`, `SESSION`, `WORKFLOW`, `TASK`, `TASKINSTANCE`, and `WORKFLOWLINK` objects, so post-processing should normalize everything into **graph structures** rather than flat text summaries.

---

## 1. Core Principle

Always treat the XML as **three linked graphs** instead of a list:

1. **Definition graph**  
   Object definitions such as `SOURCE`, `TARGET`, `TRANSFORMATION`, `MAPLET`, `CONFIG`.

2. **Dataflow graph**  
   Mapping-time lineage built from `INSTANCE`, `CONNECTOR`, `TRANSFORMFIELD`, `GROUP`, and `FIELDDEPENDENCY` when present. Custom transformations and unions must remain **branch-aware**, not many-to-many by default.

3. **Execution graph**  
   Workflow/session orchestration built from `SESSION`, `TASK`, `TASKINSTANCE`, and especially `WORKFLOWLINK`, which is the authoritative task dependency edge.

---

## 2. Target-First Lineage Rule

Always compute lineage **per target field**, not per branch path, transformation path, or source object. If the LLM returns a branch-level statement, split it into individual target-field claims and validate each independently. This is necessary because a shared path through a union/custom transformation does **not** mean every source field on that branch contributes to every downstream target field. The examples you investigated show that selected branch fields are carried forward while many source fields are **not** carried by the branch. 

### Required normalization
For each target field, store:

- `target_table`
- `target_field`
- `evidence_chain`
- `lineage_class`
- `confidence`
- `branch_name` (if applicable)
- `status`

### Valid statuses
- `EXPLICIT`
- `DERIVED`
- `LOOKUP_RETURN`
- `PARAMETER_DRIVEN`
- `CONSTANT`
- `SEQUENCE_GENERATED`
- `NOT_CARRIED_BY_BRANCH`
- `NOT_USED_FOR_TARGET` — source field present on path but not referenced by producing output (backward validation failure)
- `INVALID_FANOUT` — same source field mapped to many unrelated targets without per-field evidence
- `UNKNOWN`

---

## 3. Evidence Priority Rule

When post-processing the LLM output, apply this evidence priority order:

1. **Explicit connector chain** (`CONNECTOR`)  
2. **Explicit field dependency** (`FIELDDEPENDENCY`)  
3. **Explicit output expression** (`TRANSFORMFIELD.EXPRESSION`)  
4. **Exact mapplet internal flow / nested lookup output**  
5. **Exact branch alignment in a custom/union transformation**
6. **Exact field-name alignment**
7. **Everything else = UNKNOWN**

If a lower-priority interpretation contradicts a higher-priority one, discard the lower-priority result. For example, if a connector chain supports only one aligned field, reject any prose that turns it into a many-to-many mapping. The custom-union example you reviewed shows that aligned branch fields should remain aligned through the transformation path rather than being exploded into unrelated target mappings. 

---

## 4. Transformation Semantics Rules

## 4.1 Source Qualifier
Treat `Source Qualifier` as the source-side extraction boundary. It may contain filters, joins, or custom SQL and should not be reduced to “simple pass-through.” Filters may live in `TABLEATTRIBUTE` values such as SQL, Source Filter, User Defined Join, or SQL override.

### Post-processing rule
A source field should not be marked as “direct” unless:
- it is explicitly connected from source definition to Source Qualifier and onward, or
- the Source Qualifier preserves the field and no override changes its meaning.

---

## 4.2 Expression
An `Expression` transformation should only be considered to influence an output field if:
- the source field is directly connected to the relevant output/input port, or
- the field is explicitly referenced in that output field’s expression.

### Post-processing rule
Do **not** treat every upstream input port of an `Expression` as a contributor to every downstream output. Inputs that are present but not referenced in the output expression must not be shown as contributing lineage. This is especially important where local variables exist only for sequencing or row-state logic.

---

## 4.3 Sorter
A `Sorter` preserves **field identity** and changes **row ordering / distinctness**, not column meaning. The sorter path should be treated as lineage-transparent unless a downstream expression explicitly changes a field.

### Post-processing rule
Collapse sorter hops in the evidence chain if you want a cleaner display, but do not let the sorter create new source-to-target field mappings. 

---

## 4.4 Sequence
A `Sequence` output is never a source-column lineage. It must be normalized as `SEQUENCE_GENERATED`.

---

## 4.5 Lookup
A lookup output is a **scalar return value**, not a source-field pass-through, unless the lookup is explicitly configured as a pass-through of its own input. Lookup-side filters may exist in lookup SQL, SQL override, or lookup conditions, and must be surfaced as filter points. The `OWNER` example shows that a field may be returned from a nested lookup / mapplet rather than built from concatenation. 

### Post-processing rule
If no explicit concatenation/string-construction expression exists, classify the output as:

- `LOOKUP_RETURN` or `LOOKUP_DERIVED`

not `CUSTOM`, not `COMPOSITE`, and not `DIRECT_PASS_THROUGH`. The `OWNER` example you investigated fits this rule: it is lookup-driven, not a `<field1>_<field2>` composition. 

---

## 4.6 Mapplet
A `MAPLET` is a reusable subgraph, not a single opaque transformation. The XML and extracted examples show that mapplets can contain nested `Expression`, `Lookup`, input/output transformations, and internal connector flow. 

### Post-processing rule
Always expand a mapplet result into:
- input contract
- internal nested flow
- output-producing nested transformation
- output lineage class
- filter/lookup points inside the mapplet

If a mapplet output is not explicitly used downstream, it must not be shown as influencing unrelated target fields. The `OWNER` example shows why this matters. 

---

## 4.7 Custom Transformation / UNION
Custom transformations must be treated as **branch-preserving** unless the XML explicitly proves otherwise. The custom union example you reviewed shows grouped input branches and aligned output fields rather than arbitrary many-to-many lineage. 

### Post-processing rule
For any custom/union-like transformation:

1. Build a **branch model** from:
   - `GROUP`
   - `FIELDDEPENDENCY`
   - branch-specific input field naming
   - output field naming 

2. Enforce **branch isolation**:
   - each branch only contributes to its own aligned output fields
   - sharing the same downstream path does **not** imply that all fields in the branch influence all outputs. 

3. Use this mapping order:
   - `FIELDDEPENDENCY` if available
   - otherwise exact branch suffix/name alignment
   - otherwise exact field-name match
   - otherwise `UNKNOWN` 

4. If a source field is not selected into the branch output, classify it as:
   - `NOT_CARRIED_BY_BRANCH` 

### Critical rejection rule
If the LLM returns a pattern like:

> the same source field maps to many unrelated target fields through the same custom path

reject that result unless the XML explicitly shows:
- multiple `FIELDDEPENDENCY` records,
- multiple explicit expressions using that source field,
- or a true fan-out transformation. The examples you reviewed support **aligned branch mappings**, not branch-wide cross-products. 

---

## 5. Filter Discovery Rule

Do not limit “filter detection” to explicit `Filter` transformations. Informatica filter logic may appear in several places, including:

- `Filter` transformation condition
- Source Qualifier `Source Filter`
- Source Qualifier SQL / SQL override / WHERE clause
- Lookup SQL / lookup source filter / lookup condition
- Join conditions that constrain matching rows
- Expression logic that conditionally emits rows or outputs

### Post-processing rule
For every lineage or mapplet summary, attach a `filter_points` array containing all filter locations found on the path. The `OWNER`/mapplet example is important here because the mapplet may have **no standalone Filter transformation**, yet still be constrained by lookup-side filtering. 

---

## 6. Workflow Post-Processing Rules

The XML examples clearly show that workflows contain `TASK`, `TASKINSTANCE`, `WORKFLOWLINK`, variables, and conditional execution. A workflow must therefore be rendered as a **directed execution graph**, not a flat sequence.

### Rule 6.1 — Main execution path
Only tasks connected through `WORKFLOWLINK` belong in the **main execution path**. A task merely being defined in the XML does not prove it is part of the active run path.

### Rule 6.2 — Auxiliary tasks
Tasks such as variable assignments, utility commands, or success/failure handlers should be rendered as:
- `auxiliary`
- `conditionally-linked`
- or `unlinked`

unless the workflow graph explicitly shows them in the main chain. This prevents fake duplicate starts or misleading parallel roots. The workflow example you reviewed supports a clear operational sequence, while utility tasks should only be promoted if linked. 

### Rule 6.3 — Branches and conditions
Represent workflow output as:
- `main_path`
- `parallel_branches`
- `auxiliary_tasks`
- `edge_conditions`

not as one forced linear chain. Informatica workflow logic is condition-driven and may include success/failure routing.

---

## 7. Confidence and Contradiction Rules

### Confidence levels
- **HIGH** = explicit connector / fielddependency / direct expression / exact workflow link
- **MEDIUM** = exact branch alignment or strongly supported mapplet/lookup inference
- **LOW** = plausible but not fully explicit
- **UNKNOWN** = evidence incomplete or contradictory

### Contradiction handling
If the LLM gives:
- a branch-level statement that conflicts with explicit field alignment, or
- a workflow list that conflicts with `WORKFLOWLINK` structure,

the app must prefer the XML-driven rule result and downgrade the LLM statement to `LOW` or `REJECTED`.

---

## 8. Generic App-Side Decision Rules

Apply these rules after the LLM responds:

### Rule 8.1 — Normalize outputs to a canonical schema
Use a canonical structure such as:

- `field_lineage[]`
- `branch_unmapped_fields[]`
- `mapplet_outputs[]`
- `filter_points[]`
- `workflow.main_path`
- `workflow.parallel_branches`
- `workflow.auxiliary_tasks`
- `workflow.conditions`

### Rule 8.2 — Reject unsupported fan-out
If one source field appears to map to many unrelated target fields and the only evidence is “same custom transformation path,” reject it as invalid unless explicit XML evidence supports the fan-out. The custom-union evidence you reviewed does not justify branch-wide fan-out by default. 

### Rule 8.3 — Mark unused fields explicitly
Fields that exist in the source branch but are not selected into the branch output should be labeled:
- `NOT_CARRIED_BY_BRANCH`

instead of being omitted silently or mapped incorrectly. The examples you reviewed show many source fields are present in upstream sources but not propagated to the target branch. 

### Rule 8.4 — Distinguish scalar lookup outputs from composites
If no explicit string-building expression exists, treat lookup/mapplet outputs as scalar lookup returns. The `OWNER` example demonstrates why this distinction matters.

### Rule 8.5 — Field Mapping Resolution Rule

Resolve lineage per target field, not per shared path:

1. Start from the target field's immediate upstream output port.
2. Inspect that output port's exact dependencies:
   - direct input symbol
   - explicit expression references
   - lookup return value
   - parameter / constant / sequence
3. Continue tracing recursively until reaching a valid origin.
4. Do not propagate lineage through joiners or sorters unless the field is explicitly passed or referenced by the producing output.
5. If a source field is present on the path but not referenced by the producing output, classify it as `NOT_USED_FOR_TARGET`.
6. If the same source field appears to map to many unrelated targets with no explicit field-level evidence, suppress those mappings as `INVALID_FANOUT`.
7. Preserve both:
   - **technical lineage** (all transformation hops)
   - **business/source lineage** (deepest valid source/lookup/parameter origin)

### Rule 8.6 — Backward validation

After forward BFS produces mapping records, validate each by walking transformation steps backward from the target. At each step, verify the output port's expression references the input field (or the step is a same-name pass-through, FIELDDEPENDENCY-backed, or from a type that returns values without input-referencing expressions). If any step fails, reclassify as `NOT_USED_FOR_TARGET` with `LOW` confidence.

---

## 9. Minimal Generic Pseudocode Logic

Use this generalized decision logic in the app:

1. **For each target field**  
   - trace backward through connectors
   - preserve field identity through sorters
   - only keep source inputs referenced by explicit expressions
   - if a custom/union transformation is encountered:
     - isolate the correct branch/group
     - use `FIELDDEPENDENCY` if present
     - otherwise use branch suffix/name alignment
   - if a lookup/mapplet output is encountered:
     - classify as `LOOKUP_RETURN` unless explicit concatenation exists
   - if no sufficient evidence:
     - classify as `UNKNOWN` 

2. **For each source field in a branch**
   - if it does not appear in:
     - branch output fields,
     - explicit field dependencies,
     - or explicit downstream expressions
   - then mark:
     - `NOT_CARRIED_BY_BRANCH` 

3. **For workflow**
   - build the main DAG only from `WORKFLOWLINK`
   - keep unlinked or indirectly referenced tasks separate
   - preserve branch structure and edge conditions
   - do not flatten parallel or conditional paths into a fake linear list. 

---

## 10. Final General Rule Set (Short Version)

If you want the shortest usable version for your app logic, use this:

- Build **definition**, **dataflow**, and **execution** graphs separately.
- Compute lineage **per target field**, not per branch path. 
- Respect this evidence priority: `CONNECTOR` > `FIELDDEPENDENCY` > `EXPRESSION` > mapplet/lookup internal flow > exact branch alignment > exact field-name match > `UNKNOWN`.
- Treat custom/union transformations as **branch-preserving**, not many-to-many by default. 
- Preserve field identity through sorters.
- Only let expressions influence outputs they explicitly reference.
- Treat lookup/mapplet outputs as scalar returns unless explicit concatenation exists. 
- Discover filters in **Filter**, **Source Qualifier**, **lookup SQL**, **join conditions**, and **expression gating**.
- Mark upstream fields that are not selected into the branch output as `NOT_CARRIED_BY_BRANCH`.
- **Backward-validate** each mapping: walk transformation steps from target backward, verify producing output references the input. Classify failures as `NOT_USED_FOR_TARGET`.
- **Suppress invalid fan-out**: if one source field maps to >3 unrelated targets without per-field expression evidence, classify as `INVALID_FANOUT`.
- Track **dual lineage**: technical (all hops) + business (deepest valid origin: source field, lookup return, parameter, constant, sequence).
- Build workflow order only from `WORKFLOWLINK`; keep auxiliary/unlinked tasks separate.

---