import { describe, expect, it } from "vitest";
import {
  TokenBucket,
  RateLimitError,
  TenantRateLimiter,
} from "../src/ratelimit/TokenBucket.js";

describe("TokenBucket", () => {
  it("allows up to capacity then rejects", () => {
    let t = 0;
    const bucket = new TokenBucket(2, 1, () => t);
    expect(bucket.tryTake()).toBe(true);
    expect(bucket.tryTake()).toBe(true);
    expect(bucket.tryTake()).toBe(false);
  });

  it("refills over time", () => {
    let t = 0;
    const bucket = new TokenBucket(1, 10, () => t);
    expect(bucket.tryTake()).toBe(true);
    expect(bucket.tryTake()).toBe(false);
    t += 200;
    expect(bucket.tryTake()).toBe(true);
  });

  it("take throws RateLimitError with retry metadata and headers", () => {
    const bucket = new TokenBucket(1, 2, () => 0);
    bucket.take();
    try {
      bucket.take();
      throw new Error("expected RateLimitError");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      const rl = err as RateLimitError;
      expect(rl.remaining).toBe(0);
      expect(rl.retryAfterMs).toBeGreaterThan(0);
      expect(rl.limit).toBe(1);
      const headers = rl.toHeaders();
      expect(headers["Retry-After"]).toMatch(/^\d+$/);
      expect(headers["X-RateLimit-Limit"]).toBe("1");
      expect(headers["X-RateLimit-Remaining"]).toBe("0");
    }
  });
});

describe("TenantRateLimiter", () => {
  it("exposes remaining and rate-limit headers per tenant", () => {
    let t = 0;
    const limiter = new TenantRateLimiter(2, 1, () => t);
    limiter.take("acme");
    expect(limiter.remaining("acme")).toBe(1);
    const headers = limiter.rateLimitHeaders("acme");
    expect(headers["X-RateLimit-Limit"]).toBe("2");
    expect(headers["X-RateLimit-Remaining"]).toBe("1");
    expect(headers["Retry-After"]).toBeUndefined();
  });
});
