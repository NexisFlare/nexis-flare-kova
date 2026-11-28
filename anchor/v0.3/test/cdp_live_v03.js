// Valódi Chrome (headless, CDP) ellenőrzés az élő oldalon: v0.2 → v0.3 migráció, státusz-napló, GitHub (valódi hívás + hibaágak), áttekintés, lánc-export.
const base = process.argv[2];
const REALSHA = 'e45bdafd379bb5bf19e0bf2512c809bb39abd454';
(async () => {
  const tabs = await (await fetch('http://localhost:9333/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(tabs.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {};
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let fails = 0; const check = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); if (!cond) fails++; };
  await send('Page.enable'); await send('Runtime.enable');

  // --- v0.2 adat bevetése (valódi hash-ekkel, schema 2) ---
  await send('Page.navigate', { url: base }); await sleep(3500);
  await ev(`(async()=>{
    localStorage.clear();
    const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');
    const mk = async (id, ts, c, rel, status) => { const a = {id, type:'thought', content:c, timestamp:ts, source:{member:'Ignis (Gemini)',platform:'chat',thread:''}, status:status||'draft', tags:[], related_ids:rel||[], meta:{}}; a.hash = await sha(ts+'\\n'+c); a.hash_basis='created'; return a; };
    const arr = [await mk('v2-gyoker','2026-11-20T10:00:00.000Z','Gyökér horgony őűéá'), await mk('v2-kozep','2026-11-21T10:00:00.000Z','Közép horgony',['v2-gyoker'],'open'), await mk('v2-level','2026-11-22T10:00:00.000Z','Levél horgony',['v2-kozep','v2-gyoker','v2-hianyzo'])];
    localStorage.setItem('nexis_flare_anchors', JSON.stringify(arr)); localStorage.setItem('nexis_flare_anchors_schema','2');
    window.__raw02 = localStorage.getItem('nexis_flare_anchors'); sessionStorage.setItem('raw02', window.__raw02); return true; })()`);
  await send('Page.navigate', { url: base + '?v=' + Date.now() }); await sleep(3500);
  const m = await ev(`(async()=>{
    await window.AnchorUI.ready;
    const st = JSON.parse(localStorage.getItem('nexis_flare_anchors'));
    const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');
    const hashesOk = (await Promise.all(st.map(async a => a.hash === await sha(a.timestamp+'\\n'+a.content)))).every(Boolean);
    return { title: document.title, schema: localStorage.getItem('nexis_flare_anchors_schema'), backup: localStorage.getItem('nexis_flare_anchors_backup_v0.2') === sessionStorage.getItem('raw02'),
      logs: st.map(a => Array.isArray(a.status_log) && a.status_log.length === 0), basis: st.map(a=>a.hash_basis), hashesOk, cards: document.querySelectorAll('#list article.anchor').length,
      status: document.getElementById('status').textContent, summary: document.getElementById('integrity-summary').textContent,
      v3: typeof window.AnchorV3, footer: document.getElementById('app-foot').textContent.slice(0, 120) }; })()`);
  console.log(JSON.stringify(m));
  check('v0.3 cím és AnchorV3 betöltve', m.title.includes('v0.3') && m.v3 === 'object');
  check('migráció: séma 3, v0.2 nyers másolat, üres napló, hash-ek és basis érintetlenek, hash egyezik', m.schema === '3' && m.backup && m.logs.every(Boolean) && m.basis.every(b => b === 'created') && m.hashesOk && m.cards === 3 && m.summary.includes('3 egyezik'));
  check('migrációs állapotsor', m.status.includes('Migráció séma 2 → 3'));

  // --- áttekintés ---
  const ov = await ev(`(()=>{ const c=[...document.querySelectorAll('#overview-body .ov-col')]; return { sum: document.querySelector('#overview-body .ov-sum').textContent, roots:[...c[0].querySelectorAll('.chip-btn')].map(b=>b.textContent), leaves:[...c[1].querySelectorAll('.chip-btn')].map(b=>b.textContent), miss: (document.querySelector('.ov-miss')||{}).textContent||'' }; })()`);
  console.log(JSON.stringify(ov));
  check('globális áttekintés: gyökerek, levél, hiányzó', ov.roots[0] === 'v2-gyoker' && ov.roots.includes('v2-kozep') && ov.leaves.join() === 'v2-level' && ov.miss.includes('v2-hianyzo') && ov.sum.includes('3 horgony'));

  // --- lánc-export ---
  const ce = await ev(`(()=>{ window.AnchorUI.showChain('v2-kozep'); const v = document.getElementById('chain-md').value; return { v, head: v.split('\\n')[0], hasAll: ['v2-kozep','v2-gyoker','v2-level'].every(i => v.includes('### '+i+' (thought)')), btns: !!document.getElementById('btn-chain-copy') && !!document.getElementById('btn-chain-md') }; })()`);
  check('lánc-export: egy blokk, kiválasztott + előre + vissza', ce.head === '# Horgony-lánc: v2-kozep' && ce.hasAll && ce.btns);

  // --- státuszváltás naplóval ---
  const sl = await ev(`(async()=>{
    const card = [...document.querySelectorAll('#list article.anchor')].find(c => c.getAttribute('data-id') === 'v2-gyoker');
    card.querySelector('.sl-to').value = 'verified'; card.querySelector('.sl-by').value = 'Parázs'; card.querySelector('.sl-why').value = 'Chrome-teszt: élő oldal';
    card.querySelector('button[data-act="status-apply"]').click(); await new Promise(r=>setTimeout(r,300));
    const a = JSON.parse(localStorage.getItem('nexis_flare_anchors')).find(x => x.id === 'v2-gyoker');
    const c2 = [...document.querySelectorAll('#list article.anchor')].find(c => c.getAttribute('data-id') === 'v2-gyoker');
    const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');
    return { status: a.status, log: a.status_log, open: c2.querySelector('details.log-view').open, text: c2.querySelector('.log-list').textContent, hashOk: a.hash === await sha(a.timestamp+'\\n'+a.content) }; })()`);
  console.log(JSON.stringify(sl));
  check('státusz-napló: ki/mikor/miért, hash érintetlen', sl.status === 'verified' && sl.log.length === 1 && sl.log[0].by === 'Parázs' && sl.log[0].reason.startsWith('Chrome-teszt') && sl.log[0].from === 'draft' && sl.open && sl.hashOk);

  // --- GitHub: VALÓDI api.github.com hívás ---
  const gh = await ev(`(async()=>{
    const d = document; d.getElementById('f-content').value = 'Chrome-teszt: horgony valódi GitHub-hivatkozással'; d.getElementById('f-member').value = 'Kova';
    d.getElementById('f-github').value = 'https://github.com/NexisFlare/rajrezonancia/commit/${REALSHA}';
    d.getElementById('anchor-form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
    await new Promise(r=>setTimeout(r,6000));
    const st = JSON.parse(localStorage.getItem('nexis_flare_anchors')); const a = st[st.length-1];
    const card = [...d.querySelectorAll('#list article.anchor')].find(c => c.getAttribute('data-id') === a.id);
    const cache = JSON.parse(localStorage.getItem('nexis_flare_anchors_ghcache')||'{}')[a.id];
    return { id: a.id, ref: a.meta.github_commit, badge: !!card.querySelector('.badge.ext-ts'), pending: !!card.querySelector('.badge.gh-pending'), result: card.querySelector('.gh-result') && card.querySelector('.gh-result').textContent, cacheState: cache && cache.state, cacheInfo: cache && cache.info, status: d.getElementById('status').textContent }; })()`);
  console.log(JSON.stringify(gh));
  check('GitHub (valódi hívás): a hivatkozás mentve, a felület nem hibázik', !!gh.ref && (gh.badge || gh.pending) && !!gh.cacheState);
  if (gh.cacheState === 'ok') check('GitHub (valódi hívás): feloldva → „külső időbélyeg”, commit-dátum megvan', gh.badge && gh.cacheInfo && /^\d{4}-/.test(gh.cacheInfo.committed_at), gh.cacheInfo && gh.cacheInfo.committed_at);
  else console.log('INFO valódi hívás állapota: ' + gh.cacheState + ' (graceful fallback; a sikeres ágat alább fetch-helyettesítéssel is kipróbáljuk)');

  // --- GitHub: hibaágak és sikeres ág a böngészőben (fetch-helyettesítés) ---
  const gh2 = await ev(`(async()=>{
    const realFetch = window.fetch; const out = {};
    const d = document; const id = JSON.parse(localStorage.getItem('nexis_flare_anchors')).slice(-1)[0].id;
    const card = () => [...d.querySelectorAll('#list article.anchor')].find(c => c.getAttribute('data-id') === id);
    const run = async (label, f) => { window.fetch = f; card().querySelector('button[data-act="gh-check"]').click(); await new Promise(r=>setTimeout(r,500));
      const c = card(); out[label] = { badge: !!c.querySelector('.badge.ext-ts'), pending: !!c.querySelector('.badge.gh-pending'), text: c.querySelector('.gh-result').textContent }; };
    const okBody = { sha: '${REALSHA}', html_url: 'https://github.com/NexisFlare/rajrezonancia/commit/${REALSHA}', commit: { message: 'x', committer: { date: '2099-01-02T03:04:05Z' }, author: { date: '2099-01-02T03:04:05Z' } } };
    await run('net', () => Promise.reject(new TypeError('Failed to fetch')));
    await run('limit', async () => ({ status: 403, ok: false, json: async () => ({}) }));
    await run('notfound', async () => ({ status: 404, ok: false, json: async () => ({}) }));
    await run('ok', async () => ({ status: 200, ok: true, json: async () => okBody }));
    await run('net_after_ok', () => Promise.reject(new TypeError('Failed to fetch')));
    window.fetch = realFetch; return out; })()`);
  console.log(JSON.stringify(gh2));
  check('GitHub hálózati hiba: nincs jelvény, hivatkozás marad, érthető szöveg', !gh2.net.badge && gh2.net.pending && gh2.net.text.includes('nem érhető el'));
  check('GitHub 403/404: nincs „külső időbélyeg”', !gh2.limit.badge && !gh2.notfound.badge && gh2.notfound.text.includes('nem található'));
  check('GitHub sikeres válasz: „külső időbélyeg” jelvény', gh2.ok.badge);
  check('GitHub: sikeres után hálózati hiba nem veszi el a jelvényt', gh2.net_after_ok.badge && gh2.net_after_ok.text.includes('újraellenőrzés nem sikerült'));

  // --- export ---
  const ex = await ev(`(()=>{ const j = JSON.parse(window.AnchorUI.engine.exportToJSON()); return { v: j.version, s: j.schema_version, n: j.count, logs: j.anchors.every(a => Array.isArray(a.status_log)) }; })()`);
  check('JSON-export v0.3 / séma 3, minden horgonyon napló', ex.v === 'v0.3' && ex.s === 3 && ex.n === 4 && ex.logs);

  // --- egyéb oldalak betöltése valódi Chrome-ban ---
  for (const p of ['', 'merce/', 'modulok/', 'portrek/']) {
    await send('Page.navigate', { url: new URL(p, base.replace(/anchor\/?$/, '')).href }); await sleep(2500);
    const r = await ev(`({ t: document.title, n: document.querySelectorAll('a[href*="anchor"]').length, anchorLabel: [...document.querySelectorAll('a[href*="anchor"]')].map(a => a.textContent.trim()).filter(Boolean).join('|').slice(0,80), h1: (document.querySelector('h1')||{}).textContent })`);
    console.log('/' + p, JSON.stringify(r));
    check('oldal betölt: /' + p, !!r.h1 && (r.n === 0 || /v0\.3/.test(r.anchorLabel)));
  }

  await fetch('http://localhost:9333/json/close/' + tabs.id);
  console.log(fails ? 'CHROME LIVE FAIL (' + fails + ')' : 'CHROME LIVE OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
