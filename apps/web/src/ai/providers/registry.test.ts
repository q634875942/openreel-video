import { describe, it, expect } from "vitest";
import { ProviderRegistry } from "./registry";
import type { AIProvider } from "../AIProvider";

function stubProvider(id: string): AIProvider {
  return {
    info: { id, displayName: id, keylessOk: false },
    listModels: () => [],
    generate: async function* () {
      yield { type: "done", finishReason: "stop" };
    },
  };
}

describe("ProviderRegistry", () => {
  it("starts empty with no current selection", () => {
    const r = new ProviderRegistry();
    expect(r.list()).toEqual([]);
    expect(r.getCurrent()).toBeNull();
    expect(r.getCurrentId()).toBeNull();
  });

  it("auto-selects the first registered provider as current", () => {
    const r = new ProviderRegistry();
    r.register(stubProvider("a"));
    expect(r.getCurrentId()).toBe("a");
  });

  it("does not change current selection on subsequent registrations", () => {
    const r = new ProviderRegistry();
    r.register(stubProvider("a"));
    r.register(stubProvider("b"));
    expect(r.getCurrentId()).toBe("a");
  });

  it("looks up by id and lists all infos", () => {
    const r = new ProviderRegistry();
    r.register(stubProvider("a"));
    r.register(stubProvider("b"));
    expect(r.get("a")?.info.id).toBe("a");
    expect(r.get("missing")).toBeNull();
    expect(r.list().map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("switches current to any registered provider", () => {
    const r = new ProviderRegistry();
    r.register(stubProvider("a"));
    r.register(stubProvider("b"));
    r.setCurrent("b");
    expect(r.getCurrentId()).toBe("b");
    expect(r.getCurrent()?.info.id).toBe("b");
  });

  it("throws when setting current to an unregistered id", () => {
    const r = new ProviderRegistry();
    r.register(stubProvider("a"));
    expect(() => r.setCurrent("missing")).toThrow(/not registered/);
  });

  it("unregistering the current provider moves selection to another registered provider", () => {
    const r = new ProviderRegistry();
    r.register(stubProvider("a"));
    r.register(stubProvider("b"));
    r.unregister("a");
    expect(r.getCurrentId()).toBe("b");
  });

  it("unregistering the only provider clears the selection", () => {
    const r = new ProviderRegistry();
    r.register(stubProvider("a"));
    r.unregister("a");
    expect(r.getCurrentId()).toBeNull();
    expect(r.getCurrent()).toBeNull();
  });
});
