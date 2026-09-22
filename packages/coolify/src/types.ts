import type { ResourceStatus } from "./status";

export type ResourceKind =
  | "application"
  | "service"
  | "postgresql"
  | "mysql"
  | "mariadb"
  | "mongodb"
  | "redis"
  | "keydb"
  | "dragonfly"
  | "clickhouse";

/**
 * Coolify environment cevabı kaynakları türe göre ayrı dizilerde döner.
 * Anahtar -> ResourceKind eşlemesi.
 */
export const RESOURCE_BUCKETS: Record<string, ResourceKind> = {
  applications: "application",
  services: "service",
  postgresqls: "postgresql",
  mysqls: "mysql",
  mariadbs: "mariadb",
  mongodbs: "mongodb",
  redis: "redis",
  keydbs: "keydb",
  dragonflies: "dragonfly",
  clickhouses: "clickhouse",
};

export type FleetServer = {
  uuid: string;
  name: string;
  reachable: boolean;
  usable: boolean;
};

export type FleetResource = {
  uuid: string;
  name: string;
  kind: ResourceKind;
  status: ResourceStatus;
  projectUuid: string;
  projectName: string;
  environmentName: string;
};

export type FleetEnvironment = {
  uuid: string;
  name: string;
  resources: FleetResource[];
  /** Ortam detayları alınamazsa dolu gelir; kaynaklar yine de render edilir. */
  failure?: string;
};

export type FleetProject = {
  uuid: string;
  name: string;
  environments: FleetEnvironment[];
  /** Bu projenin okunmasında hata oluştuysa dolu gelir; ağaç yine de render edilir. */
  failure?: string;
};

export type DatabaseBackup = {
  uuid: string;
  enabled: boolean;
  frequency: string;
  saveToS3: boolean;
};

export type DatabaseSummary = {
  uuid: string;
  name: string;
  status: ResourceStatus;
  backups: DatabaseBackup[];
};

export type S3Storage = {
  uuid: string;
  name: string;
  bucket: string;
  endpoint: string;
  usable: boolean;
};

export type EnvKey = {
  key: string;
  isBuildTime: boolean;
};

export type ApplicationDetail = {
  uuid: string;
  name: string;
  description: string;
  buildPack: string;
  gitRepository: string;
  gitBranch: string;
  /** Coolify tek alanda virgülle ayırır; burada liste olarak tutulur. */
  domains: string[];
  portsExposed: string;
  healthCheckEnabled: boolean;
  healthCheckPath: string;
  limitsMemory: string;
  limitsCpus: string;
  status: ResourceStatus;
};

export type DeploymentSummary = {
  uuid: string;
  applicationName: string;
  status: string;
  createdAt: string;
};
