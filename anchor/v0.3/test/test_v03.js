// Anchor Engine v0.3 – mag-tesztek (node): migráció, státusz-napló, GitHub-hivatkozás, áttekintés, lánc-export
const assert = require('assert');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '../anchor/js');

function fakeStorage(init) {
  const d = Object.assign({}, init || {});
  return { getItem: k => (Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; }, _d: d };
}
let passed = 0;
const ok = (n) => { passed++; console.log('PASS', n); };
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function mkFetch(map) { // map: url-részlet -> {status, body} | Error | 'hang'
  const calls = [];
  const f = (url, opts) => {
    calls.push(url);
    const key = Object.keys(map).find(k => url.indexOf(k) !== -1);
    const v = key ? map[key] : { status: 404, body: {} };
    if (v === 'hang') return new Promise((_, rej) => { if (opts && opts.signal) opts.signal.addEventListener('abort', () => { const e = new Error('abort'); e.name = 'AbortError'; rej(e); }); });
    if (v instanceof Error) return Promise.reject(v);
    return Promise.resolve({ status: v.status, ok: v.status >= 200 && v.status < 300, json: () => v.json ? v.json() : Promise.resolve(v.body) });
  };
  f.calls = calls;
  return f;
}
const SHA40 = 'f75a2c36' + 'a'.repeat(32);
const commitBody = (msg, date) => ({ sha: SHA40, html_url: 'https://github.com/NexisFlare/rajrezonancia/commit/' + SHA40, commit: { message: msg || 'x', committer: { date: date || '2026-11-28T12:00:00Z' }, author: { date: '2026-11-28T11:59:00Z' } } });

