// Minimal CDC simulator with Debezium-like envelopes.
// Now with Appwrite Realtime.
// State is in-memory + localStorage snapshot.

const STORAGE_KEYS = Object.freeze({
  state: "cdc_playground",
  onboarding: "cdc_playground_onboarding_v1",
  lastTemplate: "cdc_playground_last_template_v1",
  scenarioFilter: "cdc_playground_template_filter_v1",
});

const COMPARATOR_PREFS_KEY = "cdc_comparator_prefs_v1";

const DEFAULT_SCHEMA = [
  { name: "id", type: "number", pk: true },
  { name: "customer_name", type: "string", pk: false },
  { name: "price_per_unit", type: "number", pk: false },
  { name: "order_total", type: "number", pk: false },
  { name: "sales_rep", type: "string", pk: false },
  { name: "region", type: "string", pk: false },
];

const FALLBACK_SCENARIOS = [
  {
    id: "orders",
    name: "Omnichannel Orders",
    label: "Omnichannel Orders",
    description: "Track order lifecycle and fulfillment signals across channels.",
    highlight: "Focus on status transitions, totals, and fulfillment metadata.",
    schema: [
      { name: "order_id", type: "string", pk: true },
      { name: "customer_id", type: "string", pk: false },
      { name: "status", type: "string", pk: false },
      { name: "subtotal", type: "number", pk: false },
      { name: "shipping_method", type: "string", pk: false },
      { name: "updated_at", type: "string", pk: false },
    ],
    rows: [
      { order_id: "ORD-1001", customer_id: "C-204", status: "processing", subtotal: 184.5, shipping_method: "Expedited", updated_at: "2025-03-20T15:04:00Z" },
      { order_id: "ORD-1002", customer_id: "C-412", status: "packed", subtotal: 92.1, shipping_method: "Standard", updated_at: "2025-03-20T14:45:00Z" },
      { order_id: "ORD-1003", customer_id: "C-102", status: "cancelled", subtotal: 248.0, shipping_method: "Store Pickup", updated_at: "2025-03-19T21:10:00Z" },
    ],
    events: [],
  },
  {
    id: "payments",
    name: "Real-time Payments",
    label: "Real-time Payments",
    description: "Model authorization, capture, and decline flows for transactions.",
    highlight: "Great for demonstrating idempotent updates and risk review.",
    schema: [
      { name: "transaction_id", type: "string", pk: true },
      { name: "account_id", type: "string", pk: false },
      { name: "payment_method", type: "string", pk: false },
      { name: "amount", type: "number", pk: false },
      { name: "status", type: "string", pk: false },
      { name: "authorized_at", type: "string", pk: false },
      { name: "captured_at", type: "string", pk: false },
    ],
    rows: [
      { transaction_id: "PAY-88341", account_id: "ACC-0937", payment_method: "card", amount: 72.4, status: "captured", authorized_at: "2025-03-18T10:04:00Z", captured_at: "2025-03-18T10:06:10Z" },
      { transaction_id: "PAY-88355", account_id: "ACC-4201", payment_method: "wallet", amount: 15.0, status: "authorized", authorized_at: "2025-03-20T16:20:00Z", captured_at: null },
      { transaction_id: "PAY-88377", account_id: "ACC-0937", payment_method: "card", amount: 420.0, status: "declined", authorized_at: "2025-03-20T08:11:00Z", captured_at: null },
    ],
    events: [],
  },
  {
    id: "iot",
    name: "IoT Telemetry",
    label: "IoT Telemetry",
    description: "Capture rolling sensor readings with anomaly flags.",
    highlight: "Simulate snapshots, drifts, and device alerts in edge pipelines.",
    schema: [
      { name: "reading_id", type: "string", pk: true },
      { name: "device_id", type: "string", pk: false },
      { name: "temperature_c", type: "number", pk: false },
      { name: "pressure_kpa", type: "number", pk: false },
      { name: "status", type: "string", pk: false },
      { name: "recorded_at", type: "string", pk: false },
    ],
    rows: [
      { reading_id: "READ-301", device_id: "THERM-04", temperature_c: 21.4, pressure_kpa: 101.3, status: "nominal", recorded_at: "2025-03-20T15:00:00Z" },
      { reading_id: "READ-302", device_id: "THERM-04", temperature_c: 24.9, pressure_kpa: 101.1, status: "warning", recorded_at: "2025-03-20T15:15:00Z" },
      { reading_id: "READ-377", device_id: "THERM-11", temperature_c: 18.0, pressure_kpa: 99.5, status: "nominal", recorded_at: "2025-03-20T15:10:00Z" },
    ],
    events: [],
  },
];

const SHARED_SCENARIOS =
  (typeof window !== "undefined" && Array.isArray(window.CDC_SCENARIOS) && window.CDC_SCENARIOS.length)
    ? window.CDC_SCENARIOS
    : FALLBACK_SCENARIOS;

const SCENARIO_TEMPLATES = Object.freeze(
  SHARED_SCENARIOS
    .filter(template => Array.isArray(template.rows) && template.rows.length)
    .map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      highlight: template.highlight,
      schema: template.schema,
      rows: template.rows,
      events: template.events || [],
      ops: template.ops || [],
    }))
);

