/**
 * Anchor Engine v0.2 – felület.
 * A mag (anchor.js, Hídépítő) és a v0.2 alosztály (anchor2.js) kapja az adatokat; ez a fájl az
 * űrlapot, a listát, a szűrőket, a láncnézetet, az exportot és az importot köti hozzá.
 * A horgonyok szövegét mindig textContent-tel jelenítjük meg, soha nem innerHTML-lel.
 */
(function () {
  'use strict';

  var V2 = window.AnchorV2;
  var TYPES = V2.TYPES, STATUSES = V2.STATUSES, ANSWERS = V2.ANSWERS, INDEP = V2.INDEPENDENCE;
  var MAX_IMPORT_BYTES = 2 * 1024 * 1024;
  var INTEG_LABEL = {
    ok: '✔ hash egyezik', mismatch: '✖ hash eltér', none: '– nincs hash', unavailable: '– nem ellenőrizhető', pending: '… ellenőrzés'
  };

  var $ = function (id) { return document.getElementById(id); };

  var corruptSaved = AnchorStorage.guardCorrupt();
  var engine = new V2.Engine(AnchorStorage.KEY);
  var integ = {};
  var chainId = null;

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

  function renderCard(a, q) {
    var origin = AnchorStorage.originOf(a.id);
    var known = {};
    engine.anchors.forEach(function (x) { known[x.id] = true; });
    var st = integ[a.id] || 'pending';

    var head = el('div', { class: 'a-head' }, [
      el('span', { class: 'badge type-' + a.type, text: TYPES[a.type] || a.type }),
      el('span', { class: 'badge ' + (origin === 'imported' ? 'origin-imported' : 'origin-new'), text: origin === 'imported' ? 'Importált / archivált' : 'Új' }),
      el('span', { class: 'badge integ integ-' + st, text: INTEG_LABEL[st] || st }),
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

    var statusSel = el('select', { 'data-act': 'status', 'data-id': a.id, 'aria-label': 'Státusz módosítása' });
    Object.keys(STATUSES).forEach(function (k) {
      var o = el('option', { value: k, text: STATUSES[k] });
      if (a.status === k) o.selected = true;
      statusSel.appendChild(o);
    });
    parts.push(el('div', { class: 'a-actions' }, [
      el('label', { class: 'inline' }, [el('span', { text: 'Státusz' }), statusSel]),
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

    $('btn-submit').disabled = true;
    return engine.addAnchorSealed({
      type: $('f-type').value, content: content,
      source: { member: member || 'ismeretlen', platform: platform || 'ismeretlen', thread: thread },
      status: $('f-status').value, tags: splitTags($('f-tags').value), related_ids: related, meta: meta
    }).then(function (anchor) {
      AnchorStorage.forget(anchor.id);
      AnchorStorage.setPrefs({ member: member, platform: platform, thread: thread });
      ['f-content', 'f-falsif', 'f-tags', 'f-related'].forEach(function (id) { $(id).value = ''; });
      resetIndependence();
      var unknown = related.filter(function (rid) { return !engine.anchors.some(function (a) { return a.id === rid; }); });
      setStatus('Rögzítve: ' + anchor.id + (anchor.hash ? ' · SHA-256: ' + anchor.hash.slice(0, 12) + '…' : ' · hash nélkül (a böngésző nem ad Web Crypto-t)') +
        (unknown.length ? ' · figyelem: ezek a kapcsolódó azonosítók nincsenek ebben a böngészőben: ' + unknown.join(', ') : ''), unknown.length ? 'warn' : 'ok');
      return verifyAndRender();
    }).then(function () { $('btn-submit').disabled = false; }, function (e) { $('btn-submit').disabled = false; setStatus(e.message, 'err'); });
  }

  function anchorById(id) { return engine.anchors.filter(function (a) { return a.id === id; })[0]; }

  function onListChange(ev) {
    var t = ev.target;
    if (t && t.getAttribute && t.getAttribute('data-act') === 'status') {
      try {
        engine.updateAnchorStatus(t.getAttribute('data-id'), t.value);
        setStatus('Státusz módosítva: ' + t.getAttribute('data-id') + ' → ' + STATUSES[t.value], 'ok');
      } catch (e) { setStatus(e.message, 'err'); }
      renderList();
    }
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
    } else if (act === 'copy') {
      var a = anchorById(id);
      if (!a) return;
      copyText(V2.anchorToMarkdown(a)).then(function () { setStatus('Vágólapra másolva (Markdown): ' + id, 'ok'); },
        function (e) { setStatus(e.message, 'err'); });
    }
  }

  function exportMD() {
    if (!engine.anchors.length) { setStatus('Még nincs mit exportálni.', 'warn'); return; }
    download('anchors_v0.2_' + todayStamp() + '.md', 'text/markdown', engine.exportToMarkdown());
    setStatus('Markdown export letöltve (' + engine.anchors.length + ' horgony).', 'ok');
  }
  function exportJSON() {
    if (!engine.anchors.length) { setStatus('Még nincs mit exportálni.', 'warn'); return; }
    download('anchors_v0.2_' + todayStamp() + '.json', 'application/json', engine.exportToJSON());
    setStatus('JSON export letöltve (v0.2, séma 2, ' + engine.anchors.length + ' horgony).', 'ok');
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
    $('list').addEventListener('change', onListChange);
    $('list').addEventListener('click', onListClick);
    $('btn-export-md').addEventListener('click', exportMD);
    $('btn-export-json').addEventListener('click', exportJSON);
    $('btn-copy-list').addEventListener('click', copyList);
    $('btn-verify').addEventListener('click', function () {
      setStatus('Integritás újraellenőrzése…', '');
      verifyAndRender().then(function (c) { setStatus('Újraellenőrzés kész: ' + c.ok + ' egyezik, ' + c.mismatch + ' eltér, ' + c.none + ' hash nélkül.', c.mismatch ? 'warn' : 'ok'); });
    });
    $('btn-chain-close').addEventListener('click', function () { chainId = null; $('chain-panel').hidden = true; });
    $('import-file').addEventListener('change', onImportFile);
    ['flt-type', 'flt-status', 'flt-origin', 'flt-integrity', 'flt-tag'].forEach(function (id) { $(id).addEventListener('change', renderList); });
    $('flt-text').addEventListener('input', renderList);
    $('btn-clear-filters').addEventListener('click', function () { clearFilters(); renderList(); });

    renderList();
    ready = engine.migrate().then(function (rep) {
      if (rep.unavailable) {
        setStatus('A v0.1 → v0.2 migráció hash nélkül maradt (nincs Web Crypto); az adatok sértetlenek.', 'warn');
      } else if (rep.fromSchema < V2.SCHEMA_VERSION && engine.anchors.length) {
        setStatus('Migráció v0.1 → v0.2: ' + rep.sealed + ' horgony kapott SHA-256 hash-t (basis: migrated)' + (rep.backedUp ? '. A régi nyers adat megvan a nexis_flare_anchors_backup_v0.1 kulcson.' : '.'), 'ok');
      }
      return verifyAndRender();
    }).catch(function (e) { setStatus('Indítási hiba: ' + e.message, 'err'); });
    return ready;
  }

  window.AnchorUI = {
    engine: engine,
    get ready() { return ready; },
    showChain: showChain,
    renderList: renderList
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
