import { Gateway, MockProvider } from "../src/index.js";

async function main() {
  const gw = new Gateway({
    providers: [
      new MockProvider("openai", ["gpt-mini", "gpt-fast"]),
      new MockProvider("anthropic", ["claude-haiku", "gpt-fast"]),
    ],
    rateLimitCapacity: 5,
    rateLimitRefillPerSecond: 5,
  });

  const a = await gw.chat({
    model: "gpt-mini",
    messages: [{ role: "user", content: "Route me" }],
    tenantId: "demo",
  });
  console.log("primary:", a.provider, a.content);

  const b = await gw.chat(
    {
      model: "gpt-fast",
      messages: [{ role: "user", content: "Prefer anthropic" }],
      tenantId: "demo",
    },
    { preferredProvider: "anthropic" },
  );
  console.log("preferred:", b.provider, b.content);

  console.log("usage:", gw.usage.totalsByTenant());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
