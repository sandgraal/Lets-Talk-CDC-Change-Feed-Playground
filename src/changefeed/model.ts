import { nanoid } from "../utils/nanoid";

export type ApplyPolicy = "apply-on-commit" | "apply-as-polled";

export type ChangeEvent<RowType = Record<string, any>> = {
  txId: string;
  lsn: number;
  commitTs: number;
  type: "insert" | "update" | "delete" | "schema";
  table: string;
  pk: string;
  before: RowType | null;
  after: RowType | null;
  schemaVersion: number;
  partition?: number;
  offset?: number;
  index: number;
  total: number;
  availableAt: number;
};

export type SourceRow = {
  table: string;
  id: string;
  data: Record<string, any>;
};

export type PlaygroundOptions = {
  partitions: number;
  commitDrift: boolean;
  schemaDrift: boolean;
  dropProbability: number;
  applyPolicy: ApplyPolicy;
  projectSchemaDrift: boolean;
  maxApplyPerTick: number;
};

export type PlaygroundState = {
  clockMs: number;
  lsn: number;
  schemaVersion: number;
  options: PlaygroundOptions;
  source: {
    rows: SourceRow[];
    log: ChangeEvent[];
  };
  broker: {
    partitions: ChangeEvent[][];
    dropped: number;
  };
  consumer: {
    tables: Record<string, Record<string, any>>;
    buffered: Record<string, { events: ChangeEvent[]; total: number; commitTs: number; lsn: number }>;
    ready: { events: ChangeEvent[]; commitTs: number; lsn: number }[];
    lastAppliedCommitTs: number;
    appliedLog: ChangeEvent[];
  };
  metrics: {
    latestCommitTs: number;
  };
};

export type PlaygroundAction =
  | { type: "seed" }
  | { type: "insertCustomers"; count?: number }
  | { type: "placeOrder"; items?: number }
  | { type: "updateCustomer"; tier?: string; commitTs?: number; id?: string }
  | { type: "deleteCustomer" }
  | { type: "injectBacklog"; count: number }
  | { type: "tick"; deltaMs?: number }
  | { type: "setApplyPolicy"; policy: ApplyPolicy }
  | { type: "toggleCommitDrift"; enabled: boolean }
  | { type: "toggleSchemaDrift"; enabled: boolean }
  | { type: "setDropProbability"; probability: number }
  | { type: "setProjectSchemaDrift"; project: boolean }
  | { type: "setMaxApply"; maxApplyPerTick: number }
  | { type: "reset" };

const DEFAULT_OPTIONS: PlaygroundOptions = {
  partitions: 3,
  commitDrift: false,
  schemaDrift: false,
  dropProbability: 0,
  applyPolicy: "apply-on-commit",
  projectSchemaDrift: true,
  maxApplyPerTick: 4,
};

const DEFAULT_COLUMNS = ["id", "email", "name", "tier"] as const;
const SCHEMA_DRIFT_COLUMN = "priority_flag";

const hash = (input: string): number => {
  let acc = 0;
  for (let i = 0; i < input.length; i += 1) {
    acc = (acc * 31 + input.charCodeAt(i)) % 9973;
  }
  return acc;
};

const shouldDrop = (lsn: number, probability: number) => {
  if (probability <= 0) return false;
  const scaled = Math.floor(probability * 100);
  return (hash(String(lsn)) % 100) < scaled;
};

const partitionForKey = (pk: string, partitions: number) => {
  if (partitions <= 1) return 0;
  return hash(pk) % partitions;
};

const applyRowChange = (row: Record<string, any> | undefined, event: ChangeEvent, projectSchemaDrift: boolean) => {
  if (event.type === "delete") return undefined;

  const next: Record<string, any> = { ...(row ?? {}), ...(event.after ?? {}) };

  if (!projectSchemaDrift && SCHEMA_DRIFT_COLUMN in next) {
    delete next[SCHEMA_DRIFT_COLUMN];
  }

  return next;
};

