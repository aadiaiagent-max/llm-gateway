import type { ProviderAdapter, ProviderName } from "../types.js";

export class RoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutingError";
  }
}

export interface RouteDecision {
  provider: ProviderAdapter;
  reason: string;
}

/**
 * Prefer an explicit provider map by model; fall back across healthy providers.
 */
export class ModelRouter {
  private readonly byModel = new Map<string, ProviderAdapter[]>();

  constructor(private readonly providers: ProviderAdapter[]) {
    if (providers.length === 0) throw new Error("at least one provider required");
    for (const p of providers) {
      for (const model of p.models) {
        const list = this.byModel.get(model) ?? [];
        list.push(p);
        this.byModel.set(model, list);
      }
    }
  }

  route(model: string, preferred?: ProviderName): RouteDecision {
    const candidates = this.byModel.get(model);
    if (!candidates || candidates.length === 0) {
      throw new RoutingError(`no provider registered for model ${model}`);
    }
    if (preferred) {
      const hit = candidates.find((p) => p.name === preferred);
      if (hit) return { provider: hit, reason: `preferred:${preferred}` };
    }
    return { provider: candidates[0]!, reason: "primary" };
  }

  /** Round-robin-ish failover: try each candidate until one succeeds. */
  candidates(model: string): ProviderAdapter[] {
    const list = this.byModel.get(model);
    if (!list || list.length === 0) {
      throw new RoutingError(`no provider registered for model ${model}`);
    }
    return [...list];
  }
}
