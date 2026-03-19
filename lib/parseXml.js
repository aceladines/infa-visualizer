import { buildFieldMappings } from "./buildFieldMappings";

/**
 * Parse an Informatica PowerCenter XML export string into a structured object.
 * Uses direct-child traversal (not querySelectorAll) to prevent scope leaking.
 */
export function parseInformaticaXML(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("Invalid XML: " + parseError.textContent);

  const result = {
    repository: null,
    folders: [],
    mappings: [],
    mapplets: [],
    workflows: [],
    sessions: [],
    sources: [],
    targets: [],
    transformations: [],
    connectors: [],
    fieldMappings: [],
    shortcuts: [],
    connections: [],
    configs: [],
  };

  // ── Repository ────────────────────────────────────────────────
  const repo = doc.querySelector("POWERMART") || doc.querySelector("REPOSITORY");
  if (repo) {
    result.repository = {
      name: repo.getAttribute("REPOSITORY_NAME") || repo.getAttribute("NAME") || "Unknown",
      version: repo.getAttribute("REPOSITORY_VERSION") || repo.getAttribute("POWERCENTER_VERSION") || "",
    };
  }

  // ── Walk the full document for top-level elements ─────────────
  // Use a recursive walker that respects the Informatica XML hierarchy:
  //   POWERMART > REPOSITORY > FOLDER > (SOURCE|TARGET|MAPPING|MAPPLET|SHORTCUT|WORKFLOW|SESSION|...)
  // We collect elements at FOLDER level (or REPOSITORY level if no FOLDER).

  const folders = doc.querySelectorAll("FOLDER");
  if (folders.length > 0) {
    folders.forEach((f) => {
      result.folders.push({
        name: f.getAttribute("NAME") || "Default",
        description: f.getAttribute("DESCRIPTION") || "",
      });
      collectFolderContents(f, result);
    });
  } else {
    // No FOLDER — scan from REPOSITORY or document root
    const root = doc.querySelector("REPOSITORY") || doc.documentElement;
    collectFolderContents(root, result);
  }

  // ── POWERCENTER_CONNECTION (can be at various levels) ──────────
  doc.querySelectorAll("POWERCENTER_CONNECTION").forEach((pc) => {
    const connAttrs = [];
    directChildren(pc, "ATTRIBUTE").forEach((a) => {
      connAttrs.push({
        name: a.getAttribute("NAME") || "",
        value: a.getAttribute("VALUE") || "",
      });
    });
    result.connections.push({
      name: pc.getAttribute("NAME") || "",
      type: pc.getAttribute("TYPE") || "",
      subtype: pc.getAttribute("SUBTYPE") || "",
      attributes: connAttrs,
    });
  });

  // ── METAEXTENSION ─────────────────────────────────────────────
  doc.querySelectorAll("METAEXTENSION").forEach((me) => {
    result.configs.push({
      name: me.getAttribute("NAME") || "",
      datatype: me.getAttribute("DATATYPE") || "",
      description: me.getAttribute("DESCRIPTION") || "",
      value: me.getAttribute("VALUE") || me.getAttribute("DEFAULTVALUE") || "",
      objectType: me.getAttribute("OBJECTTYPE") || "",
    });
  });

  // ── Derived field mappings ────────────────────────────────────
  result.fieldMappings = buildFieldMappings(result);

  return result;
}

// ─── Collect contents from a FOLDER (or root) element ───────────

function collectFolderContents(folder, result) {
  // SOURCES — direct children of FOLDER only
  directChildren(folder, "SOURCE").forEach((src) => {
    result.sources.push({
      name: src.getAttribute("NAME"),
      dbdName: src.getAttribute("DBDNAME") || "",
      ownerName: src.getAttribute("OWNERNAME") || "",
      databaseType: src.getAttribute("DATABASETYPE") || "",
      description: src.getAttribute("DESCRIPTION") || "",
      fields: parseFieldElements(src, "SOURCEFIELD"),
      tableAttributes: parseTableAttributes(src),
      type: "SOURCE",
    });
  });

  // TARGETS
  directChildren(folder, "TARGET").forEach((tgt) => {
    result.targets.push({
      name: tgt.getAttribute("NAME"),
      dbdName: tgt.getAttribute("DBDNAME") || "",
      ownerName: tgt.getAttribute("OWNERNAME") || "",
      databaseType: tgt.getAttribute("DATABASETYPE") || "",
      description: tgt.getAttribute("DESCRIPTION") || "",
      fields: parseFieldElements(tgt, "TARGETFIELD"),
      tableAttributes: parseTableAttributes(tgt),
      type: "TARGET",
    });
  });

  // SHORTCUTS
  directChildren(folder, "SHORTCUT").forEach((sc) => {
    result.shortcuts.push({
      name: sc.getAttribute("NAME") || "",
      refObjectName: sc.getAttribute("REFOBJECTNAME") || "",
      objectType: sc.getAttribute("OBJECTTYPE") || sc.getAttribute("OBJECTSUBTYPE") || "",
      folderName: sc.getAttribute("FOLDERNAME") || "",
      repositoryName: sc.getAttribute("REPOSITORYNAME") || "",
      dbdName: sc.getAttribute("DBDNAME") || "",
      description: sc.getAttribute("DESCRIPTION") || "",
      reusable: sc.getAttribute("REUSABLE") || "",
      type: "SHORTCUT",
    });
  });

  // MAPPINGS — direct children of FOLDER
  directChildren(folder, "MAPPING").forEach((m) => {
    result.mappings.push(parseMapping(m, result));
  });

  // MAPPLETS — kept separate from mappings (FIX: was polluting result.mappings)
  directChildren(folder, "MAPPLET").forEach((ml) => {
    const mapplet = parseMapping(ml, result);
    mapplet.objectType = "MAPPLET";
    result.mapplets.push(mapplet);
    // NOT pushed to result.mappings — mapplet-internal connectors are not source→target flows
  });

  // SESSIONS — direct children of FOLDER (reusable sessions)
  directChildren(folder, "SESSION").forEach((s) => {
    result.sessions.push(parseSession(s));
  });

  // WORKFLOWS
  directChildren(folder, "WORKFLOW").forEach((w) => {
    const wf = parseWorkflow(w);

    // Also collect non-reusable sessions embedded inside the workflow
    directChildren(w, "SESSION").forEach((s) => {
      result.sessions.push(parseSession(s));
    });

    result.workflows.push(wf);
  });
}