const state = {
  schema: [],     // [{name, type, pk}]
  rows: [],       // [{col: value}]
  events: [],     // emitted events (local + realtime)
  scenarioId: null,
  remoteId: null,
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
  comparatorFeedback: document.getElementById("comparatorFeedback"),
  scenarioFilter: document.getElementById("scenarioFilter"),
  learningSteps: document.getElementById("learningSteps"),
  learningTip: document.getElementById("learningTip"),
  schemaStatus: document.getElementById("schemaStatus"),
  stepCards: Array.from(document.querySelectorAll(".step-card")),
  autofillRow: document.getElementById("btnAutofillRow"),
  templateGallery: document.getElementById("templateGallery"),
  onboardingOverlay: document.getElementById("onboardingOverlay"),
  onboardingButton: document.getElementById("btnOnboarding"),
  onboardingClose: document.getElementById("onboardingClose"),
  onboardingDismiss: document.getElementById("onboardingDismiss"),
  onboardingStart: document.getElementById("onboardingStart"),
  saveRemote: document.getElementById("btnSaveRemote"),
  shareLink: document.getElementById("btnShareLink"),
  quickstartCards: {
    schema: document.getElementById("qsSchema"),
    rows: document.getElementById("qsRows"),
    events: document.getElementById("qsEvents"),
  },
  quickstartButtons: {
    schema: document.getElementById("btnQuickSchema"),
    rows: document.getElementById("btnQuickRows"),
    events: document.getElementById("btnQuickEvents"),
  },
  inspectorList: document.getElementById("eventList"),
  inspectorDetail: document.getElementById("eventDetail"),
  inspectorPrev: document.getElementById("eventPrev"),
  inspectorNext: document.getElementById("eventNext"),
  inspectorReplay: document.getElementById("eventReplay"),
};

const uiState = {
  selectedEventIndex: null, // index within state.events
  lastShareId: null,
  scenarioFilter: "",
  pendingShareId: (() => {
    if (typeof window === "undefined") return null;
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("scenario");
    } catch {
      return null;
    }
  })()
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

function getTemplateById(id) {
  if (!id) return null;
  return SCENARIO_TEMPLATES.find(t => t.id === id) || null;
}

