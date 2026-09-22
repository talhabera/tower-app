import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull(),
    errorKind: text("error_kind"),
    result: jsonb("result"),
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("audit_log_created_at_idx").on(t.createdAt)],
);

/** Tek satır (id = 1). */
export const backupPreset = pgTable("backup_preset", {
  id: integer("id").primaryKey(),
  frequency: text("frequency").notNull().default("0 3 * * *"),
  keepLocal: integer("keep_local").notNull().default(7),
  keepS3: integer("keep_s3").notNull().default(30),
  s3StorageUuid: text("s3_storage_uuid"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});
