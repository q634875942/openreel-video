// AIProvider — the abstraction every concrete AI backend implements.
//
// Concrete implementations in feat-005:
//   - ClaudeProvider  (Anthropic SDK + prompt caching)
//   - OpenAIProvider  (OpenAI SDK)
//   - DeepSeekProvider (OpenAI-compatible SDK with custom baseURL)
//   - CompatibleProvider (user-supplied baseURL + key + model; covers
//     Kimi, GLM, Ollama, vLLM, etc.)

import type {
  GenerateChunk,
  GenerateRequest,
  ModelInfo,
  ProviderInfo,
} from "./types";

export interface AIProvider {
  readonly info: ProviderInfo;

  // Available models on this provider. Static metadata for now; in the
  // future a provider could fetch this dynamically (e.g. local Ollama
  // listing installed models).
  listModels(): readonly ModelInfo[];

  // Generate a response as a stream of unified chunks. Implementations
  // MUST yield exactly one terminal chunk:
  //   - { type: "done", finishReason: ... } on success
  //   - { type: "error", error: ... }      on failure
  // Any chunks after the terminal chunk are ignored.
  generate(
    request: GenerateRequest,
    options?: GenerateOptions,
  ): AsyncIterable<GenerateChunk>;
}

export interface GenerateOptions {
  // AbortSignal cancels the in-flight stream. Implementations should release
  // network resources and yield a terminal error chunk before throwing.
  readonly signal?: AbortSignal;
}
