/* Scandi ERP — umumiy klient qatlami: sessiya, huquq, so'rov.
   Har sahifa shuni ulaydi va App.start() bilan boshlaydi. */
const App = (() => {
  const KEY = 'erp.token';
  let me = null;

  const token    = () => localStorage.getItem(KEY);
  const setToken = (t) => t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY);

  async function api(path, opts = {}) {
    const r = await fetch(path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token() ? { Authorization: 'Bearer ' + token() } : {}),
        ...(opts.headers || {}),
      },
    });
    if (r.status === 401) { setToken(null); gate(); throw new Error('Sessiya tugadi'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Xato');
    return j;
  }

  const can = (...p) => !!me && p.some((x) => me.permissions.includes(x));

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    setToken(null);
    location.reload();
  }

  // Kirish ekrani. Telegram Mini App ichida ochilsa PIN so'ralmaydi —
  // xodim initData imzosi orqali aniqlanadi.
  function gate(message) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="overlay" id="erpGate">
        <div class="modal" style="max-width:360px">
          <h2>Scandi ERP</h2>
          <p class="muted" style="margin:8px 0 18px">Kirish uchun PIN kodingizni kiriting</p>
          ${message ? `<p class="tag bad" style="display:block;margin-bottom:12px">${message}</p>` : ''}
          <input id="erpPin" type="tel" inputmode="numeric" maxlength="6" placeholder="••••"
                 style="font-size:28px;text-align:center;letter-spacing:.4em">
          <button class="primary" style="width:100%;margin-top:14px" id="erpGo">Kirish</button>
        </div>
      </div>`);
    const go = async () => {
      try {
        const r = await api('/api/auth/pin',
          { method: 'POST', body: JSON.stringify({ pin: document.getElementById('erpPin').value }) });
        setToken(r.token);
        location.reload();
      } catch (e) {
        const g = document.getElementById('erpGate');
        if (g) g.remove();
        gate(e.message);
      }
    };
    document.getElementById('erpGo').onclick = go;
    document.getElementById('erpPin').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    document.getElementById('erpPin').focus();
  }

  // Telegram Mini App ichida bo'lsa avtomatik kirish
  async function tryTelegram() {
    const tg = window.Telegram?.WebApp;
    if (!tg?.initData) return false;
    try {
      const r = await api('/api/auth/telegram',
        { method: 'POST', body: JSON.stringify({ initData: tg.initData }) });
      setToken(r.token);
      me = r.user;
      return true;
    } catch { return false; }
  }

  // Sahifa shu bilan boshlanadi:
  //   App.start(me => { ... }, 'production.view')
  async function start(onReady, ...required) {
    if (!me && token()) { try { me = await api('/api/auth/me'); } catch { me = null; } }
    if (!me) await tryTelegram();
    if (!me) return gate();

    if (required.length && !can(...required)) {
      document.body.innerHTML =
        `<div class="card" style="max-width:420px;margin:80px auto;text-align:center">
           <h2>Ruxsat yo'q</h2>
           <p class="muted" style="margin:10px 0 18px">Bu bo'lim sizning rolingizga ochiq emas.</p>
           <button onclick="App.logout()">Boshqa hisob bilan kirish</button></div>`;
      return;
    }
    // Sarlavhadagi foydalanuvchi paneli
    const slot = document.getElementById('erpUser');
    if (slot) slot.innerHTML =
      `<span class="muted">${me.name}${me.roles[0] ? ' · ' + me.roles[0].name : ''}</span>
       <button onclick="App.logout()">Chiqish</button>`;
    onReady(me);
  }

  return { api, can, start, logout, me: () => me };
})();
