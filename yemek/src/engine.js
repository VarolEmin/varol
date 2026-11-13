/* Haftalık akşam yemeği plan motoru. Saf ES5, DOM yok. */
(function (root, factory) {
  if (typeof module === 'object' && module && module.exports) {
    module.exports = factory();
  } else {
    root.YemekEngine = factory();
  }
})(this, function () {
  'use strict';

  var GUNLER = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
  var AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  var ANCHOR = new Date(2026, 10, 16); // Hafta 1 Pazartesi
  var DAY_MS = 86400000;
  var DEVAM = 'Dünden devam';
  var ESLIKSIZ = ['Salata bowl', 'Dışarıda', 'Yeni tarif'];
  var PRATIK_GUNLERI = ['Sebze yemeği', 'Bakliyat', 'Tavuk', 'Et'];
  var DEFAULT_W = { 'Sık': 3, 'Normal': 2, 'Seyrek': 1, 'Kapalı': 0 };

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function mondayOf(date) {
    var back = (date.getDay() + 6) % 7;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - back);
  }

  function dateKey(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function parseKey(key) {
    var p = String(key).split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }

  function addDays(date, n) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  }

  function cycleWeek(date) {
    var diff = Math.round((mondayOf(date).getTime() - ANCHOR.getTime()) / (7 * DAY_MS));
    return (((diff % 4) + 4) % 4) + 1;
  }

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function inSeason(y, ay) {
    var m = y.mevsim;
    if (!m) { return true; }
    if (m.bas <= m.son) { return ay >= m.bas && ay <= m.son; }
    return ay >= m.bas || ay <= m.son;
  }

  var cacheData = null;
  var cacheIdx = null;
  function index(data) {
    if (cacheData === data && cacheIdx) { return cacheIdx; }
    var by = {};
    var list = data.yemekler;
    for (var i = 0; i < list.length; i++) { by[list[i].ad] = list[i]; }
    cacheData = data;
    cacheIdx = { by: by, w: data.agirliklar || DEFAULT_W };
    return cacheIdx;
  }

  function weightOf(idx, y) {
    var w = idx.w[y.siklik];
    return typeof w === 'number' ? w : 0;
  }

  function pickWeighted(items, rng) {
    var total = 0, i;
    for (i = 0; i < items.length; i++) { total += items[i].w; }
    if (total <= 0) { return items.length ? items[Math.floor(rng() * items.length)].y : null; }
    var r = rng() * total;
    for (i = 0; i < items.length; i++) {
      r -= items[i].w;
      if (r < 0) { return items[i].y; }
    }
    return items[items.length - 1].y;
  }

  // ---- Eşlik ----

  function eslikAdaylari(data, anaAd, ay) {
    var idx = index(data);
    var ana = idx.by[anaAd];
    var out = [];
    if (!ana || ESLIKSIZ.indexOf(ana.kategori) >= 0) { return out; }
    var list = data.kombinasyonlar[anaAd] || [];
    for (var i = 0; i < list.length; i++) {
      var e = idx.by[list[i]];
      if (!e || weightOf(idx, e) <= 0 || !inSeason(e, ay)) { continue; }
      if (ana.kategori === 'Tavuk' && e.kategori === 'Çorba' && e.tavuklu) { continue; }
      out.push(e);
    }
    return out;
  }

  // opts: { prevEslik: ad|null, avoid: ad|null }
  function eslikSec(data, anaAd, ay, rng, opts) {
    opts = opts || {};
    var idx = index(data);
    var ana = idx.by[anaAd];
    var cands = eslikAdaylari(data, anaAd, ay);
    if (!cands.length) { return null; }
    var prev = opts.prevEslik ? idx.by[opts.prevEslik] : null;
    var avoid = opts.avoid || null;
    var salcali = ana && ana.taban === 'Salçalı';
    // gevşetme sırası: tür tercihi, Salçalı filtresi, önceki günden farklı olma
    var combos = [[true, true, true], [true, true, false], [true, false, false], [false, false, false]];
    for (var c = 0; c < combos.length; c++) {
      var f = combos[c];
      var pool = [];
      for (var i = 0; i < cands.length; i++) {
        var e = cands[i];
        if (f[0] && prev && e.ad === prev.ad) { continue; }
        if (f[1] && salcali && e.taban === 'Salçalı') { continue; }
        if (f[2] && prev && e.kategori === prev.kategori) { continue; }
        pool.push({ y: e, w: weightOf(idx, e) });
      }
      if (pool.length && avoid) {
        var rest = [];
        for (var j = 0; j < pool.length; j++) { if (pool[j].y.ad !== avoid) { rest.push(pool[j]); } }
        if (rest.length) { pool = rest; }
      }
      if (pool.length) { return pickWeighted(pool, rng).ad; }
    }
    return null;
  }

  // ---- Gün seçimi ----

  function effCategory(tmpl, i) {
    var k = i;
    while (k > 0 && tmpl[k].kategori === DEVAM) { k--; }
    return tmpl[k].kategori;
  }

  function usedNames(days, skip) {
    var m = {};
    for (var i = 0; i < days.length; i++) {
      if (i !== skip && days[i] && days[i].ana) { m[days[i].ana] = true; }
    }
    return m;
  }

  function pratikUsed(idx, days, skip) {
    for (var i = 0; i < days.length; i++) {
      if (i !== skip && days[i] && days[i].ana) {
        var y = idx.by[days[i].ana];
        if (y && y.kategori === 'Pratik') { return true; }
      }
    }
    return false;
  }

  function last2Names(history, monday) {
    var keys = [dateKey(addDays(monday, -7)), dateKey(addDays(monday, -14))];
    var m = {};
    var h = history || [];
    for (var i = 0; i < h.length; i++) {
      if (keys.indexOf(h[i].monday) >= 0) {
        var ds = h[i].days || [];
        for (var j = 0; j < ds.length; j++) { if (ds[j] && ds[j].ana) { m[ds[j].ana] = true; } }
      }
    }
    return m;
  }

  // ctx: { monday, tmpl, days, last2, tavukHaftasi }
  function pickAna(data, ctx, i, cat, rng, avoid, allowPratik) {
    var idx = index(data);
    var date = addDays(ctx.monday, i);
    var ay = date.getMonth() + 1;
    var hafta = (i >= 5) ? 2 : 1;
    var cands = [];
    var k, y, w;
    var tavukBonus = ctx.tavukHaftasi && (cat === 'Sebze yemeği' || cat === 'Bakliyat');
    for (k = 0; k < data.yemekler.length; k++) {
      y = data.yemekler[k];
      if (!inSeason(y, ay)) { continue; }
      w = weightOf(idx, y);
      if (w <= 0) { continue; }
      if (y.kategori === cat) {
        if (tavukBonus && y.tavuklu) { w = w * 2; }
        cands.push({ y: y, w: w });
      } else if (allowPratik && y.kategori === 'Pratik') {
        cands.push({ y: y, w: w * hafta });
      }
    }
    var chosen = usedNames(ctx.days, i);
    for (var stage = 0; stage < 3; stage++) {
      var pool = [];
      for (k = 0; k < cands.length; k++) {
        var n = cands[k].y.ad;
        if (stage < 1 && ctx.last2[n]) { continue; }
        if (stage < 2 && chosen[n]) { continue; }
        pool.push(cands[k]);
      }
      if (pool.length && avoid) {
        var rest = [];
        for (k = 0; k < pool.length; k++) { if (pool[k].y.ad !== avoid) { rest.push(pool[k]); } }
        if (rest.length) { pool = rest; }
      }
      if (pool.length) {
        return { ana: pickWeighted(pool, rng).ad, relaxed: stage >= 1 };
      }
    }
    return { ana: null, relaxed: true };
  }

  // Bir günü doldurur: { ana, eslik, relaxed }
  function fillDay(data, ctx, i, rng, avoid) {
    var idx = index(data);
    var date = addDays(ctx.monday, i);
    var ay = date.getMonth() + 1;
    var tcat = ctx.tmpl[i].kategori;
    var prev = i > 0 ? ctx.days[i - 1] : null;
    var res;
    if (tcat === DEVAM) {
      var cat = effCategory(ctx.tmpl, i);
      var py = prev && prev.ana ? idx.by[prev.ana] : null;
      if (py && py.ikiGun && inSeason(py, ay) && py.ad !== avoid) {
        res = { ana: py.ad, relaxed: !!prev.relaxed };
      } else {
        res = pickAna(data, ctx, i, cat, rng, prev && prev.ana ? prev.ana : avoid, false);
      }
    } else {
      var nextDevam = (i < 6 && ctx.tmpl[i + 1].kategori === DEVAM);
      var allow = PRATIK_GUNLERI.indexOf(tcat) >= 0 && !nextDevam && !pratikUsed(idx, ctx.days, i);
      res = pickAna(data, ctx, i, tcat, rng, avoid, allow);
    }
    var eslik = null;
    if (res.ana) {
      eslik = eslikSec(data, res.ana, ay, rng, {
        prevEslik: prev ? prev.eslik : null
      });
    }
    return { ana: res.ana, eslik: eslik, relaxed: res.relaxed };
  }

  function emptyDay(monday, i, tmpl) {
    var d = addDays(monday, i);
    return { tarih: dateKey(d), gun: GUNLER[i], kategori: tmpl[i].kategori, ana: null, eslik: null, locked: false, relaxed: false };
  }

  function makeCtx(data, monday, history, days) {
    var tmpl = data.sablon[String(cycleWeek(monday))];
    var tavuk = false;
    for (var i = 0; i < tmpl.length; i++) { if (tmpl[i].kategori === 'Tavuk') { tavuk = true; } }
    return { monday: monday, tmpl: tmpl, days: days, last2: last2Names(history, monday), tavukHaftasi: tavuk };
  }

  function planWeek(data, monday, opts) {
    opts = opts || {};
    monday = mondayOf(monday);
    var counter = opts.counter || 0;
    var locked = opts.locked || {};
    var tmpl = data.sablon[String(cycleWeek(monday))];
    var days = [];
    var i;
    for (i = 0; i < 7; i++) {
      var d = emptyDay(monday, i, tmpl);
      var L = locked[String(i)];
      if (L) {
        d.ana = L.ana || null;
        d.eslik = L.eslik || null;
        d.locked = true;
      }
      days.push(d);
    }
    var ctx = makeCtx(data, monday, opts.history, days);
    var rng = mulberry32(hashStr(dateKey(monday) + ':' + counter));
    for (i = 0; i < 7; i++) {
      if (days[i].locked) { continue; }
      var r = fillDay(data, ctx, i, rng, null);
      days[i].ana = r.ana;
      days[i].eslik = r.eslik;
      days[i].relaxed = r.relaxed;
    }
    return { monday: dateKey(monday), cycleWeek: cycleWeek(monday), counter: counter, rerollN: 0, days: days };
  }

  function rerollDay(data, plan, dayIndex, opts) {
    opts = opts || {};
    var monday = parseKey(plan.monday);
    var n = (plan.rerollN || 0) + 1;
    var days = [];
    var i;
    for (i = 0; i < 7; i++) {
      var s = plan.days[i];
      days.push({ tarih: s.tarih, gun: s.gun, kategori: s.kategori, ana: s.ana, eslik: s.eslik, locked: !!s.locked, relaxed: !!s.relaxed });
    }
    var ctx = makeCtx(data, monday, opts.history, days);
    var rng = mulberry32(hashStr(plan.monday + ':' + plan.counter + ':r:' + dayIndex + ':' + n));
    var old = days[dayIndex].ana;
    var oldEslik = days[dayIndex].eslik;
    var r;
    var idx = index(data);
    var oy = old ? idx.by[old] : null;
    if (ctx.tmpl[dayIndex].kategori === DEVAM && oy && oy.ikiGun) {
      // Dünden devam günü: ana aynı kalır, yalnızca eşlik yenilenir
      var ay = parseKey(days[dayIndex].tarih).getMonth() + 1;
      var prev = dayIndex > 0 ? days[dayIndex - 1] : null;
      days[dayIndex].eslik = eslikSec(data, old, ay, rng, { prevEslik: prev ? prev.eslik : null, avoid: oldEslik });
      days[dayIndex].locked = false;
    } else {
      days[dayIndex].ana = null;
      days[dayIndex].locked = false;
      r = fillDay(data, ctx, dayIndex, rng, old);
      days[dayIndex].ana = r.ana;
      days[dayIndex].eslik = r.eslik;
      days[dayIndex].relaxed = r.relaxed;
      // ardışık "Dünden devam" günleri yeni yemeği izler
      for (i = dayIndex + 1; i < 7 && ctx.tmpl[i].kategori === DEVAM && !days[i].locked; i++) {
        days[i].ana = null;
        var r2 = fillDay(data, ctx, i, rng, null);
        days[i].ana = r2.ana;
        days[i].eslik = r2.eslik;
        days[i].relaxed = r2.relaxed;
      }
    }
    return { monday: plan.monday, cycleWeek: plan.cycleWeek, counter: plan.counter, rerollN: n, days: days };
  }

  return {
    GUNLER: GUNLER,
    AYLAR: AYLAR,
    ANCHOR: ANCHOR,
    mondayOf: mondayOf,
    dateKey: dateKey,
    parseKey: parseKey,
    addDays: addDays,
    cycleWeek: cycleWeek,
    inSeason: inSeason,
    hashStr: hashStr,
    mulberry32: mulberry32,
    eslikAdaylari: eslikAdaylari,
    eslikSec: eslikSec,
    planWeek: planWeek,
    rerollDay: rerollDay
  };
});
