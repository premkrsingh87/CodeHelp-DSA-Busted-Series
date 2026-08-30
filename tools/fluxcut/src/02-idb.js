/* FluxCut Studio — IndexedDB: persistent thumbnail / waveform / project cache.
   Keeps reopening a project instant without re-decoding a single video frame. */
(function (FC) {
  'use strict';
  const U = FC.util;
  const DB = 'fluxcut', VER = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      let rq;
      try { rq = indexedDB.open(DB, VER); } catch (e) { return res(null); }
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains('thumbs')) db.createObjectStore('thumbs');
        if (!db.objectStoreNames.contains('waves')) db.createObjectStore('waves');
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);          // private mode / blocked → run without cache
      rq.onblocked = () => res(null);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const db = await open(); if (!db) return null;
    return new Promise((res, rej) => {
      let out;
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      try { out = fn(s); } catch (e) { return res(null); }
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = t.onabort = () => res(null);
    });
  }
  const get = (store, key) => tx(store, 'readonly', s => s.get(key));
  const put = (store, key, val) => tx(store, 'readwrite', s => s.put(val, key));
  const del = (store, key) => tx(store, 'readwrite', s => s.delete(key));
  const keys = (store) => tx(store, 'readonly', s => s.getAllKeys());
  const all = (store) => tx(store, 'readonly', s => s.getAll());
  const clear = (store) => tx(store, 'readwrite', s => s.clear());

  async function usage() {
    try { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0 }; }
    catch (e) { return { used: 0, quota: 0 }; }
  }
  async function saveProject(id, json, meta) {
    await put('projects', id, { id, json, meta: meta || {}, at: Date.now() });
  }
  async function listProjects() {
    const rows = (await all('projects')) || [];
    return rows.sort((a, b) => b.at - a.at).map(r => ({ id: r.id, at: r.at, meta: r.meta, size: (r.json || '').length }));
  }
  async function loadProject(id) { const r = await get('projects', id); return r ? r.json : null; }

  FC.idb = { open, get, put, del, keys, all, clear, usage, saveProject, listProjects, loadProject };
})(window.FC);
