// The editor's backend client (workers/pallet-editor). The passphrase is kept
// on this device (localStorage); "offline" keeps drafts in this browser only.
export const API_URL = localStorage.getItem('pallet-editor-api') || 'https://pallet-editor.jdohertybiochem.workers.dev';
const KEY = 'pallet-editor-token';

export const api = {
  token: localStorage.getItem(KEY) || '',
  offline: false,
  setToken(t) { this.token = t; if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); },
  async call(method, path, body) {
    if (this.offline) throw new Error('offline');
    const r = await fetch(API_URL + path, {
      method, headers: { authorization: 'Bearer ' + this.token, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    if (r.status === 404 && path === '/api/draft' && method === 'GET') return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || r.status + ''); e.status = r.status; throw e; }
    return j;
  },
  ping() { return this.call('GET', '/api/ping'); },
  getDraft() { return this.call('GET', '/api/draft'); },
  putDraft(text) { return this.call('PUT', '/api/draft', text); },
  versions() { return this.call('GET', '/api/versions'); },
  saveVersion(message) { return this.call('POST', '/api/versions', { message }); },
  version(id) { return this.call('GET', '/api/versions/' + id); },
  requests() { return this.call('GET', '/api/requests'); },
  publish(version, message) { return this.call('POST', '/api/requests', { version, message }); },
};

// a draft kept in this browser (offline, and as a safety copy)
const LKEY = 'pallet-editor-local';
export const local = {
  async save(text) {
    try {
      const db = await idb();
      await new Promise((ok, bad) => { const t = db.transaction('d', 'readwrite'); t.objectStore('d').put(text, 'draft'); t.oncomplete = ok; t.onerror = () => bad(t.error); });
    } catch (e) { console.warn('local save', e); }
  },
  async load() {
    try {
      const db = await idb();
      return await new Promise((ok) => { const r = db.transaction('d').objectStore('d').get('draft'); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); });
    } catch { return null; }
  },
};
let dbp = null;
function idb() {
  return dbp ||= new Promise((ok, bad) => { const r = indexedDB.open(LKEY, 1); r.onupgradeneeded = () => r.result.createObjectStore('d'); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
}
