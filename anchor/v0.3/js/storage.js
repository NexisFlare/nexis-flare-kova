/**
 * AnchorStorage – a localStorage kezelése az Anchor Engine számára.
 * Kulcs: nexis_flare_anchors (ugyanaz, amit a Hídépítő-féle AnchorEngine használ).
 *
 * Mellette két külön kulcsot használ, hogy a horgonyok maguk érintetlenek maradjanak:
 *  - nexis_flare_anchors_origin: azonosító -> 'imported' (importált / archivált horgony);
 *    ami nincs benne, az ebben a böngészőben rögzített, új horgony.
 *  - nexis_flare_anchors_prefs: az űrlap utoljára használt forrás-adatai (tag, platform).
 *
 * Ha a localStorage nem érhető el (pl. privát mód), memóriabeli pótlék indul, és az
 * oldal figyelmeztet, hogy az adatok nem maradnak meg.
 */
(function (root) {
  'use strict';

  var KEY = 'nexis_flare_anchors';
  var ORIGIN_KEY = 'nexis_flare_anchors_origin';
  var PREFS_KEY = 'nexis_flare_anchors_prefs';
  var CORRUPT_KEY = 'nexis_flare_anchors_corrupt_backup';
  var persistent = true;

  function memoryShim() {
    var data = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      clear: function () { data = {}; }
    };
  }

  function probe() {
    try {
      var s = root.localStorage;
      var t = '__nexis_probe__';
      s.setItem(t, '1');
      s.removeItem(t);
      return true;
    } catch (e) {
      return false;
    }
  }

  if (!probe()) {
    persistent = false;
    try {
      Object.defineProperty(root, 'localStorage', { value: memoryShim(), configurable: true });
    } catch (e) {
      root.localStorage = memoryShim();
    }
  }

  function readJSON(key, fallback) {
    try {
      var raw = root.localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return v && typeof v === 'object' ? v : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    root.localStorage.setItem(key, JSON.stringify(value));
  }

  var AnchorStorage = {
    KEY: KEY,
    ORIGIN_KEY: ORIGIN_KEY,
    PREFS_KEY: PREFS_KEY,

    isPersistent: function () { return persistent; },

    /**
     * Védelem a sérült adat ellen: ha a tárolt horgony-JSON nem olvasható, a nyers szöveget
     * átmásoljuk egy másik kulcsra, és üres listával indulunk – így semmi nem íródik felül némán.
     * Visszaadja true-t, ha ilyen mentés készült.
     */
    guardCorrupt: function () {
      var raw = root.localStorage.getItem(KEY);
      if (!raw) return false;
      try {
        var v = JSON.parse(raw);
        if (Array.isArray(v)) return false;
      } catch (e) { /* alább kezeljük */ }
      root.localStorage.setItem(CORRUPT_KEY, raw);
      root.localStorage.removeItem(KEY);
      return true;
    },

    getOrigins: function () { return readJSON(ORIGIN_KEY, {}); },

    markImported: function (ids) {
      var map = this.getOrigins();
      ids.forEach(function (id) { map[id] = 'imported'; });
      writeJSON(ORIGIN_KEY, map);
    },

    forget: function (id) {
      var map = this.getOrigins();
      if (Object.prototype.hasOwnProperty.call(map, id)) {
        delete map[id];
        writeJSON(ORIGIN_KEY, map);
      }
    },

    /** 'imported' (importált / archivált) vagy 'new' (új, itt rögzített). */
    originOf: function (id) {
      var map = this.getOrigins();
      return Object.prototype.hasOwnProperty.call(map, id) && map[id] === 'imported' ? 'imported' : 'new';
    },

    getPrefs: function () { return readJSON(PREFS_KEY, {}); },
    setPrefs: function (p) { writeJSON(PREFS_KEY, p); }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnchorStorage;
  } else {
    root.AnchorStorage = AnchorStorage;
  }
})(typeof window !== 'undefined' ? window : globalThis);
