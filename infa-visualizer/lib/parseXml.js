import { buildFieldMappings } from "./buildFieldMappings";

/**
 * Parse an Informatica PowerCenter XML export.
 *
 * CRITICAL FIX: Builds an instanceMap per mapping so that CONNECTOR instance
 * names can be resolved to their actual SOURCE/TARGET/TRANSFORMATION definitions.
 * In real exports, INSTANCE.NAME ≠ definition NAME (e.g. "EMPLOYEES_1" instance
 * references "EMPLOYEES" source definition via TRANSFORMATION_NAME attribute).
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

  const repo = doc.querySelector("POWERMART") || doc.querySelector("REPOSITORY");
  if (repo) {
    result.repository = {
      name: repo.getAttribute("REPOSITORY_NAME") || repo.getAttribute("NAME") || "Unknown",
      version: repo.getAttribute("REPOSITORY_VERSION") || repo.getAttribute("POWERCENTER_VERSION") || "",
    };
  }

  const folders = directChildren(doc.documentElement.tagName === "POWERMART" ? (doc.querySelector("REPOSITORY") || doc.documentElement) : doc.documentElement, "FOLDER");
  if (folders.length > 0) {
    folders.forEach((f) => {
      result.folders.push({ name: f.getAttribute("NAME") || "Default", description: f.getAttribute("DESCRIPTION") || "" });
      collectFolderContents(f, result);
    });
  } else {
    collectFolderContents(doc.querySelector("REPOSITORY") || doc.documentElement, result);
  }

  // Global elements
  doc.querySelectorAll("POWERCENTER_CONNECTION").forEach((pc) => {
    const attrs = [];
    directChildren(pc, "ATTRIBUTE").forEach((a) => attrs.push({ name: a.getAttribute("NAME") || "", value: a.getAttribute("VALUE") || "" }));
    result.connections.push({ name: pc.getAttribute("NAME") || "", type: pc.getAttribute("TYPE") || "", subtype: pc.getAttribute("SUBTYPE") || "", attributes: attrs });
  });

  result.fieldMappings = buildFieldMappings(result);
  return result;
}

function collectFolderContents(folder, result) {
  directChildren(folder, "SOURCE").forEach((src) => {
    result.sources.push({
      name: src.getAttribute("NAME"), dbdName: src.getAttribute("DBDNAME") || "",
      ownerName: src.getAttribute("OWNERNAME") || "", databaseType: src.getAttribute("DATABASETYPE") || "",
      description: src.getAttribute("DESCRIPTION") || "", fields: parseFieldElements(src, "SOURCEFIELD"),
      tableAttributes: parseTableAttributes(src), type: "SOURCE",
    });
  });

  directChildren(folder, "TARGET").forEach((tgt) => {
    result.targets.push({
      name: tgt.getAttribute("NAME"), dbdName: tgt.getAttribute("DBDNAME") || "",
      ownerName: tgt.getAttribute("OWNERNAME") || "", databaseType: tgt.getAttribute("DATABASETYPE") || "",
      description: tgt.getAttribute("DESCRIPTION") || "", fields: parseFieldElements(tgt, "TARGETFIELD"),
      tableAttributes: parseTableAttributes(tgt), type: "TARGET",
    });
  });

  directChildren(folder, "SHORTCUT").forEach((sc) => {
    result.shortcuts.push({
      name: sc.getAttribute("NAME") || "", refObjectName: sc.getAttribute("REFOBJECTNAME") || "",
      objectType: sc.getAttribute("OBJECTTYPE") || sc.getAttribute("OBJECTSUBTYPE") || "",
      folderName: sc.getAttribute("FOLDERNAME") || "", repositoryName: sc.getAttribute("REPOSITORYNAME") || "",
      dbdName: sc.getAttribute("DBDNAME") || "", description: sc.getAttribute("DESCRIPTION") || "",
      reusable: sc.getAttribute("REUSABLE") || "", type: "SHORTCUT",
    });
  });

  // Reusable transformations at folder level
  directChildren(folder, "TRANSFORMATION").forEach((t) => {
    result.transformations.push(parseTransformation(t));
  });

  directChildren(folder, "MAPPING").forEach((m) => {
    result.mappings.push(parseMapping(m, result));
  });

  directChildren(folder, "MAPPLET").forEach((ml) => {
    const mapplet = parseMapping(ml, result);
    mapplet.objectType = "MAPPLET";
    result.mapplets.push(mapplet);
  });

  directChildren(folder, "SESSION").forEach((s) => result.sessions.push(parseSession(s)));

  directChildren(folder, "WORKFLOW").forEach((w) => {
    const wf = parseWorkflow(w);
    // Non-reusable sessions inside workflow
    directChildren(w, "SESSION").forEach((s) => result.sessions.push(parseSession(s)));
    // WORKLETs inside workflow
    directChildren(w, "WORKLET").forEach((wl) => {
      const sub = parseWorkflow(wl);
      sub.isWorklet = true;
      sub.parentWorkflow = wf.name;
      // Sessions inside worklet
      directChildren(wl, "SESSION").forEach((s) => result.sessions.push(parseSession(s)));
      if (!wf.worklets) wf.worklets = [];
      wf.worklets.push(sub);
    });
    result.workflows.push(wf);
  });
}

/**
 * Parse MAPPING or MAPPLET.
 * CRITICAL: Builds instanceMap that resolves INSTANCE.NAME → definition info.
 * This is required because CONNECTORs reference INSTANCE names, NOT definition names.
 */
