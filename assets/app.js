// Minimal CDC simulator with Debezium-like envelopes.
// Now with Appwrite Realtime.
// State is in-memory + localStorage snapshot.

const DEFAULT_SCHEMA = [
  { name: "id", type: "number", pk: true },
  { name: "customer_name", type: "string", pk: false },
  { name: "customer_email", type: "string", pk: false },
  { name: "customer_since", type: "string", pk: false },
  { name: "paper_grade", type: "string", pk: false },
  { name: "paper_size", type: "string", pk: false },
  { name: "sheet_count", type: "number", pk: false },
  { name: "price_per_unit", type: "number", pk: false },
  { name: "order_total", type: "number", pk: false },
  { name: "sales_rep", type: "string", pk: false },
  { name: "region", type: "string", pk: false },
];

const state = {
  schema: [],     // [{name, type, pk}]
  rows: [],       // [{col: value}]
  events: [],     // emitted events (local + realtime)
};

const els = {
  schemaPills: document.getElementById("schemaPills"),
  rowEditor: document.getElementById("rowEditor"),
  tbl: document.getElementById("tbl"),
  eventLog: document.getElementById("eventLog"),
  debzWrap: document.getElementById("debzWrap"),
  includeBefore: document.getElementById("includeBefore"),
  copyNdjson: document.getElementById("btnCopyNdjson"),
  downloadNdjson: document.getElementById("btnDownloadNdjson"),
  learningSteps: document.getElementById("learningSteps"),
  learningTip: document.getElementById("learningTip"),
  schemaStatus: document.getElementById("schemaStatus"),
  stepCards: Array.from(document.querySelectorAll(".step-card")),
  autofillRow: document.getElementById("btnAutofillRow"),
};

const learningConfig = [
  {
    id: "schema",
    target: "#schema",
    tip: "Add at least one column and designate a primary key so updates can locate rows.",
    completeTip: "Nice foundation. Head to the table to add seed data.",
    isComplete: () => state.schema.length > 0,
  },
  {
    id: "rows",
    target: "#table-state",
    tip: "Seed sample data or insert rows so you have something to mutate.",
    completeTip: "Table looks good. Trigger some inserts, updates, or deletes next.",
    isComplete: () => state.rows.length > 0,
  },
  {
    id: "events",
    target: "#change-feed",
    tip: "Run inserts, updates, deletes, or emit snapshot to see change events stream in.",
    completeTip: "Great! Copy or download the NDJSON to share your feed.",
    isComplete: () => state.events.length > 0,
  },
];

// ---------- Utilities ----------
const nowTs = () => Date.now();
const clone  = (x) => JSON.parse(JSON.stringify(x));
const save   = () => {
  try {
    localStorage.setItem("cdc_playground", JSON.stringify(state));
  } catch (err) {
    console.warn("Save to localStorage failed", err?.message || err);
  }
};
const load   = () => {
  try {
    const raw = localStorage.getItem("cdc_playground");
    if (!raw) return;
    const s = JSON.parse(raw);
    state.schema = s.schema || [];
    state.rows   = s.rows   || [];
    state.events = s.events || [];
  } catch { /* ignore */ }
};
const flashButton = (btn, msg) => {
  if (!btn) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = msg;
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
  }, 1500);
};

const toNdjson = (events) => events.map(ev => JSON.stringify(ev)).join("\n");

function escapeHtml(str = "") {
  return str.replace(/[&<>"]/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[ch] || ch);
}

function highlightJson(json = "") {
  const escaped = escapeHtml(json);
  return escaped.replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?::)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
    let cls = "json-number";
    if (match.startsWith("\"")) {
      cls = match.endsWith(":") ? "json-key" : "json-string";
    } else if (match === "true" || match === "false") {
      cls = "json-boolean";
    } else if (match === "null") {
      cls = "json-null";
    }
    return `<span class="${cls}">${match}</span>`;
  });
}