function renderTemplateGallery() {
  if (!els.templateGallery) return;
  els.templateGallery.innerHTML = "";
  if (els.scenarioFilter && els.scenarioFilter.value !== uiState.scenarioFilter) {
    els.scenarioFilter.value = uiState.scenarioFilter;
  }

  const filter = (uiState.scenarioFilter || "").trim().toLowerCase();
  const templates = SCENARIO_TEMPLATES.filter(template => {
    if (!filter) return true;
    const haystack = [
      template.name,
      template.description,
      template.highlight,
      template.id,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(filter);
  });

  if (!templates.length) {
    const empty = document.createElement("p");
    empty.className = "template-empty";
    empty.textContent = "No scenarios match your filter.";
    els.templateGallery.appendChild(empty);
    return;
  }

  templates.forEach(template => {
    const card = document.createElement("article");
    card.className = "template-card";
    if (state.scenarioId === template.id) card.classList.add("is-active");

    const title = document.createElement("h4");
    title.textContent = template.name;

    const desc = document.createElement("p");
    desc.textContent = template.description;

     const meta = document.createElement("p");
     meta.className = "template-meta";
     const opsCount = template.ops ? template.ops.length : (template.events ? template.events.length : 0);
     meta.textContent = `${template.rows?.length ?? 0} rows · ${opsCount} ops`;

    const button = document.createElement("button");
    button.type = "button";
    if (state.scenarioId === template.id) {
      button.textContent = "Active";
      button.disabled = true;
    } else {
      button.textContent = "Use template";
      button.onclick = () => {
        applyScenarioTemplate(template);
      };
    }

    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(meta);
    if (template.highlight) {
      const highlight = document.createElement("p");
      highlight.className = "template-highlight";
      highlight.textContent = template.highlight;
      card.appendChild(highlight);
    }
    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "btn-ghost template-download";
    downloadBtn.textContent = "Download JSON";
    downloadBtn.onclick = () => downloadScenarioTemplate(template);
    card.appendChild(button);
    card.appendChild(downloadBtn);
    els.templateGallery.appendChild(card);
  });
}

function hideOnboarding(markSeen = false) {
  if (!els.onboardingOverlay) return;
  els.onboardingOverlay.hidden = true;
  if (markSeen) localStorage.setItem(STORAGE_KEYS.onboarding, "seen");
}

function showOnboarding() {
  if (!els.onboardingOverlay) return;
  els.onboardingOverlay.hidden = false;
}

function maybeShowOnboarding() {
  if (!els.onboardingOverlay) return;
  const seen = localStorage.getItem(STORAGE_KEYS.onboarding);
  if (seen) return;
  showOnboarding();
}

function applyScenarioTemplate(template, options = {}) {
  if (!template) return;
  state.schema = clone(template.schema || []);
  state.rows = clone(template.rows || []);
  state.events = clone(template.events || []);
  state.scenarioId = template.id;
  state.remoteId = null;

  localStorage.setItem(STORAGE_KEYS.lastTemplate, template.id);
  if (options.markSeen !== false) localStorage.setItem(STORAGE_KEYS.onboarding, "seen");

  if (state.events.length) {
    uiState.selectedEventIndex = state.events.length - 1;
  } else {
    uiState.selectedEventIndex = null;
  }

  save();
  renderSchema();
  renderEditor();
  renderTable();
  renderJSONLog();
  renderTemplateGallery();

  const focusStep = options.focusStep || (state.rows.length ? "events" : "rows");
  updateLearning(focusStep);
  refreshSchemaStatus(`${template.name} scenario loaded.`, "success");
  if (options.closeOnboarding) hideOnboarding(true);
}

function resetEventSelection() {
  uiState.selectedEventIndex = null;
}

function selectLastEvent() {
  if (!state.events.length) {
    uiState.selectedEventIndex = null;
  } else {
    uiState.selectedEventIndex = state.events.length - 1;
  }
}

function setShareControlsEnabled(enabled) {
  const disabled = !enabled;
  if (els.saveRemote) els.saveRemote.disabled = disabled;
  if (els.shareLink) els.shareLink.disabled = disabled;
}

function buildShareUrl(id) {
  if (!id) return "";
  const base = (appwrite?.cfg?.shareBaseUrl) || (typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "");
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}scenario=${encodeURIComponent(id)}`;
}

async function saveScenarioRemote(options = {}) {
  if (!appwrite) {
    refreshSchemaStatus("Connect to Appwrite to save scenarios.", "error");
    return null;
  }
  const { databases, cfg } = appwrite;
  const collectionId = cfg.scenarioCollectionId;
  if (!collectionId) {
    refreshSchemaStatus("Appwrite scenario collection not configured.", "error");
    return null;
  }

  const snapshot = {
    kind: "scenario",
    version: 2,
    saved_at: new Date().toISOString(),
    schema: clone(state.schema),
    rows: clone(state.rows),
    events: clone(state.events),
    scenarioId: state.scenarioId,
    comparator: buildComparatorExport(),
  };

  const reuseId = state.remoteId || uiState.lastShareId;
  const targetId = reuseId || (window?.Appwrite ? Appwrite.ID.unique() : `${Date.now()}`);

  const persist = async (id, method) => {
    if (method === "update") {
      return databases.updateDocument(cfg.databaseId, collectionId, id, snapshot);
    }
    return databases.createDocument(cfg.databaseId, collectionId, id, snapshot);
  };

  try {
    const doc = await persist(targetId, reuseId ? "update" : "create");
    state.remoteId = doc.$id;
    uiState.lastShareId = doc.$id;
    save();
    if (!options.silent) flashButton(els.saveRemote, "Saved!");
    return doc.$id;
  } catch (err) {
    console.warn("saveScenarioRemote failed", err?.message || err);
    if (reuseId) {
      try {
        const fallbackId = window?.Appwrite ? Appwrite.ID.unique() : `${Date.now()}-${Math.random()}`;
        const doc = await persist(fallbackId, "create");
        state.remoteId = doc.$id;
        uiState.lastShareId = doc.$id;
        save();
        if (!options.silent) flashButton(els.saveRemote, "Saved!");
        return doc.$id;
      } catch (err2) {
        console.warn("saveScenarioRemote fallback failed", err2?.message || err2);
      }
    }
    if (!options.silent) flashButton(els.saveRemote, "Failed");
    refreshSchemaStatus("Cloud save failed. Check Appwrite configuration.", "error");
    return null;
  }
}

async function copyShareLink() {
  if (!appwrite) {
    refreshSchemaStatus("Connect to Appwrite to share scenarios.", "error");
    return;
  }
  const id = uiState.lastShareId || state.remoteId || await saveScenarioRemote({ silent: true });
  if (!id) {
    flashButton(els.shareLink, "Failed");
    return;
  }

  const url = buildShareUrl(id);
  try {
    await navigator.clipboard.writeText(url);
    flashButton(els.shareLink, "Link copied");
  } catch (err) {
    try {
      const temp = document.createElement("textarea");
      temp.value = url;
      temp.setAttribute("readonly", "true");
      temp.style.position = "absolute";
      temp.style.left = "-9999px";
      document.body.appendChild(temp);
      temp.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(temp);
      if (ok) {
        flashButton(els.shareLink, "Link copied");
        return;
      }
    } catch {
      // ignore
    }
    flashButton(els.shareLink, "Failed");
    console.warn("copyShareLink failed", err?.message || err);
  }
}

async function maybeHydrateSharedScenario() {
  if (!appwrite) return;
  if (!uiState.pendingShareId) return;
  const shareId = uiState.pendingShareId;
  uiState.pendingShareId = null;

  const { databases, cfg } = appwrite;
  if (!cfg.scenarioCollectionId) return;

  try {
    const doc = await databases.getDocument(cfg.databaseId, cfg.scenarioCollectionId, shareId);
    if (!doc || doc.kind !== "scenario") {
      refreshSchemaStatus("Shared document is not a scenario payload.", "error");
      return;
    }

    state.schema = doc.schema || [];
    state.rows = doc.rows || [];
    state.events = doc.events || [];
    state.scenarioId = doc.scenarioId || null;
    state.remoteId = doc.$id;

    if (state.events.length) selectLastEvent(); else resetEventSelection();
    if (state.scenarioId) localStorage.setItem(STORAGE_KEYS.lastTemplate, state.scenarioId);
    if (doc.comparator?.preferences) {
      applyComparatorPreferences(doc.comparator.preferences);
    }
    if (doc.comparator?.summary) {
      renderComparatorFeedback(doc.comparator.summary);
    }
    uiState.lastShareId = doc.$id;
    save();
    renderSchema();
    renderEditor();
    renderTable();
    renderJSONLog();
    renderTemplateGallery();
    refreshSchemaStatus("Scenario loaded from share link.", "success");

    if (typeof window !== "undefined" && window.history?.replaceState) {
      try {
        const params = new URLSearchParams(window.location.search);
        params.delete("scenario");
        const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`;
        window.history.replaceState({}, document.title, next);
      } catch {
        // ignore URL errors
      }
    }
  } catch (err) {
    console.warn("Fetch shared scenario failed", err?.message || err);
    refreshSchemaStatus("Unable to load shared scenario. It may have expired.", "error");
  }
}

