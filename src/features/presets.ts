export type VendorPresetId =
  | "MYSQL_DEBEZIUM"
  | "POSTGRES_LOGICAL"
  | "SQLSERVER_CDC"
  | "ORACLE_GG"
  | "MONGODB_STREAMS";

export type VendorPreset = {
  id: VendorPresetId;
  logLabel: string;
  busLabel: string;
  description: string;
  docsHint: string;
};

export const PRESETS: Record<VendorPresetId, VendorPreset> = {
  MYSQL_DEBEZIUM: {
    id: "MYSQL_DEBEZIUM",
    logLabel: "MySQL binlog",
    busLabel: "Kafka topic",
    description: "Snapshot then stream via Debezium connectors.",
    docsHint: "https://debezium.io/documentation/"
  },
  POSTGRES_LOGICAL: {
    id: "POSTGRES_LOGICAL",
    logLabel: "Postgres logical slot",
    busLabel: "Kafka topic",
    description: "Leverage logical decoding with pgoutput or wal2json.",
    docsHint: "https://www.postgresql.org/docs/current/logicaldecoding.html"
  },
  SQLSERVER_CDC: {
    id: "SQLSERVER_CDC",
    logLabel: "CDC tables",
    busLabel: "ETL pipeline",
    description: "Use SQL Server capture tables and export via agents.",
    docsHint: "https://learn.microsoft.com/sql/relational-databases/track-changes/about-change-data-capture-sql-server"
  },
  ORACLE_GG: {
    id: "ORACLE_GG",
    logLabel: "Redo / GoldenGate",
    busLabel: "GoldenGate trail",
    description: "GoldenGate captures redo logs for downstream replication.",
    docsHint: "https://docs.oracle.com/en/middleware/goldengate/"
  },
  MONGODB_STREAMS: {
    id: "MONGODB_STREAMS",
    logLabel: "Change stream",
    busLabel: "Driver subscriber",
    description: "Watch primary oplog tailing via MongoDB change streams.",
    docsHint: "https://www.mongodb.com/docs/manual/changeStreams/"
  }
};
