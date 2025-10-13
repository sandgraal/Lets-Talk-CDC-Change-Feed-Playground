export type VendorPresetId =
  | "MYSQL_DEBEZIUM"
  | "POSTGRES_LOGICAL"
  | "SQLSERVER_CDC"
  | "ORACLE_GG"
  | "MONGODB_STREAMS";

export type VendorPresetMethodKey = "polling" | "trigger" | "log";

export type VendorPresetMethodCopy = {
  label?: string;
  laneDescription?: string;
  callout?: string;
  whenToUse?: string;
  tooltip?: string;
};

export type VendorPreset = {
  id: VendorPresetId;
  label: string;
  description: string;
  docsHint: string;
  sourceLabel: string;
  sourceTooltip: string;
  logLabel: string;
  logTooltip: string;
  busLabel: string;
  busTooltip: string;
  destinationLabel: string;
  destinationTooltip: string;
  topicFormat: (table: string) => string;
  methodCopyOverrides?: Partial<Record<VendorPresetMethodKey, VendorPresetMethodCopy>>;
};

export const PRESETS: Record<VendorPresetId, VendorPreset> = {
  MYSQL_DEBEZIUM: {
    id: "MYSQL_DEBEZIUM",
    label: "MySQL · Debezium · Kafka",
    description: "Debezium tails the MySQL binlog and pushes commits to Kafka for downstream consumers.",
    docsHint: "https://debezium.io/documentation/reference/stable/connectors/mysql.html",
    sourceLabel: "MySQL primary",
    sourceTooltip: "InnoDB workload emitting row-level changes for capture.",
    logLabel: "MySQL binlog (Debezium)",
    logTooltip: "Debezium connector streams row-format binlog entries in commit order.",
    busLabel: "Kafka topic",
    busTooltip: "Kafka transports Debezium change events (e.g. db.orders) to consumers.",
    destinationLabel: "Warehouse / downstream sink",
    destinationTooltip: "Analytics warehouse, service, or cache subscribing to the Kafka topic.",
    topicFormat: table => `db.${table}`,
    methodCopyOverrides: {
      polling: {
        label: "Polling (scheduled SQL)",
        laneDescription: "Batch jobs diff the MySQL table on an interval to detect divergence.",
        callout: "Misses hard deletes and rapid updates without custom tracking tables.",
        whenToUse: "Fallback when binlog access is blocked. Accepts lag and data loss for small tables only.",
        tooltip: "ETL-style SELECT polling against the MySQL primary.",
      },
      trigger: {
        label: "Triggers (audit table)",
        laneDescription: "AFTER triggers write every mutation into an audit table for downstream extract.",
        callout: "Adds synchronous latency on the write path and increases operational overhead.",
        whenToUse: "When connectors are unavailable but you still need complete change history.",
        tooltip: "MySQL triggers populate audit tables that an extractor drains.",
      },
      log: {
        label: "Debezium binlog tail",
        laneDescription: "Debezium streams row-based binlog events into Kafka with schema evolution support.",
        callout: "Preferred default: low-impact, ordered, near real-time change capture.",
        whenToUse: "Standard choice for production MySQL workloads when Kafka + Debezium are available.",
        tooltip: "Debezium connector tailing the MySQL binlog.",
      },
    },
  },
  POSTGRES_LOGICAL: {
    id: "POSTGRES_LOGICAL",
    label: "Postgres · Logical decoding · Kafka",
    description: "Logical decoding streams Postgres WAL changes (pgoutput/wal2json) into Kafka.",
    docsHint: "https://www.postgresql.org/docs/current/logicaldecoding.html",
    sourceLabel: "Postgres primary",
    sourceTooltip: "OLTP Postgres emitting WAL entries for publications.",
    logLabel: "Logical replication slot",
    logTooltip: "Logical decoding slot materialises committed WAL changes via pgoutput or wal2json.",
    busLabel: "Kafka topic",
    busTooltip: "Kafka topics per publication (e.g. public.orders) fan out change events.",
    destinationLabel: "Warehouse / downstream sink",
    destinationTooltip: "Consumers applying logical changes into warehouses or services.",
    topicFormat: table => `public.${table}`,
    methodCopyOverrides: {
      polling: {
        label: "Polling (snapshot queries)",
        laneDescription: "Incremental SELECT queries compare current rows to previous snapshots.",
        callout: "Can't observe deletes or mid-transaction updates without tombstone columns.",
        whenToUse: "Stopgap for small tables when logical replication isn't permitted.",
        tooltip: "Periodic comparison queries against Postgres source tables.",
      },
      trigger: {
        label: "Triggers (audit schema)",
        laneDescription: "Triggers populate audit tables that an extractor tails outside the WAL.",
        callout: "Higher write amplification and maintenance across replicas.",
        whenToUse: "When WAL access is off-limits yet complete history is required.",
        tooltip: "AFTER triggers write into audit tables for downstream capture.",
      },
      log: {
        label: "Logical decoding stream",
        laneDescription: "Slot-based logical decoding streams ordered WAL changes through Kafka.",
        callout: "Best balance: ordered, low-impact capture with schema evolution support.",
        whenToUse: "Primary choice when you can run wal2json/pgoutput connectors.",
        tooltip: "Logical replication slot feeding Kafka via connectors.",
      },
    },
  },
  SQLSERVER_CDC: {
    id: "SQLSERVER_CDC",
    label: "SQL Server · CDC tables · ETL",
    description: "SQL Server CDC populates change tables that ETL tools ship downstream.",
    docsHint: "https://learn.microsoft.com/sql/relational-databases/track-changes/about-change-data-capture-sql-server",
    sourceLabel: "SQL Server OLTP",
    sourceTooltip: "Source database with CDC enabled on tracked tables.",
    logLabel: "CDC change tables",
    logTooltip: "Log reader agent populates [cdc].[schema_table_CT] from the transaction log.",
    busLabel: "ETL pipeline",
    busTooltip: "ADF/SSIS or similar ETL pipelines move captured rows to consumers.",
    destinationLabel: "Warehouse / downstream sink",
    destinationTooltip: "Lakehouse, staging DB, or microservice applying captured rows.",
    topicFormat: table => `cdc.${table}_ct`,
    methodCopyOverrides: {
      polling: {
        label: "Polling (T-SQL jobs)",
        laneDescription: "Scheduled queries compare source tables against a shadow copy.",
        callout: "Hard deletes vanish and rapid updates collapse to last-write wins.",
        whenToUse: "Only when CDC can't be enabled. Expect drift and operational overhead.",
        tooltip: "Agent jobs issuing SELECT deltas against the primary.",
      },
      trigger: {
        label: "DB triggers (audit tables)",
        laneDescription: "DDL-driven triggers write into audit tables that ETL picks up.",
        callout: "Adds synchronous writes and complicates deployments.",
        whenToUse: "Fallback for editions without CDC but needing full fidelity.",
        tooltip: "FOR INSERT/UPDATE/DELETE triggers persisting rows into audit tables.",
      },
      log: {
        label: "CDC change table stream",
        laneDescription: "Native CDC surfaces ordered change rows ready for downstream ETL.",
        callout: "Balanced approach: leverages log reader agent with minimal code.",
        whenToUse: "Default when SQL Server Enterprise/Standard CDC is available.",
        tooltip: "Change Data Capture tables populated by the log reader agent.",
      },
    },
  },
  ORACLE_GG: {
    id: "ORACLE_GG",
    label: "Oracle · GoldenGate",
    description: "GoldenGate extracts Oracle redo into trails that replicat apply downstream.",
    docsHint: "https://docs.oracle.com/en/middleware/goldengate/",
    sourceLabel: "Oracle primary",
    sourceTooltip: "Oracle Database generating redo entries for tracked schemas.",
    logLabel: "Redo / GoldenGate trail",
    logTooltip: "Extract captures redo logs into GoldenGate trail files.",
    busLabel: "GoldenGate distribution",
    busTooltip: "GoldenGate distribution path replicates changes to targets or Kafka.",
    destinationLabel: "Replica / downstream sink",
    destinationTooltip: "Target database, cache, or Kafka topic consuming GoldenGate trails.",
    topicFormat: table => `ogg.${table}`,
    methodCopyOverrides: {
      polling: {
        label: "Polling (custom jobs)",
        laneDescription: "Scripts query Oracle tables for deltas outside of GoldenGate.",
        callout: "Expensive and incomplete without change tracking columns.",
        whenToUse: "Rare stopgap for small tables when GoldenGate access is unavailable.",
        tooltip: "Ad-hoc jobs diffing source tables over DB links or snapshots.",
      },
      trigger: {
        label: "Triggers (shadow tables)",
        laneDescription: "Row-level triggers populate shadow tables for downstream capture.",
        callout: "Adds redo volume and requires meticulous deployment management.",
        whenToUse: "Fallback when GoldenGate licensing or access is restricted.",
        tooltip: "Oracle triggers mirroring mutations into custom staging tables.",
      },
      log: {
        label: "GoldenGate redo tail",
        laneDescription: "GoldenGate Extract/Replicat stream redo into ordered trail files.",
        callout: "Enterprise-grade: minimal source impact with robust replication semantics.",
        whenToUse: "Primary approach for Oracle sources requiring guaranteed replication.",
        tooltip: "GoldenGate Extract reading redo logs into trail files.",
      },
    },
  },
  MONGODB_STREAMS: {
    id: "MONGODB_STREAMS",
    label: "MongoDB · Change Streams",
    description: "Change Streams tail the MongoDB oplog and push updates to subscribers.",
    docsHint: "https://www.mongodb.com/docs/manual/changeStreams/",
    sourceLabel: "MongoDB replica set",
    sourceTooltip: "Replica set primary emitting operations into the oplog.",
    logLabel: "Change stream (oplog)",
    logTooltip: "Change Stream cursor streams oplog events filtered per namespace.",
    busLabel: "Driver subscriber",
    busTooltip: "Driver / connector pushes stream events to downstream sinks (Kafka/Atlas).",
    destinationLabel: "Streaming sink",
    destinationTooltip: "Analytical store or service consuming the stream.",
    topicFormat: table => `mongo.${table}`,
    methodCopyOverrides: {
      polling: {
        label: "Polling (find queries)",
        laneDescription: "Scheduled queries diff collections by last-updated timestamps.",
        callout: "No delete visibility and heavy load for high-churn collections.",
        whenToUse: "Only for prototypes without Change Stream or oplog access.",
        tooltip: "find() queries scanning for updated documents on an interval.",
      },
      trigger: {
        label: "Hooks (side-write)",
        laneDescription: "Application-layer hooks write audit documents alongside originals.",
        callout: "Requires app changes and doubles write throughput.",
        whenToUse: "When database triggers/log access is unavailable and app control exists.",
        tooltip: "Custom middleware duplicating writes into audit collections.",
      },
      log: {
        label: "Change Stream tail",
        laneDescription: "Native Change Stream cursor fans out oplog events in order.",
        callout: "Recommended: low-latency stream with resume tokens and schema support.",
        whenToUse: "Default for MongoDB replicas when you can open a Change Stream cursor.",
        tooltip: "MongoDB Change Stream subscription on the oplog.",
      },
    },
  },
};
