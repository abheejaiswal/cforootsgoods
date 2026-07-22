// ── API client (talks to the backend; replaces browser storage) ──────────────
(function(){
  const BASE = window.__API_BASE__ || '';        // same-origin by default
  async function req(method, path, body){
    const opt = { method, credentials:'include', headers:{} };
    if (body !== undefined){ opt.headers['Content-Type']='application/json'; opt.body=JSON.stringify(body); }
    const res = await fetch(BASE + path, opt);
    const txt = await res.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch(e){ data = txt; }
    if (!res.ok){
      const err = new Error((data && data.error) || res.statusText || ('HTTP '+res.status));
      err.status = res.status; throw err;
    }
    return data;
  }
  window.API = {
    get:  (p)    => req('GET', p),
    post: (p, b) => req('POST', p, b === undefined ? {} : b),
    put:  (p, b) => req('PUT', p, b === undefined ? {} : b),
    patch:(p, b) => req('PATCH', p, b === undefined ? {} : b),
    del:  (p)    => req('DELETE', p),
    toast: function(msg){
      try {
        let d = document.getElementById('__api_toast');
        if (!d){ d = document.createElement('div'); d.id='__api_toast';
          d.style.cssText='position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#d24b4b;color:#fff;padding:10px 16px;border-radius:8px;font:13px/1.4 system-ui,sans-serif;z-index:99999;box-shadow:0 4px 14px rgba(0,0,0,.2)';
          document.body.appendChild(d);
        }
        d.textContent = msg; d.style.display='block';
        clearTimeout(window.__api_toast_t);
        window.__api_toast_t = setTimeout(()=>{ d.style.display='none'; }, 4000);
      } catch(e){ console.error(msg); }
    }
  };
})();

