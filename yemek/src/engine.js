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
  var VARSAYILAN_AYARLAR = {
    tekrarHafta: 2,
    seyrekBeklemeHafta: 6,
    pratikKatsayi: 0.15,
    haftaSonuPratikCarpan: 2,
    tavukHaftasiCarpan: 2,
    salcaFiltresi: true,
    tavukCorbaFiltresi: true
  };
  var DEFAULT_W = { 'Sık': 4, 'Normal': 2, 'Seyrek': 1, 'Kapalı': 0 };

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

  // data.ayarlar (isteğe bağlı) ile varsayılanları birleştirir; her çağrıda yeni kopya.
  function ayarlar(data) {
    var out = {};
    var src = (data && data.ayarlar) || {};
    var keys = Object.keys(VARSAYILAN_AYARLAR);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var d = VARSAYILAN_AYARLAR[k];
      var v = src[k];
      if (typeof d === 'boolean') { out[k] = (typeof v === 'boolean') ? v : d; }
      else { out[k] = (typeof v === 'number' && isFinite(v) && v >= 0) ? v : d; }
    }
    return out;
  }

  // Önbellek yok: app farklı/değiştirilmiş bir data kopyası verebilir.
  function index(data) {
    var by = {};
    var list = data.yemekler;
    for (var i = 0; i < list.length; i++) { by[list[i].ad] = list[i]; }
    return { by: by, w: data.agirliklar || DEFAULT_W };
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
    var ayar = ayarlar(data);
    var ana = idx.by[anaAd];
    var out = [];
    if (!ana || ESLIKSIZ.indexOf(ana.kategori) >= 0) { return out; }
    var list = data.kombinasyonlar[anaAd] || [];
    for (var i = 0; i < list.length; i++) {
      var e = idx.by[list[i]];
      if (!e || weightOf(idx, e) <= 0 || !inSeason(e, ay)) { continue; }
      if (ayar.tavukCorbaFiltresi && ana.kategori === 'Tavuk' && e.kategori === 'Çorba' && e.tavuklu) { continue; }
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
    var salcali = ayarlar(data).salcaFiltresi && ana && ana.taban === 'Salçalı';
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

  // ---- Esnek yerleşim ----

  function splitUnits(tmpl) {
    var units = [];
    for (var i = 0; i < tmpl.length; i++) {
      if (tmpl[i].kategori === DEVAM && units.length) {
        units[units.length - 1].push(tmpl[i].kategori);
      } else {
        units.push([tmpl[i].kategori]);
      }
    }
    return units;
  }

  // Şablonu yerleşmiş düzene çevirir: [{ kategori, kaynakKategori }]
  function layoutWeek(data, tmpl, monday, counter) {
    var esnek = data.esnek || {};
    var units = splitUnits(tmpl);
    var fixed = [], flex = [], i;
    for (i = 0; i < units.length; i++) {
      if (esnek.hasOwnProperty(units[i][0])) { flex.push(units[i]); } else { fixed.push(units[i]); }
    }
    var order = units;
    if (flex.length) {
      var results = [];
      var used = [];
      for (i = 0; i < flex.length; i++) { used.push(false); }
      var build = function (seq, fi, pos) {
        var k;
        if (fi === fixed.length && seq.length - fi === flex.length) { results.push(seq.slice()); return; }
        if (fi < fixed.length) {
          seq.push(fixed[fi]);
          build(seq, fi + 1, pos + fixed[fi].length);
          seq.pop();
        }
        for (k = 0; k < flex.length; k++) {
          if (used[k]) { continue; }
          var yasak = esnek[flex[k][0]].yasak || [];
          var ok = true;
          for (var d = 0; d < flex[k].length; d++) { if (yasak.indexOf(pos + d) >= 0) { ok = false; } }
          if (!ok) { continue; }
          used[k] = true;
          seq.push(flex[k]);
          build(seq, fi, pos + flex[k].length);
          seq.pop();
          used[k] = false;
        }
      };
      build([], 0, 0);
      if (results.length) {
        var lr = mulberry32(hashStr(dateKey(monday) + ':yerlesim'));
        // ilk esnek kategorinin (data.esnek sırası) gün indeksine göre grupla: önce gün, sonra yerleşim
        var lead = null, ek = Object.keys(esnek);
        for (i = 0; i < ek.length && lead === null; i++) {
          for (var f = 0; f < flex.length; f++) { if (flex[f][0] === ek[i]) { lead = flex[f]; break; } }
        }
        var groups = {}, gkeys = [];
        for (i = 0; i < results.length; i++) {
          var st = 0;
          for (var u = 0; results[i][u] !== lead; u++) { st += results[i][u].length; }
          if (!groups.hasOwnProperty(st)) { groups[st] = []; gkeys.push(st); }
          groups[st].push(results[i]);
        }
        gkeys.sort(function (x, y) { return x - y; });
        var grp = groups[gkeys[Math.floor(lr() * gkeys.length)]];
        order = grp[Math.floor(lr() * grp.length)];
      }
    }
    var out = [];
    for (i = 0; i < order.length; i++) {
      for (var j = 0; j < order[i].length; j++) {
        out.push({ kategori: order[i][j], kaynakKategori: order[i][0] });
      }
    }
    return out;
  }

  // ---- Gün seçimi ----

  function effCategory(tmpl, i) {
    var k = i;
    while (k > 0 && tmpl[k].kategori === DEVAM) { k--; }
    return tmpl[k].kategori;
  }

  function layoutFromDays(days) {
    var t = [];
    for (var i = 0; i < days.length; i++) { t.push({ kategori: days[i].kategori }); }
    for (i = 0; i < t.length; i++) { t[i].kaynakKategori = effCategory(t, i); }
    return t;
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

  // son n haftada (history'de var olan kadarıyla) çıkan ana yemekler
  function lastNames(history, monday, n) {
    var keys = [];
    n = Math.floor(n);
    for (var w = 1; w <= n; w++) { keys.push(dateKey(addDays(monday, -7 * w))); }
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
    var hafta = (i >= 5) ? ctx.ayar.haftaSonuPratikCarpan : 1;
    var cands = [];
    var k, y, w;
    var ayar = ctx.ayar;
    var tavukBonus = ctx.tavukHaftasi && (cat === 'Sebze yemeği' || cat === 'Bakliyat');
    for (k = 0; k < data.yemekler.length; k++) {
      y = data.yemekler[k];
      if (!inSeason(y, ay)) { continue; }
      w = weightOf(idx, y);
      if (w <= 0) { continue; }
      if (y.kategori === cat) {
        if (tavukBonus && y.tavuklu) { w = w * ayar.tavukHaftasiCarpan; }
        cands.push({ y: y, w: w });
      } else if (allowPratik && y.kategori === 'Pratik' && ayar.pratikKatsayi > 0) {
        cands.push({ y: y, w: w * ayar.pratikKatsayi * hafta });
      }
    }
    var chosen = usedNames(ctx.days, i);
    for (var stage = 0; stage < 3; stage++) {
      var pool = [];
      for (k = 0; k < cands.length; k++) {
        var n = cands[k].y.ad;
        if (stage < 1 && (ctx.last2[n] || (cands[k].y.siklik === 'Seyrek' && ctx.lastSeyrek[n]))) { continue; }
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
    return { tarih: dateKey(d), gun: GUNLER[i], kategori: tmpl[i].kategori, kaynakKategori: tmpl[i].kaynakKategori, ana: null, eslik: null, locked: false, relaxed: false };
  }

  function makeCtx(data, monday, history, days, tmpl) {
    var tavuk = false;
    for (var i = 0; i < tmpl.length; i++) { if (tmpl[i].kategori === 'Tavuk') { tavuk = true; } }
    var ayar = ayarlar(data);
    return { monday: monday, tmpl: tmpl, days: days, ayar: ayar, last2: lastNames(history, monday, ayar.tekrarHafta), lastSeyrek: lastNames(history, monday, ayar.seyrekBeklemeHafta), tavukHaftasi: tavuk };
  }

  function planWeek(data, monday, opts) {
    opts = opts || {};
    monday = mondayOf(monday);
    var counter = opts.counter || 0;
    var locked = opts.locked || {};
    var tmpl = layoutWeek(data, data.sablon[String(cycleWeek(monday))], monday, counter);
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
    var ctx = makeCtx(data, monday, opts.history, days, tmpl);
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
    var lay = layoutFromDays(plan.days);
    for (i = 0; i < 7; i++) {
      var s = plan.days[i];
      days.push({ tarih: s.tarih, gun: s.gun, kategori: s.kategori, kaynakKategori: s.kaynakKategori || lay[i].kaynakKategori, ana: s.ana, eslik: s.eslik, locked: !!s.locked, relaxed: !!s.relaxed });
    }
    var ctx = makeCtx(data, monday, opts.history, days, lay);
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
    VARSAYILAN_AYARLAR: VARSAYILAN_AYARLAR,
    ayarlar: ayarlar,
    eslikAdaylari: eslikAdaylari,
    eslikSec: eslikSec,
    planWeek: planWeek,
    rerollDay: rerollDay
  };
});
