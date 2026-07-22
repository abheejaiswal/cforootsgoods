window.saveUser = async () => {
  const name    = document.getElementById('uf-name').value.trim();
  const uname   = document.getElementById('uf-user').value.trim().toLowerCase().replace(/\s+/g,'_');
  const pass    = document.getElementById('uf-pass').value.trim();
  const role    = document.getElementById('uf-role').value;
  const editing = document.getElementById('uf-editing').value;
  const errEl   = document.getElementById('uf-err');

  if (!name)  { errEl.textContent='Name is required.'; return; }
  if (!uname) { errEl.textContent='Username is required.'; return; }
  if (!editing && !pass) { errEl.textContent='Password is required.'; return; }
  if (pass && pass.length<6) { errEl.textContent='Password must be at least 6 characters.'; return; }

  try {
    if (editing) {
      const body = { name, role };
      if (pass) body.password = pass;              // only change password if a new one was typed
      await API.put('/api/users/'+encodeURIComponent(editing), body);
    } else {
      await API.post('/api/users', { username:uname, password:pass, role, name });
    }
  } catch (e) {
    errEl.textContent = e.status===409 ? 'Username already taken.' : ('Save failed: '+e.message);
    return;
  }
  try { USERS_CACHE = await API.get('/api/users'); } catch(e){}
  document.getElementById('user-form-wrap').style.display='none';
  renderUsers();
};

window.deleteUser = async (uname) => {
  if (uname==='ceo'||uname===currentUser?.username) { alert('Cannot delete the CEO account or your own account.'); return; }
  if (!confirm(`Delete user "${uname}"? This cannot be undone.`)) return;
  try { await API.del('/api/users/'+encodeURIComponent(uname)); }
  catch (e) { alert('Delete failed: '+e.message); return; }
  try { USERS_CACHE = await API.get('/api/users'); } catch(e){}
  renderUsers();
};
