import { getSaveStore, requestPersistentStorage, type SaveItems, type SaveStore } from "./saveStore";

/** Per game, counted as UTF-16 code units × 2 to match what browsers charge for strings. */
export const MAX_GAME_BYTES = 5 * 1024 * 1024;
export const MAX_KEY_LENGTH = 256;

export type StorageErrorReason = "invalid-key" | "invalid-value" | "quota" | "write-failed" | "load-failed";
export type BridgeReply =
  | { type: "atelier:storage-ready"; items: SaveItems }
  | { type: "atelier:storage-error"; key: unknown; reason: StorageErrorReason };

const entryBytes = (key: string, value: string) => (key.length + value.length) * 2;

/**
 * The hub side of the save bridge for one game. The game id comes from the hub, never from a message, so a build
 * can only ever read and write its own saves. Writes update the in-memory copy at once (a build that reloads
 * right after saving gets the new value in its next `storage-ready`) and are written to the store in order.
 * A failed load is never passed off as an empty save: the build would hide its continue option, and a write on
 * top of that empty copy would overwrite the real save still on the device.
 */
export function createSaveBridge(gameId: string, reply: (message: BridgeReply) => void, store: SaveStore = getSaveStore()) {
  let loading: Promise<SaveItems> | null = null;
  // Each message waits for the one before it, so a set sent right after hello still lands after the load.
  let queue: Promise<unknown> = Promise.resolve();

  function load(): Promise<SaveItems> {
    if (!loading) {
      const attempt = store.load(gameId);
      loading = attempt;
      // Forget the failure so the next message tries again.
      attempt.catch(() => { if (loading === attempt) loading = null; });
    }
    return loading;
  }
  /** The loaded copy, or null after telling the build that its saves could not be read. */
  async function loaded(key: unknown): Promise<SaveItems | null> {
    try {
      return await load();
    } catch {
      reply({ type: "atelier:storage-error", key, reason: "load-failed" });
      return null;
    }
  }
  const used = (current: SaveItems) => Object.entries(current).reduce((total, [key, value]) => total + entryBytes(key, value), 0);

  async function set(key: unknown, value: unknown) {
    if (typeof key !== "string" || !key || key.length > MAX_KEY_LENGTH) return reply({ type: "atelier:storage-error", key, reason: "invalid-key" });
    if (typeof value !== "string") return reply({ type: "atelier:storage-error", key, reason: "invalid-value" });
    const current = await loaded(key);
    if (!current) return;
    const previous = Object.hasOwn(current, key) ? current[key] : undefined;
    const before = previous === undefined ? 0 : entryBytes(key, previous);
    if (used(current) - before + entryBytes(key, value) > MAX_GAME_BYTES) return reply({ type: "atelier:storage-error", key, reason: "quota" });
    current[key] = value;
    try {
      await store.set(gameId, key, value);
    } catch {
      // Keep the copy honest: the build should not see a value the device never stored.
      if (current[key] === value) {
        if (previous === undefined) delete current[key];
        else current[key] = previous;
      }
      reply({ type: "atelier:storage-error", key, reason: "write-failed" });
    }
  }

  async function remove(key: unknown) {
    if (typeof key !== "string" || !key || key.length > MAX_KEY_LENGTH) return reply({ type: "atelier:storage-error", key, reason: "invalid-key" });
    const current = await loaded(key);
    if (!current) return;
    delete current[key];
    try {
      await store.remove(gameId, key);
    } catch {
      reply({ type: "atelier:storage-error", key, reason: "write-failed" });
    }
  }

  /** Returns true when the message belonged to the bridge. */
  function handle(data: unknown): boolean {
    const message = data as { type?: unknown; key?: unknown; value?: unknown } | null;
    const type = message?.type;
    let step: () => Promise<unknown>;
    if (type === "atelier:storage-hello") {
      requestPersistentStorage();
      step = async () => {
        const current = await loaded(null);
        if (current) reply({ type: "atelier:storage-ready", items: { ...current } });
      };
    } else if (type === "atelier:storage-set") step = () => set(message!.key, message!.value);
    else if (type === "atelier:storage-remove") step = () => remove(message!.key);
    else return false;
    queue = queue.then(step, step);
    return true;
  }

  return { handle, idle: () => queue };
}
