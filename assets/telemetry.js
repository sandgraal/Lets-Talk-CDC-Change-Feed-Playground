(function () {
  const STORAGE_KEY = "cdc_telemetry_buffer_v1";
  const MAX_BUFFER = 200;

  const consoleRef = typeof console !== "undefined"
    ? { warn: console.warn.bind(console), debug: console.debug.bind(console) }
    : { warn: function () {}, debug: function () {} };

  const QUESTIONS = {
    activation: {
      key: "activation",
      label: "Activation",
      description: "Do new users reach their first comparator insight?",
    },
    funnel_drop: {
      key: "funnel_drop",
      label: "Funnel drop",
      description: "Where do users abandon the guided comparator walkthrough?",
    },
    adoption: {
      key: "adoption",
      label: "Adoption",
      description: "Which comparator features become part of regular usage?",
    },
    quality_gate: {
      key: "quality_gate",
      label: "Quality gate",
      description: "Do reliability issues or errors block comparator adoption?",
    },
    scenario_completeness: {
      key: "scenario_completeness",
      label: "Scenario completeness",
      description: "Which templates lead to full replay, export, and comparator review?",
    },
    collaboration: {
      key: "collaboration",
      label: "Collaboration",
      description: "How often do teams share scenarios or comparator snapshots?",
    },
  };

  const TAXONOMY = {
    "comparator.scenario.select": "activation",
    "comparator.scenario.preview": "activation",
    "comparator.preset.select": "activation",
    "comparator.scenario.filter": "activation",
    "comparator.scenario.tag_toggle": "funnel_drop",
    "comparator.scenario.tag_clear": "funnel_drop",
    "comparator.summary.copied": "activation",
    "comparator.diff.opened": "funnel_drop",
    "comparator.overlay.inspect": "activation",
    "comparator.schema.change": "activation",
    "comparator.clock.control": "funnel_drop",
    "comparator.consumer.toggle": "funnel_drop",
    "comparator.consumer.rate_toggle": "funnel_drop",
    "comparator.consumer.rate_adjust": "activation",
    "comparator.consumer.rate_reset": "activation",
    "comparator.event.search": "activation",
    "comparator.event.filter": "activation",
    "comparator.panel.layout": "adoption",
    "comparator.event.download": "adoption",
    "comparator.event.clear": "adoption",
    "comparator.event.copy": "activation",
    "comparator.event.copy.error": "quality_gate",
    "comparator.event.replay": "activation",
    "comparator.destination.download": "adoption",
    "comparator.generator.toggle": "adoption",
    "comparator.generator.rate_adjust": "adoption",
    "comparator.generator.burst": "activation",
    "tour.started": "funnel_drop",
    "tour.completed": "activation",
    "tour.dismissed": "funnel_drop",
    "workspace.share.generated": "collaboration",
    "workspace.scenario.imported": "scenario_completeness",
    "workspace.scenario.template_loaded": "activation",
    "workspace.scenario.exported": "scenario_completeness",
    "telemetry.flush": "activation",
  };

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function cloneRecord(value) {
    if (!isPlainObject(value)) return {};
    const clone = {};
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        clone[key] = value[key];
      }
    }
    return clone;
  }

  function safeIsoString(date) {
    try {
      return date.toISOString();
    } catch (err) {
      consoleRef.warn("Telemetry timestamp conversion failed", err && err.message ? err.message : err);
      try {
        return new Date().toISOString();
      } catch {
        return String(Date.now());
      }
    }
  }

  function getStorage() {
    try {
      return window.localStorage;
    } catch (err) {
      consoleRef.warn("Telemetry storage unavailable", err && err.message ? err.message : err);
      return null;
    }
  }

  const storage = typeof window !== "undefined" ? getStorage() : null;

  function reviveEntry(raw) {
    if (!isPlainObject(raw)) return null;
    const event = typeof raw.event === "string" ? raw.event.trim() : "";
    if (!event) return null;
    const payload = cloneRecord(raw.payload);
    const context = cloneRecord(raw.context);
    const recordedAtRaw =
      typeof raw.recordedAt === "string"
        ? raw.recordedAt
        : typeof raw.recorded_at === "string"
          ? raw.recorded_at
          : null;
    const recordedAt = recordedAtRaw && !Number.isNaN(Date.parse(recordedAtRaw))
      ? recordedAtRaw
      : safeIsoString(new Date());
    const questionKey = typeof raw.question === "string" && Object.prototype.hasOwnProperty.call(QUESTIONS, raw.question)
      ? raw.question
      : null;
    return { event, payload, context, question: questionKey, recordedAt };
  }

  function serializeEntry(entry) {
    return {
      event: entry.event,
      payload: entry.payload,
      context: entry.context,
      question: entry.question,
      recordedAt: entry.recordedAt,
    };
  }

  function loadBuffer() {
    if (!storage) return [];
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(reviveEntry)
        .filter(function (entry) {
          return Boolean(entry);
        })
        .slice(-MAX_BUFFER);
    } catch (err) {
      consoleRef.warn("Telemetry buffer load failed", err && err.message ? err.message : err);
      return [];
    }
  }

  const buffer = loadBuffer();

  function persistBuffer() {
    if (!storage) return;
    try {
      const snapshot = buffer.slice(-MAX_BUFFER).map(serializeEntry);
      storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (err) {
      consoleRef.warn("Telemetry buffer save failed", err && err.message ? err.message : err);
    }
  }

  function track(event, payload, context) {
    if (typeof event !== "string") return;
    const trimmed = event.trim();
    if (!trimmed) return;
    const entry = {
      event: trimmed,
      payload: cloneRecord(payload),
      context: cloneRecord(context),
      question: TAXONOMY[trimmed] || null,
      recordedAt: safeIsoString(new Date()),
    };
    buffer.push(entry);
    if (buffer.length > MAX_BUFFER) {
      buffer.splice(0, buffer.length - MAX_BUFFER);
    }
    persistBuffer();
    if (entry.context.debug) {
      consoleRef.debug("[telemetry]", entry);
    }
  }

  function flush() {
    if (!buffer.length) return [];
    const snapshot = buffer.slice();
    buffer.length = 0;
    persistBuffer();
    return snapshot.map(serializeEntry);
  }

  function enumerateQuestions() {
    return Object.keys(QUESTIONS).map(function (key) {
      const question = QUESTIONS[key];
      return { key: question.key, label: question.label, description: question.description };
    });
  }

  function taxonomySnapshot() {
    var clone = {};
    for (const key in TAXONOMY) {
      if (Object.prototype.hasOwnProperty.call(TAXONOMY, key)) {
        clone[key] = TAXONOMY[key];
      }
    }
    return clone;
  }

  const client = {
    track: track,
    flush: flush,
    buffer: buffer,
    questions: enumerateQuestions,
    taxonomy: taxonomySnapshot,
  };

  if (typeof window !== "undefined") {
    window.telemetry = client;
  }
})();
