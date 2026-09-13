import type { ChatRequest, ChatResponse, ProviderAdapter, ProviderName } from "../types.js";

export class MockProvider implements ProviderAdapter {
  constructor(
    public readonly name: ProviderName,
    public readonly models: string[],
    private readonly prefix = name,
  ) {}

  async complete(req: ChatRequest): Promise<ChatResponse> {
    if (!this.models.includes(req.model)) {
      throw new Error(`${this.name} does not serve model ${req.model}`);
    }
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
    const content = `[${this.prefix}] ${lastUser?.content ?? ""}`.trim();
    const promptTokens = estimateTokens(req.messages.map((m) => m.content).join(" "));
    const completionTokens = estimateTokens(content);
    return {
      id: `${this.name}_${Date.now()}`,
      provider: this.name,
      model: req.model,
      content,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
