let USERS_CACHE = [];               // populated after login (CEO only)
let CA_CACHE = {};                  // populated after login
function getUsers() { return USERS_CACHE; }

// Load all shared data from the server into memory after a successful login.
async function loadAllData() {
  const role = currentUser && currentUser.role;
  const [txns, ledgers] = await Promise.all([
    API.get('/api/txns'),
    API.get('/api/ledgers'),
  ]);
  TXNS = Array.isArray(txns) ? txns : [];
  CUSTOM_LEDGERS = { exp: (ledgers && ledgers.exp) || [], cr: (ledgers && ledgers.cr) || [] };
  rebuildLedgers();
  CA_CACHE = {};
  if (role === 'ceo' || role === 'ca') {
    try { CA_CACHE = (await API.get('/api/ca-reports')) || {}; } catch (e) { CA_CACHE = {}; }
  }
  USERS_CACHE = [];
  if (role === 'ceo') {
    try { USERS_CACHE = await API.get('/api/users'); } catch (e) { USERS_CACHE = []; }
  }
  // Default date range: current FY if it has data, else the full data span
  if (TXNS.length) {
    const hasData = TXNS.some(t => t.date >= fDateFrom && t.date <= fDateTo);
    if (!hasData) { const ds = TXNS.map(t => t.date).sort(); fDateFrom = ds[0]; fDateTo = ds[ds.length-1]; }
  }
}

async function doLogin() {
  const uname = (document.getElementById('l-user')?.value || '').trim().toLowerCase();
  const pass  = document.getElementById('l-pass')?.value || '';
  const err   = document.getElementById('l-err');
  err.textContent = '';
  if (!uname || !pass) { err.textContent = 'Please enter username and password.'; return; }
  try {
    const u = await API.post('/api/login', { username: uname, password: pass });
    currentUser = { username: u.username, role: u.role, name: u.name };
  } catch (e) {
    err.textContent = e.status === 401 ? 'Invalid username or password.' : ('Login failed: ' + e.message);
    return;
  }
  await applyLogin();
}

async function doLogout() {
  try { await API.post('/api/logout', {}); } catch (e) {}
  currentUser = null;
  document.getElementById('login-wrap').classList.remove('hidden');
  document.getElementById('app').style.display = 'none';
  document.getElementById('l-pass').value = '';
  document.getElementById('l-err').textContent = '';
}

async function applyLogin() {
  document.getElementById('login-wrap').classList.add('hidden');
  document.getElementById('app').style.display = 'flex';
  document.getElementById('sb-user-info').innerHTML =
    `<div style="font-weight:600;color:#242c26;font-size:12px">${esc(currentUser.name)}</div>
     <span class="rb ${ROLE_COLORS[currentUser.role]||'rb-ja'}" style="margin-top:3px;display:inline-block">${ROLE_LABELS[currentUser.role]||currentUser.role}</span>`;
  const allowed = ROLE_NAV[currentUser.role] || ['dashboard'];
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    const v = el.getAttribute('data-view');
    el.style.display = allowed.includes(v) ? 'flex' : 'none';
  });
  const nu = document.getElementById('nav-users');
  if (nu) nu.style.display = currentUser.role === 'ceo' ? 'flex' : 'none';
  const nc = document.getElementById('nav-ca');
  if (nc) nc.style.display = allowed.includes('ca') ? 'flex' : 'none';
  try { await loadAllData(); } catch (e) { API.toast('Could not load data: ' + e.message); }
  // Navigate to first allowed view
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const firstEl = document.querySelector(`.nav-item[data-view="${allowed[0]}"]`);
  if (firstEl) nav(firstEl, allowed[0]);
}

async function initAuth() {
  document.getElementById('app').style.display = 'none';
  try {
    const u = await API.get('/api/me');                 // 200 if the session cookie is valid
    currentUser = { username: u.username, role: u.role, name: u.name };
    await applyLogin();
  } catch (e) {
    // Not logged in — just show the login screen. Credentials are provisioned by
    // the administrator (see deployment docs); never printed on the login page.
    const hint = document.getElementById('l-hint');
    if (hint) hint.style.display = 'none';
    document.getElementById('login-wrap').classList.remove('hidden');
  }
}
