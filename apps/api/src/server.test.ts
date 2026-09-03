import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "./server";

describe("PayChad API", () => {
  const app = buildServer();

  afterEach(async () => {
    await app.close();
  });

  it("reports healthy", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ service: "paychad-api", status: "ok" });
  });
});
