(function () {
  const STORAGE_KEY = "cdc_telemetry_buffer_v1";
  const MAX_BUFFER = 200;

  function nowIso() {
    return new Date().toISOString();
  }

  function loadBuffer() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, MAX_BUFFER) : [];
    } catch (err) {
      console.warn("Telemetry buffer load failed", err?.message || err);
      return [];
    }
  }

  function saveBuffer(entries) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_BUFFER)));
    } catch (err) {
      console.warn("Telemetry buffer save failed", err?.message || err);
    }
  }

  const buffer = loadBuffer();

  const questions = {
    activation: "Do new users reach their first comparator insight?",
    funnel_drop: "Where do users abandon the guided comparator walkthrough?",
    scenario_completeness: "Which templates and tags lead to full replay + export?",
    share_collaboration: "How often do teams share scenarios or comparator snapshots?"
  };

  const taxonomy = {
    "comparator.scenario.select": { question: "activation" },
    "comparator.scenario.preview": { question: "activation" },
    "comparator.summary.copied": { question: "activation" },
    "comparator.diff.opened": { question: "funnel_drop" },
    "comparator.clock.control": { question: "funnel_drop" },
    "workspace.share.generated": { question: "share_collaboration" },
    "workspace.scenario.imported": { question: "scenario_completeness" },
    "telemetry.flush": { question: "activation" }
  };

  function track(event, payload = {}, context = {}) {
    if (!event || typeof event !== "string") return;
    const entry = {
      event,
      payload,
      context,
      question: taxonomy[event]?.question || null,
      recorded_at: nowIso(),
    };
    buffer.push(entry);
    if (buffer.length > MAX_BUFFER) buffer.shift();
    saveBuffer(buffer);
    if (context.debug) {
      console.debug("[telemetry]", entry);
    }
  }

  function flush() {
    if (!buffer.length) return [];
    const snapshot = buffer.slice();
    buffer.length = 0;
    saveBuffer(buffer);
    return snapshot;
  }

  function enumerateQuestions() {
    return Object.entries(questions).map(([key, description]) => ({ key, description }));
  }

  const client = {
    track,
    flush,
    buffer,
    questions: enumerateQuestions,
    taxonomy: () => ({ ...taxonomy }),
  };

  window.telemetry = client;
})();