function emitSparkleTrail(op = "c") {
  const source = els.rowEditor;
  const target = els.eventLog;
  if (!source || !target) return;

  const srcRect = source.getBoundingClientRect();
  const dstRect = target.getBoundingClientRect();

  const sparks = 6;
  for (let i = 0; i < sparks; i++) {
    const originX = srcRect.left + srcRect.width * (0.2 + Math.random() * 0.6);
    const originY = srcRect.top + srcRect.height * (0.2 + Math.random() * 0.6);
    const destX = dstRect.left + dstRect.width * (0.15 + Math.random() * 0.7);
    const destY = dstRect.top + dstRect.height * (0.08 + Math.random() * 0.22);

    const sparkle = document.createElement("span");
    sparkle.className = "sparkle";
    sparkle.dataset.op = op;
    sparkle.style.left = `${originX}px`;
    sparkle.style.top = `${originY}px`;
    document.body.appendChild(sparkle);

    const dx = destX - originX;
    const dy = destY - originY;
    const midX = dx * (0.45 + Math.random() * 0.15);
    const midY = dy * (0.45 + Math.random() * 0.2) - 20 * Math.random();
    const duration = 620 + Math.random() * 280;
    const delay = Math.random() * 90;

    const animation = sparkle.animate([
      { transform: "translate(-50%, -50%) scale(0.5)", opacity: 0.95 },
      { transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px) scale(1)`, opacity: 0.8 },
      { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(0.1)`, opacity: 0 }
    ], { duration, delay, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });

    if (animation.finished) {
      animation.finished.then(() => sparkle.remove()).catch(() => sparkle.remove());
    }
    animation.onfinish = () => sparkle.remove();
    setTimeout(() => sparkle.remove(), duration + delay + 120);
  }
}

function refreshSchemaStatus(message, tone = "muted") {
  const el = els.schemaStatus;
  if (!el) return;
  const columns = state.schema.length;
  const hasPk = state.schema.some(c => c.pk);
  const defaultMsg = columns === 0
    ? "Add a column to begin building your table."
    : hasPk
      ? `${columns} column${columns === 1 ? "" : "s"} defined. Click a pill to remove.`
      : `Define at least one primary key so updates and deletes can locate rows.`;
  el.textContent = message ?? defaultMsg;
  el.classList.remove("is-error", "is-success");
  if (tone === "error") el.classList.add("is-error");
  if (tone === "success") el.classList.add("is-success");
}

function hasPrimaryKey() {
  return state.schema.some(col => col.pk);
}

function getPrimaryKeyFields() {
  return state.schema.filter(col => col.pk).map(col => col.name);
}

