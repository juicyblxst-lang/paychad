import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./database";

const MIGRATION_PATTERN = /^(\d{4}_[a-z0-9-]+)\.sql$/;
const MIGRATION_LOCK_KEY = 814233771;

interface MigrationFile {
  id: string;
  path: string;
  checksum: string;
}

async function loadMigrations(): Promise<MigrationFile[]> {
  const directory = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  const migrations: MigrationFile[] = [];

  for (const name of names) {
    const match = MIGRATION_PATTERN.exec(name);
    if (!match) {
      throw new Error(`Invalid migration filename: ${name}`);
    }

    const path = join(directory, name);
    const contents = await readFile(path, "utf8");
    migrations.push({
      id: match[1],
      path,
      checksum: createHash("sha256").update(contents).digest("hex"),
    });
  }

  return migrations;
}

export async function migrate(): Promise<void> {
  const sql = createDatabase();
  const migrations = await loadMigrations();

  try {
    for (const migration of migrations) {
      const contents = await readFile(migration.path, "utf8");

      await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`;
        await tx.unsafe(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            migration_id TEXT PRIMARY KEY,
            checksum TEXT NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `);

        const [applied] = await tx<{ checksum: string }[]>`
          SELECT checksum
          FROM schema_migrations
          WHERE migration_id = ${migration.id}
        `;

        if (applied) {
          if (applied.checksum !== migration.checksum) {
            throw new Error(`Migration checksum mismatch for ${migration.id}`);
          }
          return;
        }

        await tx.unsafe(contents);
        await tx`
          INSERT INTO schema_migrations (migration_id, checksum)
          VALUES (${migration.id}, ${migration.checksum})
        `;
      });

      console.log(`Applied migration ${migration.id}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
