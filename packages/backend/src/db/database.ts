import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Default path to the SQLite database file (packages/backend/data/toshik.db). */
const DEFAULT_DB_PATH = resolve(import.meta.dir, "../../data/toshik.db");

/**
 * Schema migrations applied in order.
 * Each migration has a unique version number and a SQL string.
 */
const MIGRATIONS: ReadonlyArray<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS conversations (
        id          TEXT PRIMARY KEY NOT NULL,
        title       TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS messages (
        id              TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        role            TEXT NOT NULL,
        content         TEXT NOT NULL DEFAULT '',
        timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
        tokens          INTEGER,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
        ON messages(conversation_id);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS attachments (
        id          TEXT PRIMARY KEY NOT NULL,
        message_id  TEXT NOT NULL,
        type        TEXT NOT NULL,
        name        TEXT NOT NULL DEFAULT '',
        file_path   TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_attachments_message_id
        ON attachments(message_id);
    `,
  },
];

/**
 * Open (or create) the SQLite database and run pending migrations.
 *
 * @param dbPath - path to the .db file (defaults to `data/toshik.db`).
 *                 Pass `:memory:` for an in-memory database (useful for tests).
 */
export function openDatabase(dbPath: string = DEFAULT_DB_PATH): Database {
  // Ensure the parent directory exists (skip for in-memory).
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance.
  db.exec("PRAGMA journal_mode = WAL");
  // Enforce foreign key constraints.
  db.exec("PRAGMA foreign_keys = ON");

  runMigrations(db);

  return db;
}

/**
 * Apply pending schema migrations.
 * Uses a simple `schema_version` table to track applied versions.
 */
function runMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const currentVersion = (
    db.query<{ max_v: number | null }, []>(
      "SELECT MAX(version) as max_v FROM schema_version",
    ).get() ?? { max_v: 0 }
  ).max_v ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;

    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(
        migration.version,
      );
    })();

    console.log(`[db] Applied migration v${migration.version}`);
  }
}

/** Re-export Database type for convenience. */
export type { Database };