const applyEventToConsumer = (tables: Record<string, Record<string, any>>, event: ChangeEvent, projectSchemaDrift: boolean) => {
  const table = tables[event.table] ?? {};
  const current = table[event.pk];
  const next = applyRowChange(current, event, projectSchemaDrift);
  const nextTable = { ...table };
  if (next) {
    nextTable[event.pk] = next;
  } else {
    delete nextTable[event.pk];
  }
  return { ...tables, [event.table]: nextTable };
};

const enqueueTransaction = (state: PlaygroundState, events: ChangeEvent[]): PlaygroundState => {
  let next = state;
  let partitions = state.broker.partitions.map(queue => [...queue]);
  for (const evt of events) {
    const partition = partitionForKey(evt.pk, state.options.partitions);
    const driftOffset = state.options.commitDrift ? hash(`${evt.txId}:${evt.index}`) % 2 : 0;
    const queue = [...partitions[partition]];
    const insertAt = state.options.commitDrift ? 0 : queue.length;
    queue.splice(insertAt, 0, {
      ...evt,
      partition,
      offset: insertAt,
      availableAt: state.clockMs + driftOffset * 50,
    });
    partitions[partition] = queue;
    next = {
      ...next,
      metrics: {
        ...next.metrics,
        latestCommitTs: Math.max(next.metrics.latestCommitTs, evt.commitTs),
      },
    };
  }

  return {
    ...next,
    broker: {
      ...next.broker,
      partitions,
    },
  };
};

const applyReadyTransactions = (state: PlaygroundState, readyEvents: ChangeEvent[]): PlaygroundState => {
  let consumer: PlaygroundState["consumer"] = {
    ...state.consumer,
    buffered: { ...state.consumer.buffered },
  };
  const newlyReady: PlaygroundState["consumer"]["ready"] = [];

  for (const event of readyEvents) {
    const existing = consumer.buffered[event.txId];
    const buffered = existing
      ? { ...existing, events: [...existing.events, event] }
      : { events: [event], total: event.total, commitTs: event.commitTs, lsn: event.lsn };

    if (state.options.applyPolicy === "apply-as-polled") {
      consumer.tables = applyEventToConsumer(consumer.tables, event, state.options.projectSchemaDrift);
      consumer.appliedLog = [...consumer.appliedLog, event];
      consumer.lastAppliedCommitTs = Math.max(consumer.lastAppliedCommitTs, event.commitTs);
      const shouldDropBuffer = buffered.events.length >= buffered.total;
      consumer.buffered = shouldDropBuffer
        ? Object.fromEntries(Object.entries(consumer.buffered).filter(([tx]) => tx !== event.txId))
        : { ...consumer.buffered, [event.txId]: buffered };
      continue;
    }

    const nextBuffered = { ...consumer.buffered, [event.txId]: buffered };
    if (buffered.events.length >= buffered.total) {
      newlyReady.push({
        events: [...buffered.events].sort((a, b) => a.index - b.index),
        commitTs: buffered.commitTs,
        lsn: buffered.lsn,
      });
      const { [event.txId]: _removed, ...rest } = nextBuffered;
      consumer.buffered = rest;
    } else {
      consumer.buffered = nextBuffered;
    }
  }

  if (state.options.applyPolicy === "apply-on-commit") {
    const ready = [...consumer.ready, ...newlyReady];
    const pendingCommitCandidates = [
      ...ready.map(tx => tx.commitTs),
      ...Object.values(consumer.buffered).map(buf => buf.commitTs),
      ...state.broker.partitions.flat().map(evt => evt.commitTs),
    ];
    const floorCommitTs = pendingCommitCandidates.length > 0 ? Math.min(...pendingCommitCandidates) : Infinity;
    const eligible = ready
      .filter(tx => tx.commitTs <= floorCommitTs)
      .sort((a, b) => (a.commitTs === b.commitTs ? a.lsn - b.lsn : a.commitTs - b.commitTs));
    const slice = eligible.slice(0, state.options.maxApplyPerTick);

    let tables = { ...consumer.tables };
    for (const tx of slice) {
      for (const event of tx.events) {
        tables = applyEventToConsumer(tables, event, state.options.projectSchemaDrift);
      }
      consumer.appliedLog = [...consumer.appliedLog, ...tx.events];
      consumer.lastAppliedCommitTs = Math.max(consumer.lastAppliedCommitTs, tx.commitTs);
    }

    const remainingReady = ready.filter(tx => !slice.includes(tx));
    consumer = {
      ...consumer,
      tables,
      ready: remainingReady,
    };
  }

  return {
    ...state,
    consumer,
    metrics: {
      ...state.metrics,
    },
  };
};

