/**
 * Where game saves live on this device. Uploaded builds run in a third-party iframe whose own storage browsers
 * may block, partition or wipe, so builds hand their key-value saves to the hub, which keeps them per game here.
 * Everything goes through SaveStore so a cloud-backed store (cross-device continue) can replace it later.
 */
export type SaveItems = Record<string, string>;

export interface SaveStore {
  load(gameId: string): Promise<SaveItems>;
  set(gameId: string, key: string, value: string): Promise<void>;
  remove(gameId: string, key: string): Promise<void>;
}

/** Hub keys like `atelier:theme` share this origin's localStorage, so saves get their own prefix. */
export const SAVE_PREFIX = "atelier:save:";
const DB_NAME = "atelier-saves";
const STORE = "items";

type SaveRecord = { gameId: string; key: string; value: string };

function requestDone<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new DOMException("Transaction aborted", "AbortError"));
  });
}

/** IndexedDB holds saves of several hundred KB without blocking the page the way localStorage does. */
export function createIndexedDbSaveStore(factory: IDBFactory = indexedDB): SaveStore {
  let opening: Promise<IDBDatabase> | null = null;
  function db(): Promise<IDBDatabase> {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        // [gameId, key] keeps each game's keys apart and lets one range read a whole game.
        request.result.createObjectStore(STORE, { keyPath: ["gameId", "key"] });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      opening = null;
      throw error;
    });
    return opening;
  }
  async function write(apply: (store: IDBObjectStore) => void) {
    const transaction = (await db()).transaction(STORE, "readwrite");
    apply(transaction.objectStore(STORE));
    await transactionDone(transaction);
  }
  return {
    async load(gameId) {
      const store = (await db()).transaction(STORE, "readonly").objectStore(STORE);
      // Arrays sort after strings in IndexedDB, so [gameId, []] is just past every [gameId, key].
      const records = await requestDone(store.getAll(IDBKeyRange.bound([gameId, ""], [gameId, []])) as IDBRequest<SaveRecord[]>);
      return Object.fromEntries(records.map((record) => [record.key, record.value]));
    },
    set: (gameId, key, value) => write((store) => { store.put({ gameId, key, value } satisfies SaveRecord); }),
    remove: (gameId, key) => write((store) => { store.delete([gameId, key]); }),
  };
}

/** Fallback for browsers without IndexedDB; `atelier:save:{gameId}:{key}` keeps saves apart from hub keys. */
export function createLocalSaveStore(storage: Storage = localStorage): SaveStore {
  const prefix = (gameId: string) => `${SAVE_PREFIX}${encodeURIComponent(gameId)}:`;
  return {
    async load(gameId) {
      const items: SaveItems = {};
      const start = prefix(gameId);
      for (let index = 0; index < storage.length; index += 1) {
        const name = storage.key(index);
        if (name?.startsWith(start)) items[name.slice(start.length)] = storage.getItem(name) ?? "";
      }
      return items;
    },
    async set(gameId, key, value) { storage.setItem(prefix(gameId) + key, value); },
    async remove(gameId, key) { storage.removeItem(prefix(gameId) + key); },
  };
}

let shared: SaveStore | null = null;
export function getSaveStore(): SaveStore {
  shared ??= typeof indexedDB === "undefined" ? createLocalSaveStore() : createIndexedDbSaveStore();
  return shared;
}

/** Asks the browser once not to evict hub data under storage pressure; it may still say no. */
let persistAsked = false;
export function requestPersistentStorage() {
  if (persistAsked) return;
  persistAsked = true;
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
  if (!storage?.persist) return;
  void storage.persisted().then((already) => (already ? true : storage.persist())).catch(() => undefined);
}
