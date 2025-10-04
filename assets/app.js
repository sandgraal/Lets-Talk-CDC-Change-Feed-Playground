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

function refreshSchemaStatus(message, tone = "muted") {
  const el = els.schemaStatus;
  if (!el) return;
  const columns = state.schema.length;
  const defaultMsg = columns === 0
    ? "Add a column to begin building your table."
    : `${columns} column${columns === 1 ? "" : "s"} defined. Click a pill to remove.`;
  el.textContent = message ?? defaultMsg;
  el.classList.remove("is-error", "is-success");
  if (tone === "error") el.classList.add("is-error");
  if (tone === "success") el.classList.add("is-success");
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
  const text = filtered.map(ev => JSON.stringify(ev, null, 2)).join("\n");
  els.eventLog.textContent = text || "// no events yet (check filters)";
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
async function publishEvent(op, before, after) {
  if (!appwrite) return; // offline mode: skip
  const { databases, cfg } = appwrite;

  const docBodyJSON = {
    ts_ms: nowTs(),
    op,
    before: els.includeBefore.checked ? (before ?? null) : null,
    after:  after ?? null
  };

  try {
    // First try as JSON
    await databases.createDocument(cfg.databaseId, cfg.collectionId, Appwrite.ID.unique(), docBodyJSON);
  } catch (e) {
    // Fallback to string columns
    const docBodyStr = {
      ts_ms: docBodyJSON.ts_ms,
      op:    docBodyJSON.op,
      before: docBodyJSON.before == null ? null : JSON.stringify(docBodyJSON.before),
      after:  docBodyJSON.after  == null ? null : JSON.stringify(docBodyJSON.after)
    };
    try {
      await databases.createDocument(cfg.databaseId, cfg.collectionId, Appwrite.ID.unique(), docBodyStr);
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
    wrap.appendChild(inp);
    els.rowEditor.appendChild(wrap);
  }
}

function readEditorValues() {
  const obj = {};
  els.rowEditor.querySelectorAll("input").forEach(inp => {
    const col  = inp.dataset.col;
    const type = state.schema.find(c => c.name === col)?.type || "string";
    let val = inp.value;
    if (type === "number")  val = val === "" ? null : Number(val);
    if (type === "boolean") val = (val || "").toLowerCase() === "true";
    obj[col] = val === "" ? null : val;
  });
  return obj;
}

function clearEditor() { els.rowEditor.querySelectorAll("input").forEach(i => i.value = ""); }

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
  const after = clone(values);
  state.rows.push(after);
  const evt = buildEvent("c", null, after);
  state.events.push(evt);
  publishEvent("c", null, after);
  save(); renderTable(); renderJSONLog();
}

function updateRow(values) {
  const idx = findByPK(values);
  if (idx === -1) return alert("Row with matching PK not found.");
  const before = clone(state.rows[idx]);
  const after  = clone(before);
  Object.keys(values).forEach(k => { if (values[k] !== null && values[k] !== "") after[k] = values[k]; });
  state.rows[idx] = after;

  const evt = buildEvent("u", before, after);
  state.events.push(evt);
  publishEvent("u", before, after);
  save(); renderTable(); renderJSONLog();
}

function deleteRow(values) {
  const idx = findByPK(values);
  if (idx === -1) return alert("Row with matching PK not found.");
  const before = clone(state.rows[idx]);
  state.rows.splice(idx, 1);

  const evt = buildEvent("d", before, null);
  state.events.push(evt);
  publishEvent("d", before, null);
  save(); renderTable(); renderJSONLog();
}

function emitSnapshot() {
  for (const row of state.rows) {
    const evt = buildEvent("r", null, clone(row));
    state.events.push(evt);
    publishEvent("r", null, row);
  }
  save(); renderJSONLog();
}

// ---------- Seeds / export ----------
function seedRows() {
  if (state.schema.length === 0) {
    state.schema = [
      { name: "id",     type: "number",  pk: true  },
      { name: "email",  type: "string",  pk: false },
      { name: "active", type: "boolean", pk: false },
    ];
    renderSchema(); renderEditor();
  }
  if (state.rows.length === 0) {
    state.rows = [
      { id: 1, email: "user1@example.com", active: true  },
      { id: 2, email: "user2@example.com", active: false },
    ];
  }
  save(); renderTable();
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

// ---------- Wire up UI ----------
async function main() {
  load();
  const seeded = ensureDefaultSchema();
  if (seeded) save();
  renderSchema(); renderEditor(); renderTable(); renderJSONLog();
  await initAppwrite();  // enable realtime if configured

  document.getElementById("addCol").onclick = () => {
    const name = document.getElementById("colName").value.trim();
    const type = document.getElementById("colType").value;
    const pk   = document.getElementById("colPK").checked;
    addColumn({ name, type, pk });
    document.getElementById("colName").value = "";
    document.getElementById("colPK").checked = false;
  };

  document.getElementById("opInsert").onclick = () => { insertRow(readEditorValues()); clearEditor(); };
  document.getElementById("opUpdate").onclick = () => { updateRow(readEditorValues()); };
  document.getElementById("opDelete").onclick = () => { deleteRow(readEditorValues()); };
  if (els.autofillRow) {
    els.autofillRow.onclick = () => { autofillRowInputs({ autoInsert: true }); };
  }

  document.getElementById("emitSnapshot").onclick = emitSnapshot;
  document.getElementById("clearEvents").onclick = () => { state.events = []; save(); renderJSONLog(); };
  document.getElementById("seedRows").onclick = seedRows;
  document.getElementById("clearRows").onclick = () => { state.rows = []; save(); renderTable(); };
  document.getElementById("btnCopyNdjson").onclick = copyNdjson;
  document.getElementById("btnDownloadNdjson").onclick = downloadNdjson;

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

  document.getElementById("btnExport").onclick = exportScenario;
  document.getElementById("importFile").onchange = (e) => e.target.files[0] && importScenario(e.target.files[0]);
  document.getElementById("btnReset").onclick = () => { localStorage.removeItem("cdc_playground"); location.reload(); };
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

function autofillRowInputs({ autoInsert = false } = {}) {
  if (!state.schema.length) {
    refreshSchemaStatus("Add columns before autofilling rows.", "error");
    return;
  }

  const sample = generateSampleRow();
  els.rowEditor.querySelectorAll("input").forEach(inp => {
    const colName = inp.dataset.col;
    if (colName in sample) {
      inp.value = sample[colName];
    }
  });

  if (autoInsert) {
    insertRow(clone(sample));
    clearEditor();
    refreshSchemaStatus("Sample row inserted into the table.", "success");
  } else {
    refreshSchemaStatus("Sample row generated. Adjust as needed before inserting.", "success");
  }
}