const pollBroker = (state: PlaygroundState): { nextState: PlaygroundState; delivered: ChangeEvent[] } => {
  const partitions = state.broker.partitions.map(queue => [...queue]);
  const delivered: ChangeEvent[] = [];
  const maxToDeliver = state.options.maxApplyPerTick * state.options.partitions + state.options.maxApplyPerTick;
  for (let idx = 0; idx < partitions.length; idx += 1) {
    const queue = partitions[idx];
    let consumed = 0;
    while (queue.length > 0 && queue[0].availableAt <= state.clockMs && delivered.length < maxToDeliver && consumed < state.options.maxApplyPerTick) {
      const evt = queue.shift()!;
      consumed += 1;
      if (shouldDrop(evt.lsn, state.options.dropProbability)) {
        continue;
      }
      delivered.push(evt);
    }
    partitions[idx] = queue;
  }

  return {
    nextState: {
      ...state,
      broker: {
        ...state.broker,
        partitions,
      },
    },
    delivered,
  };
};

const createEvent = (state: PlaygroundState, table: string, type: ChangeEvent["type"], pk: string, after: Record<string, any> | null, before?: Record<string, any> | null, txMeta?: { txId?: string; commitTs?: number; total?: number; index?: number }): { event: ChangeEvent; nextState: PlaygroundState } => {
  const txId = txMeta?.txId ?? nanoid();
  const commitTs = txMeta?.commitTs ?? state.clockMs + 100;
  const nextLsn = state.lsn + 1;
  const total = txMeta?.total ?? 1;
  const index = txMeta?.index ?? 0;
  return {
    event: {
      txId,
      lsn: nextLsn,
      commitTs,
      type,
      table,
      pk,
      before: before ?? null,
      after,
      schemaVersion: state.schemaVersion,
      index,
      total,
      availableAt: state.clockMs,
    },
    nextState: { ...state, lsn: nextLsn, metrics: { ...state.metrics, latestCommitTs: Math.max(state.metrics.latestCommitTs, commitTs) } },
  };
};

const upsertSourceRow = (state: PlaygroundState, table: string, row: Record<string, any>) => {
  const rows = [...state.source.rows.filter(r => !(r.table === table && r.id === row.id)), { table, id: row.id, data: row }];
  return { ...state, source: { ...state.source, rows } };
};

const deleteSourceRow = (state: PlaygroundState, table: string, pk: string) => {
  const rows = state.source.rows.filter(r => !(r.table === table && r.id === pk));
  return { ...state, source: { ...state.source, rows } };
};

const seedRows = (): SourceRow[] => [
  { table: "customers", id: "C-100", data: { id: "C-100", email: "ada@example.com", name: "Ada Lovelace", tier: "gold" } },
  { table: "customers", id: "C-200", data: { id: "C-200", email: "lin@example.com", name: "Lin Cheng", tier: "silver" } },
  { table: "orders", id: "O-500", data: { id: "O-500", customer_id: "C-100", status: "processing" } },
];

export const createInitialState = (options?: Partial<PlaygroundOptions>): PlaygroundState => ({
  clockMs: 0,
  lsn: 0,
  schemaVersion: 1,
  options: { ...DEFAULT_OPTIONS, ...options },
  source: {
    rows: seedRows(),
    log: [],
  },
  broker: { partitions: Array.from({ length: options?.partitions ?? DEFAULT_OPTIONS.partitions }, () => []), dropped: 0 },
  consumer: { tables: {}, buffered: {}, ready: [], lastAppliedCommitTs: 0, appliedLog: [] },
  metrics: { latestCommitTs: 0 },
});

