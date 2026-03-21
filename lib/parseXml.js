import { buildFieldMappings } from "./buildFieldMappings";

/**
 * Parse an Informatica PowerCenter XML export string into a structured object.
 *
 * Handles: POWERMART, REPOSITORY, FOLDER, SOURCE/SOURCEFIELD,
 * TARGET/TARGETFIELD, MAPPING, MAPPLET, TRANSFORMATION/TRANSFORMFIELD,
 * CONNECTOR, INSTANCE, SHORTCUT, WORKFLOW, WORKFLOWLINK, TASKINSTANCE,
 * SESSION, SESSTRANSFORMATIONINST, CONFIGREFERENCE, POWERCENTER_CONNECTION,
 * TABLEATTRIBUTE, METAEXTENSION, ASSOCIATED_SOURCE_INSTANCE.
 *
 * @param {string} xmlString - Raw XML content
 * @returns {object} Parsed data
 */
export function parseInformaticaXML(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Invalid XML: " + parseError.textContent);
  }

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

  // ── Repository info ───────────────────────────────────────────
  const repo =
    doc.querySelector("POWERMART") || doc.querySelector("REPOSITORY");
  if (repo) {
    result.repository = {
      name:
        repo.getAttribute("REPOSITORY_NAME") ||
        repo.getAttribute("NAME") ||
        "Unknown",
      version:
        repo.getAttribute("REPOSITORY_VERSION") ||
        repo.getAttribute("POWERCENTER_VERSION") ||
        "",
    };
  }

  // ── Folders ───────────────────────────────────────────────────
  doc.querySelectorAll("FOLDER").forEach((f) => {
    result.folders.push({
      name: f.getAttribute("NAME") || "Default",
      description: f.getAttribute("DESCRIPTION") || "",
    });
  });

  // ── Sources ───────────────────────────────────────────────────
  doc.querySelectorAll("SOURCE").forEach((src) => {
    const fields = parseFieldElements(src, "SOURCEFIELD");
    const tableAttrs = parseTableAttributes(src);
    result.sources.push({
      name: src.getAttribute("NAME"),
      dbdName: src.getAttribute("DBDNAME") || "",
      ownerName: src.getAttribute("OWNERNAME") || "",
      databaseType: src.getAttribute("DATABASETYPE") || "",
      description: src.getAttribute("DESCRIPTION") || "",
      fields,
      tableAttributes: tableAttrs,
      type: "SOURCE",
    });
  });

  // ── Targets ───────────────────────────────────────────────────
  doc.querySelectorAll("TARGET").forEach((tgt) => {
    const fields = parseFieldElements(tgt, "TARGETFIELD");
    const tableAttrs = parseTableAttributes(tgt);
    result.targets.push({
      name: tgt.getAttribute("NAME"),
      dbdName: tgt.getAttribute("DBDNAME") || "",
      ownerName: tgt.getAttribute("OWNERNAME") || "",
      databaseType: tgt.getAttribute("DATABASETYPE") || "",
      description: tgt.getAttribute("DESCRIPTION") || "",
      fields,
      tableAttributes: tableAttrs,
      type: "TARGET",
    });
  });

  // ── Shortcuts (reusable references across folders) ────────────
  doc.querySelectorAll("SHORTCUT").forEach((sc) => {
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

  // ── Mappings (with nested transformations, instances, connectors) ──
  doc.querySelectorAll("MAPPING").forEach((m) => {
    result.mappings.push(parseMappingOrMapplet(m, "MAPPING"));
  });

  // ── Mapplets (reusable transformation groups — kept separate from mappings) ──
  doc.querySelectorAll("MAPPLET").forEach((ml) => {
    result.mapplets.push(parseMappingOrMapplet(ml, "MAPPLET"));
  });

  // ── Collect unique transformations from all mappings and mapplets ──
  const xformMap = new Map();
  [...result.mappings, ...result.mapplets].forEach((m) => {
    (m.transformations || []).forEach((t) => {
      if (!xformMap.has(t.name)) xformMap.set(t.name, t);
    });
  });
  result.transformations = Array.from(xformMap.values());

  // ── Collect connectors from mappings (for summary/reference) ──
  result.connectors = result.mappings.flatMap((m) => m.connectors || []);

  // ── Workflows ─────────────────────────────────────────────────
  doc.querySelectorAll("WORKFLOW").forEach((w) => {
    result.workflows.push(parseWorkflow(w));
  });

  // ── Sessions ──────────────────────────────────────────────────
  doc.querySelectorAll("SESSION").forEach((s) => {
    const sessionOverrides = [];

    // SESSTRANSFORMATIONINST — session-level property overrides
    s.querySelectorAll("SESSTRANSFORMATIONINST").forEach((sti) => {
      const attrs = [];
      sti.querySelectorAll("ATTRIBUTE").forEach((a) => {
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

    // CONFIGREFERENCE
    const configRef = s.querySelector("CONFIGREFERENCE");

    // ASSOCIATED_SOURCE_INSTANCE
    const assocSources = [];
    s.querySelectorAll("ASSOCIATED_SOURCE_INSTANCE").forEach((asi) => {
      assocSources.push({
        name: asi.getAttribute("NAME") || "",
        transformationName: asi.getAttribute("TRANSFORMATION_NAME") || "",
      });
    });

    result.sessions.push({
      name: s.getAttribute("NAME"),
      mappingName: s.getAttribute("MAPPINGNAME") || "",
      description: s.getAttribute("DESCRIPTION") || "",
      isValid: s.getAttribute("ISVALID") || "",
      sortOrder: s.getAttribute("SORTORDER") || "",
      isReusable: s.getAttribute("REUSABLE") || "",
      sessionOverrides,
      associatedSources: assocSources,
      configReference: configRef
        ? {
            name: configRef.getAttribute("REFOBJECTNAME") || "",
            type: configRef.getAttribute("TYPE") || "",
          }
        : null,
    });
  });

  // ── POWERCENTER_CONNECTION (database / FTP / etc. connections) ──
  doc.querySelectorAll("POWERCENTER_CONNECTION").forEach((pc) => {
    const connAttrs = [];
    pc.querySelectorAll("ATTRIBUTE").forEach((a) => {
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

  // ── METAEXTENSION (custom metadata attached to objects) ────────
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

// ─── Shared parser for MAPPING and MAPPLET ──────────────────────

function parseMappingOrMapplet(element, kind) {
  const obj = {
    name: element.getAttribute("NAME"),
    description: element.getAttribute("DESCRIPTION") || "",
    isValid: element.getAttribute("ISVALID") || "",
    objectType: kind,
    transformations: [],
    connectors: [],
    instances: [],
    mappletInstances: [],
  };

  // Use :scope > to only get direct children, avoiding nested MAPPLET internals
  element.querySelectorAll(":scope > TRANSFORMATION").forEach((t) => {
    obj.transformations.push(parseTransformation(t));
  });

  element.querySelectorAll(":scope > INSTANCE").forEach((inst) => {
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

  element.querySelectorAll(":scope > CONNECTOR").forEach((c) => {
    obj.connectors.push(parseConnector(c));
  });

  return obj;
}

// ─── Workflow parser ────────────────────────────────────────────

function parseWorkflow(w) {
  const wf = {
    name: w.getAttribute("NAME"),
    description: w.getAttribute("DESCRIPTION") || "",
    schedulerName: w.getAttribute("SCHEDULER_NAME") || "",
    isValid: w.getAttribute("ISVALID") || "",
    isSuspendOnError: w.getAttribute("SUSPEND_ON_ERROR") || "",
    tasks: [],
    links: [],
  };

  w.querySelectorAll("TASK").forEach((t) => {
    wf.tasks.push({
      name: t.getAttribute("NAME"),
      type: t.getAttribute("TYPE") || "",
      description: t.getAttribute("DESCRIPTION") || "",
      reusable: t.getAttribute("REUSABLE") || "",
    });
  });

  w.querySelectorAll("TASKINSTANCE").forEach((ti) => {
    wf.tasks.push({
      name: ti.getAttribute("NAME"),
      type: ti.getAttribute("TASKTYPE") || "",
      transformationName: ti.getAttribute("TRANSFORMATION_NAME") || "",
      isReusable: ti.getAttribute("REUSABLE") || "",
      failParentIfInstanceFails:
        ti.getAttribute("FAIL_PARENT_IF_INSTANCE_FAILS") || "",
    });
  });

  w.querySelectorAll("WORKFLOWLINK").forEach((l) => {
    wf.links.push({
      from: l.getAttribute("FROMTASK") || "",
      to: l.getAttribute("TOTASK") || "",
      condition: l.getAttribute("CONDITION") || "",
    });
  });

  // WORKFLOWVARIABLE
  w.querySelectorAll("WORKFLOWVARIABLE").forEach((v) => {
    if (!wf.variables) wf.variables = [];
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

// ─── Private helpers ─────────────────────────────────────────────

function parseFieldElements(parent, tagName) {
  const fields = [];
  parent.querySelectorAll(tagName).forEach((sf) => {
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
  tElement.querySelectorAll("TRANSFORMFIELD").forEach((tf) => {
    fields.push({
      name: tf.getAttribute("NAME"),
      datatype: tf.getAttribute("DATATYPE"),
      precision: tf.getAttribute("PRECISION"),
      scale: tf.getAttribute("SCALE"),
      porttype: tf.getAttribute("PORTTYPE"),
      expression:
        tf.getAttribute("EXPRESSION") ||
        tf.getAttribute("EXPRESSION_") ||
        "",
      defaultValue: tf.getAttribute("DEFAULTVALUE") || "",
      description: tf.getAttribute("DESCRIPTION") || "",
      group: tf.getAttribute("GROUP") || tf.getAttribute("GROUPNAME") || "",
    });
  });

  // Gather TABLEATTRIBUTE for transformations that have them (e.g. SQ overrides, Lookup SQL)
  const tableAttrs = parseTableAttributes(tElement);

  // Parse Router/other GROUP elements if present
  const groups = [];
  tElement.querySelectorAll(":scope > GROUP").forEach((g) => {
    groups.push({
      name: g.getAttribute("NAME") || "",
      expression: g.getAttribute("EXPRESSION") || "",
      order: g.getAttribute("ORDER") || "",
      type: g.getAttribute("TYPE") || "",
    });
  });

  return {
    name: tElement.getAttribute("NAME"),
    type: tElement.getAttribute("TYPE") || "",
    description: tElement.getAttribute("DESCRIPTION") || "",
    reusable: tElement.getAttribute("REUSABLE") || "",
    fields,
    tableAttributes: tableAttrs,
    ...(groups.length > 0 ? { groups } : {}),
  };
}

function parseConnector(cElement) {
  return {
    fromInstance:
      cElement.getAttribute("FROMINSTANCE") ||
      cElement.getAttribute("FROMINSTANCENAME") ||
      "",
    fromField:
      cElement.getAttribute("FROMFIELD") ||
      cElement.getAttribute("FROMFIELDNAME") ||
      "",
    fromInstanceType: cElement.getAttribute("FROMINSTANCETYPE") || "",
    toInstance:
      cElement.getAttribute("TOINSTANCE") ||
      cElement.getAttribute("TOINSTANCENAME") ||
      "",
    toField:
      cElement.getAttribute("TOFIELD") ||
      cElement.getAttribute("TOFIELDNAME") ||
      "",
    toInstanceType: cElement.getAttribute("TOINSTANCETYPE") || "",
  };
}

function parseTableAttributes(parent) {
  const attrs = [];
  parent.querySelectorAll(":scope > TABLEATTRIBUTE").forEach((ta) => {
    attrs.push({
      name: ta.getAttribute("NAME") || "",
      value: ta.getAttribute("VALUE") || "",
    });
  });
  return attrs;
}
