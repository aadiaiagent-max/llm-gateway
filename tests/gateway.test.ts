import { describe, expect, it } from "vitest";
import { Gateway, RateLimitError } from "../src/server/Gateway.js";
import { MockProvider } from "../src/providers/MockProvider.js";

describe("Gateway", () => {
  it("routes and records usage", async () => {
    const gw = new Gateway({
      providers: [
        new MockProvider("openai", ["gpt-mini"]),
        new MockProvider("anthropic", ["claude-haiku"]),
      ],
      rateLimitCapacity: 10,
      rateLimitRefillPerSecond: 10,
    });
    const res = await gw.chat({
      model: "gpt-mini",
      messages: [{ role: "user", content: "hello" }],
      tenantId: "acme",
    });
    expect(res.provider).toBe("openai");
    expect(res.content).toContain("hello");
    const totals = gw.usage.totalsByTenant();
    expect(totals.acme?.requests).toBe(1);
    expect(totals.acme!.tokens).toBeGreaterThan(0);
  });

  it("fails over to next provider", async () => {
    const flaky = new MockProvider("flaky", ["shared"]);
    flaky.complete = async () => {
      throw new Error("upstream down");
    };
    const solid = new MockProvider("solid", ["shared"]);
    const gw = new Gateway({
      providers: [flaky, solid],
      rateLimitCapacity: 5,
      rateLimitRefillPerSecond: 5,
    });
    const res = await gw.chat({
      model: "shared",
      messages: [{ role: "user", content: "ping" }],
    });
    expect(res.provider).toBe("solid");
  });

  it("enforces per-tenant rate limits", async () => {
    let t = 0;
    const gw = new Gateway({
      providers: [new MockProvider("openai", ["gpt-mini"])],
      rateLimitCapacity: 1,
      rateLimitRefillPerSecond: 0.0001,
      now: () => t,
    });
    await gw.chat({
      model: "gpt-mini",
      messages: [{ role: "user", content: "one" }],
      tenantId: "t1",
    });
    await expect(
      gw.chat({
        model: "gpt-mini",
        messages: [{ role: "user", content: "two" }],
        tenantId: "t1",
      }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });
});
