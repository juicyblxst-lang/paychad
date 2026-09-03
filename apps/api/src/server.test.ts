import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "./server";

describe("PayChad API", () => {
  const app = buildServer();

  afterEach(async () => {
    await app.close();
  });

  it("reports liveness without a database", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ service: "paychad-api", status: "degraded" });
  });

  it("reports database readiness as unavailable when database is not configured", async () => {
    const response = await app.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ service: "paychad-api", status: "not_ready", code: "CONFIGURATION_ERROR" });
  });
});
