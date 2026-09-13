import type { UsageRecord } from "../types.js";

export class UsageLog {
  private records: UsageRecord[] = [];

  record(entry: UsageRecord): void {
    this.records.push(entry);
  }

  list(): UsageRecord[] {
    return [...this.records];
  }

  clear(): void {
    this.records = [];
  }

  totalsByTenant(): Record<string, { requests: number; tokens: number }> {
    const out: Record<string, { requests: number; tokens: number }> = {};
    for (const r of this.records) {
      const cur = out[r.tenantId] ?? { requests: 0, tokens: 0 };
      cur.requests += 1;
      if (r.ok) cur.tokens += r.totalTokens;
      out[r.tenantId] = cur;
    }
    return out;
  }
}
