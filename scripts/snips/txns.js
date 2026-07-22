function initTxns() { TXNS = []; }               // data is loaded from the server after login
function save() {}                               // no-op: each mutation is persisted via the API
function updTxn(id, patch) {
  const t = TXNS.find(x => x.id === id);
  if (t) {
    Object.assign(t, patch);                     // optimistic local update
    API.patch('/api/txns/' + encodeURIComponent(id), patch)
       .catch(e => API.toast('Save failed: ' + e.message));
  }
}
