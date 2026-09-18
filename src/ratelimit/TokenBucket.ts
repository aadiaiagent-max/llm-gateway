export class RateLimitError extends Error {
  readonly remaining: number;
  readonly retryAfterMs: number;
  readonly limit: number;

  constructor(
    message = "rate limit exceeded",
    opts: { remaining?: number; retryAfterMs?: number; limit?: number } = {},
  ) {
    super(message);
    this.name = "RateLimitError";
    this.remaining = opts.remaining ?? 0;
    this.retryAfterMs = opts.retryAfterMs ?? 0;
    this.limit = opts.limit ?? 0;
  }

  /** Headers suitable for an HTTP 429 response. */
  toHeaders(): Record<string, string> {
    const retryAfterSec = Math.max(1, Math.ceil(this.retryAfterMs / 1000));
    return {
      "Retry-After": String(retryAfterSec),
      "X-RateLimit-Limit": String(this.limit),
      "X-RateLimit-Remaining": String(Math.max(0, Math.floor(this.remaining))),
    };
  }
}

/** Simple token bucket rate limiter. */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    now: () => number = () => Date.now(),
  ) {
    if (capacity <= 0 || refillPerSecond <= 0) {
      throw new Error("capacity and refillPerSecond must be > 0");
    }
    this.tokens = capacity;
    this.lastRefill = now();
    this.now = now;
  }

  private readonly now: () => number;

  tryTake(cost = 1): boolean {
    this.refill();
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }

  take(cost = 1): void {
    this.refill();
    if (this.tokens < cost) {
      throw new RateLimitError("rate limit exceeded", {
        remaining: this.tokens,
        retryAfterMs: this.retryAfterMs(cost),
        limit: this.capacity,
      });
    }
    this.tokens -= cost;
  }

  available(): number {
    this.refill();
    return this.tokens;
  }

  /** Milliseconds until `cost` tokens are available. */
  retryAfterMs(cost = 1): number {
    this.refill();
    if (this.tokens >= cost) return 0;
    const needed = cost - this.tokens;
    return Math.ceil((needed / this.refillPerSecond) * 1000);
  }

  private refill(): void {
    const t = this.now();
    const elapsedSec = (t - this.lastRefill) / 1000;
    if (elapsedSec <= 0) return;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsedSec * this.refillPerSecond,
    );
    this.lastRefill = t;
  }
}

export class TenantRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  take(tenantId: string, cost = 1): void {
    this.bucket(tenantId).take(cost);
  }

  remaining(tenantId: string): number {
    return this.bucket(tenantId).available();
  }

  retryAfterMs(tenantId: string, cost = 1): number {
    return this.bucket(tenantId).retryAfterMs(cost);
  }

  /** Snapshot useful for attaching to successful or 429 responses. */
  rateLimitHeaders(tenantId: string): Record<string, string> {
    const remaining = this.remaining(tenantId);
    const retryMs = this.retryAfterMs(tenantId);
    const retryAfterSec = remaining > 0 ? 0 : Math.max(1, Math.ceil(retryMs / 1000));
    const headers: Record<string, string> = {
      "X-RateLimit-Limit": String(this.capacity),
      "X-RateLimit-Remaining": String(Math.max(0, Math.floor(remaining))),
    };
    if (retryAfterSec > 0) headers["Retry-After"] = String(retryAfterSec);
    return headers;
  }

  private bucket(tenantId: string): TokenBucket {
    let bucket = this.buckets.get(tenantId);
    if (!bucket) {
      bucket = new TokenBucket(this.capacity, this.refillPerSecond, this.now);
      this.buckets.set(tenantId, bucket);
    }
    return bucket;
  }
}