const captureEvents = (state: PlaygroundState, events: ChangeEvent[]) => ({
  ...state,
  source: { ...state.source, log: [...state.source.log, ...events] },
});

const withSchemaDrift = (state: PlaygroundState, base: Record<string, any>) => {
  if (!state.options.schemaDrift) return base;
  return { ...base, [SCHEMA_DRIFT_COLUMN]: true };
};

const generateCustomerInsert = (state: PlaygroundState, idSuffix: number) => {
  const id = `C-${500 + idSuffix}`;
  const base = { id, email: `user${idSuffix}@example.com`, name: `Customer ${idSuffix}`, tier: idSuffix % 2 === 0 ? "gold" : "silver" };
  const payload = withSchemaDrift(state, base);
  return createEvent(state, "customers", "insert", id, payload);
};

const generateOrderWithItems = (state: PlaygroundState, customerId: string, itemCount: number) => {
  const txId = nanoid();
  const commitTs = state.clockMs + 120;
  const total = 1 + itemCount;
  const orderId = `O-${800 + state.lsn}`;
  let next = state;
  const { event: orderEvt, nextState: s1 } = createEvent(next, "orders", "insert", orderId, withSchemaDrift(next, { id: orderId, customer_id: customerId, status: "created" }), null, {
    txId,
    commitTs,
    total,
    index: 0,
  });
  next = s1;
  const events = [orderEvt];
  for (let i = 0; i < itemCount; i += 1) {
    const { event, nextState } = createEvent(next, "order_items", "insert", `${orderId}-ITEM-${i + 1}`, withSchemaDrift(next, { id: `${orderId}-ITEM-${i + 1}`, order_id: orderId, sku: `SKU-${i + 1}`, qty: 1 }), null, {
      txId,
      commitTs,
      total,
      index: i + 1,
    });
    next = nextState;
    events.push(event);
  }
  return { events, nextState: next };
};

const deriveLag = (state: PlaygroundState) => {
  const lagMs =
    state.consumer.lastAppliedCommitTs > 0
      ? Math.max(0, state.metrics.latestCommitTs - state.consumer.lastAppliedCommitTs)
      : 0;
  const backlog = state.broker.partitions.reduce((acc, q) => acc + q.length, 0) + Object.values(state.consumer.buffered).reduce((acc, buf) => acc + buf.events.length, 0) + state.consumer.ready.reduce((acc, tx) => acc + tx.events.length, 0);
  return { lagMs, backlog };
};

// Helper function to apply all ready transactions
function applyAllReadyTransactions(state: PlaygroundState): PlaygroundState {
  let tables = { ...state.consumer.tables };
  let appliedLog = [...state.consumer.appliedLog];
  let lastAppliedCommitTs = state.consumer.lastAppliedCommitTs;

  for (const tx of state.consumer.ready) {
    for (const evt of tx.events) {
      tables = applyEventToConsumer(tables, evt, state.options.projectSchemaDrift);
    }
    appliedLog = [...appliedLog, ...tx.events];
    lastAppliedCommitTs = Math.max(lastAppliedCommitTs, tx.commitTs);
  }

  return {
    ...state,
    consumer: {
      ...state.consumer,
      tables,
      ready: [],
      buffered: {},
      appliedLog,
      lastAppliedCommitTs,
    },
  };
}

