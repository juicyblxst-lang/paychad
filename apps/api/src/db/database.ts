import postgres from "postgres";

const DEFAULT_MAX_CONNECTIONS = 5;

const postgresTypes = {
  bigint: postgres.BigInt,
};

type DatabaseTypes = typeof postgresTypes;

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required for database operations");
  }
  return url;
}

export function createDatabase() {
  return postgres<DatabaseTypes>(getDatabaseUrl(), {
    max: DEFAULT_MAX_CONNECTIONS,
    prepare: true,
    types: postgresTypes,
    onnotice: () => undefined,
  });
}

export type Database = ReturnType<typeof createDatabase>;
