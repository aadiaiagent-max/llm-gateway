export class RateLimitError extends Error {
  constructor(message = "rate limit exceeded") {
    super(message);
    this.name = "RateLimitError";
  }
}

/** Simple token bucket — easy to explain in interviews. */
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
    if (!this.tryTake(cost)) throw new RateLimitError();
  }

  available(): number {
    this.refill();
    return this.tokens;
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
    let bucket = this.buckets.get(tenantId);
    if (!bucket) {
      bucket = new TokenBucket(this.capacity, this.refillPerSecond, this.now);
      this.buckets.set(tenantId, bucket);
    }
    bucket.take(cost);
  }
}