function ensurePrimaryKeyValues(values) {
  const pks = getPrimaryKeyFields();
  const missing = pks.filter(name => values[name] === null || typeof values[name] === "undefined");
  if (!missing.length) return true;
  alert(`Provide values for primary key column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
  return false;
}

function demandPrimaryKey(action) {
  if (hasPrimaryKey()) return true;
  const msg = action
    ? `Add a primary key before ${action}.`
    : `Add at least one primary key to continue.`;
  refreshSchemaStatus(msg, "error");
  updateLearning("schema");
  return false;
}

function nextDocumentId() {
  if (!appwrite || !window.Appwrite) return null;
  try {
    return Appwrite.ID.unique();
  } catch {
    return null;
  }
}

function ensureDefaultSchema() {
  let mutated = false;
  if (!state.schema.length) {
    state.schema = DEFAULT_SCHEMA.map(col => ({ ...col }));
    mutated = true;
  }
  if (!state.rows.length) {
    state.rows = [];
  }
  return mutated;
}

// Debezium-ish envelope
function buildEvent(op, before, after) {
  const pkFields = state.schema.filter(c => c.pk).map(c => c.name);
  const key = {};
  for (const k of pkFields) key[k] = (after ?? before)?.[k] ?? null;

  if (!els.debzWrap.checked) {
    return { op, before: els.includeBefore.checked ? before ?? null : null, after, ts_ms: nowTs() };
  }

  return {
    payload: {
      before: els.includeBefore.checked ? before ?? null : null,
      after:  after ?? null,
      source: { name: "playground", version: "0.1.0" },
      op,            // c,u,d,r
      ts_ms: nowTs()
    },
    key
  };
}
function getFilterFlags() {
  return {
    c: document.getElementById("filterC")?.checked ?? true,
    u: document.getElementById("filterU")?.checked ?? true,
    d: document.getElementById("filterD")?.checked ?? true,
    r: document.getElementById("filterR")?.checked ?? true,
  };
}

function filterEvents(evts) {
  const allowed = getFilterFlags();
  return evts.filter(e => {
    const op = e.op || e.payload?.op;
    return allowed[op] ?? true;
  });
}

function getOp(ev) {
  // supports both plain and Debezium-envelope shapes
  return ev.op ?? ev.payload?.op ?? "u";
}

function renderJSONLog() {
  const filtered = filterEvents(state.events);
  if (!filtered.length) {
    els.eventLog.textContent = "// no events yet (check filters)";
    updateLearning();
    return;
  }

  const payload = filtered.map(ev => JSON.stringify(ev, null, 2)).join("\n");
  els.eventLog.innerHTML = highlightJson(payload);
  updateLearning();
}

function updateLearning(activeId) {
  if (!els.learningSteps) return;

  const buttons = Array.from(els.learningSteps.querySelectorAll("button.learning-step"));
  let firstIncomplete = null;

  buttons.forEach(btn => {
    const id = btn.dataset.step;
    const config = learningConfig.find(step => step.id === id);
    const complete = config?.isComplete() ?? false;
    btn.classList.toggle("is-complete", complete);

    const status = btn.querySelector(".step-status");
    if (status) status.textContent = complete ? "Done" : "Pending";

    if (!complete && firstIncomplete === null) firstIncomplete = id;
  });

  const activeIdResolved = activeId || firstIncomplete || learningConfig[learningConfig.length - 1]?.id;

  buttons.forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.step === activeIdResolved);
  });

  if (els.stepCards?.length) {
    els.stepCards.forEach(card => {
      card.classList.toggle("is-active", card.dataset.step === activeIdResolved);
    });
  }

  const activeConfig = learningConfig.find(step => step.id === activeIdResolved);
  if (activeConfig && els.learningTip) {
    const isComplete = activeConfig.isComplete();
    const tip = isComplete && activeConfig.completeTip ? activeConfig.completeTip : activeConfig.tip;
    els.learningTip.textContent = tip;
  }
}

async function copyNdjson() {
  const filtered = filterEvents(state.events);
  if (!filtered.length) {
    flashButton(els.copyNdjson, "No events");
    return;
  }

  const ndjson = toNdjson(filtered);
  try {
    await navigator.clipboard.writeText(ndjson);
    flashButton(els.copyNdjson, "Copied!");
  } catch (err) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = ndjson;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (ok) {
        flashButton(els.copyNdjson, "Copied!");
        return;
      }
    } catch {
      // fall through to failure notification
    }
    flashButton(els.copyNdjson, "Failed");
    console.warn("Copy to clipboard failed", err);
    alert("Copy failed. You can still select the log text manually.");
  }
}

function downloadNdjson() {
  const filtered = filterEvents(state.events);
  if (!filtered.length) {
    flashButton(els.downloadNdjson, "No events");
    return;
  }

  const ndjson = toNdjson(filtered) + "\n";
  const blob = new Blob([ndjson], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `change-events-${stamp}.ndjson`;
  a.click();
  URL.revokeObjectURL(url);
  flashButton(els.downloadNdjson, "Saved!");
}


// ---------- Appwrite Realtime wiring ----------
let appwrite = null;

async function initAppwrite() {
  const cfg = window.APPWRITE_CFG;
  if (!cfg || !window.Appwrite) return; // run offline if not configured

  const client    = new Appwrite.Client().setEndpoint(cfg.endpoint).setProject(cfg.projectId);
  const account   = new Appwrite.Account(client);
  const databases = new Appwrite.Databases(client);
  const realtime  = new Appwrite.Realtime(client);

  // Try to ensure a session (optional; public perms will still work without it)
  try { await account.get(); }
  catch { try { await account.createAnonymousSession(); } catch (e) { console.warn("Anonymous session unavailable", e.message); } }

  const channel = cfg.channel(cfg.databaseId, cfg.collectionId);
  realtime.subscribe(channel, (msg) => {
    const ev = (msg.events && msg.events[0]) || "";
    // Only react to document create events
    if (!ev.includes(".documents.*.create")) return;

    // Normalize payload (supports either JSON or string columns)
    const doc = msg.payload;
    const norm = {
      ts_ms: doc.ts_ms ?? doc.ts ?? Date.now(),
      op:    doc.op    ?? "u",
      before: typeof doc.before === "string" ? safeParse(doc.before) : (doc.before ?? null),
      after:  typeof doc.after  === "string" ? safeParse(doc.after)  : (doc.after  ?? null),
      _docId: doc.$id
    };

    // De-dup (ignore if we already appended this doc id)
    if (!state.events.some(e => e._docId === norm._docId)) {
      state.events.push(norm);
      renderJSONLog();
      save();
    }
  });

  appwrite = { client, account, databases, realtime, cfg };
}

function safeParse(s) { try { return JSON.parse(s); } catch { return s; } }

// Attempt to write JSON; if it fails (e.g., column is string), retry stringified.
async function publishEvent(op, before, after, docId) {
  if (!appwrite) return; // offline mode: skip
  const { databases, cfg } = appwrite;

  const docBodyJSON = {
    ts_ms: nowTs(),
    op,
    before: els.includeBefore.checked ? (before ?? null) : null,
    after:  after ?? null
  };

  const documentId = docId || Appwrite.ID.unique();

  try {
    // First try as JSON
    await databases.createDocument(cfg.databaseId, cfg.collectionId, documentId, docBodyJSON);
  } catch (e) {
    // Fallback to string columns
    const docBodyStr = {
      ts_ms: docBodyJSON.ts_ms,
      op:    docBodyJSON.op,
      before: docBodyJSON.before == null ? null : JSON.stringify(docBodyJSON.before),
      after:  docBodyJSON.after  == null ? null : JSON.stringify(docBodyJSON.after)
    };
    try {
      await databases.createDocument(cfg.databaseId, cfg.collectionId, documentId, docBodyStr);
    } catch (e2) {
      console.warn("publishEvent failed (JSON and string modes)", e2);
    }
  }
}

// ---------- Schema ----------
function addColumn({ name, type, pk }) {
  const input = document.getElementById("colName");
  const raw = (name ?? "").trim();
  if (!raw) {
    refreshSchemaStatus("Column name cannot be empty.", "error");
    input?.focus();
    return;
  }

  const normalized = raw.replace(/\s+/g, "_");
  if (state.schema.some(c => c.name === normalized)) {
    refreshSchemaStatus(`Column "${normalized}" already exists.`, "error");
    input?.focus();
    return;
  }

  state.schema.push({ name: normalized, type, pk: !!pk });
  for (const r of state.rows) if (!(normalized in r)) r[normalized] = null;
  save();
  renderSchema();
  renderEditor();
  renderTable();
  const newInput = els.rowEditor.querySelector(`input[data-col="${normalized}"]`);
  if (newInput) newInput.focus();
  refreshSchemaStatus(`Added column "${normalized}".`, "success");
}

function removeColumn(name) {
  const idx = state.schema.findIndex(c => c.name === name);
  if (idx === -1) return;
  state.schema.splice(idx, 1);
  for (const r of state.rows) delete r[name];
  save();
  renderSchema();
  renderEditor();
  renderTable();
  refreshSchemaStatus(`Removed column "${name}".`, state.schema.length ? "muted" : "success");
}

function renderSchema() {
  els.schemaPills.innerHTML = "";
  for (const c of state.schema) {
    const pill = document.createElement("div");
    pill.className = "pill";
    pill.innerHTML = `${c.name} <span class="muted">(${c.type})</span>${c.pk ? '<span class="pk">PK</span>' : ""}`;
    pill.title = "Click to remove column";
    pill.onclick = () => removeColumn(c.name);
    els.schemaPills.appendChild(pill);
  }
  updateLearning();
  refreshSchemaStatus();
}

// ---------- Editor (row inputs) ----------
function renderEditor() {
  els.rowEditor.innerHTML = "";
  for (const c of state.schema) {
    const wrap = document.createElement("div");
    const inp  = document.createElement("input");
    inp.placeholder = `${c.name}`;
    inp.dataset.col = c.name;
    inp.dataset.touched = "false";
    inp.addEventListener("input", () => {
      inp.dataset.touched = "true";
    });
    wrap.appendChild(inp);
    els.rowEditor.appendChild(wrap);
  }
}

function readEditorValues() {
  const obj = {};
  const touched = {};
  els.rowEditor.querySelectorAll("input").forEach(inp => {
    const col  = inp.dataset.col;
    const type = state.schema.find(c => c.name === col)?.type || "string";
    let val = inp.value;
    if (type === "number") {
      if (val === "") {
        val = null;
      } else {
        const num = Number(val);
        val = Number.isNaN(num) ? null : num;
      }
    }
    if (type === "boolean") {
      if (val === "") {
        val = null;
      } else {
        const normalized = val.toLowerCase();
        if (normalized === "true" || normalized === "1") {
          val = true;
        } else if (normalized === "false" || normalized === "0") {
          val = false;
        } else {
          val = null;
        }
      }
    }
    obj[col] = val === "" ? null : val;
    touched[col] = inp.dataset.touched === "true";
  });
  Object.defineProperty(obj, "__touched", { value: touched, enumerable: false });
  return obj;
}

function clearEditor() {
  els.rowEditor.querySelectorAll("input").forEach(i => {
    i.value = "";
    i.dataset.touched = "false";
  });
}

// ---------- Table ----------
function renderTable() {
  const thead = els.tbl.tHead || els.tbl.createTHead();
  const tbody = els.tbl.tBodies[0] || els.tbl.createTBody();
  thead.innerHTML = ""; tbody.innerHTML = "";

  const trh = thead.insertRow();
  state.schema.forEach(c => {
    const th = document.createElement("th");
    th.textContent = c.name + (c.pk ? " *" : "");
    trh.appendChild(th);
  });

  for (const r of state.rows) {
    const tr = tbody.insertRow();
    state.schema.forEach(c => {
      const td = tr.insertCell();
      td.textContent = r[c.name];
    });
  }
  updateLearning();
}

function findByPK(values) {
  const pks = state.schema.filter(c => c.pk).map(c => c.name);
  if (pks.length === 0) return -1;
  return state.rows.findIndex(row => pks.every(k => row[k] === values[k]));
}

// ---------- Operations (now publish to Appwrite too) ----------
function insertRow(values) {
  if (!demandPrimaryKey("inserting rows")) return;
  if (!ensurePrimaryKeyValues(values)) return;
  const after = clone(values);
  state.rows.push(after);
  const docId = nextDocumentId();
  const evt = buildEvent("c", null, after);
  if (docId) evt._docId = docId;
  state.events.push(evt);
  publishEvent("c", null, after, docId);
  save(); renderTable(); renderJSONLog();
  emitSparkleTrail("c");
}

function updateRow(values) {
  if (!demandPrimaryKey("updating rows")) return;
  if (!ensurePrimaryKeyValues(values)) return;
  const touched = values.__touched || {};
  const idx = findByPK(values);
  if (idx === -1) return alert("Row with matching primary key not found.");
  const before = clone(state.rows[idx]);
  const after  = clone(before);
  let mutated = false;
  state.schema.forEach(col => {
    const key = col.name;
    if (!touched[key]) return;
    after[key] = values[key];
    mutated = true;
  });
  if (!mutated) {
    alert("No fields were changed.");
    return;
  }
  state.rows[idx] = after;

  const docId = nextDocumentId();
  const evt = buildEvent("u", before, after);
  if (docId) evt._docId = docId;
  state.events.push(evt);
  publishEvent("u", before, after, docId);
  save(); renderTable(); renderJSONLog();
  emitSparkleTrail("u");
}

function deleteRow(values) {
  if (!demandPrimaryKey("deleting rows")) return;
  if (!ensurePrimaryKeyValues(values)) return;
  const idx = findByPK(values);
  if (idx === -1) return alert("Row with matching primary key not found.");
  const before = clone(state.rows[idx]);
  state.rows.splice(idx, 1);

  const docId = nextDocumentId();
  const evt = buildEvent("d", before, null);
  if (docId) evt._docId = docId;
  state.events.push(evt);
  publishEvent("d", before, null, docId);
  save(); renderTable(); renderJSONLog();
  emitSparkleTrail("d");
}

function emitSnapshot() {
  for (const row of state.rows) {
    const docId = nextDocumentId();
    const evt = buildEvent("r", null, clone(row));
    if (docId) evt._docId = docId;
    state.events.push(evt);
    publishEvent("r", null, row, docId);
  }
  save(); renderJSONLog();
  emitSparkleTrail("r");
}

// ---------- Seeds / export ----------
function seedRows() {
  const seeded = ensureDefaultSchema();
  if (seeded) {
    renderSchema();
    renderEditor();
  }

  if (!demandPrimaryKey("seeding sample rows")) return;

  if (state.rows.length === 0) {
    const samples = [];
    const pkFields = getPrimaryKeyFields();
    const seen = new Set();
    const desired = 3;

    while (samples.length < desired) {
      const candidate = generateSampleRow();
      if (pkFields.length) {
        const key = pkFields.map(pk => candidate[pk]).join("::");
        if (seen.has(key)) continue;
        seen.add(key);
      }
      samples.push(candidate);
    }
    state.rows = samples;
    refreshSchemaStatus("Seeded sample rows based on your schema.", "success");
  } else {
    refreshSchemaStatus("Rows already exist. Clear rows to regenerate fresh samples.", "muted");
  }

  save();
  renderTable();
}

function exportScenario() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "cdc_scenario.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function importScenario(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const s = JSON.parse(reader.result);
      state.schema = s.schema || [];
      state.rows   = s.rows   || [];
      state.events = s.events || [];
      save(); renderSchema(); renderEditor(); renderTable(); renderJSONLog();
    } catch { alert("Invalid scenario JSON"); }
  };
  reader.readAsText(file);
}

function bindUiHandlers() {
  const addColBtn = document.getElementById("addCol");
  if (addColBtn) {
    addColBtn.onclick = () => {
      const name = document.getElementById("colName").value.trim();
      const type = document.getElementById("colType").value;
      const pk   = document.getElementById("colPK").checked;
      addColumn({ name, type, pk });
      document.getElementById("colName").value = "";
      document.getElementById("colPK").checked = false;
    };
  }

  const insertBtn = document.getElementById("opInsert");
  if (insertBtn) insertBtn.onclick = () => { insertRow(readEditorValues()); clearEditor(); };

  const updateBtn = document.getElementById("opUpdate");
  if (updateBtn) updateBtn.onclick = () => { updateRow(readEditorValues()); };

  const deleteBtn = document.getElementById("opDelete");
  if (deleteBtn) deleteBtn.onclick = () => { deleteRow(readEditorValues()); };

  if (els.autofillRow) {
    els.autofillRow.onclick = () => { autofillRowAndInsert(); };
  }

  const emitSnapshotBtn = document.getElementById("emitSnapshot");
  if (emitSnapshotBtn) emitSnapshotBtn.onclick = emitSnapshot;

  const clearEventsBtn = document.getElementById("clearEvents");
  if (clearEventsBtn) clearEventsBtn.onclick = () => { state.events = []; save(); renderJSONLog(); };

  const seedRowsBtn = document.getElementById("seedRows");
  if (seedRowsBtn) seedRowsBtn.onclick = seedRows;

  const clearRowsBtn = document.getElementById("clearRows");
  if (clearRowsBtn) clearRowsBtn.onclick = () => { state.rows = []; save(); renderTable(); };

  const copyNdjsonBtn = document.getElementById("btnCopyNdjson");
  if (copyNdjsonBtn) copyNdjsonBtn.onclick = copyNdjson;

  const downloadNdjsonBtn = document.getElementById("btnDownloadNdjson");
  if (downloadNdjsonBtn) downloadNdjsonBtn.onclick = downloadNdjson;

  ["filterC", "filterU", "filterD", "filterR"].forEach(id => {
    const cb = document.getElementById(id);
    if (cb) cb.onchange = renderJSONLog;
  });

  if (els.learningSteps) {
    els.learningSteps.addEventListener("click", (event) => {
      const btn = event.target.closest("button.learning-step");
      if (!btn) return;
      const targetSel = btn.dataset.target;
      if (targetSel) {
        const node = document.querySelector(targetSel);
        if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      updateLearning(btn.dataset.step);
    });
  }

  const exportBtn = document.getElementById("btnExport");
  if (exportBtn) exportBtn.onclick = exportScenario;

  const importInput = document.getElementById("importFile");
  if (importInput) importInput.onchange = (e) => e.target.files[0] && importScenario(e.target.files[0]);

  const resetBtn = document.getElementById("btnReset");
  if (resetBtn) resetBtn.onclick = () => { localStorage.removeItem("cdc_playground"); location.reload(); };
}

// ---------- Wire up UI ----------
async function main() {
  load();
  const seeded = ensureDefaultSchema();
  if (seeded) save();
  renderSchema(); renderEditor(); renderTable(); renderJSONLog();
  bindUiHandlers();
  initAppwrite().catch(err => console.warn("Appwrite init skipped", err));
}
main();
function randomSampleForColumn(col) {
  switch (col.name) {
    case "id":
      return Math.floor(1000 + Math.random() * 9000);
    case "customer_name": {
      const names = ["Pam Beesly", "Jim Halpert", "Dwight Schrute", "Stanley Hudson", "Phyllis Vance", "Michael Scott", "Angela Martin", "Kevin Malone", "Oscar Martinez", "Creed Bratton", "Kelly Kapoor"]; return names[Math.floor(Math.random() * names.length)];
    }
    case "customer_email":
      return `customer${Math.floor(Math.random() * 9000 + 1000)}@dundermifflin.com`;
    case "customer_since": {
      const year = Math.floor(Math.random() * 10) + 2014;
      const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
      const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    case "paper_grade": {
      const grades = ["Premium", "Standard", "Recycled", "Cardstock", "Gloss"];
      return grades[Math.floor(Math.random() * grades.length)];
    }
    case "paper_size": {
      const sizes = ["Letter", "Legal", "A4", "Tabloid", "Custom"];
      return sizes[Math.floor(Math.random() * sizes.length)];
    }
    case "sheet_count":
      return [250, 500, 750, 1000][Math.floor(Math.random() * 4)];
    case "price_per_unit":
      return Number((Math.random() * 20 + 5).toFixed(2));
    case "order_total":
      return Number((Math.random() * 1000 + 200).toFixed(2));
    case "sales_rep": {
      const reps = ["Andy Bernard", "Phyllis Vance", "Stanley Hudson", "Jim Halpert", "Dwight Schrute", "Karen Filippelli"];
      return reps[Math.floor(Math.random() * reps.length)];
    }
    case "region": {
      const regions = ["Scranton", "Stamford", "Nashua", "Utica", "Akron"];
      return regions[Math.floor(Math.random() * regions.length)];
    }
    default:
      if (col.type === "number") return Math.floor(Math.random() * 1000);
      if (col.type === "boolean") return Math.random() > 0.5;
      return `${col.name}_${Math.floor(Math.random() * 9999)}`;
  }
}

function generateSampleRow() {
  const row = {};
  for (const col of state.schema) {
    row[col.name] = randomSampleForColumn(col);
  }
  return row;
}

function autofillRowAndInsert() {
  if (!state.schema.length) {
    refreshSchemaStatus("Add columns before autofilling rows.", "error");
    return;
  }

  const sample = generateSampleRow();

  // reflect values in the editor for transparency
  els.rowEditor.querySelectorAll("input").forEach(inp => {
    const colName = inp.dataset.col;
    if (colName in sample) inp.value = sample[colName];
  });

  // mutate table state + log event
  const after = clone(sample);
  state.rows.push(after);
  const docId = nextDocumentId();
  const evt = buildEvent("c", null, after);
  if (docId) evt._docId = docId;
  state.events.push(evt);
  publishEvent("c", null, after, docId);

  save();
  renderTable();
  renderJSONLog();

  refreshSchemaStatus("Sample row inserted into the table.", "success");
  updateLearning("rows");
  emitSparkleTrail("c");
}
