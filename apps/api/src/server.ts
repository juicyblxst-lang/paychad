import Fastify from "fastify";
import cors from "@fastify/cors";
import type { Database } from "./db/database";
import { ApiError, registerApiRoutes } from "./routes";

export function buildServer(db?: Database) {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true });
  app.get("/health", async () => ({ service: "paychad-api", status: db ? "ok" : "degraded" }));
  app.get("/ready", async (_request, reply) => {
    if (!db) return reply.code(503).send({ service: "paychad-api", status: "not_ready", code: "CONFIGURATION_ERROR" });
    try {
      await db`SELECT 1`;
      return { service: "paychad-api", status: "ready", database: "ok" };
    } catch {
      return reply.code(503).send({ service: "paychad-api", status: "not_ready", code: "DATABASE_ERROR" });
    }
  });
  registerApiRoutes(app, db);
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    app.log.error(error);
    return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  });
  return app;
}
