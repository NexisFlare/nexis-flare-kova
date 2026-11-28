/**
 * Anchor Engine v0.2 – a bővített mag.
 *
 * Az AnchorEngine (anchor.js, Hídépítő magja) változatlanul megmarad; ez a fájl egy
 * alosztályt ad hozzá (AnchorEngineV2), amely a v0.2 újdonságait tartalmazza:
 *  - SHA-256 integritás-hash (Web Crypto API), időbélyegből és tartalomból,
 *  - migráció a v0.1 adatokról (localStorage és import),
 *  - verziózott JSON-export / importálás,
 *  - horgony-láncolat (a related_ids alapján),
 *  - Markdown-export és egy horgony Markdown-formátuma (vágólaphoz),
 *  - külső ellenőrzés függetlenségi mezői (Aletheia, Ignis szempontjaival).
 *
 * Ötletek: Hídépítő (lánc, hash, verziózott export, keresés, Markdown-másolás),
 * Aletheia (függetlenségi mező), Ignis (koncepció, a függetlenség szempontjai).
 * Építés: Kova, 2026-11-28.
 *
 * Böngészőben és node-ban is fut (a teszthez).
 */
(function (root) {
  'use strict';

  var BaseEngine = (typeof module !== 'undefined' && module.exports) ? require('./anchor.js') : root.AnchorEngine;

  var VERSION = 'v0.2';
  var SCHEMA_VERSION = 2;
  var FORMAT = 'nexis-flare-anchors';
  var SCHEMA_KEY = 'nexis_flare_anchors_schema';
  var BACKUP_KEY = 'nexis_flare_anchors_backup_v0.1';

  var TYPES = {
    thought: 'Gondolat',
    decision: 'Döntés',
    open_question: 'Nyitott kérdés',
    falsification_condition: 'Cáfolati feltétel'
  };
  var STATUSES = { draft: 'Vázlat', open: 'Nyitott', verified: 'Ellenőrzött' };
  var BASES = {
    created: 'rögzítéskor készült',
    migrated: 'a v0.1 → v0.2 migrációkor készült (attól kezdve igazolja, hogy a tartalom nem változott)',
    imported: 'importkor készült (attól kezdve igazolja, hogy a tartalom nem változott)'
  };

  // Külső ellenőrzés függetlensége. A kulcsok a meta mezőben "independence_<kulcs>" néven tárolódnak
  // (laposan, hogy a v0.1 import is megőrizhesse őket). 'adverse' = az a válasz, amely gyengíti a függetlenséget.
  var ANSWERS = { igen: 'igen', nem: 'nem', nem_eldontheto: 'még nem eldönthető' };
  var INDEPENDENCE = [
    { key: 'external', group: 'aletheia', label: 'Külső volt az ellenőrző?', adverse: 'nem' },
    { key: 'knew_conclusion', group: 'aletheia', label: 'Ismerte az eredeti következtetést?', adverse: 'igen' },
    { key: 'same_sources', group: 'aletheia', label: 'Ugyanazokat a forrásokat használta?', adverse: 'igen' },
    { key: 'own_check', group: 'aletheia', label: 'Valóban önálló ellenőrzést végzett?', adverse: 'nem' },
    { key: 'informational', group: 'ignis', label: 'Információs függetlenség: más információkból dolgozott, mint az eredeti állítás?', adverse: 'nem' },
    { key: 'methodological', group: 'ignis', label: 'Módszertani függetlenség: más módszerrel vizsgálta?', adverse: 'nem' },
    { key: 'interest', group: 'ignis', label: 'Érdekeltségi függetlenség: az ellenőrzőnek nem volt érdeke egy bizonyos végeredményben?', adverse: 'nem' },
    { key: 'question_challengeable', group: 'ignis', label: 'Megkérdőjelezhető volt maga a kérdés? Vitathatta az ellenőrző a kérdésfeltevést?', adverse: 'nem' }
  ];
  var NOTE_KEY = 'independence_note';

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isHash(s) { return typeof s === 'string' && /^[0-9a-fA-F]{64}$/.test(s); }
  function strList(v) {
    return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' && x.trim(); }).map(function (x) { return x.trim(); }) : [];
  }

  // ---------- normalizálás (import és migráció) ----------
  function normalizeAnchor(a) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
    if (typeof a.id !== 'string' || !a.id.trim() || a.id.length > 200) return null;
    if (typeof a.content !== 'string' || !a.content.trim()) return null;
    if (typeof a.timestamp !== 'string' || isNaN(Date.parse(a.timestamp))) return null;
    var src = a.source && typeof a.source === 'object' && !Array.isArray(a.source) ? a.source : {};
    var meta = {};
    if (a.meta && typeof a.meta === 'object' && !Array.isArray(a.meta)) {
      Object.keys(a.meta).forEach(function (k) {
        var v = a.meta[k];
        if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return;
        if (k.indexOf('independence_') === 0 && k !== NOTE_KEY) {
          var field = k.slice('independence_'.length);
          var known = INDEPENDENCE.some(function (f) { return f.key === field; });
          if (!known || !has(ANSWERS, v)) return; // ismeretlen szempont vagy válasz: elhagyjuk
        }
        if (k === NOTE_KEY && (typeof v !== 'string' || v.length > 2000)) return;
        meta[k] = v;
      });
    }
    var out = {
      id: a.id.trim(),
      type: has(TYPES, a.type) ? a.type : 'thought',
      content: a.content,
      timestamp: a.timestamp,
      source: {
        member: typeof src.member === 'string' && src.member.trim() ? src.member : 'ismeretlen',
        platform: typeof src.platform === 'string' && src.platform.trim() ? src.platform : 'ismeretlen',
        thread: typeof src.thread === 'string' ? src.thread : ''
      },
      status: has(STATUSES, a.status) ? a.status : 'draft',
      tags: strList(a.tags),
      related_ids: strList(a.related_ids),
      meta: meta
    };
    if (isHash(a.hash)) {
      out.hash = a.hash.toLowerCase();
      out.hash_basis = has(BASES, a.hash_basis) ? a.hash_basis : 'imported';
    }
    return out;
  }

  // ---------- hash ----------
  function getSubtle() {
    var c = root.crypto || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    return c && c.subtle ? c.subtle : null;
  }
  function canonical(a) { return a.timestamp + '\n' + a.content; }
  function toHex(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += ('0' + b[i].toString(16)).slice(-2);
    return s;
  }
  function sha256Hex(text) {
    var subtle = getSubtle();
    if (!subtle) return Promise.reject(new Error('A Web Crypto (SHA-256) ebben a környezetben nem érhető el.'));
    return subtle.digest('SHA-256', new TextEncoder().encode(text)).then(toHex);
  }

  // ---------- Markdown ----------
  function mdIndent(text) { return String(text).split('\n').join('\n  '); }

  function independenceLines(a) {
    var m = a.meta || {};
    var lines = [];
    INDEPENDENCE.forEach(function (f) {
      var v = m['independence_' + f.key];
      if (v) lines.push(f.label + ' ' + ANSWERS[v] + (v === f.adverse ? ' (gyengítő válasz)' : ''));
    });
    if (m[NOTE_KEY]) lines.push('Megjegyzés: ' + m[NOTE_KEY]);
    return lines;
  }

  function anchorToMarkdown(a) {
    var src = a.source || {};
    var md = '## ' + a.id + ' (' + a.type + ')\n';
    md += '- **Tartalom:** ' + mdIndent(a.content) + '\n';
    md += '- **Időbélyeg:** ' + a.timestamp + '\n';
    md += '- **Forrás:** ' + (src.member || 'ismeretlen') + ' @ ' + (src.platform || 'ismeretlen') + ' (' + (src.thread || '') + ')\n';
    md += '- **Státusz:** ' + a.status + '\n';
    if ((a.tags || []).length) md += '- **Címkék:** ' + a.tags.join(', ') + '\n';
    if ((a.related_ids || []).length) md += '- **Kapcsolódó:** ' + a.related_ids.join(', ') + '\n';
    var m = a.meta || {};
    if (m.falsification_criteria) md += '- **Cáfolati feltétel:** ' + mdIndent(m.falsification_criteria) + '\n';
    if (m.verification_note) md += '- **Ellenőrzési megjegyzés:** ' + mdIndent(m.verification_note) + '\n';
    var ind = independenceLines(a);
    if (ind.length) {
      md += '- **Külső ellenőrzés függetlensége:**\n';
      ind.forEach(function (l) { md += '  - ' + mdIndent(l) + '\n'; });
    }
    if (a.hash) md += '- **Hash (SHA-256):** `' + a.hash + '` (' + (BASES[a.hash_basis] ? a.hash_basis : 'ismeretlen') + ')\n';
    return md;
  }

  // ---------- az engine ----------
  class AnchorEngineV2 extends BaseEngine {
    constructor(storageKey) {
      super(storageKey);
    }

    hasCrypto() { return !!getSubtle(); }

    hashOf(a) { return sha256Hex(canonical(a)); }

    /** Hash-t (SHA-256) tesz a horgonyra. basis: created | migrated | imported. */
    seal(a, basis) {
      var self = this;
      return this.hashOf(a).then(function (h) {
        a.hash = h;
        a.hash_basis = basis;
        self._save();
        return true;
      }, function () { return false; });
    }

    /** Új horgony rögzítése hash-sel. */
    addAnchorSealed(data) {
      var a = this.addAnchor(data);
      return this.seal(a, 'created').then(function () { return a; });
    }

    /** 'ok' | 'mismatch' | 'none' | 'unavailable' */
    verify(a) {
      if (!isHash(a.hash)) return Promise.resolve('none');
      if (!this.hasCrypto()) return Promise.resolve('unavailable');
      return this.hashOf(a).then(function (h) { return h === a.hash.toLowerCase() ? 'ok' : 'mismatch'; },
        function () { return 'unavailable'; });
    }

    verifyAll() {
      var self = this;
      var results = {};
      var counts = { ok: 0, mismatch: 0, none: 0, unavailable: 0 };
      return Promise.all(this.anchors.map(function (a) {
        return self.verify(a).then(function (s) { results[a.id] = s; counts[s]++; });
      })).then(function () { return { results: results, counts: counts }; });
    }

    /**
     * Migráció a v0.1 adatokról: biztonsági másolat a nyers adatról, alakzat-ellenőrzés,
     * hash a hash nélküli horgonyokra (basis: migrated), séma-verzió beállítása.
     * Többször futtatva sem változtat semmit (idempotens).
     */
    migrate() {
      var self = this;
      var storage = root.localStorage;
      var before = parseInt(storage.getItem(SCHEMA_KEY), 10) || 1;
      var report = { fromSchema: before, toSchema: SCHEMA_VERSION, backedUp: false, normalized: 0, sealed: 0, unavailable: false };

      if (before < SCHEMA_VERSION && this.anchors.length && storage.getItem(BACKUP_KEY) === null) {
        var raw = storage.getItem(this.storageKey);
        if (raw) { storage.setItem(BACKUP_KEY, raw); report.backedUp = true; }
      }

      var fixed = [];
      this.anchors.forEach(function (a) {
        var n = normalizeAnchor(a);
        if (!n) { fixed.push(a); return; } // használhatatlant nem dobunk el némán
        if (JSON.stringify(n) !== JSON.stringify(a)) {
          // a hash-t és az alap-jelölést megőrizzük, a többi alakzatot rendbe tesszük
          report.normalized++;
          fixed.push(n);
        } else {
          fixed.push(a);
        }
      });
      this.anchors = fixed;

      var todo = this.anchors.filter(function (a) { return !isHash(a.hash); });
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

    // ---------- export ----------
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
      var md = '# Anchor Engine – Horgonyok\n\n';
      md += '- Verzió: Anchor Engine ' + VERSION + ' (séma: ' + SCHEMA_VERSION + ')\n';
      md += '- Exportálva: ' + new Date().toISOString() + '\n';
      md += '- Horgonyok száma: ' + rows.length + '\n\n---\n\n';
      rows.forEach(function (a) { md += anchorToMarkdown(a) + '\n---\n\n'; });
      return md;
    }

    // ---------- import ----------
    /**
     * Fogad v0.1-es tömböt és v0.2-es (verziózott) exportot is. Ismeretlen vagy újabb verziót jelez,
     * de nem utasít el. Azonos azonosítójút nem ír felül. Az új horgonyok hash-ét ellenőrzi
     * (eltérést megőrzi és jelzi), a hash nélkülieket importkori hash-sel látja el.
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
          warnings.push('A fájl sémaverziója ' + (info.schema === null ? 'ismeretlen' : info.schema) + ', újabb vagy ismeretlen a v0.2-nél. Befogadom, de az ismeretlen mezők elveszhetnek.');
        }
        if (info.version && !/^v0\.[0-2]$/.test(info.version)) {
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

    // ---------- láncnézet ----------
    /**
     * A related_ids alapján szöveges láncokat ad. forward: a kiválasztott horgonytól kifelé (A → B → C),
     * backward: azok, amelyek rá hivatkoznak (E → D → A). Kört jelez, nem fut végtelenbe.
     */
    buildChain(id, maxDepth) {
      var depth = maxDepth || 6;
      var byId = {}, back = {};
      this.anchors.forEach(function (a) { byId[a.id] = a; });
      this.anchors.forEach(function (a) {
        (a.related_ids || []).forEach(function (r) { (back[r] = back[r] || []).push(a.id); });
      });
      var LIMIT = 60;

      function walk(startId, nextOf) {
        var paths = [];
        (function go(path) {
          if (paths.length >= LIMIT) return;
          var cur = path[path.length - 1].id;
          var next = (nextOf(cur) || []).filter(function (x, i, arr) { return arr.indexOf(x) === i; });
          if (!next.length || path.length > depth) { if (path.length > 1) paths.push(path.slice()); return; }
          next.forEach(function (n) {
            if (paths.length >= LIMIT) return;
            var inPath = path.some(function (p) { return p.id === n; });
            var node = { id: n, exists: !!byId[n], cycle: inPath };
            path.push(node);
            if (inPath || !byId[n]) { paths.push(path.slice()); } else { go(path); }
            path.pop();
          });
        })([{ id: startId, exists: !!byId[startId], cycle: false }]);
        return paths;
      }

      var fwd = walk(id, function (x) { return byId[x] ? byId[x].related_ids : []; });
      var bwd = walk(id, function (x) { return back[x]; }).map(function (p) { return p.slice().reverse(); });
      return { id: id, exists: !!byId[id], forward: fwd, backward: bwd, truncated: fwd.length >= LIMIT || bwd.length >= LIMIT };
    }

  }

  var api = {
    Engine: AnchorEngineV2,
    VERSION: VERSION,
    SCHEMA_VERSION: SCHEMA_VERSION,
    FORMAT: FORMAT,
    SCHEMA_KEY: SCHEMA_KEY,
    BACKUP_KEY: BACKUP_KEY,
    TYPES: TYPES,
    STATUSES: STATUSES,
    BASES: BASES,
    ANSWERS: ANSWERS,
    INDEPENDENCE: INDEPENDENCE,
    NOTE_KEY: NOTE_KEY,
    normalizeAnchor: normalizeAnchor,
    anchorToMarkdown: anchorToMarkdown,
    independenceLines: independenceLines,
    sha256Hex: sha256Hex,
    canonical: canonical
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.AnchorV2 = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