// ─── MAPPING / MAPPLET parser (shared structure) ────────────────

function parseMapping(element, result) {
  const obj = {
    name: element.getAttribute("NAME"),
    description: element.getAttribute("DESCRIPTION") || "",
    isValid: element.getAttribute("ISVALID") || "",
    objectType: "MAPPING",
    transformations: [],
    connectors: [],
    instances: [],
    mappletInstances: [],
  };

  // TRANSFORMATION — direct children only (prevents leaking from nested mapplets)
  directChildren(element, "TRANSFORMATION").forEach((t) => {
    const xform = parseTransformation(t);
    obj.transformations.push(xform);
    result.transformations.push(xform);
  });

  // INSTANCE — direct children only
  directChildren(element, "INSTANCE").forEach((inst) => {
    const instanceType =
      inst.getAttribute("TYPE") ||
      inst.getAttribute("TRANSFORMATION_TYPE") ||
      "";
    const entry = {
      name: inst.getAttribute("NAME"),
      type: instanceType,
      transformationName: inst.getAttribute("TRANSFORMATION_NAME") || "",
      reusable: inst.getAttribute("REUSABLE") || "",
      description: inst.getAttribute("DESCRIPTION") || "",
    };
    obj.instances.push(entry);

    if (
      instanceType.toLowerCase() === "mapplet" ||
      inst.getAttribute("REUSABLE_TRANSFORMATION") === "YES"
    ) {
      obj.mappletInstances.push(entry);
    }
  });

  // CONNECTOR — direct children only
  directChildren(element, "CONNECTOR").forEach((c) => {
    const conn = parseConnector(c);
    obj.connectors.push(conn);
    result.connectors.push(conn);
  });

  return obj;
}

// ─── WORKFLOW parser ────────────────────────────────────────────

function parseWorkflow(w) {
  const wf = {
    name: w.getAttribute("NAME"),
    description: w.getAttribute("DESCRIPTION") || "",
    schedulerName: w.getAttribute("SCHEDULER_NAME") || "",
    isValid: w.getAttribute("ISVALID") || "",
    isSuspendOnError: w.getAttribute("SUSPEND_ON_ERROR") || "",
    tasks: [],
    links: [],
    variables: [],
  };

  // FIX: Only use TASKINSTANCE (the actual workflow graph nodes).
  // TASK elements are definitions — they don't participate in WORKFLOWLINK references.
  // Using both caused duplicate tasks and broken execution order.
  const seen = new Set();
  directChildren(w, "TASKINSTANCE").forEach((ti) => {
    const name = ti.getAttribute("NAME");
    if (seen.has(name)) return; // dedup
    seen.add(name);
    wf.tasks.push({
      name,
      type: ti.getAttribute("TASKTYPE") || "",
      transformationName: ti.getAttribute("TRANSFORMATION_NAME") || "",
      isReusable: ti.getAttribute("REUSABLE") || "",
      failParentIfInstanceFails: ti.getAttribute("FAIL_PARENT_IF_INSTANCE_FAILS") || "",
    });
  });

  // WORKFLOWLINK — direct children only (prevents leaking from nested WORKLETs)
  directChildren(w, "WORKFLOWLINK").forEach((l) => {
    wf.links.push({
      from: l.getAttribute("FROMTASK") || "",
      to: l.getAttribute("TOTASK") || "",
      condition: l.getAttribute("CONDITION") || "",
    });
  });

  // WORKFLOWVARIABLE
  directChildren(w, "WORKFLOWVARIABLE").forEach((v) => {
    wf.variables.push({
      name: v.getAttribute("NAME") || "",
      datatype: v.getAttribute("DATATYPE") || "",
      defaultValue: v.getAttribute("DEFAULTVALUE") || "",
      isNull: v.getAttribute("ISNULL") || "",
      isPersistent: v.getAttribute("ISPERSISTENT") || "",
    });
  });

  return wf;
}

