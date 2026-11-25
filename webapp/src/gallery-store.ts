export interface ImportedPhoto {
  file: File;
  thumbnail: string;
}

let connection: Promise<IDBDatabase> | undefined;
function database() {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('caduceus.om3.preview-gallery', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('imports', { keyPath: 'key', autoIncrement: true });
      request.result.createObjectStore('hidden');
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = undefined; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  }).catch(error => { connection = undefined; throw error; });
}

function committed(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadGallery() {
  const db = await database();
  const tx = db.transaction(['imports', 'hidden']);
  const imports = tx.objectStore('imports').getAll();
  const hidden = tx.objectStore('hidden').getAllKeys();
  await committed(tx);
  return { imports: imports.result as (ImportedPhoto & { key: number })[], hidden: new Set(hidden.result) };
}

export async function storePhotos(photos: ImportedPhoto[]) {
  const db = await database();
  const tx = db.transaction('imports', 'readwrite');
  const store = tx.objectStore('imports');
  const requests = photos.map(photo => store.add(photo));
  await committed(tx);
  return requests.map(request => Number(request.result));
}

export async function storeRemoval(id: string, key?: number) {
  const db = await database();
  const tx = db.transaction(key === undefined ? 'hidden' : 'imports', 'readwrite');
  if (key === undefined) tx.objectStore('hidden').put(true, id);
  else tx.objectStore('imports').delete(key);
  await committed(tx);
}