export const reducePlayground = (state: PlaygroundState, action: PlaygroundAction): PlaygroundState => {
  switch (action.type) {
    case "reset":
      return createInitialState({ ...state.options });
    case "seed":
      return createInitialState({ ...state.options });
    case "setApplyPolicy": {
      // Drain/apply all ready transactions before switching policy
      let nextState = applyAllReadyTransactions(state);
      // Optionally, could also drain buffered transactions if desired
      return { ...nextState, options: { ...nextState.options, applyPolicy: action.policy }, consumer: { ...nextState.consumer, buffered: {}, ready: [] } };
    }
    case "setDropProbability":
      return { ...state, options: { ...state.options, dropProbability: action.probability } };
    case "toggleCommitDrift":
      return { ...state, options: { ...state.options, commitDrift: action.enabled } };
    case "toggleSchemaDrift":
      return { ...state, options: { ...state.options, schemaDrift: action.enabled }, schemaVersion: action.enabled ? state.schemaVersion + 1 : state.schemaVersion };
    case "setProjectSchemaDrift":
      return { ...state, options: { ...state.options, projectSchemaDrift: action.project } };
    case "setMaxApply":
      return { ...state, options: { ...state.options, maxApplyPerTick: action.maxApplyPerTick } };
    case "insertCustomers": {
      let next = state;
      const events: ChangeEvent[] = [];
      const count = action.count ?? 1;
      for (let i = 0; i < count; i += 1) {
        const { event, nextState } = generateCustomerInsert(next, i + 1 + state.source.rows.length);
        next = upsertSourceRow(nextState, "customers", event.after ?? {});
        events.push(event);
      }
      next = captureEvents(next, events);
      return enqueueTransaction(next, events);
    }
    case "placeOrder": {
      const customerId = state.source.rows.find(r => r.table === "customers")?.id ?? "C-100";
      const itemCount = action.items ?? 2;
      const { events, nextState } = generateOrderWithItems(state, customerId, itemCount);
      let next = nextState;
      for (const evt of events) {
        next = upsertSourceRow(next, evt.table, evt.after ?? {});
      }
      next = captureEvents(next, events);
      return enqueueTransaction(next, events);
    }
    case "updateCustomer": {
      const target = state.source.rows.find(r => r.table === "customers" && (!action.id || r.id === action.id));
      if (!target) return state;
      const payload = withSchemaDrift(state, {
        ...target.data,
        tier: action.tier ?? (target.data.tier === "gold" ? "platinum" : "gold"),
      });
      const commitTs = action.commitTs ?? state.clockMs + 100;
      const { event, nextState } = createEvent(state, "customers", "update", target.id, payload, target.data, {
        txId: nanoid(),
        commitTs,
      });
      const updated = upsertSourceRow(nextState, "customers", payload);
      const captured = captureEvents(updated, [event]);
      return enqueueTransaction(captured, [event]);
    }
    case "deleteCustomer": {
      const target = state.source.rows.find(r => r.table === "customers");
      if (!target) return state;
      const { event, nextState } = createEvent(state, "customers", "delete", target.id, null, target.data, { txId: nanoid() });
      const removed = deleteSourceRow(nextState, "customers", target.id);
      const captured = captureEvents(removed, [event]);
      return enqueueTransaction(captured, [event]);
    }
    case "injectBacklog": {
      let next = state;
      const events: ChangeEvent[] = [];
      for (let i = 0; i < action.count; i += 1) {
        const { event, nextState } = generateCustomerInsert(next, i + 1000 + state.source.rows.length);
        next = upsertSourceRow(nextState, "customers", event.after ?? {});
        events.push(event);
      }
      next = captureEvents(next, events);
      return enqueueTransaction(next, events);
    }
    case "tick": {
      const delta = action.deltaMs ?? 50;
      let ticked = { ...state, clockMs: state.clockMs + delta };
      const { nextState, delivered } = pollBroker(ticked);
      ticked = nextState;
      ticked = applyReadyTransactions(ticked, delivered);
      return ticked;
    }
    default:
      return state;
  }
};

export const selectLanes = (state: PlaygroundState) => {
  const { lagMs, backlog } = deriveLag(state);
  return {
    source: state.source,
    broker: state.broker,
    consumer: state.consumer,
    options: state.options,
    metrics: { ...state.metrics, lagMs, backlog },
  };
};

export const PROJECTED_COLUMNS = [...DEFAULT_COLUMNS, SCHEMA_DRIFT_COLUMN];
