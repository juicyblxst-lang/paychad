import { createDatabase } from "./db/database";
import { buildServer } from "./server";

const db = process.env.DATABASE_URL ? createDatabase() : undefined;
const app = buildServer(db);
const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: "0.0.0.0" }).catch(async (error) => {
  app.log.error(error);
  if (db) await db.end({ timeout: 5 }).catch(() => undefined);
  process.exit(1);
});

const shutdown = async () => {
  await app.close();
  if (db) await db.end({ timeout: 5 });
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
