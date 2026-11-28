/**
 * Anchor Engine v0.3 – felület.
 * A mag (anchor.js, Hídépítő), a v0.2 alosztály (anchor2.js) és a v0.3 alosztály (anchor3.js) kapja az adatokat;
 * ez a fájl az űrlapot, a listát, a szűrőket, a láncnézetet, a lánc-exportot, a státusz-naplót, a GitHub-hivatkozást,
 * a globális áttekintést, az exportot és az importot köti hozzá.
 * A horgonyok szövegét mindig textContent-tel jelenítjük meg, soha nem innerHTML-lel.
 */
(function () {
  'use strict';

  var V2 = window.AnchorV2;
  var V3 = window.AnchorV3;
  var TYPES = V2.TYPES, STATUSES = V2.STATUSES, ANSWERS = V2.ANSWERS, INDEP = V2.INDEPENDENCE;
  var MAX_IMPORT_BYTES = 2 * 1024 * 1024;
  var INTEG_LABEL = {
    ok: '✔ hash egyezik', mismatch: '✖ hash eltér', none: '– nincs hash', unavailable: '– nem ellenőrizhető', pending: '… ellenőrzés'
  };

  var $ = function (id) { return document.getElementById(id); };

  var corruptSaved = AnchorStorage.guardCorrupt();
  var engine = new V3.Engine(AnchorStorage.KEY);
  var integ = {};
  var chainId = null;
  var openLog = {}, openGh = {};
  var lastBy = '';
  var PREVIEW_MAX = 200000;

  function el(tag, props, children) {
    var n = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === 'class') n.className = props[k];
        else if (k === 'text') n.textContent = props[k];
        else n.setAttribute(k, props[k]);
      });
    }
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function text(s) { return document.createTextNode(s); }

  function setStatus(msg, kind) {
    var s = $('status');
    s.textContent = msg || '';
    s.className = kind || '';
  }

  // ---------- segédek ----------
  function splitList(str) {
    return String(str || '').split(/[,\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function splitTags(str) {
    var seen = {};
    return String(str || '').split(',').map(function (s) { return s.trim(); }).filter(function (s) {
      if (!s || seen[s.toLowerCase()]) return false;
      seen[s.toLowerCase()] = true;
      return true;
    });
  }
  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    try {
      return new Intl.DateTimeFormat('hu-HU', {
        timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      }).format(d) + ' (Europe/Amsterdam)';
    } catch (e) { return d.toISOString(); }
  }
  function todayStamp() {
    try { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function download(filename, mime, data) {
    var blob = new Blob([data], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function copyText(str) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(str).catch(function () { return legacyCopy(str); });
    }
    return legacyCopy(str);
  }
  function legacyCopy(str) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = str; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('A vágólapra másolás nem sikerült.'));
    });
  }

  function appendHighlighted(parent, str, q) {
    var lower = str.toLowerCase();
    if (!q || lower.length !== str.length) { parent.appendChild(text(str)); return; }
    var i = 0, idx;
    while ((idx = lower.indexOf(q, i)) !== -1) {
      if (idx > i) parent.appendChild(text(str.slice(i, idx)));
      parent.appendChild(el('mark', { text: str.slice(idx, idx + q.length) }));
      i = idx + q.length;
    }
    if (i < str.length) parent.appendChild(text(str.slice(i)));
  }

  // ---------- függetlenségi mezők az űrlapon ----------
  function buildIndependenceForm() {
    INDEP.forEach(function (f) {
      var sel = el('select', { id: 'f-indep-' + f.key });
      sel.appendChild(el('option', { value: '', text: '— nincs megadva —' }));
      Object.keys(ANSWERS).forEach(function (k) { sel.appendChild(el('option', { value: k, text: ANSWERS[k] })); });
      var kids = [el('span', { text: f.label }), sel];
      if (f.hint) kids.push(el('span', { class: 'indep-hint', text: f.hint }));
      $('indep-' + f.group).appendChild(el('label', { class: 'indep-field' }, kids));
    });
  }
  function readIndependence() {
    var meta = {};
    INDEP.forEach(function (f) {
      var v = $('f-indep-' + f.key).value;
      if (v) meta['independence_' + f.key] = v;
    });
    var note = $('f-indep-note').value.trim();
    if (note) meta[V2.NOTE_KEY] = note;
    return meta;
  }
  function resetIndependence() {
    INDEP.forEach(function (f) { $('f-indep-' + f.key).value = ''; });
    $('f-indep-note').value = '';
  }

  // ---------- szűrés ----------
  function currentFilter() {
    return {
      type: $('flt-type').value, status: $('flt-status').value, origin: $('flt-origin').value,
      integrity: $('flt-integrity').value, tag: $('flt-tag').value, text: $('flt-text').value.trim().toLowerCase()
    };
  }
  function matchesExtra(a, f) {
    if (f.origin && AnchorStorage.originOf(a.id) !== f.origin) return false;
    if (f.integrity) {
      var s = integ[a.id] || 'pending';
      if (s !== f.integrity) return false;
    }
    if (f.text) {
      var m = a.meta || {};
      var hay = [a.id, a.content, a.source.member, a.source.platform, a.source.thread, (a.tags || []).join(' '),
        m.falsification_criteria || '', m.verification_note || '', m[V2.NOTE_KEY] || '', a.hash || ''].join(' ').toLowerCase();
      if (hay.indexOf(f.text) === -1) return false;
    }
    return true;
  }
  function filteredRows() {
    var f = currentFilter();
    var rows = engine.getAnchors({ type: f.type, status: f.status, tag: f.tag }).filter(function (a) { return matchesExtra(a, f); });
    rows.sort(function (x, y) { return Date.parse(y.timestamp) - Date.parse(x.timestamp); });
    return rows;
  }
  function refreshTagOptions() {
    var sel = $('flt-tag'), keep = sel.value, tags = {};
    engine.anchors.forEach(function (a) { (a.tags || []).forEach(function (t) { tags[t] = true; }); });
    var names = Object.keys(tags).sort(function (x, y) { return x.localeCompare(y, 'hu'); });
    while (sel.options.length > 1) sel.remove(1);
    names.forEach(function (t) { sel.appendChild(el('option', { value: t, text: t })); });
    sel.value = tags[keep] ? keep : '';
  }
  function clearFilters() {
    ['flt-type', 'flt-status', 'flt-origin', 'flt-integrity', 'flt-tag', 'flt-text'].forEach(function (id) { $(id).value = ''; });
  }

  // ---------- kártyák ----------
  function chip(label, onClick, title) {
    var b = el('button', { type: 'button', class: 'chip-btn', text: label });
    if (title) b.title = title;
    b.addEventListener('click', onClick);
    return b;
  }

  function independenceBlock(a) {
    var m = a.meta || {}, rows = [], adverse = 0, answered = 0;
    INDEP.forEach(function (f) {
      var v = m['independence_' + f.key];
      if (!v) return;
      answered++;
      var weak = v === f.adverse;
      if (weak) adverse++;
      rows.push(el('li', { class: weak ? 'weak' : '' }, [
        el('span', { class: 'q', text: f.label + ' ' }),
        el('b', { text: ANSWERS[v] }),
        weak ? el('span', { class: 'weak-tag', text: ' · gyengítő válasz' }) : null
      ]));
    });
    if (!answered && !m[V2.NOTE_KEY]) return null;
    var sum = answered + ' / ' + INDEP.length + ' szempont megválaszolva' + (adverse ? ' · ' + adverse + ' gyengítő válasz' : '');
    var children = [el('summary', { text: 'Külső ellenőrzés függetlensége (' + sum + ')' })];
    if (rows.length) children.push(el('ul', { class: 'indep-list' }, rows));
    if (m[V2.NOTE_KEY]) children.push(el('p', { class: 'falsif' }, [el('strong', { text: 'Megjegyzés: ' }), text(String(m[V2.NOTE_KEY]))]));
    return el('details', { class: 'indep-view' }, children);
  }


  // ---------- státusz-napló és GitHub-hivatkozás a kártyán ----------
  function logEntryText(e) {
    return fmtTime(e.at) + ' · ' + e.by + ': ' + (e.from ? STATUSES[e.from] + ' → ' : 'rögzítéskor: ') + STATUSES[e.to] + (e.reason ? ' — ' + e.reason : '');
  }

  function statusLogBlock(a) {
    var log = a.status_log || [];
    var kids = [el('summary', { text: 'Státusz-napló (' + log.length + ')' })];
    if (log.length) {
      kids.push(el('ol', { class: 'log-list' }, log.map(function (e) { return el('li', { text: logEntryText(e) }); })));
    } else {
      kids.push(el('p', { class: 'help', text: 'Még nincs bejegyzés. A v0.3 előtt rögzített horgonyoknál a korábbi státuszváltások nem naplózottak; ezt utólag nem találjuk ki.' }));
    }
    var sel = el('select', { class: 'sl-to', 'aria-label': 'Új státusz' });
    Object.keys(STATUSES).forEach(function (k) {
      if (k === a.status) return;
      sel.appendChild(el('option', { value: k, text: STATUSES[k] }));
    });
    var by = el('input', { type: 'text', class: 'sl-by', maxlength: '120', placeholder: 'Ki módosítja?', 'aria-label': 'Ki módosítja' });
    by.value = lastBy || (AnchorStorage.getPrefs().member || '');
    kids.push(el('div', { class: 'log-form' }, [
      el('span', { class: 'source', text: 'Mostani státusz: ' + (STATUSES[a.status] || a.status) + ' → ' }),
      sel, by,
      el('input', { type: 'text', class: 'sl-why', maxlength: '1000', placeholder: 'Miért? (ajánlott)', 'aria-label': 'Indok' }),
      el('button', { type: 'button', class: 'ghost', 'data-act': 'status-apply', 'data-id': a.id, text: 'Státusz rögzítése' })
    ]));
    var d = el('details', { class: 'log-view', 'data-kind': 'log', 'data-id': a.id }, kids);
    if (openLog[a.id]) d.open = true;
    return d;
  }

  function ghStateText(entry, a) {
    if (!entry) return { text: 'Még nincs ellenőrizve. Az „Ellenőrzés most” gomb a nyilvános api.github.com-ot kérdezi meg.', cls: '' };
    var s = entry.state;
    if (s === 'ok') {
      var i = entry.info || {};
      var t = 'Megtalálva az api.github.com-on. Commit-dátum: ' + fmtTime(i.committed_at) + '. Ellenőrizve: ' + fmtTime(entry.checked_at) + '. ';
      t += i.mentions_hash ? 'A commit üzenete tartalmazza a horgony hash-ének elejét. ' : 'A commit üzenete nem említi a horgony hash-ét, ezért a commit nem bizonyítja, hogy éppen ez a szöveg szerepelt benne. ';
      if (i.before_anchor) t += 'Figyelem: a commit korábbi, mint a horgony időbélyege, ezért a horgony létezését nem igazolja. ';
      if (entry.recheck_failed) t += 'A legutóbbi újraellenőrzés nem sikerült (' + entry.recheck_failed + '), a korábbi eredményt mutatom.';
      return { text: t.trim(), cls: i.before_anchor ? 'warn' : 'ok' };
    }
    var d = entry.detail ? ' (' + entry.detail + ')' : '';
    if (s === 'notfound') return { text: 'Ezen a hivatkozáson nem található nyilvános commit (elírás, privát tár vagy törölt commit lehet). A hivatkozás megmarad.', cls: 'warn' };
    if (s === 'ratelimit') return { text: 'A GitHub most nem válaszolt' + d + ': kérésszám-korlát vagy tiltás lehet. A hivatkozás megmarad, próbáld újra később.', cls: 'warn' };
    if (s === 'network') return { text: 'Az api.github.com nem érhető el' + d + '. A hivatkozás megmarad, a horgony ettől még teljes értékű; próbáld újra később.', cls: 'warn' };
    if (s === 'incomplete') return { text: 'A hivatkozásból hiányzik a tárhely (tulajdonos/tár), ezért nem ellenőrizhető.', cls: 'warn' };
    if (s === 'invalid') return { text: 'A hivatkozás nem értelmezhető, ezért nem ellenőrizhető.', cls: 'warn' };
    return { text: 'Az ellenőrzés most nem sikerült' + d + '. A hivatkozás megmarad, próbáld újra később.', cls: 'warn' };
  }

  function githubBadge(a) {
    var m = a.meta || {};
    if (!m[V3.GH_KEY]) return null;
    var e = engine.githubEntry(a.id);
    if (e && e.state === 'ok') {
      var i = e.info || {};
      return el('span', { class: 'badge ext-ts', title: 'Az api.github.com szerint a commit létezik; commit-dátum: ' + (i.committed_at || '') + '. A dátumot a commit készítője adja, ez nem szigorú időbélyeg-hitelesítés.', text: 'külső időbélyeg' });
    }
    return el('span', { class: 'badge gh-pending', title: 'GitHub-commit hivatkozás van megadva, de a feloldása nem sikerült vagy még nem történt meg.', text: 'GitHub-hivatkozás' });
  }

  function githubBlock(a) {
    var m = a.meta || {};
    var ref = m[V3.GH_KEY] || '';
    var entry = ref ? engine.githubEntry(a.id) : null;
    var parsed = ref ? V3.parseGithubRef(ref) : null;
    var kids = [el('summary', { text: 'GitHub-commit / külső időbélyeg' + (ref ? (entry && entry.state === 'ok' ? ' (megtalálva)' : ' (megadva)') : ' (nincs megadva)') })];
    if (ref) {
      var line = el('p', { class: 'source' }, [text('Hivatkozás: ')]);
      if (parsed && parsed.url) line.appendChild(el('a', { href: parsed.url, rel: 'noopener noreferrer', target: '_blank', text: parsed.owner + '/' + parsed.repo + '@' + parsed.sha.slice(0, 12) }));
      else line.appendChild(el('code', { text: ref }));
      kids.push(line);
      var st = !parsed ? ghStateText({ state: 'invalid' }, a) : parsed.incomplete ? ghStateText({ state: 'incomplete' }, a) : ghStateText(entry, a);
      kids.push(el('p', { class: 'gh-result ' + st.cls, text: st.text }));
    } else {
      kids.push(el('p', { class: 'help', text: 'Opcionális. Ha egy GitHub-commit a horgony hash-ét vagy szövegét tartalmazza, itt hivatkozhatsz rá.' }));
    }
    var inp = el('input', { type: 'text', class: 'gh-input', maxlength: '300', placeholder: 'https://github.com/tulajdonos/tár/commit/hash vagy tulajdonos/tár@hash', 'aria-label': 'GitHub-commit hivatkozás' });
    inp.value = ref;
    var chk = el('button', { type: 'button', class: 'ghost', 'data-act': 'gh-check', 'data-id': a.id, text: 'Ellenőrzés most' });
    if (!ref || !parsed || parsed.incomplete) chk.disabled = true;
    kids.push(el('div', { class: 'log-form' }, [inp,
      el('button', { type: 'button', class: 'ghost', 'data-act': 'gh-save', 'data-id': a.id, text: 'Hivatkozás mentése' }), chk]));
    kids.push(el('p', { class: 'help', text: 'A „külső időbélyeg” azt jelenti, hogy a commit a nyilvános GitHubon létezik. A commit dátumát a commit készítője adja, ezért ez nem szigorú időbélyeg-hitelesítés; ott erősebb, ahol a commit üzenete a horgony hash-ét tartalmazza.' }));
    var d = el('details', { class: 'gh-view', 'data-kind': 'gh', 'data-id': a.id }, kids);
    if (openGh[a.id]) d.open = true;
    return d;
  }

  function renderCard(a, q) {
    var origin = AnchorStorage.originOf(a.id);
    var known = {};
    engine.anchors.forEach(function (x) { known[x.id] = true; });
    var st = integ[a.id] || 'pending';

    var head = el('div', { class: 'a-head' }, [
      el('span', { class: 'badge type-' + a.type, text: TYPES[a.type] || a.type }),
      el('span', { class: 'badge ' + (origin === 'imported' ? 'origin-imported' : 'origin-new'), text: origin === 'imported' ? 'Importált / archivált' : 'Új' }),
      el('span', { class: 'badge integ integ-' + st, text: INTEG_LABEL[st] || st }),
      githubBadge(a),
      el('span', { class: 'a-id mono', text: a.id })
    ]);

    var body = el('p', { class: 'a-content' });
    appendHighlighted(body, a.content, q);

    var src = a.source || {};
    var parts = [head, body,
      el('p', { class: 'source', text: 'Forrás: ' + (src.member || 'ismeretlen') + ' · ' + (src.platform || 'ismeretlen') + (src.thread ? ' · szál: ' + src.thread : '') }),
      el('p', { class: 'source', title: a.timestamp, text: 'Rögzítve: ' + fmtTime(a.timestamp) })];

    var m = a.meta || {};
    if (m.falsification_criteria) parts.push(el('p', { class: 'falsif' }, [el('strong', { text: 'Cáfolati feltétel: ' }), text(String(m.falsification_criteria))]));
    if (m.verification_note) parts.push(el('p', { class: 'falsif' }, [el('strong', { text: 'Ellenőrzési megjegyzés: ' }), text(String(m.verification_note))]));
    var ib = independenceBlock(a);
    if (ib) parts.push(ib);

    if ((a.tags || []).length) {
      var tagBox = el('p', { class: 'chips' });
      a.tags.forEach(function (t) { tagBox.appendChild(chip('#' + t, function () { $('flt-tag').value = t; renderList(); }, 'Szűrés erre a címkére')); });
      parts.push(tagBox);
    }
    if ((a.related_ids || []).length) {
      var relBox = el('p', { class: 'chips' }, [el('span', { class: 'source', text: 'Kapcsolódó: ' })]);
      a.related_ids.forEach(function (rid) {
        relBox.appendChild(chip(known[rid] ? rid : rid + ' (nincs ebben a böngészőben)', function () { showChain(rid); }, 'Láncnézet erre a horgonyra'));
      });
      parts.push(relBox);
    }

    if (a.hash) {
      parts.push(el('p', { class: 'hashline', title: 'SHA-256: ' + a.hash + '\n' + (V2.BASES[a.hash_basis] || '') }, [
        el('span', { class: 'source', text: 'SHA-256: ' }),
        el('code', { text: a.hash.slice(0, 16) + '…' }),
        el('span', { class: 'source', text: ' · ' + (a.hash_basis || '') })
      ]));
    }

    parts.push(statusLogBlock(a));
    parts.push(githubBlock(a));
    parts.push(el('div', { class: 'a-actions' }, [
      el('span', { class: 'badge status-' + a.status, text: 'Státusz: ' + (STATUSES[a.status] || a.status) }),
      el('span', { class: 'grow' }),
      el('button', { type: 'button', class: 'ghost', 'data-act': 'chain', 'data-id': a.id, text: 'Lánc' }),
      el('button', { type: 'button', class: 'ghost', 'data-act': 'copy', 'data-id': a.id, text: 'Másolás MD' }),
      el('button', { type: 'button', class: 'danger', 'data-act': 'delete', 'data-id': a.id, text: 'Törlés' })
    ]));

    return el('article', { class: 'card anchor ' + (origin === 'imported' ? 'is-imported' : 'is-new') + (st === 'mismatch' ? ' is-mismatch' : ''), 'data-id': a.id }, parts);
  }

  function renderList() {
    refreshTagOptions();
    var f = currentFilter();
    var rows = filteredRows();
    var list = $('list');
    while (list.firstChild) list.removeChild(list.firstChild);
    rows.forEach(function (a) { list.appendChild(renderCard(a, f.text)); });
    $('empty').hidden = rows.length > 0;
    $('count').textContent = '(' + rows.length + ' / ' + engine.anchors.length + ')';
    renderOverview();
    if (chainId) renderChain();
  }

  function renderIntegritySummary(counts) {
    var s = $('integrity-summary');
    if (!engine.hasCrypto()) { s.textContent = ''; return; }
    if (!counts) { s.textContent = ''; return; }
    var bits = [counts.ok + ' egyezik'];
    if (counts.mismatch) bits.push(counts.mismatch + ' eltér');
    if (counts.none) bits.push(counts.none + ' hash nélkül');
    s.textContent = 'Integritás-ellenőrzés (SHA-256): ' + bits.join(' · ') + '.';
    s.className = 'integrity-summary' + (counts.mismatch ? ' bad' : '');
  }

  function verifyAndRender() {
    return engine.verifyAll().then(function (r) {
      integ = r.results;
      renderIntegritySummary(r.counts);
      renderList();
      return r.counts;
    });
  }


  // ---------- globális áttekintés ----------
  function excerpt(a, n) {
    var s = String(a.content || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function overviewList(items, byId, note) {
    var LIM = 10;
    function li(it) {
      var a = byId[it.id];
      return el('li', { class: 'ov-item' }, [
        chip(it.id, function () { showChain(it.id); $('chain-panel').scrollIntoView && $('chain-panel').scrollIntoView(); }, 'Láncnézet erre a horgonyra'),
        el('span', { class: 'source', text: ' ' + note(it) }),
        el('span', { class: 'ov-ex', text: a ? ' · ' + excerpt(a, 70) : '' })
      ]);
    }
    var box = el('div', { class: 'ov-list-wrap' });
    box.appendChild(el('ul', { class: 'ov-list' }, items.slice(0, LIM).map(li)));
    if (items.length > LIM) {
      box.appendChild(el('details', { class: 'ov-more' }, [
        el('summary', { text: 'További ' + (items.length - LIM) + ' horgony' }),
        el('ul', { class: 'ov-list' }, items.slice(LIM).map(li))
      ]));
    }
    return box;
  }
  function renderOverview() {
    var body = $('overview-body');
    while (body.firstChild) body.removeChild(body.firstChild);
    var ov = engine.overview();
    $('overview-count').textContent = '(' + ov.total + ' horgony)';
    if (!ov.total) { body.appendChild(el('p', { class: 'help', text: 'Még nincs horgony, így nincs mit áttekinteni.' })); return; }
    var byId = {};
    engine.anchors.forEach(function (a) { byId[a.id] = a; });
    body.appendChild(el('p', { class: 'ov-sum', text: ov.total + ' horgony · ' + ov.roots.length + ' gyökér · ' + ov.leaves.length + ' levél (ebből ' + ov.isolated + ' különálló) · ' + ov.missing.length + ' hiányzó azonosító' }));
    var cols = el('div', { class: 'ov-cols' });
    var c1 = el('div', { class: 'ov-col' }, [el('h3', { text: 'Gyökér-horgonyok' }),
      el('p', { class: 'help', text: 'Akikre más horgonyok hivatkoznak; a legtöbbet hivatkozott elöl.' })]);
    if (ov.roots.length) c1.appendChild(overviewList(ov.roots, byId, function (it) { return '← ' + it.in + ' hivatkozás'; }));
    else c1.appendChild(el('p', { class: 'help', text: 'Még egyik horgonyra sem hivatkozik másik.' }));
    var c2 = el('div', { class: 'ov-col' }, [el('h3', { text: 'Levél-horgonyok' }),
      el('p', { class: 'help', text: 'Akikre senki sem hivatkozik; a legújabb elöl.' })]);
    if (ov.leaves.length) c2.appendChild(overviewList(ov.leaves, byId, function (it) { return it.out ? '→ ' + it.out + ' horgonyra hivatkozik' : '(különálló)'; }));
    else c2.appendChild(el('p', { class: 'help', text: 'Minden horgonyra hivatkozik valaki.' }));
    cols.appendChild(c1); cols.appendChild(c2);
    body.appendChild(cols);
    if (ov.missing.length) {
      var miss = el('div', { class: 'ov-miss' }, [el('h3', { text: 'Hiányzó azonosítók' }),
        el('p', { class: 'help', text: 'Hivatkoznak rájuk, de nincsenek ebben a böngészőben. Importáld azt az exportot, amelyben szerepelnek.' })]);
      miss.appendChild(el('ul', { class: 'ov-list' }, ov.missing.slice(0, 20).map(function (m) {
        return el('li', { class: 'ov-item' }, [el('span', { class: 'chain-dead', text: m.id }), el('span', { class: 'source', text: ' ← ' + m.from.join(', ') })]);
      })));
      body.appendChild(miss);
    }
  }

  // ---------- láncnézet ----------
  function chainRow(path, rootId, forward) {
    var row = el('li', { class: 'chain-row' });
    path.forEach(function (n, i) {
      if (i) row.appendChild(el('span', { class: 'arrow', 'aria-hidden': 'true', text: ' → ' }));
      var label = n.id + (n.cycle ? ' (kör)' : '') + (!n.exists ? ' (nincs ebben a böngészőben)' : '');
      if (n.id === rootId && !n.cycle && ((forward && i === 0) || (!forward && i === path.length - 1))) {
        row.appendChild(el('span', { class: 'chain-root', text: n.id }));
      } else if (!n.exists || n.cycle) {
        row.appendChild(el('span', { class: 'chain-dead', text: label }));
      } else {
        row.appendChild(chip(label, function () { showChain(n.id); }, 'Ugrás erre a horgonyra a láncban'));
      }
    });
    return row;
  }

  function renderChain() {
    var body = $('chain-body');
    while (body.firstChild) body.removeChild(body.firstChild);
    var c = engine.buildChain(chainId);
    $('chain-panel').hidden = false;
    if (!c.exists) body.appendChild(el('p', { class: 'help', text: 'Ez az azonosító nincs ebben a böngészőben: ' + chainId + '. Importáld azt az exportot, amelyben szerepel.' }));
    body.appendChild(el('p', { class: 'chain-title' }, [el('strong', { text: 'Kiválasztott: ' }), el('span', { class: 'mono', text: chainId })]));
    body.appendChild(el('p', { class: 'chain-sub', text: 'Visszafelé: akik erre hivatkoznak' }));
    if (c.backward.length) body.appendChild(el('ul', { class: 'chain-list' }, c.backward.map(function (p) { return chainRow(p, chainId, false); })));
    else body.appendChild(el('p', { class: 'help', text: 'Nincs horgony, amely erre hivatkozna.' }));
    body.appendChild(el('p', { class: 'chain-sub', text: 'Előre: amire ez hivatkozik' }));
    if (c.forward.length) body.appendChild(el('ul', { class: 'chain-list' }, c.forward.map(function (p) { return chainRow(p, chainId, true); })));
    else body.appendChild(el('p', { class: 'help', text: 'Ez a horgony nem hivatkozik másra.' }));
    if (c.truncated) body.appendChild(el('p', { class: 'help', text: 'A lánc hosszú, csak az első 60 ág látszik.' }));
    var mdText = engine.exportChainMarkdown(chainId);
    $('chain-md').value = mdText.length > PREVIEW_MAX ? mdText.slice(0, PREVIEW_MAX) + '\n\n… (az előnézet itt megáll; a másolás és a letöltés a teljes szöveget adja)\n' : mdText;
    body.appendChild(el('p', { class: 'row actions' }, [
      chip('Mutasd a listában', function () { clearFilters(); $('flt-text').value = chainId; renderList(); $('panel-lista').scrollIntoView && $('panel-lista').scrollIntoView(); }, 'A lista szűrése erre az azonosítóra')
    ]));
  }

  function showChain(id) { chainId = id; renderChain(); }

  // ---------- események ----------
  function showFormError(msg) {
    var e = $('form-error');
    e.textContent = msg || '';
    e.hidden = !msg;
  }

  function onSubmit(ev) {
    ev.preventDefault();
    showFormError('');
    var content = $('f-content').value.trim();
    if (!content) { showFormError('A tartalom kötelező.'); $('f-content').focus(); return Promise.resolve(); }
    var member = $('f-member').value.trim(), platform = $('f-platform').value.trim(), thread = $('f-thread').value.trim();
    var falsif = $('f-falsif').value.trim();
    var related = splitList($('f-related').value);
    var meta = readIndependence();
    if (falsif) meta.falsification_criteria = falsif;
    var gh = $('f-github').value.trim();
    if (gh) {
      var pr = V3.parseGithubRef(gh);
      if (!pr || pr.incomplete) { showFormError('A GitHub-commit hivatkozás nem értelmezhető. Használd az URL-t (https://github.com/tulajdonos/tár/commit/hash) vagy a tulajdonos/tár@hash alakot, vagy hagyd üresen.'); $('f-github').focus(); return Promise.resolve(); }
      meta[V3.GH_KEY] = gh;
    }

    $('btn-submit').disabled = true;
    return engine.addAnchorSealed({
      type: $('f-type').value, content: content,
      source: { member: member || 'ismeretlen', platform: platform || 'ismeretlen', thread: thread },
      status: $('f-status').value, tags: splitTags($('f-tags').value), related_ids: related, meta: meta
    }).then(function (anchor) {
      AnchorStorage.forget(anchor.id);
      AnchorStorage.setPrefs({ member: member, platform: platform, thread: thread });
      ['f-content', 'f-falsif', 'f-tags', 'f-related', 'f-github'].forEach(function (id) { $(id).value = ''; });
      resetIndependence();
      var unknown = related.filter(function (rid) { return !engine.anchors.some(function (a) { return a.id === rid; }); });
      setStatus('Rögzítve: ' + anchor.id + (anchor.hash ? ' · SHA-256: ' + anchor.hash.slice(0, 12) + '…' : ' · hash nélkül (a böngésző nem ad Web Crypto-t)') +
        (unknown.length ? ' · figyelem: ezek a kapcsolódó azonosítók nincsenek ebben a böngészőben: ' + unknown.join(', ') : ''), unknown.length ? 'warn' : 'ok');
      if (anchor.meta && anchor.meta[V3.GH_KEY]) checkGithubAndRender(anchor.id);
      return verifyAndRender();
    }).then(function () { $('btn-submit').disabled = false; }, function (e) { $('btn-submit').disabled = false; setStatus(e.message, 'err'); });
  }

  function anchorById(id) { return engine.anchors.filter(function (a) { return a.id === id; })[0]; }

  function checkGithubAndRender(id) {
    openGh[id] = true;
    setStatus('GitHub-commit ellenőrzése az api.github.com-on…', '');
    return engine.checkGithub(id).then(function (e) {
      var ok = e.state === 'ok';
      setStatus(ok ? 'A commit megtalálva, a horgony „külső időbélyeg” jelzést kapott: ' + id + '.' : 'A commit most nem oldható fel (' + e.state + '), a hivatkozás megmarad: ' + id + '.', ok ? 'ok' : 'warn');
      renderList();
      return e;
    });
  }

  function onListToggle(ev) {
    var d = ev.target;
    if (!d || !d.getAttribute) return;
    var kind = d.getAttribute('data-kind'), id = d.getAttribute('data-id');
    if (kind === 'log') openLog[id] = d.open;
    else if (kind === 'gh') openGh[id] = d.open;
  }

  function onListClick(ev) {
    var t = ev.target;
    var act = t && t.getAttribute && t.getAttribute('data-act');
    if (!act) return;
    var id = t.getAttribute('data-id');
    if (act === 'delete') {
      if (!window.confirm('Biztosan törlöd ezt a horgonyt?\n\n' + id + '\n\nA törlés nem vonható vissza. Ha kell, előbb exportálj.')) return;
      try {
        engine.deleteAnchor(id); AnchorStorage.forget(id); delete integ[id];
        if (chainId === id) chainId = null;
        setStatus('Törölve: ' + id, 'ok');
      } catch (e) { setStatus(e.message, 'err'); }
      verifyAndRender();
    } else if (act === 'chain') {
      showChain(id);
      $('chain-panel').scrollIntoView && $('chain-panel').scrollIntoView();
    } else if (act === 'status-apply') {
      var card = t.closest('article');
      var to = card.querySelector('.sl-to').value, by = card.querySelector('.sl-by').value, why = card.querySelector('.sl-why').value;
      try {
        engine.changeStatus(id, to, by, why);
        lastBy = by.trim();
        openLog[id] = true;
        setStatus('Státusz módosítva és naplózva: ' + id + ' → ' + STATUSES[to] + (why.trim() ? ' (indok rögzítve)' : ' (indok nélkül)'), 'ok');
      } catch (e) { setStatus(e.message, 'err'); }
      renderList();
    } else if (act === 'gh-save') {
      var card2 = t.closest('article');
      var val = card2.querySelector('.gh-input').value;
      try {
        engine.setGithubRef(id, val);
        openGh[id] = true;
        if (val.trim()) { renderList(); checkGithubAndRender(id); }
        else { setStatus('GitHub-hivatkozás törölve: ' + id, 'ok'); renderList(); }
      } catch (e) { setStatus(e.message, 'err'); }
    } else if (act === 'gh-check') {
      checkGithubAndRender(id);
    } else if (act === 'copy') {
      var a = anchorById(id);
      if (!a) return;
      copyText(V2.anchorToMarkdown(a)).then(function () { setStatus('Vágólapra másolva (Markdown): ' + id, 'ok'); },
        function (e) { setStatus(e.message, 'err'); });
    }
  }

  function exportMD() {
    if (!engine.anchors.length) { setStatus('Még nincs mit exportálni.', 'warn'); return; }
    download('anchors_v0.3_' + todayStamp() + '.md', 'text/markdown', engine.exportToMarkdown());
    setStatus('Markdown export letöltve (' + engine.anchors.length + ' horgony).', 'ok');
  }
  function exportJSON() {
    if (!engine.anchors.length) { setStatus('Még nincs mit exportálni.', 'warn'); return; }
    download('anchors_v0.3_' + todayStamp() + '.json', 'application/json', engine.exportToJSON());
    setStatus('JSON export letöltve (v0.3, séma 3, ' + engine.anchors.length + ' horgony).', 'ok');
  }
  function safeName(id) { return String(id).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'horgony'; }
  function copyChain() {
    if (!chainId) return;
    copyText(engine.exportChainMarkdown(chainId)).then(function () { setStatus('A lánc vágólapra másolva (Markdown): ' + chainId, 'ok'); },
      function (e) { setStatus(e.message, 'err'); });
  }
  function downloadChain() {
    if (!chainId) return;
    download('anchor_lanc_' + safeName(chainId) + '_' + todayStamp() + '.md', 'text/markdown', engine.exportChainMarkdown(chainId));
    setStatus('A lánc Markdown-fájlja letöltve: ' + chainId, 'ok');
  }
  function copyList() {
    var rows = filteredRows();
    if (!rows.length) { setStatus('A szűrt lista üres, nincs mit másolni.', 'warn'); return; }
    copyText(engine.exportToMarkdown(rows)).then(function () { setStatus('Vágólapra másolva (Markdown): ' + rows.length + ' horgony.', 'ok'); },
      function (e) { setStatus(e.message, 'err'); });
  }

  function onImportFile(ev) {
    var input = ev.target;
    var file = input.files && input.files[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) { setStatus('A fájl túl nagy (legfeljebb 2 MB).', 'err'); input.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function () {
      engine.importAny(String(reader.result)).then(function (r) {
        if (r.newIds.length) AnchorStorage.markImported(r.newIds);
        var msg = 'Import kész (' + r.info.kind + (r.info.version ? ', ' + r.info.version : '') + '): ' + r.added + ' új importált horgony, ' + r.skipped + ' kihagyva (már létező azonosító)' +
          (r.invalid ? ', ' + r.invalid + ' használhatatlan elem' : '') + (r.sealedNow ? ', ' + r.sealedNow + ' importkori hash-t kapott' : '') + '.';
        if (r.mismatched.length) msg += ' Figyelem: ' + r.mismatched.length + ' horgony hash-e nem egyezik a tartalmával (befogadtam, megjelöltem).';
        if (r.warnings.length) msg += ' ' + r.warnings.join(' ');
        if (r.hashUnavailable) msg += ' A hash-ellenőrzés ebben a böngészőben nem elérhető.';
        setStatus(msg, r.mismatched.length || r.warnings.length ? 'warn' : (r.added ? 'ok' : 'warn'));
        return verifyAndRender();
      }).catch(function (e) { setStatus('Az import nem sikerült: ' + e.message, 'err'); }).then(function () { input.value = ''; });
    };
    reader.onerror = function () { setStatus('A fájl nem olvasható.', 'err'); input.value = ''; };
    reader.readAsText(file, 'utf-8');
  }

  // ---------- indulás ----------
  var ready;
  function init() {
    buildIndependenceForm();
    if (!AnchorStorage.isPersistent()) {
      var n = $('notice-storage');
      n.textContent = 'A böngésző tárolója nem érhető el, ezért a horgonyok csak ennek az oldalnak a megnyitásáig maradnak meg. Exportálj, mielőtt bezárod.';
      n.hidden = false;
    }
    if (!engine.hasCrypto()) {
      var c = $('notice-crypto');
      c.textContent = 'A SHA-256 (Web Crypto) ebben a környezetben nem érhető el, ezért az új horgonyok hash nélkül rögzülnek. Az oldal https-en vagy localhoston működik teljesen.';
      c.hidden = false;
    }
    if (corruptSaved) setStatus('A korábban tárolt horgony-adat nem volt olvasható, ezért átmásoltam a nexis_flare_anchors_corrupt_backup kulcsra, és üres listával indulok.', 'warn');
    var prefs = AnchorStorage.getPrefs();
    if (prefs.member) $('f-member').value = prefs.member;
    if (prefs.platform) $('f-platform').value = prefs.platform;
    if (prefs.thread) $('f-thread').value = prefs.thread;

    $('anchor-form').addEventListener('submit', onSubmit);
    $('anchor-form').addEventListener('reset', function () { showFormError(''); setTimeout(resetIndependence, 0); });
    $('list').addEventListener('toggle', onListToggle, true);
    $('list').addEventListener('click', onListClick);
    $('btn-export-md').addEventListener('click', exportMD);
    $('btn-export-json').addEventListener('click', exportJSON);
    $('btn-copy-list').addEventListener('click', copyList);
    $('btn-verify').addEventListener('click', function () {
      setStatus('Integritás újraellenőrzése…', '');
      verifyAndRender().then(function (c) { setStatus('Újraellenőrzés kész: ' + c.ok + ' egyezik, ' + c.mismatch + ' eltér, ' + c.none + ' hash nélkül.', c.mismatch ? 'warn' : 'ok'); });
    });
    $('btn-chain-copy').addEventListener('click', copyChain);
    $('btn-chain-md').addEventListener('click', downloadChain);
    $('btn-chain-close').addEventListener('click', function () { chainId = null; $('chain-panel').hidden = true; });
    $('import-file').addEventListener('change', onImportFile);
    ['flt-type', 'flt-status', 'flt-origin', 'flt-integrity', 'flt-tag'].forEach(function (id) { $(id).addEventListener('change', renderList); });
    $('flt-text').addEventListener('input', renderList);
    $('btn-clear-filters').addEventListener('click', function () { clearFilters(); renderList(); });

    renderList();
    ready = engine.migrate().then(function (rep) {
      if (rep.unavailable) {
        setStatus('A migráció hash nélkül maradt (nincs Web Crypto); az adatok sértetlenek.', 'warn');
      } else if (rep.fromSchema < V3.SCHEMA_VERSION && engine.anchors.length) {
        setStatus('Migráció séma ' + rep.fromSchema + ' → ' + V3.SCHEMA_VERSION + ' (v0.' + (rep.fromSchema >= 2 ? '2' : '1') + ' → v0.3): ' + rep.logsAdded + ' horgony kapott üres státusz-naplót' +
          (rep.sealed ? ', ' + rep.sealed + ' SHA-256 hash-t (basis: migrated)' : '') +
          (rep.backedUp ? '. A régi nyers adat megvan a ' + rep.backupKey + ' kulcson.' : '.'), 'ok');
      }
      return verifyAndRender();
    }).catch(function (e) { setStatus('Indítási hiba: ' + e.message, 'err'); });
    return ready;
  }

  window.AnchorUI = {
    engine: engine,
    get ready() { return ready; },
    showChain: showChain,
    renderOverview: renderOverview,
    renderList: renderList
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