// ---------- Utilities ----------
const nowTs = () => Date.now();
const clone  = (x) => JSON.parse(JSON.stringify(x));
const comparatorState = {
  summary: null,
};
const save   = () => {
  try {
    localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
  } catch (err) {
    console.warn("Save to localStorage failed", err?.message || err);
  }
};
const load   = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.state);
    if (!raw) return;
    const s = JSON.parse(raw);
    state.schema = s.schema || [];
    state.rows   = s.rows   || [];
    state.events = s.events || [];
    state.scenarioId = s.scenarioId || null;
    state.remoteId = s.remoteId || null;
  } catch { /* ignore */ }
};
const loadTemplateFilter = () => {
  try {
    uiState.scenarioFilter = localStorage.getItem(STORAGE_KEYS.scenarioFilter) || "";
  } catch {
    uiState.scenarioFilter = "";
  }
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

const saveTemplateFilter = (value) => {
  try {
    localStorage.setItem(STORAGE_KEYS.scenarioFilter, value);
  } catch (err) {
    console.warn("Save scenario filter failed", err?.message || err);
  }
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

function loadComparatorPreferences() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COMPARATOR_PREFS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Comparator prefs parse failed", err);
    return null;
  }
}

function applyComparatorPreferences(prefs) {
  if (typeof window === "undefined") return;
  try {
    if (prefs) {
      window.localStorage.setItem(COMPARATOR_PREFS_KEY, JSON.stringify(prefs));
    } else {
      window.localStorage.removeItem(COMPARATOR_PREFS_KEY);
    }
    window.dispatchEvent(new CustomEvent("cdc:comparator-preferences-set", { detail: prefs || null }));
  } catch (err) {
    console.warn("Comparator prefs apply failed", err);
  }
}

