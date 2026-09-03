import Fastify from "fastify";
import cors from "@fastify/cors";

export function buildServer() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true });
  app.get("/health", async () => ({ service: "paychad-api", status: "ok" }));
  return app;
}

const app = buildServer();
const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
