class _ {
  constructor() {
    this.handlers = /* @__PURE__ */ new Set();
  }
  emit(t) {
    this.handlers.forEach((s) => s(t));
  }
  on(t) {
    return this.handlers.add(t), () => this.handlers.delete(t);
  }
}
class p {
  constructor() {
    this.bus = new _(), this.seq = 0, this.randomSeed = 42;
  }
  configure(t) {
  }
  reset(t) {
    this.seq = 0, this.randomSeed = t;
  }
  onEvent(t) {
    return this.bus.on(t);
  }
}
class k extends p {
  constructor() {
    super(...arguments), this.name = "polling", this.table = /* @__PURE__ */ new Map(), this.lastSync = 0, this.pollIntervalMs = 1e3, this.includeSoftDeletes = !1;
  }
  configure(t) {
    t.poll_interval_ms !== void 0 && (this.pollIntervalMs = t.poll_interval_ms), t.include_soft_deletes !== void 0 && (this.includeSoftDeletes = t.include_soft_deletes);
  }
  reset(t) {
    super.reset(t), this.table.clear(), this.lastSync = 0;
  }
  applySourceOp(t) {
    if (t.op === "insert")
      this.table.set(t.pk.id, {
        id: t.pk.id,
        table: t.table,
        data: t.after,
        version: 1,
        updated_at_ms: t.t,
        deleted: !1
      });
    else if (t.op === "update") {
      const s = this.table.get(t.pk.id);
      if (!s || s.deleted) return;
      this.table.set(t.pk.id, {
        ...s,
        table: s.table ?? t.table,
        data: { ...s.data, ...t.after },
        version: s.version + 1,
        updated_at_ms: t.t
      });
    } else if (t.op === "delete") {
      const s = this.table.get(t.pk.id);
      if (!s) return;
      this.table.set(t.pk.id, {
        ...s,
        table: s.table ?? t.table,
        deleted: !0,
        updated_at_ms: t.t
      });
    }
  }
  shouldPoll(t) {
    return t - this.lastSync >= this.pollIntervalMs;
  }
  tick(t) {
    if (!this.shouldPoll(t)) return;
    const s = [...this.table.values()].filter((e) => e.updated_at_ms > this.lastSync);
    for (const e of s) {
      if (e.deleted && !this.includeSoftDeletes) continue;
      const i = {
        source: "demo-db",
        table: e.table,
        op: e.deleted ? "d" : e.version > 1 ? "u" : "c",
        pk: { id: e.id },
        before: null,
        after: e.deleted ? null : e.data,
        ts_ms: e.updated_at_ms,
        tx: { id: `tx-${e.updated_at_ms}`, lsn: null, index: 0, total: 1, last: !0 },
        seq: ++this.seq,
        meta: { method: "polling" }
      };
      this.bus.emit(i);
    }
    this.lastSync = t;
  }
}
class v extends p {
  constructor() {
    super(...arguments), this.name = "trigger", this.table = /* @__PURE__ */ new Map(), this.audit = [], this.extractOffset = 0, this.extractIntervalMs = 500, this.lastExtract = 0, this.triggerOverheadMs = 5;
  }
  configure(t) {
    t.extract_interval_ms !== void 0 && (this.extractIntervalMs = t.extract_interval_ms), t.trigger_overhead_ms !== void 0 && (this.triggerOverheadMs = t.trigger_overhead_ms);
  }
  reset(t) {
    super.reset(t), this.table.clear(), this.audit = [], this.extractOffset = 0, this.lastExtract = 0;
  }
  applySourceOp(t) {
    const s = t.t + this.triggerOverheadMs, e = t.txn ?? { id: `tx-${s}`, index: 0, total: 1, last: !0 }, i = e.id ?? `tx-${s}`, r = typeof e.index == "number" ? e.index : 0, o = typeof e.total == "number" ? e.total : 1, d = typeof e.last == "boolean" ? e.last : r >= o - 1;
    if (t.op === "insert")
      this.table.set(t.pk.id, {
        id: t.pk.id,
        table: t.table,
        data: t.after,
        version: 1,
        updated_at_ms: s,
        deleted: !1
      }), this.audit.push({
        audit_id: f(),
        op: "c",
        pk: t.pk,
        before: null,
        after: t.after,
        tx_id: i,
        tx_index: r,
        tx_total: o,
        tx_last: d,
        table: t.table,
        commit_ts_ms: s
      });
    else if (t.op === "update") {
      const n = this.table.get(t.pk.id), u = n ? { ...n.data } : null, h = n ? { ...n.data, ...t.after } : t.after;
      this.table.set(t.pk.id, {
        id: t.pk.id,
        table: n?.table ?? t.table,
        data: h,
        version: (n?.version ?? 0) + 1,
        updated_at_ms: s,
        deleted: !1
      }), this.audit.push({
        audit_id: f(),
        op: "u",
        pk: t.pk,
        before: u,
        after: h,
        tx_id: i,
        tx_index: r,
        tx_total: o,
        tx_last: d,
        table: t.table,
        commit_ts_ms: s
      });
    } else if (t.op === "delete") {
      const n = this.table.get(t.pk.id) || {
        id: t.pk.id,
        table: t.table,
        data: {},
        version: 0,
        updated_at_ms: s,
        deleted: !0
      };
      this.table.set(t.pk.id, {
        ...n,
        deleted: !0,
        updated_at_ms: s
      }), this.audit.push({
        audit_id: f(),
        op: "d",
        pk: t.pk,
        before: n ? n.data : null,
        after: null,
        tx_id: i,
        tx_index: r,
        tx_total: o,
        tx_last: d,
        table: t.table,
        commit_ts_ms: s
      });
    }
  }
  tick(t) {
    if (t - this.lastExtract < this.extractIntervalMs) return;
    const s = this.audit.slice(this.extractOffset);
    for (const e of s) {
      const i = {
        source: "demo-db",
        table: e.table,
        op: e.op,
        pk: e.pk,
        before: e.before,
        after: e.after,
        ts_ms: e.commit_ts_ms,
        tx: {
          id: e.tx_id,
          lsn: null,
          index: e.tx_index,
          total: e.tx_total,
          last: e.tx_last
        },
        seq: ++this.seq,
        meta: { method: "trigger" }
      };
      this.bus.emit(i);
    }
    this.extractOffset = this.audit.length, this.lastExtract = t;
  }
}
function f() {
  return Math.random().toString(36).slice(2);
}
class y extends p {
  constructor() {
    super(...arguments), this.name = "log", this.table = /* @__PURE__ */ new Map(), this.wal = [], this.lsn = 0, this.fetchIntervalMs = 100, this.lastFetch = 0;
  }
  configure(t) {
    t.fetch_interval_ms !== void 0 && (this.fetchIntervalMs = t.fetch_interval_ms);
  }
  reset(t) {
    super.reset(t), this.table.clear(), this.wal = [], this.lsn = 0, this.lastFetch = 0;
  }
  applySourceOp(t) {
    const s = t.txn ?? { id: `tx-${t.t}`, index: 0, total: 1, last: !0 }, e = s.id ?? `tx-${t.t}`, i = typeof s.index == "number" ? s.index : 0, r = typeof s.total == "number" ? s.total : 1, o = typeof s.last == "boolean" ? s.last : i >= r - 1;
    if (t.op === "insert")
      this.table.set(t.pk.id, {
        id: t.pk.id,
        table: t.table,
        data: t.after,
        version: 1,
        updated_at_ms: t.t,
        deleted: !1
      }), this.wal.push({
        lsn: ++this.lsn,
        tx_id: e,
        tx_index: i,
        tx_total: r,
        tx_last: o,
        table: t.table,
        op: "c",
        pk: t.pk,
        before: null,
        after: t.after,
        commit_ts_ms: t.t
      });
    else if (t.op === "update") {
      const d = this.table.get(t.pk.id), n = d ? { ...d.data } : null, u = d ? { ...d.data, ...t.after } : t.after;
      this.table.set(t.pk.id, {
        id: t.pk.id,
        table: d?.table ?? t.table,
        data: u,
        version: (d?.version ?? 0) + 1,
        updated_at_ms: t.t,
        deleted: !1
      }), this.wal.push({
        lsn: ++this.lsn,
        tx_id: e,
        tx_index: i,
        tx_total: r,
        tx_last: o,
        table: t.table,
        op: "u",
        pk: t.pk,
        before: n,
        after: u,
        commit_ts_ms: t.t
      });
    } else if (t.op === "delete") {
      const d = this.table.get(t.pk.id);
      this.table.delete(t.pk.id), this.wal.push({
        lsn: ++this.lsn,
        tx_id: e,
        tx_index: i,
        tx_total: r,
        tx_last: o,
        table: t.table,
        op: "d",
        pk: t.pk,
        before: d ? d.data : null,
        after: null,
        commit_ts_ms: t.t
      });
    }
  }
  tick(t) {
    if (t - this.lastFetch < this.fetchIntervalMs) return;
    const s = this.wal.slice(this.seq);
    for (const e of s) {
      const i = {
        source: "demo-db",
        table: e.table,
        op: e.op,
        pk: e.pk,
        before: e.before,
        after: e.after,
        ts_ms: e.commit_ts_ms,
        tx: {
          id: e.tx_id,
          lsn: e.lsn,
          index: e.tx_index,
          total: e.tx_total,
          last: e.tx_last
        },
        seq: ++this.seq,
        meta: { method: "log" }
      };
      this.bus.emit(i);
    }
    this.lastFetch = t;
  }
}
class M {
  constructor() {
    this.scenario = null, this.engines = [], this.idx = 0, this.now = 0, this.playing = !1;
  }
  attach(t) {
    this.engines = t;
  }
  load(t) {
    this.scenario = t, this.idx = 0, this.now = 0, this.playing = !1;
  }
  reset(t) {
    this.engines.forEach((s) => s.reset(t)), this.idx = 0, this.now = 0;
  }
  onTick(t) {
    this.onTickCb = t;
  }
  start() {
    this.playing = !0;
  }
  pause() {
    this.playing = !1;
  }
  tick(t) {
    if (!this.playing || !this.scenario) return;
    this.now += t;
    const { ops: s } = this.scenario;
    for (; this.idx < s.length && s[this.idx].t <= this.now; ) {
      const e = s[this.idx++];
      this.engines.forEach((i) => i.applySourceOp(e));
    }
    this.engines.forEach((e) => e.tick(this.now)), this.onTickCb?.(this.now);
  }
}
const S = /* @__PURE__ */ new Set(["c", "u", "d"]);
function w(a) {
  switch (a.op) {
    case "insert":
      return "c";
    case "update":
      return "u";
    case "delete":
      return "d";
    default:
      return null;
  }
}
function E(a) {
  return a.map((t, s) => {
    const e = w(t);
    if (!e) return null;
    const i = t.pk?.id != null ? String(t.pk.id) : "";
    return {
      key: `${e}::${i}`,
      op: e,
      pk: i,
      index: s,
      time: t.t
    };
  }).filter((t) => !!t);
}
function I(a) {
  return a.map((t, s) => {
    if (!S.has(t.op)) return null;
    const e = t.pk?.id != null ? String(t.pk.id) : "", i = t.op;
    return {
      key: `${i}::${e}`,
      op: i,
      pk: e,
      index: s,
      time: t.ts_ms
    };
  }).filter((t) => !!t);
}
function b(a) {
  const t = /* @__PURE__ */ new Map();
  for (const s of a) {
    const e = t.get(s.key);
    e ? e.push(s) : t.set(s.key, [s]);
  }
  return t;
}
function O(a, t) {
  const s = [], e = [], i = [], r = b(a), o = b(t), d = /* @__PURE__ */ new Set([...r.keys(), ...o.keys()]);
  for (const n of d) {
    const u = r.get(n) ?? [], h = o.get(n) ?? [], l = Math.min(u.length, h.length);
    for (let c = 0; c < l; c++) {
      const m = u[c], x = h[c];
      s.push({
        expected: m,
        actual: x,
        lagMs: Math.max(0, x.time - m.time)
      });
    }
    for (let c = l; c < u.length; c++)
      e.push(u[c]);
    for (let c = l; c < h.length; c++)
      i.push(h[c]);
  }
  return { matched: s, missing: e, extra: i };
}
function T(a) {
  const t = [], s = [...a].sort((i, r) => i.actual.index - r.actual.index);
  let e = -1 / 0;
  for (const i of s)
    i.expected.index < e ? t.push({
      type: "ordering",
      op: i.expected.op,
      pk: i.expected.pk,
      expectedIndex: i.expected.index,
      actualIndex: i.actual.index,
      expectedTime: i.expected.time,
      actualTime: i.actual.time
    }) : e = i.expected.index;
  return t;
}
function q(a) {
  return a.filter((t) => t.lagMs > 0).sort((t, s) => s.lagMs - t.lagMs).slice(0, 5).map((t) => ({
    op: t.expected.op,
    pk: t.expected.pk,
    expectedTime: t.expected.time,
    actualTime: t.actual.time,
    lagMs: t.lagMs
  }));
}
function g(a, t, s) {
  const e = E(t), i = I(s), { matched: r, missing: o, extra: d } = O(e, i), n = [];
  for (const l of o)
    n.push({
      type: "missing",
      op: l.op,
      pk: l.pk,
      expectedIndex: l.index,
      expectedTime: l.time
    });
  for (const l of d)
    n.push({
      type: "extra",
      op: l.op,
      pk: l.pk,
      actualIndex: l.index,
      actualTime: l.time
    });
  n.push(...T(r));
  const u = q(r), h = u.reduce((l, c) => Math.max(l, c.lagMs), 0);
  return {
    method: a,
    totals: {
      missing: n.filter((l) => l.type === "missing").length,
      extra: n.filter((l) => l.type === "extra").length,
      ordering: n.filter((l) => l.type === "ordering").length
    },
    issues: n,
    lag: {
      max: h,
      samples: u
    }
  };
}
function $(a, t) {
  return t.map((s) => g(s.method, a, s.events));
}
const B = {
  EventBus: _,
  PollingEngine: k,
  TriggerEngine: v,
  LogEngine: y,
  ScenarioRunner: M,
  diffLane: g,
  diffAllLanes: $
};
typeof window < "u" && (window.__LetstalkCdcSimulatorBundle = B);
export {
  _ as EventBus,
  y as LogEngine,
  k as PollingEngine,
  M as ScenarioRunner,
  v as TriggerEngine,
  B as default,
  $ as diffAllLanes,
  g as diffLane
};
