// Transforms the extracted single-file app into an API-backed front-end.
// Keeps the UI byte-for-byte; swaps only the browser-storage data layer.
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'public', 'index.html');
let h = fs.readFileSync(F, 'utf8');
const S = p => fs.readFileSync(path.join(__dirname, 'snips', p), 'utf8');

let steps = 0;
function replaceBetween(startMarker, endMarker, next, label){
  const i = h.indexOf(startMarker);
  if (i < 0) throw new Error('start marker not found: ' + label);
  const j = h.indexOf(endMarker, i);
  if (j < 0) throw new Error('end marker not found: ' + label);
  h = h.slice(0, i) + next + h.slice(j + endMarker.length);
  steps++;
}
function replaceOnce(oldStr, next, label){
  const i = h.indexOf(oldStr);
  if (i < 0) throw new Error('anchor not found: ' + label);
  if (h.indexOf(oldStr, i + oldStr.length) >= 0) throw new Error('anchor not unique: ' + label);
  h = h.slice(0, i) + next + h.slice(i + oldStr.length);
  steps++;
}
function replaceRegex(re, next, label){
  if (!re.test(h)) throw new Error('regex not matched: ' + label);
  h = h.replace(re, next);
  steps++;
}

// 1) Inject the API client at the very top of the app script
replaceOnce('const DEFAULT_CATS = [', S('apiclient.js') + '\nconst DEFAULT_CATS = [', 'apiclient');

// 2) Ledgers (loadLedgers + saveLedgers)
replaceBetween('function loadLedgers(){', 'rebuildLedgers(); }',
`function loadLedgers(){ rebuildLedgers(); }
async function saveLedgers(){ rebuildLedgers(); try{ await API.put('/api/ledgers', CUSTOM_LEDGERS); }catch(e){ API.toast('Could not save ledgers: '+e.message); } }`, 'ledgers');

// 3) Transactions init/save/update
replaceBetween('function initTxns() {', 'if(t){Object.assign(t,patch);save();} }', S('txns.js'), 'txns');

// 4) confirmImport
replaceBetween('window.confirmImport = () => {', 'pendingImport=[];\n};', S('confirmImport.js'), 'confirmImport');

// 5) Auth + data loading (getUsers .. initAuth)
replaceBetween('function getUsers() {', 'if (session) { currentUser = session; applyLogin(); }\n}', S('auth.js'), 'auth');

// 6) CA report storage
replaceBetween('function getCAReports(){ try{return JSON.parse', 'localStorage.setItem(CA_KEY,JSON.stringify(all));\n}', S('ca.js'), 'ca');

// 7) User management (saveUser + deleteUser)
replaceBetween('window.saveUser = () => {', 'saveUsers(getUsers().filter(u=>u.username!==uname));\n  renderUsers();\n};', S('usermgmt.js'), 'usermgmt');

// 8) Password pill: server never returns plaintext -> show hashed marker, drop reveal button
replaceRegex(/<span class="pwd-pill"[^>]*>[^<]*<\/span>\s*<button[^>]*togglePwd[^>]*>[^<]*<\/button>/,
  '<span class="pwd-pill">\u2022\u2022\u2022\u2022\u2022\u2022 (hashed)</span>', 'pwdpill');

// 9) Security banner text
replaceRegex(/Credentials are stored in[\s\S]*?sharing purposes\./,
  'Accounts are stored on the server with hashed passwords. Access is controlled by login and role \u2014 share credentials only with authorised staff over a secure channel.', 'secbanner');

// 10) Logo: replace bundler UUID with an inline SVG wordmark (both occurrences)
const wordmark = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 40">' +
  '<g transform="translate(2,6)">' +
  '<rect x="0" y="14" width="7" height="14" rx="1.5" fill="#d24b4b"/>' +
  '<rect x="9" y="8" width="7" height="20" rx="1.5" fill="#5f8a1e"/>' +
  '<rect x="18" y="3" width="7" height="25" rx="1.5" fill="#5f8a1e"/>' +
  '<rect x="27" y="11" width="7" height="17" rx="1.5" fill="#d24b4b"/></g>' +
  '<text x="42" y="27" font-family="Manrope,system-ui,sans-serif" font-size="20" font-weight="800" fill="#242c26" letter-spacing="0.5">ROOTSGOODS</text>' +
  '</svg>');
const before = h.split('c0bba04f-0d38-45d0-b708-b4d90a333665').length - 1;
if (before < 1) throw new Error('logo uuid not found');
h = h.split('c0bba04f-0d38-45d0-b708-b4d90a333665').join(wordmark);
steps++;

// 11) Web font: add Google Fonts link (the bundler font UUIDs won't resolve when hosted)
replaceOnce('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">\n<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">', 'font');

// 11b) Edit-user: server never returns plaintext password -> blank the field (openEditUser prefill)
replaceOnce("document.getElementById('uf-pass').value=u.password;",
  "document.getElementById('uf-pass').value='';", 'edituser');

// 12) Boot: drop the localStorage default-date IIFE (now handled in loadAllData)
replaceBetween('initTxns();\n// Default date range:', 'initAuth();', 'initTxns();\ninitAuth();', 'boot');

fs.writeFileSync(F, h);
console.log('front-end patched in', steps, 'steps ->', F);
