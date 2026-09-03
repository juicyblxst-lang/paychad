import Fastify from "fastify";
import cors from "@fastify/cors";

export function buildServer() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true });
  app.get("/health", async () => ({ service: "paychad-api", status: "ok" }));
  return app;
}
