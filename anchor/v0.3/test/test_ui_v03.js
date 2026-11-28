const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path'), assert = require('assert');
const { webcrypto } = require('crypto');
const ROOT = path.resolve(__dirname, '../anchor');
const BASE = 'https://nexisflare.github.io/rajrezonancia/anchor/';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let n = 0; const ok = (m) => console.log('PASS', ++n, m);
const sha = async (s) => Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(s))).toString('hex');

async function open(init, opts = {}) {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, s) => '<script>' + fs.readFileSync(path.join(ROOT, s), 'utf8').replace(/<\/script/g, '<\\/script') + '</script>');
  const dom = new JSDOM(html, { url: BASE, runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      if (init) Object.keys(init).forEach(k => w.localStorage.setItem(k, init[k]));
      if (!opts.noCrypto) { Object.defineProperty(w, 'crypto', { value: { subtle: webcrypto.subtle }, configurable: true }); }
      w.TextEncoder = TextEncoder;
      if (opts.fetch) w.fetch = opts.fetch;
      w.confirm = () => true;
      w.__copied = [];
      Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: (t) => { w.__copied.push(t); return Promise.resolve(); } }, configurable: true });
      w.__downloads = [];
      w.URL.createObjectURL = (b) => { w.__blob = b; return 'blob:t'; }; w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () { w.__downloads.push({ name: this.download, blob: w.__blob }); };
      w.HTMLElement.prototype.scrollIntoView = function () {};
    } });
  await new Promise(r => dom.window.addEventListener('load', r));
  await dom.window.AnchorUI.ready;
  await wait(20);
  return dom;
}
const readBlob = (w, b) => new Promise((res, rej) => { const r = new w.FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(b); });
const cards = (w) => [...w.document.querySelectorAll('#list article.anchor')];
async function submit(w, o) {
  Object.keys(o).forEach(k => { w.document.getElementById(k).value = o[k]; });
  w.document.getElementById('anchor-form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  await wait(80);
}
async function doImport(w, text) {
  const input = w.document.getElementById('import-file');
  Object.defineProperty(input, 'files', { value: [new w.File([text], 'x.json')], configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  await wait(150);
}

(async () => {
  // v0.1 adat migrációja
  const v01 = [
    { id: 'anchor-2026-11-20-001', type: 'thought', content: 'Régi horgony egy.', timestamp: '2026-11-20T10:00:00.000Z', source: { member: 'Ignis (Gemini)', platform: 'chat', thread: '' }, status: 'open', tags: ['137'], related_ids: [], meta: {} },
    { id: 'anchor-2026-11-20-002', type: 'decision', content: 'Régi horgony kettő – ékezetek: őűéá.', timestamp: '2026-11-20T11:00:00.000Z', source: { member: 'Kova', platform: 'chat', thread: '' }, status: 'draft', tags: [], related_ids: ['anchor-2026-11-20-001'], meta: { falsification_criteria: 'x' } }
  ];
  const raw = JSON.stringify(v01);
  let dom = await open({ nexis_flare_anchors: raw });
  let w = dom.window, d = w.document;
  assert.strictEqual(cards(w).length, 2);
  const st = JSON.parse(w.localStorage.getItem('nexis_flare_anchors'));
  assert.strictEqual(st[0].hash, await sha(v01[0].timestamp + '\n' + v01[0].content));
  assert.strictEqual(st[1].hash, await sha(v01[1].timestamp + '\n' + v01[1].content));
  assert.strictEqual(st[1].hash_basis, 'migrated');
  assert.strictEqual(w.localStorage.getItem('nexis_flare_anchors_schema'), '3');
  assert.strictEqual(w.localStorage.getItem('nexis_flare_anchors_backup_v0.1'), raw);
  assert(st.every(a => Array.isArray(a.status_log) && a.status_log.length === 0));
  ok('v0.1 → v0.3 migráció: hash = független SHA-256, basis=migrated, séma=3, nyers mentés, üres napló');
  assert(d.getElementById('status').textContent.includes('Migráció séma 1 → 3'));
  assert(d.getElementById('integrity-summary').textContent.includes('2 egyezik'));
  assert(cards(w).every(c => c.textContent.includes('hash egyezik')));
  ok('integritás-összegzés és jelvények');
  assert(d.getElementById('app-foot').textContent.includes('Koncepció: Ignis · Mag, v0.2- és v0.3-ötletek: Hídépítő · Függetlenségi mező: Aletheia (Ignis szempontjaival) · Építés: Kova – Nexis Flare raj, 2026-11-28'));
  ok('lábléc kreditsor');
  assert(![...d.querySelectorAll('*')].some(e => /tény\s*\/\s*érzés|érzés-metafora|bizonytalanság/i.test(e.textContent) && e.children.length === 0));
  ok('nincs tény/érzés-metafora/bizonytalanság felosztás a felületen');

  // újabb horgony függetlenségi mezővel + XSS
  await submit(w, { 'f-type': 'thought', 'f-status': 'open', 'f-content': 'Új horgony <img src=x onerror="window.__xss=1">', 'f-member': 'Aletheia', 'f-platform': 'chat', 'f-tags': 'mérce', 'f-related': 'anchor-2026-11-20-002',
    'f-indep-external': 'igen', 'f-indep-knew_conclusion': 'igen', 'f-indep-own_check': 'nem_eldontheto', 'f-indep-note': 'Ugyanaz a forráskészlet.' });
  assert.strictEqual(cards(w).length, 3);
  assert(!w.__xss && !d.querySelector('#list img')); ok('XSS: szöveg marad szöveg');
  const stored = JSON.parse(w.localStorage.getItem('nexis_flare_anchors'));
  const nw = stored[stored.length - 1];
  assert.strictEqual(nw.hash_basis, 'created');
  assert.strictEqual(nw.hash, await sha(nw.timestamp + '\n' + nw.content));
  assert.strictEqual(nw.meta.independence_external, 'igen');
  assert.strictEqual(nw.meta.independence_knew_conclusion, 'igen');
  assert.strictEqual(nw.meta.independence_note, 'Ugyanaz a forráskészlet.');
  assert(!('independence_same_sources' in nw.meta));
  ok('új horgony: hash=created, függetlenségi mezők laposan a meta-ban');
  const newCard = cards(w).find(c => c.textContent.includes('Új horgony'));
  assert(newCard.querySelector('li.weak')); assert(newCard.textContent.includes('gyengítő válasz'));
  assert(newCard.textContent.includes('Ugyanaz a forráskészlet.'));
  ok('függetlenségi összegzés, gyengítő válasz jelölve');

  // keresés
  d.getElementById('flt-text').value = 'régi'; d.getElementById('flt-text').dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.strictEqual(cards(w).length, 2); assert(d.querySelector('#list mark'));
  d.getElementById('flt-text').value = 'forráskészlet'; d.getElementById('flt-text').dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.strictEqual(cards(w).length, 1); ok('tartalomkeresés kiemeléssel, megjegyzésre is keres');
  d.getElementById('btn-clear-filters').click();
  assert.strictEqual(cards(w).length, 3);

  // lánc
  w.AnchorUI.showChain('anchor-2026-11-20-001');
  const ch = d.getElementById('chain-body').textContent;
  assert(!d.getElementById('chain-panel').hidden);
  assert(ch.includes('anchor-2026-11-20-002') && ch.includes('→')); ok('láncnézet mutatja a visszafelé hivatkozókat');
  d.querySelector('#chain-body .chain-row button').click();
  assert(d.getElementById('chain-body').textContent.includes('Kiválasztott')); ok('lánc elemei kattinthatók');

  // MD másolás
  d.querySelector('button[data-act="copy"]').click(); await wait(30);
  assert(w.__copied.length === 1 && w.__copied[0].includes('SHA-256')); ok('Másolás MD vágólapra, hash is benne');
  d.getElementById('btn-copy-list').click(); await wait(30);
  assert(w.__copied.length === 2 && w.__copied[1].includes('Régi horgony')); ok('szűrt lista másolása');

  // JSON export versioned
  d.getElementById('btn-export-json').click();
  const ex = JSON.parse(await readBlob(w, w.__downloads[0].blob));
  assert.strictEqual(ex.format, 'nexis-flare-anchors'); assert.strictEqual(ex.version, 'v0.3'); assert.strictEqual(ex.schema_version, 3); assert.strictEqual(ex.count, 3); assert(Array.isArray(ex.anchors));
  assert(w.__downloads[0].name.endsWith('.json') && w.__downloads[0].name.includes('v0.3')); assert(ex.anchors.every(a => Array.isArray(a.status_log))); ok('verziózott JSON-export (v0.3, séma 3, státusz-napló)');
  d.getElementById('btn-export-md').click(); assert((await readBlob(w, w.__downloads[1].blob)).includes('SHA-256')); ok('MD export');

  // manipuláció: tartalom módosítása → eltérés
  const tampered = JSON.parse(w.localStorage.getItem('nexis_flare_anchors'));
  tampered[0].content = 'Átírt szöveg'; w.localStorage.setItem('nexis_flare_anchors', JSON.stringify(tampered));
  w.AnchorUI.engine.load && w.AnchorUI.engine.load();
  dom.window.close();
  dom = await open({ nexis_flare_anchors: JSON.stringify(tampered), nexis_flare_anchors_schema: '3' });
  w = dom.window; d = w.document;
  assert(d.getElementById('integrity-summary').textContent.includes('1 eltér'));
  assert(d.querySelector('.card.is-mismatch') && d.querySelector('.badge.integ-mismatch')); ok('módosított tartalom → "hash eltér" jelzés');
  d.getElementById('flt-integrity').value = 'mismatch'; d.getElementById('flt-integrity').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.strictEqual(cards(w).length, 1); ok('integritás-szűrő');

  // import: v0.1 tömb és v0.2 wrapper, ütköző id nem írja felül
  dom = await open();
  w = dom.window; d = w.document;
  await doImport(w, raw);
  assert.strictEqual(cards(w).length, 2);
  assert(cards(w).every(c => c.querySelector('.origin-imported')));
  assert(JSON.parse(w.localStorage.getItem('nexis_flare_anchors'))[0].hash_basis === 'imported'); ok('v0.1 tömb import → hash_basis=imported, Importált jelölés');
  await doImport(w, JSON.stringify(ex));
  assert.strictEqual(cards(w).length, 3); ok('v0.3 import, meglévő id kihagyva');
  await doImport(w, JSON.stringify({ format: 'nexis-flare-anchors', version: 'v9.9', schema_version: 9, anchors: [] }));
  assert(d.getElementById('status').textContent.length > 0); ok('újabb verzió: figyelmeztet, nem omlik össze');
  await doImport(w, 'ez nem json');
  assert(d.getElementById('status').className.includes('err')); ok('hibás JSON: hibaüzenet');

  // törlés
  d.querySelector('button[data-act="delete"]').click(); await wait(60);
  assert.strictEqual(cards(w).length, 2); ok('törlés megerősítéssel');

  // Web Crypto nélkül
  dom = await open({ nexis_flare_anchors: raw }, { noCrypto: true });
  w = dom.window; d = w.document;
  assert(!d.getElementById('notice-crypto').hidden); assert.strictEqual(cards(w).length, 2);
  assert.deepStrictEqual(JSON.parse(w.localStorage.getItem('nexis_flare_anchors')).map(a => { const c = Object.assign({}, a); delete c.status_log; return c; }), v01);
  assert.strictEqual(w.localStorage.getItem('nexis_flare_anchors_backup_v0.1'), raw); assert.strictEqual(w.localStorage.getItem('nexis_flare_anchors_schema'), null);
  ok('Web Crypto nélkül: figyelmeztetés, az adat sértetlen (csak üres napló került rá), nyers másolat megvan, séma-kulcs nem lép');
  await submit(w, { 'f-content': 'hash nélküli' });
  assert.strictEqual(cards(w).length, 3); ok('Web Crypto nélkül is lehet horgonyt rögzíteni');

  // v0.2.1: igen/nem súgók és megjegyzés-segéd, nincs pontszám
  dom = await open();
  w = dom.window; d = w.document;
  assert(d.title.includes('v0.3') && d.querySelector('h1').textContent.includes('v0.3'));
  const hints = [...d.querySelectorAll('.indep-hint')];
  assert.strictEqual(hints.length, 8);
  const byLabel = {};
  d.querySelectorAll('.indep-field').forEach(lab => {
    const l = lab.querySelector('span') && lab.querySelector('span').textContent;
    const h = lab.querySelector('.indep-hint') && lab.querySelector('.indep-hint').textContent;
    if (l) byLabel[l] = h;
  });
  assert(/gyengítheti/.test(byLabel['Ismerte az eredeti következtetést?']));
  assert(/gyengítheti/.test(byLabel['Ugyanazokat a forrásokat használta?']));
  assert(/erősítheti/.test(byLabel['Külső volt az ellenőrző?']));
  const help = d.getElementById('indep-note-help').textContent;
  assert(help.includes('mi alapján') && help.includes('konkrét bizonyíték') && help.includes('nem tudtuk megvizsgálni'));
  assert(!/pontszám|százalék|független \/ nem független|score/i.test(d.body.innerText + d.getElementById('app-foot').textContent) || help.includes('nem ad pontszámot'));
  // no scoring UI
  assert(!d.querySelector('[data-score], .indep-score, #indep-score'));
  ok('v0.2.1: 8 igen/nem súgó, a két gyengítő igen jelölve, megjegyzés-segéd, nincs pontozás');


  // ================= v0.3 =================
  const SHA40 = 'f75a2c36' + 'b'.repeat(32);
  const okFetch = (msgFn) => { const f = async (url) => { f.calls.push(url); return { status: 200, ok: true, json: async () => ({ sha: SHA40, html_url: 'https://github.com/NexisFlare/rajrezonancia/commit/' + SHA40, commit: { message: msgFn ? msgFn() : 'm', committer: { date: '2099-01-02T03:04:05Z' }, author: { date: '2099-01-02T03:04:05Z' } } }) }; }; f.calls = []; return f; };
  const failFetch = (kind) => { const f = async (url) => { f.calls.push(url); if (kind === 'net') throw new TypeError('Failed to fetch'); return { status: kind, ok: false, json: async () => ({}) }; }; f.calls = []; return f; };

  // A) v0.2 adat migrációja v0.3-ra az oldalon
  {
    const e = await import_v02();
    async function import_v02() {
      // v0.2-es adat: két hash-elt horgony, séma 2
      const dm = await open();
      const E = dm.window.AnchorUI.engine; // csak a hash-számításhoz használjuk az alap motort
      const base = (id, ts, c, rel) => ({ id, type: 'thought', content: c, timestamp: ts, source: { member: 'K', platform: 'p', thread: '' }, status: 'draft', tags: [], related_ids: rel || [], meta: {} });
      const arr = [base('v2-a', '2026-11-26T10:00:00.000Z', 'Kettes A'), base('v2-b', '2026-11-26T11:00:00.000Z', 'Kettes B', ['v2-a'])];
      for (const a of arr) { a.hash = await sha(a.timestamp + '\n' + a.content); a.hash_basis = 'created'; }
      dm.window.close();
      return arr;
    }
    const raw2 = JSON.stringify(e);
    dom = await open({ nexis_flare_anchors: raw2, nexis_flare_anchors_schema: '2' });
    w = dom.window; d = w.document;
    assert.strictEqual(w.localStorage.getItem('nexis_flare_anchors_schema'), '3');
    assert.strictEqual(w.localStorage.getItem('nexis_flare_anchors_backup_v0.2'), raw2);
    assert(d.getElementById('status').textContent.includes('Migráció séma 2 → 3'));
    const mig = JSON.parse(w.localStorage.getItem('nexis_flare_anchors'));
    assert.deepStrictEqual(mig.map(a => a.hash), e.map(a => a.hash)); assert.deepStrictEqual(mig.map(a => a.hash_basis), ['created', 'created']);
    assert(mig.every(a => Array.isArray(a.status_log) && !a.status_log.length));
    assert(cards(w).every(c => c.textContent.includes('hash egyezik') && c.textContent.includes('Státusz-napló (0)')));
    assert(cards(w).every(c => c.querySelector('details.log-view') && c.querySelector('details.gh-view')));
    ok('v0.2 → v0.3 migráció az oldalon: séma 3, v0.2 másolat, hash-ek érintetlenek, üres napló, hash egyezik');

    // B) státuszváltás naplóval a felületen
    const card = cards(w).find(c => c.textContent.includes('Kettes A'));
    const aid = card.getAttribute('data-id');
    assert.strictEqual(card.querySelector('details.log-view').open, false);
    card.querySelector('.sl-to').value = 'verified';
    card.querySelector('.sl-by').value = 'Hídépítő <b>x</b>';
    card.querySelector('.sl-why').value = 'Átnéztük <img src=x onerror="window.__xss2=1">';
    card.querySelector('button[data-act="status-apply"]').click(); await wait(40);
    const sv = JSON.parse(w.localStorage.getItem('nexis_flare_anchors')).find(a => a.id === aid);
    assert.strictEqual(sv.status, 'verified'); assert.strictEqual(sv.status_log.length, 1);
    assert.strictEqual(sv.status_log[0].by, 'Hídépítő <b>x</b>'); assert(sv.status_log[0].reason.startsWith('Átnéztük'));
    assert.strictEqual(sv.status_log[0].from, 'draft'); assert.strictEqual(sv.status_log[0].to, 'verified'); assert(!isNaN(Date.parse(sv.status_log[0].at)));
    const card2 = cards(w).find(c => c.getAttribute('data-id') === aid);
    assert(card2.textContent.includes('Státusz-napló (1)')); assert.strictEqual(card2.querySelector('details.log-view').open, true);
    assert(card2.querySelector('.log-list').textContent.includes('Hídépítő <b>x</b>') && card2.querySelector('.log-list').textContent.includes('Vázlat → Ellenőrzött'));
    assert(!w.__xss2 && !card2.querySelector('.log-list b, .log-list img'));
    assert(card2.querySelector('.badge.status-verified'));
    assert(card2.textContent.includes('hash egyezik'));
    ok('státusz-napló a felületen: ki/mikor/miért mentve, összecsukható rész nyitva marad, szöveg marad szöveg, hash érintetlen');
    // ugyanarra a státuszra nincs lehetőség, rossz érték hibát ad
    assert(![...card2.querySelectorAll('.sl-to option')].some(o => o.value === 'verified'));
    ok('a mostani státusz nem választható új státuszként');
  }

  // C) GitHub-hivatkozás: sikeres feloldás, hibák, graceful fallback
  {
    const f1 = okFetch(() => 'x');
    dom = await open({}, { fetch: f1 });
    w = dom.window; d = w.document;
    await submit(w, { 'f-content': 'Horgony GitHub-hivatkozással', 'f-member': 'Kova', 'f-github': 'https://github.com/NexisFlare/rajrezonancia/commit/' + SHA40 });
    await wait(150);
    assert.strictEqual(f1.calls.length, 1); assert.strictEqual(f1.calls[0], 'https://api.github.com/repos/NexisFlare/rajrezonancia/commits/' + SHA40);
    let c = cards(w)[0];
    assert(c.querySelector('.badge.ext-ts') && c.querySelector('.badge.ext-ts').textContent === 'külső időbélyeg');
    assert(c.querySelector('details.gh-view').open); assert(c.querySelector('.gh-result').textContent.includes('Megtalálva az api.github.com-on'));
    assert(c.querySelector('.gh-result').textContent.includes('nem említi'));
    assert(c.querySelector('.gh-view a').href === 'https://github.com/NexisFlare/rajrezonancia/commit/' + SHA40 && c.querySelector('.gh-view a').rel.includes('noopener'));
    const saved = JSON.parse(w.localStorage.getItem('nexis_flare_anchors'))[0];
    assert.strictEqual(saved.meta.github_commit, 'https://github.com/NexisFlare/rajrezonancia/commit/' + SHA40);
    assert.strictEqual(saved.hash, await sha(saved.timestamp + '\n' + saved.content));
    assert(c.textContent.includes('hash egyezik'));
    // újratöltve a gyorsítótárból is látszik, hálózat nélkül
    const lsCopy = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); lsCopy[k] = w.localStorage.getItem(k); }
    dom = await open(lsCopy, { fetch: failFetch('net') });
    w = dom.window; d = w.document; c = cards(w)[0];
    assert(c.querySelector('.badge.ext-ts'));
    ok('GitHub: sikeres feloldás → „külső időbélyeg” jelzés, hivatkozás mentve, hash érintetlen, gyorsítótárból újratöltve is látszik');

    // érvénytelen hivatkozás az űrlapon
    const before = cards(w).length;
    await submit(w, { 'f-content': 'Rossz hivatkozás', 'f-github': 'ez nem commit' });
    assert.strictEqual(cards(w).length, before); assert(!d.getElementById('form-error').hidden && d.getElementById('form-error').textContent.includes('nem értelmezhető'));
    ok('érvénytelen GitHub-hivatkozás: az űrlap nem rögzít, érthető hibát ad');
    d.getElementById('f-github').value = '';

    // hálózati hiba: a hivatkozás megmarad, nincs jelvény, nincs összeomlás
    const f2 = failFetch('net');
    dom = await open({}, { fetch: f2 });
    w = dom.window; d = w.document;
    await submit(w, { 'f-content': 'Offline horgony', 'f-github': 'NexisFlare/rajrezonancia@' + SHA40 });
    await wait(150);
    c = cards(w)[0];
    assert(!c.querySelector('.badge.ext-ts')); assert(c.querySelector('.badge.gh-pending'));
    assert(c.querySelector('.gh-result').textContent.includes('nem érhető el') && c.querySelector('.gh-result').textContent.includes('megmarad'));
    assert.strictEqual(JSON.parse(w.localStorage.getItem('nexis_flare_anchors'))[0].meta.github_commit, 'NexisFlare/rajrezonancia@' + SHA40);
    assert(d.getElementById('status').textContent.includes('megmarad'));
    assert(c.textContent.includes('hash egyezik'));
    ok('GitHub hálózati hiba: graceful fallback (hivatkozás megmarad, „GitHub-hivatkozás” jelvény, nincs „külső időbélyeg”, nincs hiba)');

    // a kártyán: újraellenőrzés most már sikeres fetch-csel
    w.fetch = okFetch(() => 'Anchor ' + JSON.parse(w.localStorage.getItem('nexis_flare_anchors'))[0].hash.slice(0, 12));
    c.querySelector('button[data-act="gh-check"]').click(); await wait(100);
    c = cards(w)[0];
    assert(c.querySelector('.badge.ext-ts')); assert(c.querySelector('.gh-result').textContent.includes('tartalmazza a horgony hash-ének elejét'));
    assert(c.querySelector('.gh-result').textContent.includes('Figyelem: a commit korábbi') === false);
    ok('újraellenőrzés a kártyán: jelvény megjelenik, a hash-említés kiderül');

    // 403 (limit) és 404
    w.fetch = failFetch(403);
    c.querySelector('button[data-act="gh-check"]').click(); await wait(80);
    c = cards(w)[0];
    assert(c.querySelector('.badge.ext-ts')); assert(c.querySelector('.gh-result').textContent.includes('újraellenőrzés nem sikerült'));
    ok('403 (limit) újraellenőrzéskor a korábbi sikeres eredmény megmarad, jelzett figyelmeztetéssel');
    w.fetch = failFetch(404);
    c.querySelector('button[data-act="gh-check"]').click(); await wait(80);
    c = cards(w)[0];
    assert(!c.querySelector('.badge.ext-ts')); assert(c.querySelector('.gh-result').textContent.includes('nem található nyilvános commit'));
    ok('404: nincs „külső időbélyeg”, a hivatkozás megmarad');

    // hivatkozás módosítása és törlése a kártyán
    c.querySelector('.gh-input').value = 'szia';
    c.querySelector('button[data-act="gh-save"]').click(); await wait(30);
    assert(d.getElementById('status').className.includes('err'));
    c.querySelector('.gh-input').value = '';
    c.querySelector('button[data-act="gh-save"]').click(); await wait(30);
    c = cards(w)[0];
    assert.strictEqual(JSON.parse(w.localStorage.getItem('nexis_flare_anchors'))[0].meta.github_commit, undefined);
    assert(!c.querySelector('.badge.ext-ts') && !c.querySelector('.badge.gh-pending'));
    ok('hivatkozás törlése és rossz érték elutasítása a kártyán');

    // XSS a hivatkozásban (importált, értelmezhetetlen érték)
    const evil = [{ id: 'evil-1', type: 'thought', content: 'x', timestamp: '2026-11-28T10:00:00.000Z', source: { member: 'a', platform: 'b', thread: '' }, status: 'draft', tags: [], related_ids: [], meta: { github_commit: '<img src=x onerror="window.__xss3=1">' } }];
    dom = await open({}); w = dom.window; d = w.document;
    await doImport(w, JSON.stringify(evil));
    assert(!w.__xss3 && !d.querySelector('#list img')); assert(d.querySelector('.gh-view code').textContent.includes('<img'));
    assert(d.querySelector('.gh-result').textContent.includes('nem értelmezhető'));
    ok('értelmezhetetlen GitHub-hivatkozás szövegként jelenik meg, nincs szkript-futás');
  }

  // D) áttekintés + E) lánc-export
  {
    const base = (id, ts, c, rel) => ({ id, type: 'thought', content: c, timestamp: ts, source: { member: 'K', platform: 'p', thread: '' }, status: 'draft', tags: [], related_ids: rel || [], meta: {}, status_log: [] });
    const seed = [base('A', '2026-11-20T10:00:00.000Z', 'Gyökér szöveg'), base('B', '2026-11-21T10:00:00.000Z', 'Közép', ['A']), base('C', '2026-11-22T10:00:00.000Z', 'Levél egy', ['B', 'A', 'HIANY-1']), base('D', '2026-11-23T10:00:00.000Z', 'Levél kettő', ['B']), base('Z', '2026-11-24T10:00:00.000Z', 'Különálló')];
    for (const a of seed) { a.hash = await sha(a.timestamp + '\n' + a.content); a.hash_basis = 'created'; }
    dom = await open({ nexis_flare_anchors: JSON.stringify(seed), nexis_flare_anchors_schema: '3' });
    w = dom.window; d = w.document;
    const ovb = d.getElementById('overview-body');
    assert(ovb.querySelector('.ov-sum').textContent.includes('5 horgony') && ovb.querySelector('.ov-sum').textContent.includes('2 gyökér') && ovb.querySelector('.ov-sum').textContent.includes('3 levél (ebből 1 különálló)') && ovb.querySelector('.ov-sum').textContent.includes('1 hiányzó'));
    const cols = ovb.querySelectorAll('.ov-col');
    const rootIds = [...cols[0].querySelectorAll('.ov-item .chip-btn')].map(b => b.textContent);
    const leafIds = [...cols[1].querySelectorAll('.ov-item .chip-btn')].map(b => b.textContent);
    assert.deepStrictEqual(rootIds, ['B', 'A']); assert(cols[0].querySelector('.ov-item').textContent.includes('← 2 hivatkozás'));
    assert.deepStrictEqual(leafIds, ['Z', 'D', 'C']); assert(cols[1].textContent.includes('(különálló)') && cols[1].textContent.includes('→ 3 horgonyra hivatkozik'));
    assert(ovb.querySelector('.ov-miss').textContent.includes('HIANY-1'));
    assert(d.getElementById('overview-details').open);
    ok('globális áttekintés: gyökerek (B, A – egyenlő hivatkozásszámnál a újabb elöl), levelek (Z, D, C), különálló és hiányzó azonosító megjelenik');
    cols[0].querySelector('.chip-btn').click();
    assert(!d.getElementById('chain-panel').hidden && d.getElementById('chain-body').textContent.includes('Kiválasztott'));
    ok('az áttekintés elemei a láncnézetre visznek');

    // E) lánc-export
    w.AnchorUI.showChain('B');
    const prev = d.getElementById('chain-md').value;
    assert(prev.startsWith('# Horgony-lánc: B')); assert(prev.includes('### B (thought)') && prev.includes('### A (thought)') && prev.includes('### C (thought)') && prev.includes('### D (thought)'));
    assert(!prev.includes('### Z')); assert(prev.includes('- Visszafelé (akik erre hivatkoznak): 2 horgony') && prev.includes('- Előre (amire ez hivatkozik): 1 horgony'));
    assert(!prev.includes('Nem található ebben a böngészőben'));
    d.getElementById('btn-chain-copy').click(); await wait(30);
    assert.strictEqual(w.__copied.length, 1); assert(w.__copied[0].includes('### C (thought)') && w.__copied[0].includes('Horgony-lánc: B'));
    const nd = w.__downloads.length;
    d.getElementById('btn-chain-md').click();
    assert.strictEqual(w.__downloads.length, nd + 1);
    const dl = w.__downloads[nd]; assert(/^anchor_lanc_B_\d{4}-\d{2}-\d{2}\.md$/.test(dl.name));
    const dtext = await readBlob(w, dl.blob); assert(dtext.includes('# Horgony-lánc: B') && dtext.includes('### A (thought)'));
    ok('lánc-export: előnézet, másolás és .md letöltés ugyanazt az egy szövegblokkot adja (kiválasztott + teljes előre/vissza lánc)');

    // v0.3 JSON-export → import friss oldalra: napló megmarad
    const cardB = cards(w).find(c => c.getAttribute('data-id') === 'B');
    cardB.querySelector('.sl-to').value = 'open'; cardB.querySelector('.sl-by').value = 'Parázs'; cardB.querySelector('.sl-why').value = 'Kérdés maradt';
    cardB.querySelector('button[data-act="status-apply"]').click(); await wait(30);
    d.getElementById('btn-export-json').click();
    const exJ = await readBlob(w, w.__downloads[w.__downloads.length - 1].blob);
    assert.strictEqual(JSON.parse(exJ).anchors.find(a => a.id === 'B').status_log[0].reason, 'Kérdés maradt');
    dom = await open({}); w = dom.window; d = w.document;
    await doImport(w, exJ);
    assert.strictEqual(cards(w).length, 5);
    assert(cards(w).find(c => c.getAttribute('data-id') === 'B').textContent.includes('Státusz-napló (1)'));
    assert(!d.getElementById('status').textContent.includes('Ismeretlen verzió') && !d.getElementById('status').textContent.includes('újabb'));
    ok('v0.3 JSON-export → import: a státusz-napló megmarad, nincs verzió-figyelmeztetés');
  }

  console.log('ÖSSZESEN', n, 'UI-ellenőrzés OK');
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