// ─── SESSION parser ─────────────────────────────────────────────

function parseSession(s) {
  const sessionOverrides = [];
  directChildren(s, "SESSTRANSFORMATIONINST").forEach((sti) => {
    const attrs = [];
    directChildren(sti, "ATTRIBUTE").forEach((a) => {
      attrs.push({
        name: a.getAttribute("NAME") || "",
        value: a.getAttribute("VALUE") || "",
      });
    });
    sessionOverrides.push({
      pipelineName: sti.getAttribute("PIPELINE_NAME") || "",
      sInstName: sti.getAttribute("SINSTANCENAME") || "",
      transformationName: sti.getAttribute("TRANSFORMATION_NAME") || "",
      transformationType: sti.getAttribute("TRANSFORMATION_TYPE") || "",
      attributes: attrs,
    });
  });

  const configRef = Array.from(s.children).find((c) => c.tagName === "CONFIGREFERENCE");

  const assocSources = [];
  directChildren(s, "ASSOCIATED_SOURCE_INSTANCE").forEach((asi) => {
    assocSources.push({
      name: asi.getAttribute("NAME") || "",
      transformationName: asi.getAttribute("TRANSFORMATION_NAME") || "",
    });
  });

  return {
    name: s.getAttribute("NAME"),
    mappingName: s.getAttribute("MAPPINGNAME") || "",
    description: s.getAttribute("DESCRIPTION") || "",
    isValid: s.getAttribute("ISVALID") || "",
    sortOrder: s.getAttribute("SORTORDER") || "",
    isReusable: s.getAttribute("REUSABLE") || "",
    sessionOverrides,
    associatedSources: assocSources,
    configReference: configRef
      ? { name: configRef.getAttribute("REFOBJECTNAME") || "", type: configRef.getAttribute("TYPE") || "" }
      : null,
  };
}

// ─── Private helpers ────────────────────────────────────────────

/**
 * Get direct children of an element matching a tag name.
 * This is the critical fix: replaces querySelectorAll which leaks into nested scopes.
 */
function directChildren(parent, tagName) {
  const results = [];
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].tagName === tagName) {
      results.push(parent.children[i]);
    }
  }
  return results;
}

function parseFieldElements(parent, tagName) {
  const fields = [];
  directChildren(parent, tagName).forEach((sf) => {
    fields.push({
      name: sf.getAttribute("NAME"),
      datatype: sf.getAttribute("DATATYPE"),
      precision: sf.getAttribute("PRECISION"),
      scale: sf.getAttribute("SCALE"),
      keyType: sf.getAttribute("KEYTYPE"),
      nullable: sf.getAttribute("NULLABLE"),
      fieldNumber: sf.getAttribute("FIELDNUMBER"),
      pictureText: sf.getAttribute("PICTURETEXT") || "",
    });
  });
  return fields;
}

function parseTransformation(tElement) {
  const fields = [];
  directChildren(tElement, "TRANSFORMFIELD").forEach((tf) => {
    fields.push({
      name: tf.getAttribute("NAME"),
      datatype: tf.getAttribute("DATATYPE"),
      precision: tf.getAttribute("PRECISION"),
      scale: tf.getAttribute("SCALE"),
      porttype: tf.getAttribute("PORTTYPE"),
      expression: tf.getAttribute("EXPRESSION") || tf.getAttribute("EXPRESSION_") || "",
      defaultValue: tf.getAttribute("DEFAULTVALUE") || "",
      description: tf.getAttribute("DESCRIPTION") || "",
    });
  });

  return {
    name: tElement.getAttribute("NAME"),
    type: tElement.getAttribute("TYPE") || "",
    description: tElement.getAttribute("DESCRIPTION") || "",
    reusable: tElement.getAttribute("REUSABLE") || "",
    fields,
    tableAttributes: parseTableAttributes(tElement),
  };
}

function parseConnector(cElement) {
  return {
    fromInstance: cElement.getAttribute("FROMINSTANCE") || cElement.getAttribute("FROMINSTANCENAME") || "",
    fromField: cElement.getAttribute("FROMFIELD") || cElement.getAttribute("FROMFIELDNAME") || "",
    fromInstanceType: cElement.getAttribute("FROMINSTANCETYPE") || "",
    toInstance: cElement.getAttribute("TOINSTANCE") || cElement.getAttribute("TOINSTANCENAME") || "",
    toField: cElement.getAttribute("TOFIELD") || cElement.getAttribute("TOFIELDNAME") || "",
    toInstanceType: cElement.getAttribute("TOINSTANCETYPE") || "",
  };
}

function parseTableAttributes(parent) {
  const attrs = [];
  // FIX: replaces `:scope > TABLEATTRIBUTE` which is unreliable in DOMParser
  directChildren(parent, "TABLEATTRIBUTE").forEach((ta) => {
    attrs.push({
      name: ta.getAttribute("NAME") || "",
      value: ta.getAttribute("VALUE") || "",
    });
  });
  return attrs;
}
