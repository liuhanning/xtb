const DB_NAME = 'cuotiben';
const DB_VERSION = 2;
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
      // v2: add new fields
      if (e.oldVersion < 2) {
        // Fields will be lazily populated on first use
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
      attempts: 0,
      lastResult: null,
      lastResultAt: null,
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
        results = results.filter((r) => (r.question || '').toLowerCase().includes(q));
      }
      results.sort((a, b) => b.createdAt - a.createdAt);
      resolve(results);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function toggleMastered(id) {
  const item = await getQuestion(id);
  if (!item) throw new Error('题目不存在');
  return updateQuestion(id, { mastered: !item.mastered });
}

async function markCorrect(id) {
  const item = await getQuestion(id);
  const newAttempts = (item.attempts || 0) + 1;
  let mastered = item.mastered || false;
  // If correct twice in a row or already mastered, mark as mastered
  if (item.lastResult === 'correct' || newAttempts >= 2) {
    mastered = true;
  }
  return updateQuestion(id, {
    attempts: newAttempts,
    lastResult: 'correct',
    lastResultAt: Date.now(),
    mastered,
  });
}

async function markWrong(id) {
  const item = await getQuestion(id);
  const newAttempts = (item.attempts || 0) + 1;
  return updateQuestion(id, {
    attempts: newAttempts,
    lastResult: 'wrong',
    lastResultAt: Date.now(),
    mastered: false,
  });
}

async function getRandomQuestions(count, { subject = 'all', showMastered = false } = {}) {
  const all = await getAllQuestions({ subject, showMastered });
  // Fisher-Yates shuffle
  const shuffled = [...all];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
