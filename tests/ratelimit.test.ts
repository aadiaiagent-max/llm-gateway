import { describe, expect, it } from "vitest";
import { TokenBucket, RateLimitError } from "../src/ratelimit/TokenBucket.js";

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

  it("take throws RateLimitError", () => {
    const bucket = new TokenBucket(1, 1, () => 0);
    bucket.take();
    expect(() => bucket.take()).toThrow(RateLimitError);
  });
});