function buildComparatorExport() {
  const preferences = loadComparatorPreferences();
  let summary = comparatorState.summary;
  try {
    summary = summary ? JSON.parse(JSON.stringify(summary)) : null;
  } catch {
    summary = null;
  }
  return {
    preferences: preferences || null,
    summary,
  };
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
    state.scenarioId = "default";
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

function getRenderableEvents() {
  const allowed = getFilterFlags();
  const items = [];
  state.events.forEach((event, index) => {
    const op = getOp(event);
    if (allowed[op] ?? true) items.push({ event, index });
  });
  return items;
}

function renderJSONLog(precomputed) {
  const items = precomputed || getRenderableEvents();
  if (!items.length) {
    if (els.eventLog) els.eventLog.textContent = "// no events yet (check filters)";
    renderEventInspector(items);
    updateLearning();
    broadcastComparatorState();
    return;
  }

  const payload = items.map(({ event }) => JSON.stringify(event, null, 2)).join("\n");
  if (els.eventLog) els.eventLog.innerHTML = highlightJson(payload);
  renderEventInspector(items);
  updateLearning();
  broadcastComparatorState();
}

function getEventPayload(event) {
  return event?.payload ?? event ?? {};
}

function getEventBefore(event) {
  const payload = getEventPayload(event);
  return payload?.before ?? event?.before ?? null;
}

function getEventAfter(event) {
  const payload = getEventPayload(event);
  return payload?.after ?? event?.after ?? null;
}

function getEventTimestamp(event) {
  const payload = getEventPayload(event);
  const value = payload?.ts_ms ?? event?.ts_ms ?? null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolvePrimaryKeyColumn() {
  const pkCol = state.schema.find(col => col.pk);
  return pkCol ? pkCol.name : null;
}

function extractPrimaryKeyValue(event, pkColumn, fallback) {
  if (!pkColumn) return fallback;
  if (event?.key && event.key[pkColumn] != null) return event.key[pkColumn];
  const after = getEventAfter(event);
  if (after && after[pkColumn] != null) return after[pkColumn];
  const before = getEventBefore(event);
  if (before && before[pkColumn] != null) return before[pkColumn];
  return fallback;
}

function buildWorkspaceOps() {
  const pkColumn = resolvePrimaryKeyColumn();
  const events = state.events ?? [];
  const baseTs = events.reduce((min, event) => {
    const op = getOp(event);
    const ts = getEventTimestamp(event);
    if (op === "r" || ts == null) return min;
    return Math.min(min, ts);
  }, Number.POSITIVE_INFINITY);
  const hasBase = Number.isFinite(baseTs);

  const ops = [];
  events.forEach((event, index) => {
    const op = getOp(event);
    if (op === "r") return; // snapshots don't become source ops

    const ts = getEventTimestamp(event);
    const normalizedTs = hasBase && ts != null ? Math.max(0, ts - baseTs) : index * 150;

    const fallbackPk = `${index}`;
    const pkValue = extractPrimaryKeyValue(event, pkColumn, fallbackPk);
    const pk = { id: pkValue != null ? String(pkValue) : fallbackPk };

    const after = getEventAfter(event);
    if (op === "c") {
      if (!after) return;
      ops.push({ t: normalizedTs, op: "insert", table: "workspace", pk, after: clone(after) });
      return;
    }
    if (op === "u") {
      if (!after) return;
      ops.push({ t: normalizedTs, op: "update", table: "workspace", pk, after: clone(after) });
      return;
    }
    if (op === "d") {
      ops.push({ t: normalizedTs, op: "delete", table: "workspace", pk });
    }
  });

  return ops;
}

function buildComparatorDetail() {
  const ops = buildWorkspaceOps();
  return {
    schema: clone(state.schema),
    rows: clone(state.rows),
    events: clone(state.events),
    scenario: {
      name: "workspace-live",
      label: "Workspace (live)",
      description: `${state.rows.length} rows · ${ops.length} operations`,
      seed: 1,
      ops,
    },
  };
}

function broadcastComparatorState() {
  if (typeof window === "undefined") return;
  try {
    const detail = buildComparatorDetail();
    window.dispatchEvent(new CustomEvent("cdc:workspace-update", { detail }));
  } catch (err) {
    console.warn("Comparator broadcast failed", err);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("cdc:workspace-request", () => {
    broadcastComparatorState();
  });
  window.addEventListener("cdc:comparator-summary", (event) => {
    renderComparatorFeedback(event?.detail);
  });
  window.addEventListener("cdc:apply-scenario-template", (event) => {
    const templateId = event?.detail?.id;
    if (!templateId) return;
    const template = getTemplateById(templateId);
    if (template) {
      applyScenarioTemplate(template, { focusStep: "events" });
    }
  });
  window.addEventListener("cdc:scenario-filter-request", () => {
    window.dispatchEvent(new CustomEvent("cdc:scenario-filter", { detail: { query: uiState.scenarioFilter } }));
  });
}

function renderComparatorFeedback(detail) {
  const panel = els.comparatorFeedback;
  if (!panel) return;

  if (!detail || !detail.summary || detail.totalEvents <= 0) {
    panel.hidden = true;
    panel.innerHTML = "";
    panel.removeAttribute("data-live");
    comparatorState.summary = null;
    return;
  }

  const { summary, scenarioLabel, scenarioName, isLive } = detail;

  try {
    comparatorState.summary = JSON.parse(JSON.stringify(detail));
  } catch {
    comparatorState.summary = null;
  }

  const bestLag = summary.bestLag;
  const worstLag = summary.worstLag;
  const lowestDeletes = summary.lowestDeletes;
  const highestDeletes = summary.highestDeletes;
  const orderingIssues = Array.isArray(summary.orderingIssues) ? summary.orderingIssues : [];

  const lagText = bestLag && worstLag
    ? `${escapeHtml(bestLag.label)} leads at ${Math.round(bestLag.metrics.lagMs)}ms` +
      (summary.lagSpread > 0
        ? `; ${escapeHtml(worstLag.label)} trails by ${Math.round(summary.lagSpread)}ms`
        : "")
    : "Lag data pending";

  const deleteText = lowestDeletes && highestDeletes
    ? lowestDeletes.metrics.deletesPct >= 99.5
      ? `${escapeHtml(highestDeletes.label)} captures all deletes.`
      : `${escapeHtml(lowestDeletes.label)} captures ${Math.round(lowestDeletes.metrics.deletesPct)}% deletes (best: ${escapeHtml(highestDeletes.label)}).`
    : "Delete coverage pending.";

  const orderingText = orderingIssues.length
    ? `Ordering drift in ${orderingIssues.map(item => escapeHtml(item.label)).join(", ")}.`
    : "Ordering preserved across methods.";

  const title = scenarioLabel || scenarioName || "Comparator insights";

  panel.dataset.live = isLive ? "true" : "false";
  panel.innerHTML = `
    <p class="comparator-feedback__title">${escapeHtml(title)}</p>
    <p class="comparator-feedback__meta">${isLive ? "Live workspace" : "Scenario preview"}</p>
    <ul>
      <li><strong>Lag:</strong> ${lagText}</li>
      <li><strong>Deletes:</strong> ${deleteText}</li>
      <li><strong>Ordering:</strong> ${orderingText}</li>
    </ul>
  `;
  panel.hidden = false;
}

const OP_METADATA = {
  c: { label: "Insert", tone: "op-insert" },
  u: { label: "Update", tone: "op-update" },
  d: { label: "Delete", tone: "op-delete" },
  r: { label: "Snapshot", tone: "op-snapshot" },
};

function normalizeEvent(event) {
  if (!event) return { before: null, after: null, ts: null, op: "u", key: null, raw: event };
  const op = getOp(event);
  const payload = event.payload ?? event;
  const before = payload.before ?? event.before ?? null;
  const after = payload.after ?? event.after ?? null;
  const ts = payload.ts_ms ?? event.ts_ms ?? null;
  const key = event.key ?? null;
  return { before, after, ts, op, key, raw: event };
}

function formatTimestamp(ts) {
  if (typeof ts !== "number") return "—";
  try {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return String(ts);
    return date.toISOString().replace("T", " ").replace(".000Z", "Z");
  } catch {
    return String(ts);
  }
}

function describePrimaryKeyValue(normalized) {
  const pkFields = getPrimaryKeyFields();
  if (!pkFields.length) {
    if (normalized.key && typeof normalized.key === "object") {
      return Object.values(normalized.key).filter(Boolean).join(" · ") || "Key unavailable";
    }
    return "No primary key set";
  }
  const source = normalized.after ?? normalized.before ?? {};
  const parts = pkFields.map(name => `${name}: ${source[name] ?? "∅"}`);
  return parts.join(" · ");
}

function computeDiffRows(before = {}, after = {}) {
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  const rows = [];
  keys.forEach(key => {
    const prev = before ? before[key] : undefined;
    const next = after ? after[key] : undefined;
    let status = "unchanged";
    const prevDefined = typeof prev !== "undefined";
    const nextDefined = typeof next !== "undefined";
    if (!prevDefined && nextDefined) status = "added";
    else if (prevDefined && !nextDefined) status = "removed";
    else if (JSON.stringify(prev) !== JSON.stringify(next)) status = "changed";
    rows.push({ key, before: prev, after: next, status });
  });
  rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows;
}

function createValueCell(value) {
  const span = document.createElement("span");
  span.className = "diff-value";
  if (typeof value === "undefined") {
    span.classList.add("is-empty");
    span.textContent = "—";
  } else if (value === null) {
    span.classList.add("is-null");
    span.textContent = "null";
  } else if (typeof value === "object") {
    span.classList.add("is-json");
    span.textContent = JSON.stringify(value);
  } else if (typeof value === "boolean") {
    span.classList.add("is-boolean");
    span.textContent = value ? "true" : "false";
  } else {
    span.textContent = String(value);
  }
  return span;
}

function renderEventInspector(precomputed) {
  if (!els.inspectorList || !els.inspectorDetail) return;

  const items = precomputed || getRenderableEvents();
  const listEl = els.inspectorList;
  const detailEl = els.inspectorDetail;
  listEl.innerHTML = "";
  detailEl.innerHTML = "";

  if (!items.length) {
    const emptyMsg = document.createElement("p");
    emptyMsg.className = "inspector-empty";
    emptyMsg.textContent = "No events match the current filters.";
    detailEl.appendChild(emptyMsg);
    if (els.inspectorPrev) els.inspectorPrev.disabled = true;
    if (els.inspectorNext) els.inspectorNext.disabled = true;
    if (els.inspectorReplay) els.inspectorReplay.disabled = true;
    return;
  }

  let activeIdx = items.findIndex(item => item.index === uiState.selectedEventIndex);
  if (activeIdx === -1) {
    activeIdx = items.length - 1;
    uiState.selectedEventIndex = items[activeIdx].index;
  }

  items.forEach((item, idx) => {
    const { event } = item;
    const normalized = normalizeEvent(event);
    const opMeta = OP_METADATA[normalized.op] || { label: normalized.op.toUpperCase(), tone: "op-generic" };

    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inspector-item";
    if (idx === activeIdx) button.classList.add("is-active");

    const badge = document.createElement("span");
    badge.className = `inspector-item-op ${opMeta.tone}`;
    badge.textContent = opMeta.label;

    const keySpan = document.createElement("span");
    keySpan.className = "inspector-item-key";
    keySpan.textContent = describePrimaryKeyValue(normalized);

    const tsSpan = document.createElement("span");
    tsSpan.className = "inspector-item-ts";
    tsSpan.textContent = formatTimestamp(normalized.ts);

    button.appendChild(badge);
    button.appendChild(keySpan);
    button.appendChild(tsSpan);
    button.onclick = () => {
      uiState.selectedEventIndex = item.index;
      renderEventInspector();
    };

    li.appendChild(button);
    listEl.appendChild(li);
  });

  const activeItem = items[activeIdx];
  const normalized = normalizeEvent(activeItem.event);
  const opMeta = OP_METADATA[normalized.op] || { label: normalized.op.toUpperCase(), tone: "op-generic" };

  const header = document.createElement("div");
  header.className = "inspector-detail-header";

  const opBadge = document.createElement("span");
  opBadge.className = `inspector-detail-op ${opMeta.tone}`;
  opBadge.textContent = opMeta.label;

  const pkText = document.createElement("p");
  pkText.className = "inspector-detail-pk";
  pkText.textContent = describePrimaryKeyValue(normalized);

  const tsText = document.createElement("span");
  tsText.className = "inspector-detail-ts";
  tsText.textContent = formatTimestamp(normalized.ts);

  header.appendChild(opBadge);
  header.appendChild(pkText);
  header.appendChild(tsText);
  detailEl.appendChild(header);

  const diffRows = computeDiffRows(normalized.before || {}, normalized.after || {});

  const diffWrap = document.createElement("div");
  diffWrap.className = "inspector-diff";

  const diffHead = document.createElement("div");
  diffHead.className = "inspector-diff-row diff-head";
  const headKey = document.createElement("span"); headKey.textContent = "Field"; diffHead.appendChild(headKey);
  const headBefore = document.createElement("span"); headBefore.textContent = "Before"; diffHead.appendChild(headBefore);
  const headAfter = document.createElement("span"); headAfter.textContent = "After"; diffHead.appendChild(headAfter);
  diffWrap.appendChild(diffHead);

  const pkFields = new Set(getPrimaryKeyFields());
  diffRows.forEach(row => {
    const diffRow = document.createElement("div");
    diffRow.className = `inspector-diff-row diff-${row.status}`;
    if (pkFields.has(row.key)) diffRow.classList.add("is-pk");

    const keyCell = document.createElement("div");
    keyCell.className = "diff-key";
    keyCell.textContent = row.key;
    if (pkFields.has(row.key)) {
      const pkBadge = document.createElement("span");
      pkBadge.className = "diff-tag";
      pkBadge.textContent = "PK";
      keyCell.appendChild(pkBadge);
    }

    const beforeCell = document.createElement("div");
    beforeCell.className = "diff-before";
    beforeCell.appendChild(createValueCell(row.before));

    const afterCell = document.createElement("div");
    afterCell.className = "diff-after";
    afterCell.appendChild(createValueCell(row.after));

    diffRow.appendChild(keyCell);
    diffRow.appendChild(beforeCell);
    diffRow.appendChild(afterCell);
    diffWrap.appendChild(diffRow);
  });

  if (!diffRows.length) {
    const empty = document.createElement("p");
    empty.className = "inspector-empty";
    empty.textContent = "No field-level changes.";
    diffWrap.appendChild(empty);
  }

  detailEl.appendChild(diffWrap);

  if (els.inspectorPrev) els.inspectorPrev.disabled = activeIdx <= 0;
  if (els.inspectorNext) els.inspectorNext.disabled = activeIdx >= items.length - 1;
  if (els.inspectorReplay) els.inspectorReplay.disabled = !items.length;

  const activeButton = listEl.querySelector(".inspector-item.is-active");
  if (activeButton) activeButton.scrollIntoView({ block: "nearest" });
}

function stepSelectedEvent(delta) {
  const items = getRenderableEvents();
  if (!items.length) return;
  let activeIdx = items.findIndex(item => item.index === uiState.selectedEventIndex);
  if (activeIdx === -1) activeIdx = items.length - 1;
  let targetIdx = activeIdx + delta;
  targetIdx = Math.max(0, Math.min(items.length - 1, targetIdx));
  if (targetIdx === activeIdx) return;
  uiState.selectedEventIndex = items[targetIdx].index;
  renderEventInspector(items);
}

function replaySelectedEvent() {
  const items = getRenderableEvents();
  if (!items.length) return;
  const active = items.find(item => item.index === uiState.selectedEventIndex) || items[items.length - 1];
  replayEventToTable(active.event);
  renderEventInspector(items);
}

function replayEventToTable(event) {
  const normalized = normalizeEvent(event);
  const op = normalized.op;
  const before = normalized.before;
  const after = normalized.after;
  const reference = after ?? before ?? {};

  if (!getPrimaryKeyFields().length) {
    refreshSchemaStatus("Assign a primary key before replaying events to the table.", "error");
    return;
  }

  const idx = findByPK(reference);

  switch (op) {
    case "c":
    case "r": {
      if (!after) {
        refreshSchemaStatus("Event is missing an after payload to hydrate.", "error");
        return;
      }
      if (idx === -1) {
        state.rows.push(clone(after));
      } else {
        state.rows[idx] = clone(after);
      }
      break;
    }
    case "u": {
      if (!after) {
        refreshSchemaStatus("Update event missing after payload.", "error");
        return;
      }
      if (idx === -1) {
        state.rows.push(clone(after));
      } else {
        state.rows[idx] = clone(after);
      }
      break;
    }
    case "d": {
      if (idx === -1) {
        refreshSchemaStatus("Row already absent from table.", "muted");
        break;
      }
      state.rows.splice(idx, 1);
      break;
    }
    default:
      refreshSchemaStatus(`Unsupported operation "${op}" for replay.`, "error");
      return;
  }

  save();
  renderTable();
  refreshSchemaStatus("Event applied back to the table.", "success");
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

  updateQuickstart(activeIdResolved);
}

function updateQuickstart(activeId) {
  const cards = els.quickstartCards || {};
  const completion = learningConfig.reduce((acc, step) => {
    acc[step.id] = step.isComplete();
    return acc;
  }, {});

  const resolvedActive = activeId || learningConfig.find(step => !completion[step.id])?.id || "events";

  ["schema", "rows", "events"].forEach(step => {
    const card = cards[step];
    if (!card) return;
    const statusEl = card.querySelector(".quickstart-status");
    card.classList.remove("is-active", "is-complete");

    if (completion[step]) {
      card.classList.add("is-complete");
      if (statusEl) statusEl.textContent = "Done";
    } else if (step === resolvedActive) {
      card.classList.add("is-active");
      if (statusEl) statusEl.textContent = "In progress";
    } else if (statusEl) {
      statusEl.textContent = "Pending";
    }

    const button = card.querySelector("button");
    if (!button) return;
    let enabled = true;
    if (step === "rows" && !completion.schema) enabled = false;
    if (step === "events" && !completion.rows) enabled = false;
    button.disabled = !enabled;
  });
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
    if (doc?.kind === "scenario") return;
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
      selectLastEvent();
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
  selectLastEvent();
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
  selectLastEvent();
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
  selectLastEvent();
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
  selectLastEvent();
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
  const payload = {
    version: 2,
    exported_at: new Date().toISOString(),
    schema: clone(state.schema),
    rows: clone(state.rows),
    events: clone(state.events),
    scenarioId: state.scenarioId || null,
    remoteId: state.remoteId || null,
    comparator: buildComparatorExport(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "cdc_scenario.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadScenarioTemplate(template) {
  const payload = {
    id: template.id,
    name: template.name,
    description: template.description,
    highlight: template.highlight,
    schema: template.schema,
    rows: template.rows,
    events: template.events,
    ops: template.ops,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${template.id || template.name || "scenario"}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importScenario(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      const scenarioPayload = payload && payload.schema ? payload : { schema: [], rows: [], events: [] };

      state.schema = scenarioPayload.schema || [];
      state.rows   = scenarioPayload.rows   || [];
      state.events = scenarioPayload.events || [];
      state.scenarioId = scenarioPayload.scenarioId || null;
      state.remoteId = scenarioPayload.remoteId || null;
      if (state.scenarioId) {
        localStorage.setItem(STORAGE_KEYS.lastTemplate, state.scenarioId);
      }
      if (state.events.length) selectLastEvent(); else resetEventSelection();
      if (scenarioPayload.comparator?.preferences) {
        applyComparatorPreferences(scenarioPayload.comparator.preferences);
      }
      if (scenarioPayload.comparator?.summary) {
        renderComparatorFeedback(scenarioPayload.comparator.summary);
      }
      save(); renderSchema(); renderEditor(); renderTable(); renderJSONLog();
      renderTemplateGallery();
    } catch { alert("Invalid scenario JSON"); }
  };
  reader.readAsText(file);
}

function quickstartFocusSchema() {
  const schemaSection = document.getElementById("schema");
  if (schemaSection) schemaSection.scrollIntoView({ behavior: "smooth", block: "start" });
  const input = document.getElementById("colName");
  if (input) {
    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      input.select();
    });
  }
  updateLearning("schema");
}

function quickstartSeedRows() {
  if (!hasPrimaryKey()) {
    refreshSchemaStatus("Add a primary key before seeding sample rows.", "error");
    quickstartFocusSchema();
    return;
  }
  const beforeCount = state.rows.length;
  seedRows();
  const seededSomething = state.rows.length > beforeCount;
  if (seededSomething) {
    const tableSection = document.getElementById("table-state");
    tableSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  updateLearning("rows");
}

function quickstartEmitEvent() {
  if (!hasPrimaryKey()) {
    refreshSchemaStatus("Add a primary key and rows before emitting events.", "error");
    quickstartFocusSchema();
    return;
  }

  if (!state.rows.length) {
    autofillRowAndInsert();
  } else {
    emitSnapshot();
  }

  const eventsSection = document.getElementById("change-feed");
  eventsSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  updateLearning("events");
}

function bindUiHandlers() {
  if (els.onboardingButton) {
    els.onboardingButton.onclick = () => showOnboarding();
  }
  if (els.onboardingClose) {
    els.onboardingClose.onclick = () => hideOnboarding(true);
  }
  if (els.onboardingDismiss) {
    els.onboardingDismiss.onclick = () => hideOnboarding(true);
  }
  if (els.onboardingStart) {
    els.onboardingStart.onclick = () => {
      const template = getTemplateById("orders");
      applyScenarioTemplate(template, { focusStep: "rows", closeOnboarding: true });
    };
  }
  if (els.onboardingOverlay) {
    els.onboardingOverlay.addEventListener("click", (event) => {
      if (event.target === els.onboardingOverlay) hideOnboarding(true);
    });
  }

  if (els.saveRemote) {
    els.saveRemote.onclick = () => { saveScenarioRemote(); };
  }
  if (els.shareLink) {
    els.shareLink.onclick = () => { copyShareLink(); };
  }

  if (els.quickstartButtons) {
    if (els.quickstartButtons.schema) {
      els.quickstartButtons.schema.onclick = quickstartFocusSchema;
    }
    if (els.quickstartButtons.rows) {
      els.quickstartButtons.rows.onclick = quickstartSeedRows;
    }
    if (els.quickstartButtons.events) {
      els.quickstartButtons.events.onclick = quickstartEmitEvent;
    }
  }

  if (els.inspectorPrev) {
    els.inspectorPrev.onclick = () => stepSelectedEvent(-1);
  }
  if (els.inspectorNext) {
    els.inspectorNext.onclick = () => stepSelectedEvent(1);
  }
  if (els.inspectorReplay) {
    els.inspectorReplay.onclick = replaySelectedEvent;
  }

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

  if (els.scenarioFilter) {
    els.scenarioFilter.value = uiState.scenarioFilter;
    els.scenarioFilter.addEventListener("input", (event) => {
      const value = event.target.value || "";
      uiState.scenarioFilter = value;
      saveTemplateFilter(value);
      renderTemplateGallery();
      window.dispatchEvent(new CustomEvent("cdc:scenario-filter", { detail: { query: value } }));
    });
  }

  const emitSnapshotBtn = document.getElementById("emitSnapshot");
  if (emitSnapshotBtn) emitSnapshotBtn.onclick = emitSnapshot;

  const clearEventsBtn = document.getElementById("clearEvents");
  if (clearEventsBtn) clearEventsBtn.onclick = () => {
    state.events = [];
    resetEventSelection();
    save();
    renderJSONLog();
  };

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
  if (resetBtn) resetBtn.onclick = () => {
    localStorage.removeItem(STORAGE_KEYS.state);
    localStorage.removeItem(STORAGE_KEYS.lastTemplate);
    localStorage.removeItem(STORAGE_KEYS.onboarding);
    location.reload();
  };
}

// ---------- Wire up UI ----------
async function main() {
  load();
  loadTemplateFilter();
  if (state.events.length) selectLastEvent();
  let hydratedFromTemplate = false;
  if (!state.schema.length) {
    const rememberedId = localStorage.getItem(STORAGE_KEYS.lastTemplate);
    const remembered = getTemplateById(rememberedId);
    if (remembered) {
      applyScenarioTemplate(remembered, { focusStep: "events", markSeen: false });
      hydratedFromTemplate = true;
    }
  }

  const seeded = ensureDefaultSchema();
  if (!hydratedFromTemplate) {
    if (seeded) save();
    renderSchema();
    renderEditor();
    renderTable();
    renderJSONLog();
  }

  renderTemplateGallery();
  bindUiHandlers();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cdc:scenario-filter", { detail: { query: uiState.scenarioFilter } }));
  }
  broadcastComparatorState();
  setShareControlsEnabled(false);

  try {
    await initAppwrite();
    if (appwrite?.cfg?.scenarioCollectionId) setShareControlsEnabled(true);
    await maybeHydrateSharedScenario();
  } catch (err) {
    console.warn("Appwrite init skipped", err?.message || err);
  }

  const shouldShowOnboarding = !localStorage.getItem(STORAGE_KEYS.onboarding)
    && (state.scenarioId === "default" || !state.schema.length)
    && state.rows.length === 0
    && state.events.length === 0;
  if (shouldShowOnboarding) maybeShowOnboarding();
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
  if (typeof row.price_per_unit === "number" && typeof row.order_total === "number") {
    const quantity = Math.floor(Math.random() * 40) + 5;
    row.order_total = Number((row.price_per_unit * quantity).toFixed(2));
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
  selectLastEvent();
  publishEvent("c", null, after, docId);

  save();
  renderTable();
  renderJSONLog();

  refreshSchemaStatus("Sample row inserted into the table.", "success");
  updateLearning("rows");
  emitSparkleTrail("c");
}
