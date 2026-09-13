export type ProviderName = string;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  /** Optional sticky routing key (e.g. tenant id). */
  tenantId?: string;
}

export interface ChatResponse {
  id: string;
  provider: ProviderName;
  model: string;
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface ProviderAdapter {
  readonly name: ProviderName;
  readonly models: string[];
  complete(req: ChatRequest): Promise<ChatResponse>;
}

export interface UsageRecord {
  at: number;
  tenantId: string;
  provider: ProviderName;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  ok: boolean;
  error?: string;
}