(async () => {
  const V2 = require(path.join(ROOT, 'anchor2.js'));
  const V3 = require(path.join(ROOT, 'anchor3.js'));

  // ---------- 1. migráció v0.2 -> v0.3 ----------
  globalThis.localStorage = fakeStorage();
  const e2 = new V2.Engine('nexis_flare_anchors');
  const x1 = await e2.addAnchorSealed({ type: 'decision', content: 'Kettes séma döntés.\nKét sor.', source: { member: 'Ignis (Gemini)', platform: 'Gemini', thread: 't' }, status: 'verified', tags: ['137'], meta: { independence_external: 'igen', independence_note: 'n' } });
  const x2 = await e2.addAnchorSealed({ type: 'thought', content: 'Kettes séma gondolat.', related_ids: [x1.id], source: { member: 'Kova', platform: 'p', thread: '' } });
  localStorage.setItem('nexis_flare_anchors_schema', '2');
  const raw02 = localStorage.getItem('nexis_flare_anchors');
  const hashes = [x1.hash, x2.hash];
  const e3 = new V3.Engine('nexis_flare_anchors');
  const rep = await e3.migrate();
  assert.strictEqual(rep.fromSchema, 2); assert.strictEqual(rep.toSchema, 3); assert.strictEqual(rep.backedUp, true);
  assert.strictEqual(rep.backupKey, 'nexis_flare_anchors_backup_v0.2'); assert.strictEqual(rep.logsAdded, 2); assert.strictEqual(rep.sealed, 0);
  assert.strictEqual(localStorage.getItem('nexis_flare_anchors_backup_v0.2'), raw02);
  assert.strictEqual(localStorage.getItem('nexis_flare_anchors_schema'), '3');
  const st = JSON.parse(localStorage.getItem('nexis_flare_anchors'));
  assert.deepStrictEqual(st.map(a => a.hash), hashes); assert.deepStrictEqual(st.map(a => a.hash_basis), ['created', 'created']);
  assert.deepStrictEqual(st.map(a => a.status_log), [[], []]);
  assert.strictEqual(st[0].content, x1.content); assert.strictEqual(st[0].meta.independence_note, 'n'); assert.strictEqual(st[0].status, 'verified');
  ok('migráció v0.2 → v0.3: séma 3, nyers v0.2 másolat, üres státusz-napló, hash-ek és tartalom érintetlenek');
  const stBefore = localStorage.getItem('nexis_flare_anchors');
  const rep2 = await e3.migrate();
  assert.strictEqual(rep2.fromSchema, 3); assert.strictEqual(rep2.backedUp, false); assert.strictEqual(rep2.normalized, 0); assert.strictEqual(rep2.logsAdded, 0);
  assert.strictEqual(localStorage.getItem('nexis_flare_anchors'), stBefore); assert.strictEqual(localStorage.getItem('nexis_flare_anchors_backup_v0.2'), raw02);
  ok('migráció: idempotens (másodszor semmi nem változik, a másolat marad)');
  const e3b = new V3.Engine('nexis_flare_anchors');
  assert.strictEqual((await e3b.verifyAll()).counts.ok, 2);
  ok('migráció után újratöltve: mindkét hash egyezik');

  // v0.1 -> v0.3 közvetlenül
  const v01 = [{ id: 'anchor-2026-11-27-001', type: 'thought', content: 'Régi.', timestamp: '2026-11-27T20:00:00.000Z', source: { member: 'K', platform: 'p', thread: '' }, status: 'draft', tags: [], related_ids: [], meta: {} }];
  globalThis.localStorage = fakeStorage({ nexis_flare_anchors: JSON.stringify(v01) });
  const e01 = new V3.Engine('nexis_flare_anchors');
  const r01 = await e01.migrate();
  assert.strictEqual(r01.fromSchema, 1); assert.strictEqual(r01.sealed, 1); assert.strictEqual(r01.backupKey, 'nexis_flare_anchors_backup_v0.1');
  assert.strictEqual(localStorage.getItem('nexis_flare_anchors_backup_v0.1'), JSON.stringify(v01));
  assert.strictEqual(e01.anchors[0].hash, sha(v01[0].timestamp + '\n' + v01[0].content));
  assert.deepStrictEqual(e01.anchors[0].status_log, []);
  ok('migráció v0.1 → v0.3 közvetlenül: v0.1 másolat, migrated hash, üres napló');

  // ---------- 2. státusz-napló ----------
  globalThis.localStorage = fakeStorage();
  const E = new V3.Engine('nexis_flare_anchors');
  const a = await E.addAnchorSealed({ type: 'thought', content: 'Napló teszt.', source: { member: 'Hídépítő (DeepSeek)', platform: 'p', thread: 't' }, status: 'draft' });
  assert.strictEqual(a.status_log.length, 1); assert.strictEqual(a.status_log[0].from, null); assert.strictEqual(a.status_log[0].to, 'draft');
  assert.strictEqual(a.status_log[0].by, 'Hídépítő (DeepSeek)'); assert.strictEqual(a.status_log[0].at, a.timestamp);
  assert.strictEqual(await E.verify(a), 'ok');
  const t0 = Date.now();
  E.changeStatus(a.id, 'verified', 'Ignis (Gemini)', 'Aletheia átnézte, a forrás egyezik.');
  const L = E.anchors[0].status_log;
  assert.strictEqual(L.length, 2); assert.strictEqual(L[1].from, 'draft'); assert.strictEqual(L[1].to, 'verified');
  assert.strictEqual(L[1].by, 'Ignis (Gemini)'); assert.strictEqual(L[1].reason, 'Aletheia átnézte, a forrás egyezik.');
  assert(Math.abs(Date.parse(L[1].at) - t0) < 5000); assert.strictEqual(E.anchors[0].status, 'verified');
  assert.strictEqual(await E.verify(E.anchors[0]), 'ok'); // a státusz nem része a hash-nek
  assert.throws(() => E.changeStatus(a.id, 'verified', 'x', ''), /már ez/);
  assert.throws(() => E.changeStatus(a.id, 'nincs', 'x', ''), /Érvénytelen/);
  assert.throws(() => E.changeStatus('nincs-ilyen', 'open', 'x', ''), /nem található/);
  E.changeStatus(a.id, 'open', '', '');
  assert.strictEqual(E.anchors[0].status_log[2].by, 'ismeretlen'); assert.strictEqual(E.anchors[0].status_log[2].reason, '');
  E.updateAnchorStatus(a.id, 'draft'); // a mag hívása is naplózódik
  assert.strictEqual(E.anchors[0].status_log.length, 4); assert.strictEqual(E.anchors[0].status_log[3].to, 'draft');
  E.updateAnchorStatus(a.id, 'draft'); assert.strictEqual(E.anchors[0].status_log.length, 4);
  assert.strictEqual(JSON.parse(localStorage.getItem('nexis_flare_anchors'))[0].status_log.length, 4);
  ok('státusz-napló: létrehozás, ki/mikor/miért, hash érintetlen, hibák, a mag updateAnchorStatus is naplózódik, mentve');

  // ---------- 3. export / import ----------
  const json = E.exportToJSON();
  const wrap = JSON.parse(json);
  assert.strictEqual(wrap.version, 'v0.3'); assert.strictEqual(wrap.schema_version, 3); assert.strictEqual(wrap.anchors[0].status_log.length, 4);
  globalThis.localStorage = fakeStorage();
  const F = new V3.Engine('nexis_flare_anchors');
  const ir = await F.importAny(json);
  assert.strictEqual(ir.added, 1); assert.strictEqual(ir.warnings.length, 0); assert.strictEqual(ir.mismatched.length, 0);
  assert.strictEqual(F.anchors[0].status_log.length, 4); assert.strictEqual(F.anchors[0].status_log[1].reason, 'Aletheia átnézte, a forrás egyezik.');
  const ir2 = await F.importAny(json); assert.strictEqual(ir2.added, 0); assert.strictEqual(ir2.skipped, 1);
  ok('export v0.3 → import: napló megmarad, nincs figyelmeztetés, azonos azonosítót nem ír felül');
  // v0.2-es export importja
  const v2wrap = JSON.stringify({ format: 'nexis-flare-anchors', version: 'v0.2', schema_version: 2, anchors: JSON.parse(raw02) });
  globalThis.localStorage = fakeStorage();
  const G = new V3.Engine('nexis_flare_anchors');
  const gr = await G.importAny(v2wrap);
  assert.strictEqual(gr.added, 2); assert.strictEqual(gr.warnings.length, 0); assert.deepStrictEqual(G.anchors.map(x => x.status_log), [[], []]);
  assert.strictEqual((await G.verifyAll()).counts.ok, 2);
  const gw = await G.importAny(JSON.stringify({ version: 'v0.9', schema_version: 9, anchors: [] }));
  assert(gw.warnings.length >= 2);
  ok('v0.2-es export import: két horgony, üres napló, hash egyezik; ismeretlen verzió jelezve');
  // rossz napló-bejegyzések kiszűrése
  const bad = [{ id: 'b-1', content: 'x', timestamp: '2026-11-28T10:00:00.000Z', status: 'open',
    status_log: [{ at: 'nem-datum', to: 'open' }, { at: '2026-11-28T10:00:00Z', to: 'ismeretlen' }, 'szöveg', null,
      { at: '2026-11-28T10:00:00Z', to: 'open', by: 'x'.repeat(500), reason: 'y'.repeat(5000), from: 'bármi' }] }];
  const nb = V3.normalizeAnchor(bad[0]);
  assert.strictEqual(nb.status_log.length, 1); assert.strictEqual(nb.status_log[0].by.length, 120); assert.strictEqual(nb.status_log[0].reason.length, 1000); assert.strictEqual(nb.status_log[0].from, null);
  assert.strictEqual(V3.sanitizeLog('nem tömb').length, 0);
  const big = Array.from({ length: 300 }, () => ({ at: '2026-11-28T10:00:00Z', to: 'open' }));
  assert.strictEqual(V3.sanitizeLog(big).length, V3.LOG_MAX);
  ok('napló-tisztítás: érvénytelen bejegyzések kiesnek, hosszak levágva, felső korlát');

  // ---------- 4. GitHub-hivatkozás: értelmezés ----------
  let p = V3.parseGithubRef('https://github.com/NexisFlare/rajrezonancia/commit/' + SHA40);
  assert.deepStrictEqual([p.owner, p.repo, p.sha], ['NexisFlare', 'rajrezonancia', SHA40]);
  p = V3.parseGithubRef('NexisFlare/nexis-flare-kova@F75A2C3'); assert.deepStrictEqual([p.owner, p.repo, p.sha], ['NexisFlare', 'nexis-flare-kova', 'f75a2c3']);
  p = V3.parseGithubRef('https://github.com/o/r.git/commit/abcdef1/files?x=1'); assert.strictEqual(p && p.repo, 'r');
  p = V3.parseGithubRef('https://api.github.com/repos/o/r/commits/abcdef1'); assert.strictEqual(p && p.url, 'https://github.com/o/r/commit/abcdef1');
  p = V3.parseGithubRef('abcdef1234'); assert.strictEqual(p.incomplete, true);
  ['', '  ', 'szia', 'https://evil.example/o/r/commit/abcdef1', 'https://github.com/o/../commit/abcdef1', 'o/../@abcdef1', 'o/r@xyz', 'o/r@abc', 'https://github.com/o/r/pull/12', 12, null, 'x'.repeat(400)]
    .forEach(s => assert.strictEqual(V3.parseGithubRef(s), null, 'elutasítandó: ' + s));
  ok('GitHub-hivatkozás: URL, api-URL, tulajdonos/tár@hash és hash-only értelmezve; rossz formák elutasítva');

  // ---------- 5. GitHub feloldás (mock fetch) ----------
  const ref = 'NexisFlare/rajrezonancia@' + SHA40;
  let r = await V3.resolveGithubRef(ref, { fetch: mkFetch({ '/commits/': { status: 200, body: commitBody('Anchor v0.3') } }) });
  assert.strictEqual(r.state, 'ok'); assert.strictEqual(r.info.committed_at, '2026-11-28T12:00:00Z'); assert.strictEqual(r.info.sha, SHA40);
  const f1 = mkFetch({ '/commits/': { status: 200, body: commitBody() } });
  await V3.resolveGithubRef(ref, { fetch: f1 });
  assert.strictEqual(f1.calls[0], 'https://api.github.com/repos/NexisFlare/rajrezonancia/commits/' + SHA40);
  assert.strictEqual((await V3.resolveGithubRef(ref, { fetch: mkFetch({ '/commits/': { status: 404, body: {} } }) })).state, 'notfound');
  assert.strictEqual((await V3.resolveGithubRef(ref, { fetch: mkFetch({ '/commits/': { status: 422, body: {} } }) })).state, 'notfound');
  assert.strictEqual((await V3.resolveGithubRef(ref, { fetch: mkFetch({ '/commits/': { status: 403, body: {} } }) })).state, 'ratelimit');
  assert.strictEqual((await V3.resolveGithubRef(ref, { fetch: mkFetch({ '/commits/': { status: 429, body: {} } }) })).state, 'ratelimit');
  assert.strictEqual((await V3.resolveGithubRef(ref, { fetch: mkFetch({ '/commits/': { status: 500, body: {} } }) })).state, 'error');
  assert.strictEqual((await V3.resolveGithubRef(ref, { fetch: mkFetch({ '/commits/': new TypeError('Failed to fetch') }) })).state, 'network');
  assert.strictEqual((await V3.resolveGithubRef(ref, { fetch: mkFetch({ '/commits/': { status: 200, body: { sha: 'masik', commit: {} } } }) })).state, 'error');
  assert.strictEqual((await V3.resolveGithubRef(ref, { fetch: mkFetch({ '/commits/': { status: 200, json: () => Promise.reject(new Error('rossz json')) } }) })).state, 'error');
  assert.strictEqual((await V3.resolveGithubRef(ref, { fetch: () => { throw new Error('szinkron hiba'); } })).state, 'network');
  const th = Date.now();
  const tr = await V3.resolveGithubRef(ref, { fetch: mkFetch({ '/commits/': 'hang' }), timeoutMs: 60 });
  assert.strictEqual(tr.state, 'network'); assert(Date.now() - th < 2000);
  assert.strictEqual((await V3.resolveGithubRef('abcdef1234', { fetch: mkFetch({}) })).state, 'incomplete');
  assert.strictEqual((await V3.resolveGithubRef('szia', { fetch: mkFetch({}) })).state, 'invalid');
  ok('GitHub-feloldás: ok, 404/422 → notfound, 403/429 → ratelimit, 500 → error, hálózati hiba/időtúllépés → network, váratlan válasz → error; sosem dob');

  // ---------- 6. checkGithub, gyorsítótár, setGithubRef ----------
  globalThis.localStorage = fakeStorage();
  const H = new V3.Engine('nexis_flare_anchors');
  const h1 = await H.addAnchorSealed({ type: 'decision', content: 'GitHub-os horgony.', source: { member: 'Kova', platform: 'p', thread: '' } });
  assert.throws(() => H.setGithubRef(h1.id, 'szia'), /nem értelmezhető/);
  assert.throws(() => H.setGithubRef(h1.id, 'abcdef1234'), /nem értelmezhető/);
  assert.throws(() => H.setGithubRef('nincs', ref), /nem található/);
  assert.strictEqual((await H.checkGithub(h1.id, { fetch: mkFetch({}) })).state, 'none');
  H.setGithubRef(h1.id, ref);
  assert.strictEqual(H.anchors[0].meta.github_commit, ref);
  assert.strictEqual(await H.verify(H.anchors[0]), 'ok'); // a hash nem változik
  const msg = 'Anchor ' + h1.hash.slice(0, 12) + ' rögzítve';
  let ent = await H.checkGithub(h1.id, { fetch: mkFetch({ '/commits/': { status: 200, body: commitBody(msg, '2099-01-01T00:00:00Z') } }) });
  assert.strictEqual(ent.state, 'ok'); assert.strictEqual(ent.info.mentions_hash, true); assert.strictEqual(ent.info.before_anchor, false);
  assert.strictEqual(H.githubEntry(h1.id).state, 'ok');
  assert(JSON.parse(localStorage.getItem('nexis_flare_anchors_ghcache'))[h1.id]);
  // átmeneti hiba nem írja felül a sikeres ellenőrzést
  ent = await H.checkGithub(h1.id, { fetch: mkFetch({ '/commits/': { status: 403, body: {} } }) });
  assert.strictEqual(ent.state, 'ok'); assert.strictEqual(ent.recheck_failed, 'ratelimit');
  ent = await H.checkGithub(h1.id, { fetch: mkFetch({ '/commits/': new TypeError('x') }) });
  assert.strictEqual(ent.state, 'ok'); assert.strictEqual(ent.recheck_failed, 'network');
  // a commit eltűnt -> notfound felülír
  ent = await H.checkGithub(h1.id, { fetch: mkFetch({ '/commits/': { status: 404, body: {} } }) });
  assert.strictEqual(ent.state, 'notfound');
  // korábbi commit jelzése
  await H.checkGithub(h1.id, { fetch: mkFetch({ '/commits/': { status: 200, body: commitBody('x', '2000-01-01T00:00:00Z') } }) });
  assert.strictEqual(H.githubEntry(h1.id).info.before_anchor, true); assert.strictEqual(H.githubEntry(h1.id).info.mentions_hash, false);
  // a hivatkozás cseréje érvényteleníti a gyorsítótárat; törlés eltávolítja
  H.setGithubRef(h1.id, 'https://github.com/NexisFlare/nexis-flare-kova/commit/abcdef1234');
  assert.strictEqual(H.githubEntry(h1.id), null);
  H.setGithubRef(h1.id, '');
  assert.strictEqual(H.anchors[0].meta.github_commit, undefined);
  // első sikertelen ellenőrzés elmentődik hibaként
  H.setGithubRef(h1.id, ref);
  ent = await H.checkGithub(h1.id, { fetch: mkFetch({ '/commits/': new TypeError('x') }) });
  assert.strictEqual(ent.state, 'network'); assert.strictEqual(H.githubEntry(h1.id).state, 'network');
  // törléskor a gyorsítótár is megtisztul
  H.deleteAnchor(h1.id); assert.strictEqual(Object.keys(H.getGithubCache()).length, 0);
  ok('GitHub: beállítás/törlés, ellenőrzés, hash-említés, korábbi commit jelzése, átmeneti hiba nem ír felül, gyorsítótár érvénytelenítés');

  // import: túl hosszú / rossz típusú github_commit kiesik
  const ng = V3.normalizeAnchor({ id: 'g-1', content: 'x', timestamp: '2026-11-28T10:00:00.000Z', meta: { github_commit: 'x'.repeat(400) } });
  assert.strictEqual(ng.meta.github_commit, undefined);
  ok('github_commit: túl hosszú érték importkor kiesik');

  // ---------- 7. globális áttekintés ----------
  globalThis.localStorage = fakeStorage();
  const O = new V3.Engine('nexis_flare_anchors');
  const mk = (id, ts, rel) => ({ id, type: 'thought', content: 'tartalom ' + id, timestamp: ts, source: { member: 'K', platform: 'p', thread: '' }, status: 'draft', tags: [], related_ids: rel || [], meta: {} });
  O.anchors = [
    mk('R1', '2026-11-20T10:00:00.000Z'),
    mk('R2', '2026-11-21T10:00:00.000Z', ['R1']),
    mk('M1', '2026-11-22T10:00:00.000Z', ['R1', 'R2', 'NINCS-1']),
    mk('L1', '2026-11-23T10:00:00.000Z', ['M1', 'R1', 'R1', 'L1']),
    mk('L2', '2026-11-24T10:00:00.000Z', ['NINCS-1', 'NINCS-2']),
    mk('ISO', '2026-11-25T10:00:00.000Z')
  ];
  const ov = O.overview();
  assert.deepStrictEqual(ov.roots.map(x => [x.id, x.in]), [['R1', 3], ['M1', 1], ['R2', 1]]);
  assert.deepStrictEqual(ov.leaves.map(x => x.id), ['ISO', 'L2', 'L1']);
  assert.strictEqual(ov.leaves.find(x => x.id === 'L1').out, 2); assert.strictEqual(ov.leaves.find(x => x.id === 'ISO').out, 0);
  assert.strictEqual(ov.isolated, 1); assert.strictEqual(ov.total, 6);
  assert.deepStrictEqual(ov.missing.map(x => [x.id, x.from.length]), [['NINCS-1', 2], ['NINCS-2', 1]]);
  assert.deepStrictEqual(new V3.Engine('nexis_flare_anchors_ures').overview(), { total: 0, roots: [], leaves: [], missing: [], isolated: 0 });
  ok('áttekintés: gyökerek (legtöbbet hivatkozott elöl), levelek (legújabb elöl), különálló, hiányzó azonosítók; önhivatkozás és dupla hivatkozás nem számít');

  // ---------- 8. lánc-export ----------
  globalThis.localStorage = fakeStorage();
  const C = new V3.Engine('nexis_flare_anchors');
  C.anchors = [
    mk('A', '2026-11-20T10:00:00.000Z'),
    mk('B', '2026-11-21T10:00:00.000Z', ['A']),
    mk('C', '2026-11-22T10:00:00.000Z', ['B', 'GYOKER-NINCS']),
    mk('D', '2026-11-23T10:00:00.000Z', ['C']),
    mk('E', '2026-11-24T10:00:00.000Z', ['C']),
    mk('F', '2026-11-25T10:00:00.000Z', ['E']),
    mk('X', '2026-11-26T10:00:00.000Z', ['Y']),
    mk('Y', '2026-11-27T10:00:00.000Z', ['X'])
  ];
  C.anchors[2].status_log = [{ at: '2026-11-22T10:00:00.000Z', by: 'Ignis', from: null, to: 'draft', reason: '' }, { at: '2026-11-22T11:00:00.000Z', by: 'Hídépítő', from: 'draft', to: 'verified', reason: 'Kétsoros\nindok' }];
  C.anchors[2].status = 'verified';
  C.anchors[2].meta.github_commit = ref;
  const md = C.exportChainMarkdown('C');
  assert(md.startsWith('# Horgony-lánc: C\n'));
  const idx = s => md.indexOf(s);
  ['### C (thought)', '### B (thought)', '### A (thought)', '### D (thought)', '### E (thought)', '### F (thought)'].forEach(s => assert(idx(s) > -1, 'hiányzik: ' + s));
  assert(!md.includes('### X') && !md.includes('### Y'));
  assert(idx('## Kiválasztott horgony') < idx('## Visszafelé') && idx('## Visszafelé') < idx('## Előre'));
  // visszafelé: D, E, F (akik C-re hivatkoznak, közvetve is) – előre: B, A
  const back = md.slice(idx('## Visszafelé'), idx('## Előre')), fwd = md.slice(idx('## Előre'));
  ['### D', '### E', '### F'].forEach(s => assert(back.includes(s))); ['### B', '### A'].forEach(s => assert(fwd.includes(s)));
  assert(!back.includes('### A') && !fwd.includes('### D'));
  assert(md.includes('- Visszafelé (akik erre hivatkoznak): 3 horgony')); assert(md.includes('- Előre (amire ez hivatkozik): 2 horgony'));
  assert(md.includes('Nem található ebben a böngészőben: GYOKER-NINCS'));
  assert(md.includes('## Láncok') && md.includes('F → E → C') && md.includes('C → B → A'));
  assert(md.includes('Státusz-napló') && md.includes('Hídépítő: Vázlat → Ellenőrzött · indok: Kétsoros\n  indok'));
  assert(md.includes('- **GitHub-commit:** https://github.com/NexisFlare/rajrezonancia/commit/' + SHA40));
  const mdCycle = C.exportChainMarkdown('X');
  assert(mdCycle.includes('### Y (thought)') && mdCycle.includes('kört tartalmaz'));
  const mdMiss = C.exportChainMarkdown('GYOKER-NINCS');
  assert(mdMiss.includes('nincs ebben a böngészőben') && mdMiss.includes('### C (thought)') && mdMiss.includes('### F (thought)'));
  const mdAll = C.exportToMarkdown();
  assert(mdAll.includes('Anchor Engine v0.3 (séma: 3)') && mdAll.includes('Státusz-napló'));
  ok('lánc-export: kiválasztott + teljes előre/vissza lánc egy blokkban, hiányzó azonosító, kör, napló, GitHub-sor, hiányzó kiválasztott horgony; teljes export is v0.3');

  // lánc-export a gyorsítótárral (ok állapot)
  C.anchors[2].hash = sha('x'); localStorage.setItem('nexis_flare_anchors_ghcache', JSON.stringify({ C: { ref, state: 'ok', checked_at: '2026-11-28T13:00:00.000Z', info: { committed_at: '2026-11-28T12:00:00Z', mentions_hash: true, before_anchor: false } } }));
  const mdGh = C.exportChainMarkdown('C');
  assert(mdGh.includes('commit-dátum: 2026-11-28T12:00:00Z') && mdGh.includes('nem szigorú időbélyeg-hitelesítés') && mdGh.includes('hash-ének elejét'));
  ok('lánc-export: ellenőrzött commit esetén a dátum, a korlát és a hash-említés szerepel');

  // ---------- 9. a mag változatlan ----------
  const core = require('fs').readFileSync(path.join(ROOT, 'anchor.js'));
  console.log('anchor.js sha256:', crypto.createHash('sha256').update(core).digest('hex'));

  console.log('\nÖsszesen ' + passed + ' ellenőrzés sikeres.');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
