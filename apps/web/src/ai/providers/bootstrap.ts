// Boot a ProviderRegistry from Vite env vars. Used by the AI panel when
// it first opens — finds whichever provider keys the dev / user has set
// in .env.local and registers the matching providers.
//
// This is a dev-time convenience. Production (feat-007+) will swap this
// out for a settings panel that pulls keys from encrypted IndexedDB.

import { ClaudeProvider } from "./ClaudeProvider";
import { DeepSeekProvider } from "./DeepSeekProvider";
import { ProviderRegistry } from "./registry";

export interface BootstrapEnv {
  readonly VITE_ANTHROPIC_API_KEY?: string;
  readonly VITE_DEEPSEEK_API_KEY?: string;
}

export function bootstrapRegistryFromEnv(
  env: BootstrapEnv = readEnv(),
): ProviderRegistry {
  const registry = new ProviderRegistry();

  if (nonEmpty(env.VITE_ANTHROPIC_API_KEY)) {
    registry.register(new ClaudeProvider({ apiKey: env.VITE_ANTHROPIC_API_KEY }));
  }
  if (nonEmpty(env.VITE_DEEPSEEK_API_KEY)) {
    registry.register(new DeepSeekProvider({ apiKey: env.VITE_DEEPSEEK_API_KEY }));
  }

  return registry;
}

function readEnv(): BootstrapEnv {
  // Vite injects import.meta.env at build time. The optional-chaining is
  // there so this module loads cleanly in node/test environments where
  // import.meta.env may be absent or shaped differently.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as any).env as BootstrapEnv | undefined;
  return env ?? {};
}

function nonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}
