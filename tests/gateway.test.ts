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

  it("skips unhealthy providers during cooldown", async () => {
    let t = 0;
    let flakyCalls = 0;
    const flaky = new MockProvider("flaky", ["shared"]);
    flaky.complete = async () => {
      flakyCalls += 1;
      throw new Error("upstream down");
    };
    const solid = new MockProvider("solid", ["shared"]);
    const gw = new Gateway({
      providers: [flaky, solid],
      rateLimitCapacity: 10,
      rateLimitRefillPerSecond: 10,
      unhealthyCooldownMs: 1000,
      now: () => t,
    });

    const first = await gw.chat({
      model: "shared",
      messages: [{ role: "user", content: "one" }],
    });
    expect(first.provider).toBe("solid");
    expect(flakyCalls).toBe(1);
    expect(gw.isUnhealthy("flaky")).toBe(true);

    const second = await gw.chat({
      model: "shared",
      messages: [{ role: "user", content: "two" }],
    });
    expect(second.provider).toBe("solid");
    expect(flakyCalls).toBe(1);

    t += 1000;
    expect(gw.isUnhealthy("flaky")).toBe(false);
  });

  it("enforces per-tenant rate limits with Retry-After headers", async () => {
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

    try {
      await gw.chat({
        model: "gpt-mini",
        messages: [{ role: "user", content: "three" }],
        tenantId: "t1",
      });
    } catch (err) {
      const rl = err as RateLimitError;
      const headers = rl.toHeaders();
      expect(headers["Retry-After"]).toBeDefined();
      expect(headers["X-RateLimit-Remaining"]).toBe("0");
      expect(gw.rateLimitHeaders("t1")["X-RateLimit-Remaining"]).toBe("0");
    }
  });

  it("filters usage by tenant and exports csv", async () => {
    const gw = new Gateway({
      providers: [new MockProvider("openai", ["gpt-mini"])],
      rateLimitCapacity: 10,
      rateLimitRefillPerSecond: 10,
    });
    await gw.chat({
      model: "gpt-mini",
      messages: [{ role: "user", content: "a" }],
      tenantId: "acme",
    });
    await gw.chat({
      model: "gpt-mini",
      messages: [{ role: "user", content: "b" }],
      tenantId: "beta",
    });
    expect(gw.usage.filter({ tenantId: "acme" })).toHaveLength(1);
    const csv = gw.usage.exportCsv({ tenantId: "acme" });
    expect(csv.split("\n")[0]).toContain("tenantId");
    expect(csv).toContain("acme");
    expect(csv).not.toContain("beta");
  });
});
