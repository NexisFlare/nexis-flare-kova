/**
 * Anchor Engine v0.3 – a bővített mag, harmadik réteg.
 *
 * Az AnchorEngine (anchor.js, Hídépítő magja) és az AnchorEngineV2 (anchor2.js) változatlanul
 * megmarad; ez a fájl egy alosztályt ad hozzá (AnchorEngineV3), amely a v0.3 újdonságait tartalmazza:
 *  - horgony-lánc exportja Markdownba: a kiválasztott horgony és a teljes előre- és visszafelé lánc egy szövegblokkban,
 *  - státusz-napló: minden státuszváltásnál ki, mikor, miért,
 *  - opcionális GitHub-commit hivatkozás; ha a commit a nyilvános api.github.com-on feloldható, "külső időbélyeg" jelzés,
 *    ha nem, az oldal a hivatkozást változatlanul megtartja, és nem hibázik,
 *  - globális áttekintés: gyökér-horgonyok (a legtöbbet hivatkozott) és levél-horgonyok (amire senki sem hivatkozik),
 *  - séma 3, migráció a v0.2 (és v0.1) adatokról, a nyers v0.2 adat biztonsági másolatával.
 *
 * Ötletek: Hídépítő (lánc-export, státusz-napló, GitHub-összekapcsolás, globális nézet),
 * Aletheia (függetlenségi mező, v0.2), Ignis (koncepció). Építés: Kova, 2026-11-28.
 *
 * Böngészőben és node-ban is fut (a teszthez).
 */
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var V2 = isNode ? require('./anchor2.js') : root.AnchorV2;
  var BaseV2 = V2.Engine;

  var VERSION = 'v0.3';
  var RELEASE = 'v0.3';
  var SCHEMA_VERSION = 3;
  var FORMAT = V2.FORMAT;
  var SCHEMA_KEY = V2.SCHEMA_KEY;
  var BACKUP_KEY_V01 = V2.BACKUP_KEY;                       // nexis_flare_anchors_backup_v0.1
  var BACKUP_KEY_V02 = 'nexis_flare_anchors_backup_v0.2';
  var GH_CACHE_KEY = 'nexis_flare_anchors_ghcache';
  var GH_KEY = 'github_commit';                              // meta.github_commit: a megadott hivatkozás, ahogy beírták
  var STATUSES = V2.STATUSES;
  var LOG_MAX = 200;
  var CHAIN_MAX_NODES = 500;
  var GH_TIMEOUT_MS = 8000;

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function clean(s, max) { return typeof s === 'string' ? s.trim().slice(0, max) : ''; }

  // ---------- állandó sorrendű összehasonlítás (a mezők sorrendje ne számítson) ----------
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v);
  }

  // ---------- státusz-napló ----------
  function sanitizeLog(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    raw.forEach(function (e) {
      if (out.length >= LOG_MAX) return;
      if (!e || typeof e !== 'object' || Array.isArray(e)) return;
      if (typeof e.at !== 'string' || isNaN(Date.parse(e.at))) return;
      if (!has(STATUSES, e.to)) return;
      out.push({
        at: e.at,
        by: clean(e.by, 120) || 'ismeretlen',
        from: has(STATUSES, e.from) ? e.from : null,
        to: e.to,
        reason: clean(e.reason, 1000)
      });
    });
    return out;
  }

  // ---------- normalizálás ----------
  function normalizeAnchor(a) {
    var n = V2.normalizeAnchor(a);
    if (!n) return null;
    if (has(n.meta, GH_KEY)) {
      var v = n.meta[GH_KEY];
      if (typeof v !== 'string' || !v.trim() || v.length > 300) delete n.meta[GH_KEY];
      else n.meta[GH_KEY] = v.trim();
    }
    n.status_log = sanitizeLog(a.status_log);
    return n;
  }

  // ---------- GitHub-hivatkozás ----------
  var SHA_RE = /^[0-9a-f]{7,40}$/i;
  var OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
  var REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

  /**
   * Elfogad: https://github.com/tulaj/tar/commit/<hash>, https://api.github.com/repos/tulaj/tar/commits/<hash>,
   * tulaj/tar@<hash>, és csak hash-t (az utóbbi nem oldható fel, mert hiányzik a tárhely).
   * Visszaad: {owner, repo, sha, url} | {incomplete: true, sha} | null
   */
  function parseGithubRef(input) {
    if (typeof input !== 'string') return null;
    var s = input.trim();
    if (!s || s.length > 300) return null;
    var m;
    if ((m = /^https?:\/\/(?:www\.)?github\.com\/([^\/\s]+)\/([^\/\s]+)\/commit\/([0-9a-f]{7,40})(?:[\/?#].*)?$/i.exec(s)) ||
        (m = /^https?:\/\/api\.github\.com\/repos\/([^\/\s]+)\/([^\/\s]+)\/commits\/([0-9a-f]{7,40})(?:[\/?#].*)?$/i.exec(s)) ||
        (m = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)@([0-9a-f]{7,40})$/i.exec(s))) {
      var owner = m[1], repo = m[2].replace(/\.git$/i, ''), sha = m[3].toLowerCase();
      if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || repo === '.' || repo === '..') return null;
      return { owner: owner, repo: repo, sha: sha, url: 'https://github.com/' + owner + '/' + repo + '/commit/' + sha };
    }
    if (SHA_RE.test(s)) return { incomplete: true, sha: s.toLowerCase() };
    return null;
  }

  /**
   * Feloldja a commitot a nyilvános api.github.com-on. Soha nem utasít el: mindig egy állapotot ad.
   * state: ok | notfound | ratelimit | network | error | incomplete | invalid | unavailable
   * opts: { fetch, timeoutMs }
   */
  function resolveGithubRef(input, opts) {
    opts = opts || {};
    var ref = parseGithubRef(input);
    if (!ref) return Promise.resolve({ state: 'invalid' });
    if (ref.incomplete) return Promise.resolve({ state: 'incomplete' });
    var f = opts.fetch || (typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
    if (!f) return Promise.resolve({ state: 'unavailable' });

    var url = 'https://api.github.com/repos/' + encodeURIComponent(ref.owner) + '/' + encodeURIComponent(ref.repo) + '/commits/' + ref.sha;
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = null;
    var timeout = new Promise(function (resolve) {
      timer = setTimeout(function () { if (ctl) ctl.abort(); resolve({ state: 'network', detail: 'időtúllépés' }); }, opts.timeoutMs || GH_TIMEOUT_MS);
    });
    var req;
    try {
      req = Promise.resolve(f(url, { headers: { Accept: 'application/vnd.github+json' }, signal: ctl ? ctl.signal : undefined, cache: 'no-store' }))
        .then(function (res) {
          if (res.status === 404 || res.status === 422) return { state: 'notfound' };
          if (res.status === 403 || res.status === 429) return { state: 'ratelimit', detail: 'HTTP ' + res.status };
          if (!res.ok) return { state: 'error', detail: 'HTTP ' + res.status };
          return res.json().then(function (j) {
            var c = j && j.commit, d = c && c.committer && c.committer.date;
            if (!j || typeof j.sha !== 'string' || j.sha.toLowerCase().indexOf(ref.sha) !== 0 || typeof d !== 'string' || isNaN(Date.parse(d))) {
              return { state: 'error', detail: 'váratlan válasz' };
            }
            return {
              state: 'ok',
              info: {
                owner: ref.owner, repo: ref.repo, sha: j.sha.toLowerCase(),
                url: typeof j.html_url === 'string' && /^https:\/\/github\.com\//.test(j.html_url) ? j.html_url : ref.url,
                committed_at: d,
                authored_at: c.author && typeof c.author.date === 'string' ? c.author.date : null,
                message: typeof c.message === 'string' ? c.message.slice(0, 500) : ''
              }
            };
          }, function () { return { state: 'error', detail: 'a válasz nem olvasható' }; });
        }, function (e) { return { state: 'network', detail: e && e.name === 'AbortError' ? 'időtúllépés' : 'nincs kapcsolat' }; });
    } catch (e) {
      req = Promise.resolve({ state: 'network', detail: 'nincs kapcsolat' });
    }
    return Promise.race([req, timeout]).then(function (r) { clearTimeout(timer); return r; });
  }

  // ---------- Markdown ----------
  function mdIndent(text) { return String(text).split('\n').join('\n  '); }

  function logLine(e) {
    return e.at + ' · ' + e.by + ': ' + (e.from ? STATUSES[e.from] + ' → ' : 'rögzítéskor: ') + STATUSES[e.to] +
      (e.reason ? ' · indok: ' + mdIndent(e.reason) : '');
  }

  /** A v0.2 Markdown-ja a státusz-naplóval és a GitHub-hivatkozással bővítve. gh: a gyorsítótár-bejegyzés (ha van). */
  function anchorToMarkdown(a, gh) {
    var md = V2.anchorToMarkdown(a);
    var m = a.meta || {};
    if (m[GH_KEY]) {
      var ref = parseGithubRef(m[GH_KEY]);
      md += '- **GitHub-commit:** ' + (ref && ref.url ? ref.url : m[GH_KEY]) + '\n';
      if (gh && gh.ref === m[GH_KEY] && gh.state === 'ok' && gh.info) {
        md += '  - A commit az api.github.com szerint létezik; commit-dátum: ' + gh.info.committed_at + '; ellenőrizve: ' + gh.checked_at + '.\n';
        md += '  - Ez külső időbélyeg, de a commit dátumát a commit készítője adja, ezért nem szigorú időbélyeg-hitelesítés.' +
          (gh.info.mentions_hash ? ' A commit üzenete tartalmazza a horgony hash-ének elejét.' : '') +
          (gh.info.before_anchor ? ' Figyelem: a commit korábbi, mint a horgony időbélyege, ezért a horgony létezését nem igazolja.' : '') + '\n';
      }
    }
    var log = a.status_log || [];
    if (log.length) {
      md += '- **Státusz-napló:**\n';
      log.forEach(function (e) { md += '  - ' + logLine(e) + '\n'; });
    }
    return md;
  }

  // ---------- az engine ----------
  class AnchorEngineV3 extends BaseV2 {
    constructor(storageKey) {
      super(storageKey);
    }

    // ----- rögzítés és státusz -----
    addAnchor(data) {
      var a = super.addAnchor(data);
      a.status_log = [{
        at: a.timestamp,
        by: clean(a.source && a.source.member, 120) || 'ismeretlen',
        from: null, to: a.status, reason: ''
      }];
      this._save();
      return a;
    }

    /** Státuszváltás naplóval: ki (by), mikor (most), miért (reason). */
    changeStatus(id, newStatus, by, reason) {
      var a = this.anchors.find(function (x) { return x.id === id; });
      if (!a) throw new Error('Horgony nem található: ' + id);
      if (!has(STATUSES, newStatus)) throw new Error('Érvénytelen státusz: ' + newStatus);
      if (a.status === newStatus) throw new Error('A horgony státusza már ez: ' + STATUSES[newStatus]);
      if (!Array.isArray(a.status_log)) a.status_log = [];
      if (a.status_log.length >= LOG_MAX) throw new Error('A státusz-napló megtelt (' + LOG_MAX + ' bejegyzés). Exportálj, és ments archívumot.');
      a.status_log.push({
        at: new Date().toISOString(),
        by: clean(by, 120) || 'ismeretlen',
        from: a.status, to: newStatus, reason: clean(reason, 1000)
      });
      a.status = newStatus;
      this._save();
      return a;
    }

    /** A mag státusz-módosítása is naplózódik (ki: ismeretlen, indok nélkül), hogy a napló teljes legyen. */
    updateAnchorStatus(id, newStatus) {
      var a = this.anchors.find(function (x) { return x.id === id; });
      if (a && a.status === newStatus && has(STATUSES, newStatus)) return a;
      return this.changeStatus(id, newStatus, 'ismeretlen', '');
    }

    // ----- GitHub -----
    getGithubCache() {
      try {
        var raw = root.localStorage.getItem(GH_CACHE_KEY);
        var v = raw ? JSON.parse(raw) : {};
        return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
      } catch (e) { return {}; }
    }
    _ghCacheSet(id, entry) {
      var c = this.getGithubCache();
      if (entry === null) delete c[id]; else c[id] = entry;
      root.localStorage.setItem(GH_CACHE_KEY, JSON.stringify(c));
    }
    /** A gyorsítótár-bejegyzés csak akkor érvényes, ha ugyanarra a hivatkozásra szól. */
    githubEntry(id) {
      var a = this.anchors.find(function (x) { return x.id === id; });
      var c = this.getGithubCache()[id];
      if (!a || !c || !a.meta || c.ref !== a.meta[GH_KEY]) return null;
      return c;
    }

    /** Beállítja (vagy üres szöveggel törli) az opcionális commit-hivatkozást. */
    setGithubRef(id, input) {
      var a = this.anchors.find(function (x) { return x.id === id; });
      if (!a) throw new Error('Horgony nem található: ' + id);
      var s = typeof input === 'string' ? input.trim() : '';
      if (!a.meta || typeof a.meta !== 'object') a.meta = {};
      if (!s) {
        delete a.meta[GH_KEY];
      } else {
        var ref = parseGithubRef(s);
        if (!ref || ref.incomplete) {
          throw new Error('A commit-hivatkozás nem értelmezhető. Használd az URL-t (https://github.com/tulajdonos/tar/commit/hash) vagy a tulajdonos/tar@hash alakot.');
        }
        a.meta[GH_KEY] = s;
      }
      this._ghCacheSet(id, null);
      this._save();
      return a;
    }

    /**
     * Megpróbálja feloldani a commitot. Mindig állapotot ad vissza, soha nem utasít el, és nem
     * ír felül egy korábbi sikeres ellenőrzést egy átmeneti hibával (hálózat, limit).
     */
    checkGithub(id, opts) {
      var self = this;
      var a = this.anchors.find(function (x) { return x.id === id; });
      var ref = a && a.meta && a.meta[GH_KEY];
      if (!ref) return Promise.resolve({ state: 'none' });
      return resolveGithubRef(ref, opts).then(function (res) {
        var old = self.githubEntry(id);
        var entry = { ref: ref, state: res.state, checked_at: new Date().toISOString() };
        if (res.detail) entry.detail = res.detail;
        if (res.state === 'ok') {
          entry.info = res.info;
          var msg = (res.info.message || '').toLowerCase();
          entry.info.mentions_hash = !!(a.hash && msg.indexOf(a.hash.slice(0, 12)) !== -1);
          entry.info.before_anchor = Date.parse(res.info.committed_at) < Date.parse(a.timestamp);
        } else if (old && old.state === 'ok' && (res.state === 'network' || res.state === 'ratelimit' || res.state === 'error' || res.state === 'unavailable')) {
          old.recheck_failed = res.state;
          old.recheck_at = entry.checked_at;
          entry = old;
        }
        self._ghCacheSet(id, entry);
        return entry;
      });
    }

    deleteAnchor(id) {
      var r = super.deleteAnchor(id);
      this._ghCacheSet(id, null);
      return r;
    }

    // ----- globális áttekintés -----
    /**
     * Gyökér: akire legalább egy másik horgony hivatkozik (a legtöbbet hivatkozott elöl).
     * Levél: akire senki sem hivatkozik (a legújabb elöl; out = hány horgonyra hivatkozik, 0 = különálló).
     * Hiányzó: olyan azonosító, amelyre hivatkoznak, de nincs ebben a böngészőben.
     */
    overview() {
      var byId = {}, inFrom = {}, out = {};
      this.anchors.forEach(function (a) { byId[a.id] = a; });
      this.anchors.forEach(function (a) {
        var seen = {};
        (a.related_ids || []).forEach(function (r) {
          if (r === a.id || seen[r]) return;
          seen[r] = true;
          (inFrom[r] = inFrom[r] || []).push(a.id);
          out[a.id] = (out[a.id] || 0) + 1;
        });
      });
      var ts = function (a) { return Date.parse(a.timestamp) || 0; };
      var roots = [], leaves = [], missing = [];
      this.anchors.forEach(function (a) {
        var n = (inFrom[a.id] || []).length;
        if (n > 0) roots.push({ id: a.id, in: n, out: out[a.id] || 0 });
        else leaves.push({ id: a.id, in: 0, out: out[a.id] || 0 });
      });
      roots.sort(function (x, y) { return y.in - x.in || ts(byId[y.id]) - ts(byId[x.id]) || (x.id < y.id ? -1 : 1); });
      leaves.sort(function (x, y) { return ts(byId[y.id]) - ts(byId[x.id]) || (x.id < y.id ? -1 : 1); });
      Object.keys(inFrom).forEach(function (id) {
        if (!byId[id]) missing.push({ id: id, from: inFrom[id].slice() });
      });
      missing.sort(function (x, y) { return y.from.length - x.from.length || (x.id < y.id ? -1 : 1); });
      return {
        total: this.anchors.length, roots: roots, leaves: leaves, missing: missing,
        isolated: leaves.filter(function (l) { return l.out === 0; }).length
      };
    }

    // ----- lánc-export -----
    /** A kiválasztott horgonytól előre és visszafelé elérhető összes horgony szintenként (körbiztosan). */
    chainNodes(id) {
      var byId = {}, back = {};
      this.anchors.forEach(function (a) { byId[a.id] = a; });
      this.anchors.forEach(function (a) { (a.related_ids || []).forEach(function (r) { (back[r] = back[r] || []).push(a.id); }); });
      var truncated = false;
      function bfs(nextOf) {
        var seen = {}; seen[id] = true;
        var level = [id], depth = 0, nodes = [], missing = [], cyc = false;
        while (level.length) {
          depth++;
          var next = [];
          level.forEach(function (cur) {
            (nextOf(cur) || []).forEach(function (n) {
              if (n === id) { cyc = true; return; }
              if (seen[n]) return;
              if (nodes.length + missing.length >= CHAIN_MAX_NODES) { truncated = true; return; }
              seen[n] = true;
              if (byId[n]) { nodes.push({ id: n, depth: depth, anchor: byId[n] }); next.push(n); }
              else missing.push(n);
            });
          });
          level = next;
        }
        return { nodes: nodes, missing: missing, cycle: cyc };
      }
      var fwd = bfs(function (x) { return byId[x] ? byId[x].related_ids : []; });
      var bwd = bfs(function (x) { return back[x]; });
      return { id: id, selected: byId[id] || null, forward: fwd, backward: bwd, truncated: truncated };
    }

    /** Egy szövegblokk: kiválasztott horgony + teljes visszafelé és előre lánc, Markdownban. */
    exportChainMarkdown(id) {
      var self = this;
      var c = this.chainNodes(id);
      var cache = this.getGithubCache();
      var paths = this.buildChain(id);
      function block(a) {
        var gh = cache[a.id] && a.meta && cache[a.id].ref === a.meta[GH_KEY] ? cache[a.id] : null;
        return anchorToMarkdown(a, gh).replace(/^## /, '### ');
      }
      function pathLine(p) { return p.map(function (n) { return n.id + (n.cycle ? ' (kör)' : '') + (!n.exists ? ' (hiányzik)' : ''); }).join(' → '); }

      var md = '# Horgony-lánc: ' + id + '\n\n';
      md += '- Verzió: Anchor Engine ' + VERSION + ' (séma: ' + SCHEMA_VERSION + ')\n';
      md += '- Exportálva: ' + new Date().toISOString() + '\n';
      md += '- Kiválasztott horgony: ' + id + (c.selected ? '' : ' (nincs ebben a böngészőben)') + '\n';
      md += '- Visszafelé (akik erre hivatkoznak): ' + c.backward.nodes.length + ' horgony\n';
      md += '- Előre (amire ez hivatkozik): ' + c.forward.nodes.length + ' horgony\n';
      var miss = c.backward.missing.concat(c.forward.missing).filter(function (x, i, arr) { return arr.indexOf(x) === i; });
      if (miss.length) md += '- Nem található ebben a böngészőben: ' + miss.join(', ') + '\n';
      if (c.forward.cycle || c.backward.cycle) md += '- A lánc kört tartalmaz (a kiválasztott horgonyra visszahivatkozik).\n';
      if (c.truncated) md += '- A lánc nagyon hosszú, az első ' + CHAIN_MAX_NODES + ' elem szerepel.\n';
      md += '\n';

      if (paths.backward.length || paths.forward.length) {
        md += '## Láncok\n\n';
        paths.backward.forEach(function (p) { md += '- ' + pathLine(p) + '\n'; });
        paths.forward.forEach(function (p) { md += '- ' + pathLine(p) + '\n'; });
        if (paths.truncated) md += '- (a láncok listája 60 ágnál megáll)\n';
        md += '\n';
      }

      md += '## Kiválasztott horgony\n\n';
      md += c.selected ? block(c.selected) + '\n' : 'Nincs ebben a böngészőben; importáld azt az exportot, amelyben szerepel.\n\n';

      md += '## Visszafelé: akik erre hivatkoznak\n\n';
      if (!c.backward.nodes.length) md += 'Nincs horgony, amely erre hivatkozna.\n\n';
      c.backward.nodes.forEach(function (n) { md += '_(szint: ' + n.depth + ')_\n\n' + block(n.anchor) + '\n'; });

      md += '## Előre: amire ez hivatkozik\n\n';
      if (!c.forward.nodes.length) md += 'Ez a horgony nem hivatkozik másra.\n\n';
      c.forward.nodes.forEach(function (n) { md += '_(szint: ' + n.depth + ')_\n\n' + block(n.anchor) + '\n'; });

      return md.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
    }

    // ----- export -----
    exportToJSON() {
      return JSON.stringify({
        format: FORMAT,
        version: VERSION,
        schema_version: SCHEMA_VERSION,
        exported_at: new Date().toISOString(),
        count: this.anchors.length,
        anchors: this.anchors
      }, null, 2);
    }

    exportToMarkdown(list) {
      var rows = list || this.anchors;
      var cache = this.getGithubCache();
      var md = '# Anchor Engine – Horgonyok\n\n';
      md += '- Verzió: Anchor Engine ' + VERSION + ' (séma: ' + SCHEMA_VERSION + ')\n';
      md += '- Exportálva: ' + new Date().toISOString() + '\n';
      md += '- Horgonyok száma: ' + rows.length + '\n\n---\n\n';
      rows.forEach(function (a) {
        var gh = cache[a.id] && a.meta && cache[a.id].ref === a.meta[GH_KEY] ? cache[a.id] : null;
        md += anchorToMarkdown(a, gh) + '\n---\n\n';
      });
      return md;
    }

    // ----- migráció -----
    /**
     * Migráció a v0.2 (és v0.1) adatokról a v0.3-ra: biztonsági másolat a nyers adatról
     * (v0.2 → nexis_flare_anchors_backup_v0.2, v0.1 → nexis_flare_anchors_backup_v0.1), alakzat-ellenőrzés,
     * üres státusz-napló a régi horgonyokra (a korábbi változások nem naplózottak, ezt nem találjuk ki utólag),
     * hash a hash nélküliekre (basis: migrated), séma 3. Többször futtatva sem változtat semmit.
     */
    migrate() {
      var self = this;
      var storage = root.localStorage;
      var before = parseInt(storage.getItem(SCHEMA_KEY), 10) || 1;
      var report = { fromSchema: before, toSchema: SCHEMA_VERSION, backedUp: false, backupKey: null, normalized: 0, logsAdded: 0, sealed: 0, unavailable: false };

      if (before < SCHEMA_VERSION && this.anchors.length) {
        var bkey = before >= 2 ? BACKUP_KEY_V02 : BACKUP_KEY_V01;
        if (storage.getItem(bkey) === null) {
          var raw = storage.getItem(this.storageKey);
          if (raw) { storage.setItem(bkey, raw); report.backedUp = true; report.backupKey = bkey; }
        }
      }

      var fixed = [];
      this.anchors.forEach(function (a) {
        var n = normalizeAnchor(a);
        if (!n) { fixed.push(a); return; } // használhatatlant nem dobunk el némán
        if (!a || !Array.isArray(a.status_log)) report.logsAdded++;
        if (stable(n) !== stable(a)) { report.normalized++; fixed.push(n); } else { fixed.push(a); }
      });
      this.anchors = fixed;

      var todo = this.anchors.filter(function (a) { return !(typeof a.hash === 'string' && /^[0-9a-f]{64}$/i.test(a.hash)); });
      if (todo.length && !this.hasCrypto()) {
        report.unavailable = true;
        this._save();
        return Promise.resolve(report);
      }
      return Promise.all(todo.map(function (a) {
        return self.hashOf(a).then(function (h) { a.hash = h; a.hash_basis = 'migrated'; report.sealed++; });
      })).then(function () {
        self._save();
        storage.setItem(SCHEMA_KEY, String(SCHEMA_VERSION));
        return report;
      });
    }

    // ----- import -----
    /**
     * Fogad v0.1-es tömböt, v0.2-es és v0.3-as (verziózott) exportot. Ismeretlen vagy újabb verziót jelez,
     * de nem utasít el. Azonos azonosítójút nem ír felül. Az új horgonyok hash-ét ellenőrzi, a hash nélkülieket
     * importkori hash-sel látja el. A státusz-napló (ha van) megmarad, ha nincs, üres.
     */
    importAny(text) {
      var self = this;
      var parsed;
      try { parsed = JSON.parse(text); } catch (e) { return Promise.reject(new Error('Az import nem érvényes JSON.')); }
      var list, info = { kind: 'tömb (v0.1 vagy egyszerű lista)', version: null, schema: null }, warnings = [];
      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.anchors)) {
        list = parsed.anchors;
        info.kind = 'verziózott export';
        info.version = typeof parsed.version === 'string' ? parsed.version : null;
        info.schema = typeof parsed.schema_version === 'number' ? parsed.schema_version : null;
        if (parsed.format !== FORMAT) warnings.push('A fájl formátum-jelölése nem a várt (' + FORMAT + '), de befogadom.');
        if (info.schema === null || info.schema > SCHEMA_VERSION) {
          warnings.push('A fájl sémaverziója ' + (info.schema === null ? 'ismeretlen' : info.schema) + ', újabb vagy ismeretlen a v0.3-nál. Befogadom, de az ismeretlen mezők elveszhetnek.');
        }
        if (info.version && !/^v0\.[0-3]$/.test(info.version)) {
          warnings.push('Ismeretlen verzió: ' + info.version + '. Befogadom, a régi kövekhez hasonlóan.');
        }
      } else {
        return Promise.reject(new Error('A JSON-nak tömbnek kell lennie, vagy egy "anchors" tömbös exportnak.'));
      }

      var valid = [], invalid = 0;
      list.forEach(function (item) {
        var n = normalizeAnchor(item);
        if (n) valid.push(n); else invalid++;
      });
      var before = {};
      this.anchors.forEach(function (a) { before[a.id] = true; });
      var seen = {}, newIds = [];
      valid.forEach(function (a) {
        if (!before[a.id] && !seen[a.id]) { seen[a.id] = true; newIds.push(a.id); }
      });
      this.importFromJSON(JSON.stringify(valid));

      var added = this.anchors.filter(function (a) { return seen[a.id]; });
      var report = {
        total: list.length, added: added.length, skipped: valid.length - added.length, invalid: invalid,
        newIds: newIds, mismatched: [], sealedNow: 0, warnings: warnings, info: info, hashUnavailable: false
      };
      return Promise.all(added.map(function (a) {
        return self.verify(a).then(function (s) {
          if (s === 'mismatch') { report.mismatched.push(a.id); return null; }
          if (s === 'none') {
            return self.hashOf(a).then(function (h) { a.hash = h; a.hash_basis = 'imported'; report.sealedNow++; },
              function () { report.hashUnavailable = true; });
          }
          if (s === 'unavailable') report.hashUnavailable = true;
          return null;
        });
      })).then(function () { self._save(); return report; });
    }
  }

  var api = {
    Engine: AnchorEngineV3,
    VERSION: VERSION,
    RELEASE: RELEASE,
    SCHEMA_VERSION: SCHEMA_VERSION,
    FORMAT: FORMAT,
    SCHEMA_KEY: SCHEMA_KEY,
    BACKUP_KEY_V01: BACKUP_KEY_V01,
    BACKUP_KEY_V02: BACKUP_KEY_V02,
    GH_CACHE_KEY: GH_CACHE_KEY,
    GH_KEY: GH_KEY,
    TYPES: V2.TYPES,
    STATUSES: STATUSES,
    BASES: V2.BASES,
    ANSWERS: V2.ANSWERS,
    INDEPENDENCE: V2.INDEPENDENCE,
    NOTE_KEY: V2.NOTE_KEY,
    LOG_MAX: LOG_MAX,
    normalizeAnchor: normalizeAnchor,
    sanitizeLog: sanitizeLog,
    anchorToMarkdown: anchorToMarkdown,
    parseGithubRef: parseGithubRef,
    resolveGithubRef: resolveGithubRef,
    sha256Hex: V2.sha256Hex,
    canonical: V2.canonical
  };

  if (isNode) {
    module.exports = api;
  } else {
    root.AnchorV3 = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