function parseMapping(element, result) {
  const obj = {
    name: element.getAttribute("NAME"),
    description: element.getAttribute("DESCRIPTION") || "",
    isValid: element.getAttribute("ISVALID") || "",
    objectType: "MAPPING",
    transformations: [],
    connectors: [],
    instances: [],
    instanceMap: {},       // CRITICAL: instanceName → { transformationName, type }
    targetLoadOrder: [],
    mappingVariables: [],
  };

  directChildren(element, "TRANSFORMATION").forEach((t) => {
    const xform = parseTransformation(t);
    obj.transformations.push(xform);
    result.transformations.push(xform);
  });

  // INSTANCE elements - the bridge between CONNECTORs and definitions
  directChildren(element, "INSTANCE").forEach((inst) => {
    const name = inst.getAttribute("NAME") || "";
    const transformationName = inst.getAttribute("TRANSFORMATION_NAME") || name;
    const type = inst.getAttribute("TYPE") || inst.getAttribute("TRANSFORMATION_TYPE") || "";
    const entry = {
      name, type, transformationName,
      reusable: inst.getAttribute("REUSABLE") || "",
      description: inst.getAttribute("DESCRIPTION") || "",
    };
    obj.instances.push(entry);
    // Build resolution map: what each CONNECTOR instance name actually refers to
    obj.instanceMap[name] = { transformationName, type };
  });

  directChildren(element, "CONNECTOR").forEach((c) => {
    const conn = parseConnector(c);
    obj.connectors.push(conn);
    result.connectors.push(conn);
  });

  // TARGETLOADORDER
  directChildren(element, "TARGETLOADORDER").forEach((tlo) => {
    obj.targetLoadOrder.push({
      targetInstance: tlo.getAttribute("TARGETINSTANCE") || "",
      order: tlo.getAttribute("ORDER") || "",
    });
  });

  // MAPPINGVARIABLE
  directChildren(element, "MAPPINGVARIABLE").forEach((mv) => {
    obj.mappingVariables.push({
      name: mv.getAttribute("NAME") || "",
      datatype: mv.getAttribute("DATATYPE") || "",
      defaultValue: mv.getAttribute("DEFAULTVALUE") || "",
      isExprVar: mv.getAttribute("ISEXPRESSIONVARIABLE") || "",
    });
  });

  return obj;
}

