import { describe, expect, it } from "vitest";
import { MockProvider } from "../src/providers/MockProvider.js";
import { ModelRouter, RoutingError } from "../src/router/Router.js";

describe("ModelRouter", () => {
  it("routes to a provider that serves the model", () => {
    const openai = new MockProvider("openai", ["gpt-mini"]);
    const anthro = new MockProvider("anthropic", ["claude-haiku"]);
    const router = new ModelRouter([openai, anthro]);
    expect(router.route("gpt-mini").provider.name).toBe("openai");
    expect(router.route("claude-haiku").provider.name).toBe("anthropic");
  });

  it("honors preferred provider when available", () => {
    const a = new MockProvider("a", ["shared"]);
    const b = new MockProvider("b", ["shared"]);
    const router = new ModelRouter([a, b]);
    expect(router.route("shared", "b").provider.name).toBe("b");
  });

  it("throws when model is unknown", () => {
    const router = new ModelRouter([new MockProvider("x", ["m1"])]);
    expect(() => router.route("nope")).toThrow(RoutingError);
  });
});
