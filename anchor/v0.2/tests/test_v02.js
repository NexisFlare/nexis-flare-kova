// Anchor Engine v0.2 – mag-tesztek (node): hash, migráció, import, export, lánc, Markdown
const assert = require('assert');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '../anchor/js');

function fakeStorage(init) {
  const d = Object.assign({}, init || {});
  return {
    getItem: k => (Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null),
    setItem: (k, v) => { d[k] = String(v); },
    removeItem: k => { delete d[k]; },
    _d: d
  };
}
let passed = 0;
const ok = (n) => { passed++; console.log('PASS', n); };

(async () => {
  const V2 = require(path.join(ROOT, 'anchor2.js'));

  // ---------- 1. SHA-256 ismert vektorok ----------
  assert.strictEqual(await V2.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.strictEqual(await V2.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.strictEqual(await V2.sha256Hex('Árvíztűrő tükörfúrógép'), crypto.createHash('sha256').update('Árvíztűrő tükörfúrógép', 'utf8').digest('hex'));
  ok('SHA-256: ismert vektorok (abc, üres, ékezetes UTF-8) egyeznek a node crypto-val');

  // ---------- 2. migráció v0.1 adatról ----------
  const v01 = [
    { id: 'anchor-2026-11-27-001', type: 'decision', content: 'Régi döntés.\nKét sor.', timestamp: '2026-11-27T20:00:00.000Z',
      source: { member: 'Ignis (Gemini)', platform: 'Gemini', thread: 'Anchor' }, status: 'verified', tags: ['137'], related_ids: [], meta: { falsification_criteria: 'Ha mást döntünk.' } },
    { id: 'anchor-2026-11-27-002', type: 'thought', content: 'Régi gondolat.', timestamp: '2026-11-27T20:05:00.000Z',
      source: { member: 'Kova', platform: 'Grok', thread: '' }, status: 'draft', tags: [], related_ids: ['anchor-2026-11-27-001'], meta: {} }
  ];
  const raw01 = JSON.stringify(v01);
  globalThis.localStorage = fakeStorage({ nexis_flare_anchors: raw01 });
  const e1 = new V2.Engine('nexis_flare_anchors');
  assert.strictEqual(e1.anchors.length, 2);
  const rep = await e1.migrate();
  assert.strictEqual(rep.fromSchema, 1); assert.strictEqual(rep.sealed, 2); assert.strictEqual(rep.backedUp, true);
  assert.strictEqual(localStorage.getItem('nexis_flare_anchors_backup_v0.1'), raw01);
  assert.strictEqual(localStorage.getItem('nexis_flare_anchors_schema'), '2');
  const stored = JSON.parse(localStorage.getItem('nexis_flare_anchors'));
  assert.strictEqual(stored[0].content, v01[0].content); assert.strictEqual(stored[0].timestamp, v01[0].timestamp); // tartalom érintetlen
  assert.strictEqual(stored[0].hash, crypto.createHash('sha256').update(v01[0].timestamp + '\n' + v01[0].content, 'utf8').digest('hex'));
  assert.strictEqual(stored[0].hash_basis, 'migrated'); assert.strictEqual(stored[1].status, 'draft');
  ok('migráció: v0.1 → v0.2, hash (basis: migrated), nyers biztonsági másolat, séma-kulcs = 2, tartalom változatlan');
  const rep2 = await e1.migrate();
  assert.strictEqual(rep2.sealed, 0); assert.strictEqual(rep2.backedUp, false); assert.strictEqual(rep2.fromSchema, 2);
  assert.strictEqual(localStorage.getItem('nexis_flare_anchors_backup_v0.1'), raw01);
  ok('migráció: idempotens (másodszor nem változtat, a másolatot nem írja felül)');
  const e1b = new V2.Engine('nexis_flare_anchors');
  assert.strictEqual(e1b.anchors.length, 2); const vr = await e1b.verifyAll(); assert.strictEqual(vr.counts.ok, 2);
  ok('migráció után újratöltve: 2 horgony, mindkettő hash-e egyezik');

  // ---------- 3. új horgony hash-sel, ID-ütközés nincs ----------
  const a3 = await e1b.addAnchorSealed({ type: 'open_question', content: 'Új kérdés?', source: { member: 'Kova', platform: 'p', thread: 't' },
    meta: { falsification_criteria: 'x', independence_external: 'igen', independence_knew_conclusion: 'nem', independence_note: 'külső modell' } });
  assert.strictEqual(a3.hash_basis, 'created'); assert.strictEqual(await e1b.verify(a3), 'ok');
  assert(/^anchor-\d{4}-\d{2}-\d{2}-001$/.test(a3.id));
  ok('új horgony: hash (basis: created) és ellenőrzés OK');
  // státuszváltás nem érinti a hash-t
  e1b.updateAnchorStatus(a3.id, 'verified'); assert.strictEqual(await e1b.verify(a3), 'ok');
  ok('státuszváltás után a hash még egyezik (a státusz nem része a hash-nek)');
  // módosítás -> eltérés
  const backup = a3.content; a3.content = 'Átírt kérdés?';
  assert.strictEqual(await e1b.verify(a3), 'mismatch'); a3.content = backup; assert.strictEqual(await e1b.verify(a3), 'ok');
  ok('hash: a tartalom megváltoztatása eltérést jelez, visszaállítva újra egyezik');
  // időbélyeg módosítása is
  const ts = a3.timestamp; a3.timestamp = '2020-01-01T00:00:00.000Z'; assert.strictEqual(await e1b.verify(a3), 'mismatch'); a3.timestamp = ts;
  ok('hash: az időbélyeg megváltoztatása is eltérést jelez');

  // ---------- 4. export: verziózott ----------
  const exp = JSON.parse(e1b.exportToJSON());
  assert.strictEqual(exp.format, 'nexis-flare-anchors'); assert.strictEqual(exp.version, 'v0.2'); assert.strictEqual(exp.schema_version, 2);
  assert.strictEqual(exp.count, 3); assert.strictEqual(exp.anchors.length, 3); assert(!isNaN(Date.parse(exp.exported_at)));
  ok('JSON-export: format, version v0.2, schema_version 2, count, anchors');

  // ---------- 5. import: v0.2 export friss tárba (hash megmarad) ----------
  globalThis.localStorage = fakeStorage();
  const e2 = new V2.Engine('nexis_flare_anchors');
  const r5 = await e2.importAny(e1b.exportToJSON());
  assert.strictEqual(r5.added, 3); assert.strictEqual(r5.mismatched.length, 0); assert.strictEqual(r5.info.version, 'v0.2'); assert.strictEqual(r5.warnings.length, 0);
  assert.deepStrictEqual(e2.anchors.map(a => a.hash), e1b.anchors.map(a => a.hash));
  assert.strictEqual((await e2.verifyAll()).counts.ok, 3);
  ok('import: v0.2 export → új tár, 3 horgony, hash-ek megmaradnak és egyeznek, nincs figyelmeztetés');
  const r5b = await e2.importAny(e1b.exportToJSON()); assert.strictEqual(r5b.added, 0); assert.strictEqual(r5b.skipped, 3);
  ok('import: azonos azonosítót nem ír felül');

  // ---------- 6. import: v0.1 tömb (hash nélkül) ----------
  globalThis.localStorage = fakeStorage();
  const e3 = new V2.Engine('nexis_flare_anchors');
  const r6 = await e3.importAny(raw01);
  assert.strictEqual(r6.added, 2); assert.strictEqual(r6.sealedNow, 2); assert.strictEqual(r6.info.version, null);
  assert(e3.anchors.every(a => a.hash_basis === 'imported' && /^[0-9a-f]{64}$/.test(a.hash)));
  ok('import: v0.1 tömb elfogadva, a hash nélküliek importkori hash-t kapnak (basis: imported)');

  // ---------- 7. import: meghamisított hash, ismeretlen verzió, hibák ----------
  globalThis.localStorage = fakeStorage();
  const e4 = new V2.Engine('nexis_flare_anchors');
  const tampered = JSON.parse(e1b.exportToJSON()); tampered.anchors[0].content = 'Utólag átírva'; tampered.version = 'v9.9'; tampered.schema_version = 7;
  const r7 = await e4.importAny(JSON.stringify(tampered));
  assert.strictEqual(r7.added, 3); assert.deepStrictEqual(r7.mismatched, [tampered.anchors[0].id]);
  assert(r7.warnings.length >= 2); assert.strictEqual((await e4.verifyAll()).counts.mismatch, 1);
  ok('import: eltérő hash befogadva és jelezve; ismeretlen verzió/újabb séma figyelmeztet, de nem utasít el');
  await assert.rejects(e4.importAny('{nem json'), /nem érvényes JSON/);
  await assert.rejects(e4.importAny('{"a":1}'), /tömbnek/);
  const r7c = await e4.importAny(JSON.stringify([{ id: 'x' }, 5, null, { id: 'ok-1', content: 'Hiányos', timestamp: '2026-11-28T10:00:00+01:00', type: 'bogus', status: 'bogus', tags: 'nem tömb',
    meta: { independence_external: 'talán', independence_bogus: 'igen', independence_note: 'rendben', mas: 1, obj: { x: 1 } } }]));
  assert.strictEqual(r7c.invalid, 3); assert.strictEqual(r7c.added, 1);
  const ok1 = e4.anchors.find(a => a.id === 'ok-1');
  assert.strictEqual(ok1.type, 'thought'); assert.strictEqual(ok1.status, 'draft'); assert.strictEqual(ok1.tags.length, 0);
  assert.deepStrictEqual(Object.keys(ok1.meta).sort(), ['independence_note', 'mas']);
  ok('import: hibás JSON/nem tömb elutasítva; használhatatlan elemek számolva; ismeretlen függetlenségi válasz és beágyazott objektum eldobva');

  // ---------- 8. lánc ----------
  globalThis.localStorage = fakeStorage();
  const e5 = new V2.Engine('nexis_flare_anchors');
  const mk = (id, rel) => ({ id, type: 'thought', content: 'c ' + id, timestamp: '2026-11-28T10:00:00.000Z', source: { member: 'k', platform: 'p', thread: '' }, status: 'draft', tags: [], related_ids: rel, meta: {} });
  await e5.importAny(JSON.stringify([mk('A', ['B']), mk('B', ['C']), mk('C', ['A', 'Z']), mk('D', ['A']), mk('E', ['D'])]));
  const ch = e5.buildChain('A');
  const fp = ch.forward.map(p => p.map(n => n.id + (n.cycle ? '*' : '') + (n.exists ? '' : '?')).join('>'));
  const bp = ch.backward.map(p => p.map(n => n.id + (n.cycle ? '*' : '') + (n.exists ? '' : '?')).join('>'));
  assert(fp.includes('A>B>C>A*') && fp.includes('A>B>C>Z?'), JSON.stringify(fp));
  assert(bp.some(s => s.endsWith('E>D>A')) , JSON.stringify(bp));
  ok('lánc: A→B→C→A kör jelölve (*), hiányzó Z jelölve (?), visszafelé E→D→A');
  assert.strictEqual(e5.buildChain('E').backward.length, 0); assert.strictEqual(e5.buildChain('nincs').exists, false);
  ok('lánc: levél és ismeretlen azonosító kezelve');

  // ---------- 9. Markdown ----------
  const md = e1b.exportToMarkdown();
  assert(md.startsWith('# Anchor Engine – Horgonyok') && md.includes('Anchor Engine v0.2 (séma: 2)') && md.includes('**Hash (SHA-256):**'));
  assert(md.includes('Külső volt az ellenőrző? igen') && md.includes('Ismerte az eredeti következtetést? nem') && md.includes('Megjegyzés: külső modell'));
  assert(md.includes('Régi döntés.\n  Két sor.'));
  const one = V2.anchorToMarkdown(a3); assert(one.startsWith('## ' + a3.id) && one.includes(a3.hash));
  ok('Markdown: v0.2 fejléc, hash, függetlenségi sorok, többsoros tartalom behúzva; egy horgony külön is');
  // gyengítő válasz jelölése
  const adv = V2.anchorToMarkdown({ id: 'q', type: 'thought', content: 'c', timestamp: 't', source: {}, status: 'draft', tags: [], related_ids: [], meta: { independence_knew_conclusion: 'igen', independence_external: 'nem' } });
  assert(adv.includes('Ismerte az eredeti következtetést? igen (gyengítő válasz)') && adv.includes('Külső volt az ellenőrző? nem (gyengítő válasz)'));
  ok('függetlenség: a gyengítő válasz (pl. ismerte a következtetést) jelölve');

  // ---------- 10. Web Crypto nélkül nem omlik össze ----------
  const savedCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  globalThis.localStorage = fakeStorage({ nexis_flare_anchors: raw01 });
  const e6 = new V2.Engine('nexis_flare_anchors');
  const r10 = await e6.migrate();
  assert.strictEqual(r10.unavailable, true); assert.strictEqual(localStorage.getItem('nexis_flare_anchors_schema'), null);
  const x = await e6.addAnchorSealed({ content: 'Hash nélkül is él' }); assert(!x.hash);
  assert.strictEqual(await e6.verify(x), 'none');
  Object.defineProperty(globalThis, 'crypto', savedCrypto);
  ok('Web Crypto nélkül: a migráció jelzi, a séma-kulcs nem lép, az új horgony hash nélkül is rögzül');

  console.log('\nÖSSZESEN ' + passed + ' ellenőrzés OK');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