function parseWorkflow(w) {
  const wf = {
    name: w.getAttribute("NAME"), description: w.getAttribute("DESCRIPTION") || "",
    schedulerName: w.getAttribute("SCHEDULER_NAME") || "", isValid: w.getAttribute("ISVALID") || "",
    tasks: [], links: [], variables: [],
  };
  const seen = new Set();
  directChildren(w, "TASKINSTANCE").forEach((ti) => {
    const name = ti.getAttribute("NAME");
    if (seen.has(name)) return;
    seen.add(name);
    wf.tasks.push({
      name, type: ti.getAttribute("TASKTYPE") || "",
      transformationName: ti.getAttribute("TRANSFORMATION_NAME") || "",
      isReusable: ti.getAttribute("REUSABLE") || "",
    });
  });
  directChildren(w, "WORKFLOWLINK").forEach((l) => {
    wf.links.push({ from: l.getAttribute("FROMTASK") || "", to: l.getAttribute("TOTASK") || "", condition: l.getAttribute("CONDITION") || "" });
  });
  directChildren(w, "WORKFLOWVARIABLE").forEach((v) => {
    wf.variables.push({ name: v.getAttribute("NAME") || "", datatype: v.getAttribute("DATATYPE") || "", defaultValue: v.getAttribute("DEFAULTVALUE") || "" });
  });
  return wf;
}

function parseSession(s) {
  const overrides = [];
  directChildren(s, "SESSTRANSFORMATIONINST").forEach((sti) => {
    const attrs = [];
    directChildren(sti, "ATTRIBUTE").forEach((a) => attrs.push({ name: a.getAttribute("NAME") || "", value: a.getAttribute("VALUE") || "" }));
    overrides.push({ sInstName: sti.getAttribute("SINSTANCENAME") || "", transformationName: sti.getAttribute("TRANSFORMATION_NAME") || "", transformationType: sti.getAttribute("TRANSFORMATION_TYPE") || "", attributes: attrs });
  });
  return {
    name: s.getAttribute("NAME"), mappingName: s.getAttribute("MAPPINGNAME") || "",
    description: s.getAttribute("DESCRIPTION") || "", isValid: s.getAttribute("ISVALID") || "",
    isReusable: s.getAttribute("REUSABLE") || "", sessionOverrides: overrides,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function directChildren(parent, tagName) {
  const results = [];
  if (!parent || !parent.children) return results;
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].tagName === tagName) results.push(parent.children[i]);
  }
  return results;
}

function parseFieldElements(parent, tagName) {
  return directChildren(parent, tagName).map((sf) => ({
    name: sf.getAttribute("NAME"), datatype: sf.getAttribute("DATATYPE"),
    precision: sf.getAttribute("PRECISION"), scale: sf.getAttribute("SCALE"),
    keyType: sf.getAttribute("KEYTYPE"), nullable: sf.getAttribute("NULLABLE"),
    fieldNumber: sf.getAttribute("FIELDNUMBER"),
  }));
}

function parseTransformation(t) {
  const fields = directChildren(t, "TRANSFORMFIELD").map((tf) => ({
    name: tf.getAttribute("NAME"), datatype: tf.getAttribute("DATATYPE"),
    precision: tf.getAttribute("PRECISION"), scale: tf.getAttribute("SCALE"),
    porttype: tf.getAttribute("PORTTYPE"),
    expression: tf.getAttribute("EXPRESSION") || tf.getAttribute("EXPRESSION_") || "",
    defaultValue: tf.getAttribute("DEFAULTVALUE") || "",
    description: tf.getAttribute("DESCRIPTION") || "",
  }));
  return {
    name: t.getAttribute("NAME"), type: t.getAttribute("TYPE") || "",
    description: t.getAttribute("DESCRIPTION") || "",
    reusable: t.getAttribute("REUSABLE") || "", fields,
    tableAttributes: parseTableAttributes(t),
  };
}

function parseConnector(c) {
  return {
    fromInstance: c.getAttribute("FROMINSTANCE") || c.getAttribute("FROMINSTANCENAME") || "",
    fromField: c.getAttribute("FROMFIELD") || c.getAttribute("FROMFIELDNAME") || "",
    fromInstanceType: c.getAttribute("FROMINSTANCETYPE") || "",
    toInstance: c.getAttribute("TOINSTANCE") || c.getAttribute("TOINSTANCENAME") || "",
    toField: c.getAttribute("TOFIELD") || c.getAttribute("TOFIELDNAME") || "",
    toInstanceType: c.getAttribute("TOINSTANCETYPE") || "",
  };
}

function parseTableAttributes(parent) {
  return directChildren(parent, "TABLEATTRIBUTE").map((ta) => ({
    name: ta.getAttribute("NAME") || "", value: ta.getAttribute("VALUE") || "",
  }));
}
