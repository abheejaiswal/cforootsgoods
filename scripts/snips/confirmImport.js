window.confirmImport = async () => {
  if (!pendingImport.length) return;
  let saved;
  try {
    saved = await API.post('/api/txns', { txns: pendingImport });
  } catch (e) { alert('Import failed: ' + e.message); return; }
  TXNS.push(...saved);
  TXNS.sort((a,b) => a.date.localeCompare(b.date));
  closeModal("upload-modal");
  renderTransactions();
  alert(`\u2713 ${saved.length} transactions imported successfully!`);
  pendingImport = [];
};
