// Minimal CDC simulator with Debezium-like envelopes.
// Zero deps. All state kept in-memory + localStorage snapshot.

const state = {
  schema: [],     // [{name, type, pk}]
  rows: [],       // [{col: value}]
  events: [],     // emitted events
};

const els = {
  schemaPills: document.getElementById("schemaPills"),
  rowEditor: document.getElementById("rowEditor"),
  tbl: document.getElementById("tbl"),
  eventLog: document.getElementById("eventLog"),
  debzWrap: document.getElementById("debzWrap"),
  includeBefore: document.getElementById("includeBefore"),
};

// ---------- Utilities ----------
const nowTs = () => Date.now();
const clone = (x) => JSON.parse(JSON.stringify(x));
const save = () => localStorage.setItem("cdc_playground", JSON.stringify(state));
const load = () => {
  try {
    const raw = localStorage.getItem("cdc_playground");
    if (!raw) return;
    const s = JSON.parse(raw);
    state.schema = s.schema || [];
    state.rows = s.rows || [];
    state.events = s.events || [];
  } catch { /* ignore */ }
};

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
      after: after ?? null,
      source: { name: "playground", version: "0.1.0" },
      op,            // c,u,d,r
      ts_ms: nowTs()
    },
    key
  };
}

function renderJSONLog() {
  const text = state.events.map(e => JSON.stringify(e, null, 2)).join("\n");
  els.eventLog.textContent = text || "// no events yet";
}

// ---------- Schema ----------
function addColumn({ name, type, pk }) {
  if (!name) return;
  if (state.schema.some(c => c.name === name)) return;
  state.schema.push({ name, type, pk: !!pk });
  // add blank field to existing rows
  for (const r of state.rows) if (!(name in r)) r[name] = null;
  save(); renderSchema(); renderEditor(); renderTable();
}

function removeColumn(name) {
  const idx = state.schema.findIndex(c => c.name === name);
  if (idx === -1) return;
  state.schema.splice(idx, 1);
  for (const r of state.rows) delete r[name];
  save(); renderSchema(); renderEditor(); renderTable();
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
}

// ---------- Editor (row inputs) ----------
function renderEditor() {
  els.rowEditor.innerHTML = "";
  for (const c of state.schema) {
    const wrap = document.createElement("div");
    const inp = document.createElement("input");
    inp.placeholder = `${c.name}`;
    inp.dataset.col = c.name;
    wrap.appendChild(inp);
    els.rowEditor.appendChild(wrap);
  }
}

function readEditorValues() {
  const obj = {};
  els.rowEditor.querySelectorAll("input").forEach(inp => {
    const col = inp.dataset.col;
    const type = state.schema.find(c => c.name === col)?.type || "string";
    let val = inp.value;
    if (type === "number") val = val === "" ? null : Number(val);
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
  thead.innerHTML = "";
  tbody.innerHTML = "";

  // header
  const trh = thead.insertRow();
  state.schema.forEach(c => {
    const th = document.createElement("th");
    th.textContent = c.name + (c.pk ? " *" : "");
    trh.appendChild(th);
  });

  // rows
  for (const r of state.rows) {
    const tr = tbody.insertRow();
    state.schema.forEach(c => {
      const td = tr.insertCell();
      td.textContent = r[c.name];
    });
  }
}

function findByPK(values) {
  const pks = state.schema.filter(c => c.pk).map(c => c.name);
  if (pks.length === 0) return -1;
  return state.rows.findIndex(row => pks.every(k => row[k] === values[k]));
}

// ---------- Operations ----------
function insertRow(values) {
  const after = clone(values);
  state.rows.push(after);
  state.events.push(buildEvent("c", null, after));
  save(); renderTable(); renderJSONLog();
}

function updateRow(values) {
  const idx = findByPK(values);
  if (idx === -1) return alert("Row with matching PK not found.");
  const before = clone(state.rows[idx]);
  const after = clone(before);
  Object.keys(values).forEach(k => { if (values[k] !== null && values[k] !== "") after[k] = values[k]; });
  state.rows[idx] = after;
  state.events.push(buildEvent("u", before, after));
  save(); renderTable(); renderJSONLog();
}

function deleteRow(values) {
  const idx = findByPK(values);
  if (idx === -1) return alert("Row with matching PK not found.");
  const before = clone(state.rows[idx]);
  state.rows.splice(idx, 1);
  state.events.push(buildEvent("d", before, null));
  save(); renderTable(); renderJSONLog();
}

function emitSnapshot() {
  // Debezium uses op=r for snapshot read events
  for (const row of state.rows) state.events.push(buildEvent("r", null, clone(row)));
  save(); renderJSONLog();
}

// ---------- Seeds / export ----------
function seedRows() {
  if (state.schema.length === 0) {
    // sensible default schema
    state.schema = [
      { name: "id", type: "number", pk: true },
      { name: "email", type: "string", pk: false },
      { name: "active", type: "boolean", pk: false },
    ];
    renderSchema(); renderEditor();
  }
  if (state.rows.length === 0) {
    state.rows = [
      { id: 1, email: "user1@example.com", active: true },
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
      state.rows = s.rows || [];
      state.events = s.events || [];
      save(); renderSchema(); renderEditor(); renderTable(); renderJSONLog();
    } catch (e) {
      alert("Invalid scenario JSON");
    }
  };
  reader.readAsText(file);
}

// ---------- Wire up UI ----------
function main() {
  load();
  renderSchema(); renderEditor(); renderTable(); renderJSONLog();

  document.getElementById("addCol").onclick = () => {
    const name = document.getElementById("colName").value.trim();
    const type = document.getElementById("colType").value;
    const pk = document.getElementById("colPK").checked;
    addColumn({ name, type, pk });
    document.getElementById("colName").value = "";
    document.getElementById("colPK").checked = false;
  };

  document.getElementById("opInsert").onclick = () => { insertRow(readEditorValues()); clearEditor(); };
  document.getElementById("opUpdate").onclick = () => { updateRow(readEditorValues()); };
  document.getElementById("opDelete").onclick = () => { deleteRow(readEditorValues()); };

  document.getElementById("emitSnapshot").onclick = emitSnapshot;
  document.getElementById("clearEvents").onclick = () => { state.events = []; save(); renderJSONLog(); };
  document.getElementById("seedRows").onclick = seedRows;
  document.getElementById("clearRows").onclick = () => { state.rows = []; save(); renderTable(); };

  document.getElementById("btnExport").onclick = exportScenario;
  document.getElementById("importFile").onchange = (e) => e.target.files[0] && importScenario(e.target.files[0]);
  document.getElementById("btnReset").onclick = () => { localStorage.removeItem("cdc_playground"); location.reload(); };
}
main();
