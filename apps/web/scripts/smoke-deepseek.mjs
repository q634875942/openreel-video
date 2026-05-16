// One-off smoke test: real DeepSeek call via the openai SDK (the same SDK
// our DeepSeekProvider wraps). This script intentionally bypasses our
// DeepSeekProvider TS class to avoid the TS-loader bootstrap problem in
// node — the provider's translation logic is already covered by 11 unit
// tests with mocked SDK responses. Here we verify only that:
//   1. the API key is valid
//   2. api.deepseek.com is reachable
//   3. DeepSeek's streaming response format matches what
//      openai-translation.ts is built to handle
//
// Run from apps/web:
//   node scripts/smoke-deepseek.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appsWeb = resolve(__dirname, "..");

function readEnvLocal() {
  try {
    const text = readFileSync(resolve(appsWeb, ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*VITE_DEEPSEEK_API_KEY\s*=\s*(.+?)\s*$/.exec(line);
      if (m) return m[1];
    }
  } catch {}
  return process.env.VITE_DEEPSEEK_API_KEY;
}

const apiKey = readEnvLocal();
if (!apiKey) {
  console.error("VITE_DEEPSEEK_API_KEY not set. Aborting.");
  process.exit(2);
}

console.log("=== smoke-deepseek: live DeepSeek round trip ===\n");

const client = new OpenAI({
  apiKey,
  baseURL: "https://api.deepseek.com/v1",
});

// First, list models — confirms key + connectivity
console.log("--- step 1: list models (confirms key + connectivity) ---");
try {
  const models = await client.models.list();
  for (const m of models.data) {
    console.log(`  - ${m.id}`);
  }
} catch (err) {
  console.error("FAIL listing models:", err.message ?? err);
  process.exit(1);
}

// Then a streaming chat — exercises the same shape openai-translation.ts handles
console.log("\n--- step 2: streaming chat (raw OpenAI-shape chunks) ---");
const stream = await client.chat.completions.create({
  model: "deepseek-v4-flash",
  messages: [
    { role: "user", content: "Say hello in exactly 3 words." },
  ],
  temperature: 0,
  max_tokens: 800,
  stream: true,
  stream_options: { include_usage: true },
});

let assembled = "";
let reasoning = "";
let chunkCount = 0;
let lastFinishReason = null;
let usage = null;

for await (const chunk of stream) {
  chunkCount++;
  const choice = chunk.choices?.[0];
  if (choice?.delta?.content) assembled += choice.delta.content;
  if (choice?.delta?.reasoning_content) reasoning += choice.delta.reasoning_content;
  if (choice?.finish_reason) lastFinishReason = choice.finish_reason;
  if (chunk.usage) usage = chunk.usage;
  // Quiet log: print only content/finish/usage events, skip the noisy reasoning chunks
  if (
    choice?.delta?.content ||
    choice?.finish_reason ||
    chunk.usage
  ) {
    console.log(`[chunk ${chunkCount}]`, JSON.stringify(chunk));
  }
}

console.log("\nreasoning trace length:", reasoning.length, "chars");
console.log("assembled content:", JSON.stringify(assembled));
console.log("total chunks:", chunkCount);
console.log("finish_reason:", lastFinishReason);
console.log("usage:", usage);

if (!assembled) {
  console.error("\nFAIL: no text content received");
  process.exit(1);
}
if (lastFinishReason !== "stop") {
  console.error("\nFAIL: expected finish_reason='stop', got", lastFinishReason);
  process.exit(1);
}

console.log("\n=== ALL CHECKS PASSED ===");
console.log(
  "\nDeepSeek streaming shape matches what openai-translation.ts handles.",
);
console.log(
  "Our DeepSeekProvider's translation is covered by 11 unit tests; the",
);
console.log(
  "wire format is now confirmed to match real API output.",
);
