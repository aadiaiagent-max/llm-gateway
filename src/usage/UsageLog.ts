import type { UsageRecord } from "../types.js";

export interface UsageFilter {
  tenantId?: string;
  provider?: string;
  ok?: boolean;
  since?: number;
  until?: number;
}

export class UsageLog {
  private records: UsageRecord[] = [];

  record(entry: UsageRecord): void {
    this.records.push(entry);
  }

  list(): UsageRecord[] {
    return [...this.records];
  }

  /** Return records matching optional tenant / provider / time filters. */
  filter(query: UsageFilter = {}): UsageRecord[] {
    return this.records.filter((r) => {
      if (query.tenantId !== undefined && r.tenantId !== query.tenantId) return false;
      if (query.provider !== undefined && r.provider !== query.provider) return false;
      if (query.ok !== undefined && r.ok !== query.ok) return false;
      if (query.since !== undefined && r.at < query.since) return false;
      if (query.until !== undefined && r.at > query.until) return false;
      return true;
    });
  }

  /** CSV export for the filtered (or full) log. */
  exportCsv(query: UsageFilter = {}): string {
    const rows = this.filter(query);
    const header =
      "at,tenantId,provider,model,promptTokens,completionTokens,totalTokens,latencyMs,ok,error";
    const lines = rows.map((r) =>
      [
        r.at,
        csvEscape(r.tenantId),
        csvEscape(String(r.provider)),
        csvEscape(r.model),
        r.promptTokens,
        r.completionTokens,
        r.totalTokens,
        r.latencyMs,
        r.ok,
        csvEscape(r.error ?? ""),
      ].join(","),
    );
    return [header, ...lines].join("\n");
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

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
