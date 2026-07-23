import type { HorrorCorridorV2Save, PersistenceAdapter } from "../contracts";

const DATABASE_NAME = "horror-corridor-v2";
const STORE_NAME = "expedition-saves";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB failed to open."));
  });
}

async function transact<T>(mode: IDBTransactionMode, task: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = task(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB transaction failed."));
    });
  } finally {
    database.close();
  }
}

export function createBrowserPersistenceAdapter(slot = "autosave"): PersistenceAdapter {
  const fallbackKey = `${DATABASE_NAME}:${slot}`;
  return Object.freeze({
    async save(value) {
      try {
        await transact("readwrite", (store) => store.put(value, slot));
      } catch {
        localStorage.setItem(fallbackKey, JSON.stringify(value));
      }
    },
    async load() {
      try {
        return (await transact("readonly", (store) => store.get(slot))) as HorrorCorridorV2Save | null;
      } catch {
        const value = localStorage.getItem(fallbackKey);
        return value ? JSON.parse(value) as HorrorCorridorV2Save : null;
      }
    },
    async clear() {
      try {
        await transact("readwrite", (store) => store.delete(slot));
      } catch {
        localStorage.removeItem(fallbackKey);
      }
    },
  });
}

export function createMemoryPersistenceAdapter(): PersistenceAdapter & Readonly<{ peek: () => HorrorCorridorV2Save | null }> {
  let value: HorrorCorridorV2Save | null = null;
  return Object.freeze({
    save: async (next) => {
      value = structuredClone(next);
    },
    load: async () => value ? structuredClone(value) : null,
    clear: async () => {
      value = null;
    },
    peek: () => value ? structuredClone(value) : null,
  });
}
