export type AccountTransitionSnapshot = Array<[string, string | null]>;
export interface AccountTransitionJournalStore {
  save(id: string, snapshot: AccountTransitionSnapshot): Promise<void>;
  load(id: string): Promise<AccountTransitionSnapshot | null>;
  remove(id: string): Promise<void>;
}

const JOURNAL_DB = 'astro-rail-account-transitions';
const JOURNAL_STORE = 'journals';

function runJournalOperation<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前浏览器无法保存账户恢复点，请确认允许本机存储后重试。'));
      return;
    }
    const opening = indexedDB.open(JOURNAL_DB, 1);
    opening.onupgradeneeded = () => {
      if (!opening.result.objectStoreNames.contains(JOURNAL_STORE)) opening.result.createObjectStore(JOURNAL_STORE);
    };
    opening.onerror = () => reject(new Error('账户恢复点暂时无法保存，当前存档已保留。'));
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction(JOURNAL_STORE, mode);
      const request = operation(transaction.objectStore(JOURNAL_STORE));
      transaction.oncomplete = () => { db.close(); resolve(request.result); };
      transaction.onabort = transaction.onerror = () => {
        db.close();
        reject(new Error('账户恢复点暂时无法保存，当前存档已保留。'));
      };
    };
  });
}

// Independent from astro-rail-archive; account switching never deletes this DB.
export const browserAccountTransitionJournal: AccountTransitionJournalStore = {
  async save(id, snapshot) { await runJournalOperation('readwrite', (store) => store.put(snapshot, id)); },
  async load(id) { return (await runJournalOperation<AccountTransitionSnapshot | undefined>('readonly', (store) => store.get(id))) || null; },
  async remove(id) { await runJournalOperation('readwrite', (store) => store.delete(id)); },
};
