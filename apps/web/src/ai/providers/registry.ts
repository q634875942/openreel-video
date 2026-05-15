// Provider registry — a simple in-memory map keyed by provider id, plus a
// current-selection pointer. Persistence (e.g. IndexedDB of which provider
// the user last picked) and encrypted key storage are deferred to feat-006
// (settings UI). For now this is a runtime singleton.

import type { AIProvider } from "../AIProvider";
import type { ProviderInfo } from "../types";

export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();
  private currentId: string | null = null;

  register(provider: AIProvider): void {
    this.providers.set(provider.info.id, provider);
    if (this.currentId === null) {
      this.currentId = provider.info.id;
    }
  }

  unregister(providerId: string): void {
    this.providers.delete(providerId);
    if (this.currentId === providerId) {
      const next = this.providers.keys().next();
      this.currentId = next.done ? null : next.value;
    }
  }

  get(providerId: string): AIProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  list(): readonly ProviderInfo[] {
    return [...this.providers.values()].map((p) => p.info);
  }

  setCurrent(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`provider "${providerId}" is not registered`);
    }
    this.currentId = providerId;
  }

  getCurrent(): AIProvider | null {
    if (this.currentId === null) return null;
    return this.providers.get(this.currentId) ?? null;
  }

  getCurrentId(): string | null {
    return this.currentId;
  }
}
