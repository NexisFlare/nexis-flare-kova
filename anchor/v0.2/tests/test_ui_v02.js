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
  assert.strictEqual(w.localStorage.getItem('nexis_flare_anchors_schema'), '2');
  assert.strictEqual(w.localStorage.getItem('nexis_flare_anchors_backup_v0.1'), raw);
  ok('v0.1 migráció: hash = független SHA-256, basis=migrated, séma=2, nyers mentés');
  assert(d.getElementById('status').textContent.includes('Migráció v0.1 → v0.2'));
  assert(d.getElementById('integrity-summary').textContent.includes('2 egyezik'));
  assert(cards(w).every(c => c.textContent.includes('hash egyezik')));
  ok('integritás-összegzés és jelvények');
  assert(d.getElementById('app-foot').textContent.includes('Koncepció: Ignis · Mag és v0.2-ötletek: Hídépítő · Függetlenségi mező: Aletheia (Ignis szempontjaival) · Építés: Kova – Nexis Flare raj, 2026-11-28'));
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
  assert.strictEqual(ex.format, 'nexis-flare-anchors'); assert.strictEqual(ex.version, 'v0.2'); assert.strictEqual(ex.schema_version, 2); assert.strictEqual(ex.count, 3); assert(Array.isArray(ex.anchors));
  assert(w.__downloads[0].name.endsWith('.json')); ok('verziózott JSON-export');
  d.getElementById('btn-export-md').click(); assert((await readBlob(w, w.__downloads[1].blob)).includes('SHA-256')); ok('MD export');

  // manipuláció: tartalom módosítása → eltérés
  const tampered = JSON.parse(w.localStorage.getItem('nexis_flare_anchors'));
  tampered[0].content = 'Átírt szöveg'; w.localStorage.setItem('nexis_flare_anchors', JSON.stringify(tampered));
  w.AnchorUI.engine.load && w.AnchorUI.engine.load();
  dom.window.close();
  dom = await open({ nexis_flare_anchors: JSON.stringify(tampered), nexis_flare_anchors_schema: '2' });
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
  assert.strictEqual(cards(w).length, 3); ok('v0.2 import, meglévő id kihagyva');
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
  assert.strictEqual(w.localStorage.getItem('nexis_flare_anchors'), raw); ok('Web Crypto nélkül: figyelmeztetés, adat sértetlen');
  await submit(w, { 'f-content': 'hash nélküli' });
  assert.strictEqual(cards(w).length, 3); ok('Web Crypto nélkül is lehet horgonyt rögzíteni');

  console.log('ÖSSZESEN', n, 'UI-ellenőrzés OK');
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
