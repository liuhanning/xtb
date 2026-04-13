const DB_NAME = 'cuotiben';
const DB_VERSION = 1;
const STORE_NAME = 'questions';

let db = null;

function openDB() {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('subject', 'subject', { unique: false });
        store.createIndex('mastered', 'mastered', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function addQuestion(data) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record = {
      ...data,
      mastered: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function updateQuestion(id, data) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      const record = { ...req.result, ...data, updatedAt: Date.now() };
      const updateReq = store.put(record);
      updateReq.onsuccess = () => resolve(record);
      updateReq.onerror = (e) => reject(e.target.error);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function deleteQuestion(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getQuestion(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getAllQuestions({ subject = 'all', search = '', showMastered = false } = {}) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      let results = req.result;
      if (subject !== 'all') {
        results = results.filter((r) => r.subject === subject);
      }
      if (!showMastered) {
        results = results.filter((r) => !r.mastered);
      }
      if (search) {
        const q = search.toLowerCase();
        results = results.filter((r) => r.question.toLowerCase().includes(q));
      }
      results.sort((a, b) => b.createdAt - a.createdAt);
      resolve(results);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function toggleMastered(id) {
  const item = await getQuestion(id);
  return updateQuestion(id, { mastered: !item.mastered });
}
