import { ModelRouter } from "../router/Router.js";
import { TenantRateLimiter, RateLimitError } from "../ratelimit/TokenBucket.js";
import { UsageLog } from "../usage/UsageLog.js";
import type {
  ChatRequest,
  ChatResponse,
  ProviderAdapter,
  ProviderName,
} from "../types.js";

export interface GatewayOptions {
  providers: ProviderAdapter[];
  /** Requests per tenant before refill. */
  rateLimitCapacity?: number;
  /** Tokens refilled per second per tenant. */
  rateLimitRefillPerSecond?: number;
  /** Skip a provider after failure for this many ms. Default: 30_000. */
  unhealthyCooldownMs?: number;
  now?: () => number;
}

export class Gateway {
  private readonly router: ModelRouter;
  private readonly limiter: TenantRateLimiter;
  readonly usage = new UsageLog();
  private readonly now: () => number;
  private readonly unhealthyCooldownMs: number;
  private readonly unhealthyUntil = new Map<ProviderName, number>();

  constructor(opts: GatewayOptions) {
    this.router = new ModelRouter(opts.providers);
    this.limiter = new TenantRateLimiter(
      opts.rateLimitCapacity ?? 10,
      opts.rateLimitRefillPerSecond ?? 1,
      opts.now,
    );
    this.now = opts.now ?? (() => Date.now());
    this.unhealthyCooldownMs = opts.unhealthyCooldownMs ?? 30_000;
  }

  /** Current rate-limit headers for a tenant (Limit / Remaining / Retry-After). */
  rateLimitHeaders(tenantId: string): Record<string, string> {
    return this.limiter.rateLimitHeaders(tenantId);
  }

  isUnhealthy(provider: ProviderName): boolean {
    const until = this.unhealthyUntil.get(provider);
    if (until === undefined) return false;
    if (this.now() >= until) {
      this.unhealthyUntil.delete(provider);
      return false;
    }
    return true;
  }

  markUnhealthy(provider: ProviderName): void {
    this.unhealthyUntil.set(provider, this.now() + this.unhealthyCooldownMs);
  }

  async chat(
    req: ChatRequest,
    opts?: { preferredProvider?: ProviderName },
  ): Promise<ChatResponse> {
    const tenantId = req.tenantId ?? "anonymous";
    const started = this.now();

    try {
      this.limiter.take(tenantId);
    } catch (err) {
      this.usage.record({
        at: started,
        tenantId,
        provider: "none",
        model: req.model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: this.now() - started,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const candidates = this.router
      .candidates(req.model)
      .filter((p) => !this.isUnhealthy(p.name));

    if (candidates.length === 0) {
      const err = new Error(`no healthy providers for model ${req.model}`);
      this.usage.record({
        at: started,
        tenantId,
        provider: "none",
        model: req.model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: this.now() - started,
        ok: false,
        error: err.message,
      });
      throw err;
    }

    if (opts?.preferredProvider) {
      candidates.sort((a, b) => {
        if (a.name === opts.preferredProvider) return -1;
        if (b.name === opts.preferredProvider) return 1;
        return 0;
      });
    }

    let lastError: unknown;
    for (const provider of candidates) {
      try {
        const res = await provider.complete(req);
        this.usage.record({
          at: started,
          tenantId,
          provider: provider.name,
          model: req.model,
          promptTokens: res.usage.promptTokens,
          completionTokens: res.usage.completionTokens,
          totalTokens: res.usage.totalTokens,
          latencyMs: this.now() - started,
          ok: true,
        });
        return res;
      } catch (err) {
        lastError = err;
        this.markUnhealthy(provider.name);
      }
    }

    this.usage.record({
      at: started,
      tenantId,
      provider: "none",
      model: req.model,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: this.now() - started,
      ok: false,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });
    throw lastError instanceof Error
      ? lastError
      : new Error("all providers failed");
  }
}

export { RateLimitError };
