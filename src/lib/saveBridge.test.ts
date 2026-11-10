import { afterEach, describe, expect, it } from "vitest";
import { createSaveBridge, MAX_GAME_BYTES, MAX_KEY_LENGTH, type BridgeReply } from "./saveBridge";
import { createLocalSaveStore, SAVE_PREFIX, type SaveStore } from "./saveStore";

afterEach(() => localStorage.clear());

/** jsdom's localStorage has its own small quota, so the limit tests use a plain map. */
function memoryStore(): SaveStore {
  const data = new Map<string, string>();
  return {
    load: async (gameId) => Object.fromEntries([...data].filter(([name]) => name.startsWith(`${gameId}
`)).map(([name, value]) => [name.slice(gameId.length + 1), value])),
    set: async (gameId, key, value) => { data.set(`${gameId}
${key}`, value); },
    remove: async (gameId, key) => { data.delete(`${gameId}
${key}`); },
  };
}

function open(gameId: string, store: SaveStore = createLocalSaveStore()) {
  const replies: BridgeReply[] = [];
  const bridge = createSaveBridge(gameId, (message) => replies.push(message), store);
  return { bridge, replies };
}

async function hello(gameId: string, store?: SaveStore) {
  const { bridge, replies } = open(gameId, store);
  bridge.handle({ type: "atelier:storage-hello" });
  await bridge.idle();
  return replies[0];
}

describe("save bridge", () => {
  it("returns what was saved to a later session of the same game", async () => {
    const first = open("game-a");
    first.bridge.handle({ type: "atelier:storage-hello" });
    first.bridge.handle({ type: "atelier:storage-set", key: "save", value: "{\"day\":3}" });
    await first.bridge.idle();
    expect(first.replies).toEqual([{ type: "atelier:storage-ready", items: {} }]);

    expect(await hello("game-a")).toEqual({ type: "atelier:storage-ready", items: { save: "{\"day\":3}" } });
  });

  it("answers a reload in the same session with the latest writes", async () => {
    const { bridge, replies } = open("game-a");
    bridge.handle({ type: "atelier:storage-set", key: "save", value: "1" });
    bridge.handle({ type: "atelier:storage-hello" });
    bridge.handle({ type: "atelier:storage-remove", key: "save" });
    bridge.handle({ type: "atelier:storage-hello" });
    await bridge.idle();
    expect(replies).toEqual([
      { type: "atelier:storage-ready", items: { save: "1" } },
      { type: "atelier:storage-ready", items: {} },
    ]);
  });

  it("keeps two games apart even when they use the same key", async () => {
    const a = open("game-a");
    const b = open("game-b");
    a.bridge.handle({ type: "atelier:storage-set", key: "save", value: "a" });
    b.bridge.handle({ type: "atelier:storage-set", key: "save", value: "b" });
    await Promise.all([a.bridge.idle(), b.bridge.idle()]);
    expect(await hello("game-a")).toEqual({ type: "atelier:storage-ready", items: { save: "a" } });
    expect(await hello("game-b")).toEqual({ type: "atelier:storage-ready", items: { save: "b" } });
  });

  it("ignores a game id inside the message", async () => {
    const a = open("game-a");
    a.bridge.handle({ type: "atelier:storage-set", gameId: "game-b", key: "save", value: "sneaky" });
    await a.bridge.idle();
    expect(await hello("game-b")).toEqual({ type: "atelier:storage-ready", items: {} });
  });

  it("stores saves under their own prefix, away from hub keys", async () => {
    localStorage.setItem("atelier:theme", "dark");
    const a = open("game-a");
    a.bridge.handle({ type: "atelier:storage-set", key: "atelier:theme", value: "light" });
    await a.bridge.idle();
    expect(localStorage.getItem("atelier:theme")).toBe("dark");
    expect(localStorage.getItem(`${SAVE_PREFIX}game-a:atelier:theme`)).toBe("light");
  });

  it("rejects bad keys and values and writes over the per-game limit", async () => {
    const { bridge, replies } = open("game-a", memoryStore());
    bridge.handle({ type: "atelier:storage-set", key: "", value: "x" });
    bridge.handle({ type: "atelier:storage-set", key: "k".repeat(MAX_KEY_LENGTH + 1), value: "x" });
    bridge.handle({ type: "atelier:storage-set", key: "save", value: { day: 3 } });
    bridge.handle({ type: "atelier:storage-set", key: "big", value: "x".repeat(MAX_GAME_BYTES / 2) });
    await bridge.idle();
    expect(replies.map((reply) => reply.type === "atelier:storage-error" && reply.reason)).toEqual(["invalid-key", "invalid-key", "invalid-value", "quota"]);
    expect(await hello("game-a")).toEqual({ type: "atelier:storage-ready", items: {} });
  });

  it("counts a replaced value only once against the limit", async () => {
    const { bridge, replies } = open("game-a", memoryStore());
    const half = "x".repeat(MAX_GAME_BYTES / 2 / 2 - 8);
    bridge.handle({ type: "atelier:storage-set", key: "save", value: half });
    bridge.handle({ type: "atelier:storage-set", key: "save", value: half });
    bridge.handle({ type: "atelier:storage-set", key: "other", value: half });
    bridge.handle({ type: "atelier:storage-set", key: "third", value: half });
    await bridge.idle();
    expect(replies).toEqual([{ type: "atelier:storage-error", key: "third", reason: "quota" }]);
  });

  it("reports a failed write and does not hand the value back later", async () => {
    const failing: SaveStore = { load: async () => ({}), set: async () => { throw new DOMException("full", "QuotaExceededError"); }, remove: async () => undefined };
    const { bridge, replies } = open("game-a", failing);
    bridge.handle({ type: "atelier:storage-set", key: "save", value: "1" });
    bridge.handle({ type: "atelier:storage-hello" });
    await bridge.idle();
    expect(replies).toEqual([
      { type: "atelier:storage-error", key: "save", reason: "write-failed" },
      { type: "atelier:storage-ready", items: {} },
    ]);
  });

  it("leaves other messages to the player", () => {
    const { bridge } = open("game-a");
    expect(bridge.handle({ type: "atelier:exit-fullscreen" })).toBe(false);
    expect(bridge.handle(null)).toBe(false);
    expect(bridge.handle("atelier:storage-hello")).toBe(false);
  });
});
