import { ClockEntry } from '../types';
import { DB_NAME, STORE_NAME } from '../constants';

class StorageService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);

      request.onerror = () => {
        this.initPromise = null;
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('synced', 'synced', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  private async getDB(): Promise<IDBDatabase> {
    await this.init();
    return this.db!;
  }

  async saveEntry(entry: ClockEntry): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getPendingEntries(): Promise<ClockEntry[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result as ClockEntry[]).filter((e) => !e.synced));
      req.onerror = () => reject(req.error);
    });
  }

  async markAsSynced(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const store = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME);
      const get = store.get(id);
      get.onsuccess = () => {
        const entry = get.result as ClockEntry | undefined;
        if (entry) {
          entry.synced = true;
          store.put(entry);
        }
        resolve();
      };
      get.onerror = () => reject(get.error);
    });
  }
}

export const storageService = new StorageService();

