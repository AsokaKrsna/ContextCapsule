const DB_NAME = "ContextCapsuleDB";
const DB_VERSION = 1;

export function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => reject(event.target.error);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Capsules Store
      if (!db.objectStoreNames.contains("capsules")) {
        const capsuleStore = db.createObjectStore("capsules", { keyPath: "id" });
        capsuleStore.createIndex("timestamp", "timestamp", { unique: false });
        capsuleStore.createIndex("conversation_id", "conversation_id", { unique: false });
      }

      // Attachments Store
      if (!db.objectStoreNames.contains("attachments")) {
        const attStore = db.createObjectStore("attachments", { keyPath: "asset_id" });
        attStore.createIndex("capsule_id", "capsule_id", { unique: false });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
  });
}

function generateId() {
  return 'cap_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

function generateAssetId() {
  return 'ast_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

// ---- CAPSULES ----

export async function saveCapsule(capsuleData) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["capsules"], "readwrite");
    const store = transaction.objectStore("capsules");
    
    if (!capsuleData.id) {
      capsuleData.id = generateId();
    }
    capsuleData.timestamp = capsuleData.timestamp || Date.now();

    const request = store.put(capsuleData);
    request.onsuccess = () => resolve(capsuleData);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getCapsule(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["capsules"], "readonly");
    const store = transaction.objectStore("capsules");
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getAllCapsules() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["capsules"], "readonly");
    const store = transaction.objectStore("capsules");
    const request = store.getAll();
    
    request.onsuccess = () => {
      const results = request.result || [];
      // Sort newest first
      results.sort((a, b) => b.timestamp - a.timestamp);
      resolve(results);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteCapsule(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["capsules", "attachments"], "readwrite");
    const capStore = transaction.objectStore("capsules");
    const attStore = transaction.objectStore("attachments");
    
    // Delete capsule
    capStore.delete(id);
    
    // Delete associated attachments
    const index = attStore.index("capsule_id");
    const request = index.getAllKeys(id);
    request.onsuccess = () => {
      request.result.forEach(key => attStore.delete(key));
    };
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteAttachmentsForCapsule(capsuleId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["attachments"], "readwrite");
    const store = transaction.objectStore("attachments");
    const index = store.index("capsule_id");
    const request = index.getAllKeys(capsuleId);

    request.onsuccess = () => {
      request.result.forEach(key => store.delete(key));
    };
    request.onerror = (e) => reject(e.target.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = (e) => reject(e.target.error);
  });
}

export async function updateCapsuleTag(id, tag) {
  const cap = await getCapsule(id);
  if (cap) {
    cap.tag = tag;
    return await saveCapsule(cap);
  }
  return null;
}

// ---- ATTACHMENTS ----

export async function saveAttachment(capsuleId, attachment) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["attachments"], "readwrite");
    const store = transaction.objectStore("attachments");
    
    const assetId = generateAssetId();
    const data = {
      asset_id: assetId,
      capsule_id: capsuleId,
      base64_data: attachment.base64 || attachment.base64_data,
      filename: attachment.filename,
      media_type: attachment.type || attachment.media_type || 'file',
      content_type: attachment.mime || attachment.content_type || 'application/octet-stream',
      timestamp: Date.now()
    };

    const request = store.put(data);
    request.onsuccess = () => resolve(data);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getAttachment(assetId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["attachments"], "readonly");
    const store = transaction.objectStore("attachments");
    const request = store.get(assetId);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getAttachmentsForCapsule(capsuleId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["attachments"], "readonly");
    const store = transaction.objectStore("attachments");
    const index = store.index("capsule_id");
    const request = index.getAll(capsuleId);
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}
