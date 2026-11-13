/* Haftalık akşam yemeği planı arayüzü. Saf ES5 (iOS 9 Safari). */
(function () {
  'use strict';
  if (typeof document === 'undefined') { return; }

  var KEY = 'yemekPlani.v1';
  var DEVAM = 'Dünden devam';
  var ANA_KATS = ['Sebze yemeği', 'Bakliyat', 'Tavuk', 'Et', 'Balık', 'Pratik', 'Salata bowl', 'Dışarıda', 'Yeni tarif'];
  var ESLIKSIZ = ['Salata bowl', 'Dışarıda', 'Yeni tarif'];
  var DISARIDA = 'Dışarıda yemek';

  var E = window.YemekEngine;
  var BASE = window.YEMEK_DATA;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var root = document.body;
  if (!E || !BASE || !BASE.yemekler || !BASE.sablon) {
    root.innerHTML = '<div style="padding:40px;font:24px sans-serif;color:#7a2e12">Plan yüklenemedi: ' +
      (!E ? 'plan motoru' : 'yemek verisi') + ' bulunamadı. Sayfayı yenilemeyi dene.</div>';
    return;
  }

  // ---- Test parametreleri ----
  var nowOverride = null;
  var hourOverride = null;
  var testMode = false;
  (function () {
    var q = String(location.search || '');
    var m = /[?&]tarih=(\d{4})-(\d{1,2})-(\d{1,2})/.exec(q);
    if (m) {
      nowOverride = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
      testMode = true;
    }
    var h = /[?&]saat=(\d{1,2})/.exec(q);
    if (h) { hourOverride = parseInt(h[1], 10); testMode = true; }
  })();

  function now() { return nowOverride ? nowOverride : new Date(); }
  function today() { var n = now(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function hourNow() { return hourOverride !== null ? hourOverride : new Date().getHours(); }

  // ---- Depo ----
  var store = { v: 1, weeks: {} };
  function loadStore() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.v === 1 && o.weeks && typeof o.weeks === 'object') { store = o; }
      }
    } catch (e) { /* bellekte çalış */ }
  }
  function saveStore() {
    var keys = Object.keys(store.weeks).sort();
    while (keys.length > 6) { delete store.weeks[keys.shift()]; }
    try { window.localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* yoksay */ }
  }
  function historyFor(mondayKey) {
    var keys = Object.keys(store.weeks).sort();
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] < mondayKey) { out.push(store.weeks[keys[i]]); }
    }
    return out;
  }
  function validPlan(p) {
    return p && p.days && p.days.length === 7 && p.monday;
  }
  function getPlan(monday, create) {
    var key = E.dateKey(monday);
    var p = store.weeks[key];
    if (validPlan(p)) { return p; }
    if (!create) { return null; }
    p = E.planWeek(etkinVeri(), monday, { counter: 0, history: historyFor(key) });
    store.weeks[key] = p;
    saveStore();
    return p;
  }

  // ---- Veri yardımcıları ----
  var byName = {};
  (function () {
    for (var i = 0; i < BASE.yemekler.length; i++) { byName[BASE.yemekler[i].ad] = BASE.yemekler[i]; }
  })();

  function effCat(plan, i) {
    var d = plan.days[i];
    if (d.kaynakKategori) { return d.kaynakKategori; }
    var k = i;
    while (k > 0 && plan.days[k].kategori === DEVAM) { k--; }
    return plan.days[k].kategori;
  }
  function dayMonth(day) { return E.parseKey(day.tarih).getMonth() + 1; }
  function inList(arr, v) { for (var i = 0; i < arr.length; i++) { if (arr[i] === v) { return true; } } return false; }
  function hasClass(el, c) { return (' ' + (el.className || '') + ' ').indexOf(' ' + c + ' ') >= 0; }

  // ---- Durum ----
  var state = { view: 0, panel: -1, onay: null, tercih: false };

  // ---- Tercihler ----
  var TKEY = 'yemekPlani.tercih.v1';
  var SIKLIKLAR = ['Sık', 'Normal', 'Seyrek', 'Kapalı'];
  var GUN_ADLARI = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
  var YEDEK_AYAR = { tekrarHafta: 2, seyrekBeklemeHafta: 6, pratikKatsayi: 0.15, haftaSonuPratikCarpan: 2,
    tavukHaftasiCarpan: 2, salcaFiltresi: true, tavukCorbaFiltresi: true };
  var YEDEK_AGIRLIK = { 'Sık': 4, 'Normal': 2, 'Seyrek': 1, 'Kapalı': 0 };
  var tercih = { siklik: {}, agirliklar: {}, ayarlar: {}, esnek: {} };
  var veriCache = null;

  function loadTercih() {
    try {
      var raw = window.localStorage.getItem(TKEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          tercih = { siklik: o.siklik || {}, agirliklar: o.agirliklar || {}, ayarlar: o.ayarlar || {}, esnek: o.esnek || {} };
        }
      }
    } catch (e) { /* varsayılanlarla çalış */ }
  }
  function isEmpty(o) { for (var k in o) { if (o.hasOwnProperty(k)) { return false; } } return true; }
  function saveTercih() {
    try {
      if (isEmpty(tercih.siklik) && isEmpty(tercih.agirliklar) && isEmpty(tercih.ayarlar) && isEmpty(tercih.esnek)) {
        window.localStorage.removeItem(TKEY);
      } else {
        window.localStorage.setItem(TKEY, JSON.stringify(tercih));
      }
    } catch (e) { /* yoksay */ }
    veriCache = null;
  }
  function varsayilanAyar() {
    var out = {}, k, src = [YEDEK_AYAR, E.VARSAYILAN_AYARLAR || {}, BASE.ayarlar || {}];
    for (var i = 0; i < src.length; i++) {
      for (k in src[i]) { if (src[i].hasOwnProperty(k)) { out[k] = src[i][k]; } }
    }
    return out;
  }
  function varsayilanAgirlik() {
    var out = {}, k, a = BASE.agirliklar || YEDEK_AGIRLIK;
    for (k in YEDEK_AGIRLIK) { if (YEDEK_AGIRLIK.hasOwnProperty(k)) { out[k] = a[k] !== undefined ? a[k] : YEDEK_AGIRLIK[k]; } }
    return out;
  }
  function varsayilanYasak() {
    var e = BASE.esnek && BASE.esnek['Balık'];
    return (e && e.yasak) ? e.yasak.slice(0) : [];
  }
  function etkinVeri() {
    if (veriCache) { return veriCache; }
    var d = JSON.parse(JSON.stringify(BASE)), k, i, by = {};
    for (i = 0; i < d.yemekler.length; i++) { by[d.yemekler[i].ad] = d.yemekler[i]; }
    for (k in tercih.siklik) {
      if (tercih.siklik.hasOwnProperty(k) && by[k] && inList(SIKLIKLAR, tercih.siklik[k])) { by[k].siklik = tercih.siklik[k]; }
    }
    d.agirliklar = d.agirliklar || {};
    for (k in tercih.agirliklar) {
      if (tercih.agirliklar.hasOwnProperty(k) && YEDEK_AGIRLIK.hasOwnProperty(k)) { d.agirliklar[k] = tercih.agirliklar[k]; }
    }
    d.ayarlar = d.ayarlar || {};
    for (k in tercih.ayarlar) {
      if (tercih.ayarlar.hasOwnProperty(k)) { d.ayarlar[k] = tercih.ayarlar[k]; }
    }
    d.esnek = d.esnek || {};
    for (k in tercih.esnek) {
      if (tercih.esnek.hasOwnProperty(k) && d.esnek[k] && tercih.esnek[k].yasak) {
        d.esnek[k].yasak = tercih.esnek[k].yasak.slice(0);
      }
    }
    veriCache = d;
    return d;
  }
  function yasakGunler() {
    var e = etkinVeri().esnek['Balık'];
    return (e && e.yasak) ? e.yasak : [];
  }
  function sameNum(a, b) { return Math.abs(Number(a) - Number(b)) < 0.00001; }

  var AYAR_SATIRLARI = [
    ['tekrarHafta', 'Aynı yemek tekrar gelmesin', 'son kaç haftada', [[0, 'Kapalı'], [1, '1 hafta'], [2, '2 hafta'], [3, '3 hafta'], [4, '4 hafta']]],
    ['seyrekBeklemeHafta', 'Seyrek yemekler için bekleme', 'yeniden gelmeden önce', [[0, 'Kapalı'], [2, '2 hafta'], [3, '3 hafta'], [4, '4 hafta'], [5, '5 hafta'], [6, '6 hafta'], [8, '8 hafta'], [10, '10 hafta'], [12, '12 hafta']]],
    ['pratikKatsayi', 'Pratik yemekler (pizza, mantı…)', 'ne sıklıkla gelsin', [[0, 'Hiç'], [0.08, 'Çok az'], [0.15, 'Ayda ~1'], [0.3, 'Sık']]],
    ['haftaSonuPratikCarpan', 'Hafta sonu pratik şansı', 'cumartesi ve pazar', [[1, 'Aynı'], [2, '2 kat'], [3, '3 kat']]],
    ['tavukHaftasiCarpan', 'Tavuk haftasında tavuklu sebze/bakliyat', 'tavuk günü olan haftalarda', [[1, 'Etkisiz'], [2, '2 kat'], [3, '3 kat']]],
    ['salcaFiltresi', 'Salçalı yemeğe salçalı eşlik verme', '', [[1, 'Evet'], [0, 'Hayır']]],
    ['tavukCorbaFiltresi', 'Tavuk yemeğine tavuk çorbası verme', '', [[1, 'Evet'], [0, 'Hayır']]]
  ];

  function selHtml(key, options, cur) {
    var h = '<div class="secim secim-kucuk"><select data-tercih="' + esc(key) + '">';
    for (var i = 0; i < options.length; i++) { h += opt(options[i][0], options[i][1], sameNum(options[i][0], cur)); }
    return h + '</select></div>';
  }
  function satirHtml(ad, aciklama, degisti, selector) {
    return '<div class="tercih-satir' + (degisti ? ' degisti' : '') + '"><div class="tercih-ad">' + esc(ad) +
      (aciklama ? '<span class="tercih-aciklama">' + esc(aciklama) + '</span>' : '') + '</div>' + selector + '</div>';
  }
  function mevsimText(y) {
    var m = y.mevsim;
    if (!m) { return 'Her mevsim'; }
    return E.AYLAR[m.bas - 1] + '–' + E.AYLAR[m.son - 1];
  }
  function sayiSecenek(n) {
    var o = [];
    for (var i = 1; i <= n; i++) { o.push([i, i + ' kat']); }
    return o;
  }

  function tercihHtml() {
    var ED = etkinVeri(), DA = varsayilanAyar(), DW = varsayilanAgirlik();
    var h = '<div class="tercih' + (state.tercih ? ' acik' : '') + '"><div class="tercih-ic">' +
      '<div class="tercih-ust"><div class="tercih-baslik">Tercihler</div>' +
      '<button class="btn btn-ana tercih-kapat" data-eylem="tercih-kapat">Bitti</button></div>' +
      '<div class="tercih-not">Değişiklikler yeni planlarda geçerli olur. Bu haftaya uygulamak için “Haftanın planını yap”a bas.</div>';
    var i, k, a, cur, v;
    h += '<div class="tercih-bolum"><div class="tercih-bolum-baslik">Kurallar</div>';
    for (i = 0; i < AYAR_SATIRLARI.length; i++) {
      a = AYAR_SATIRLARI[i];
      v = DA[a[0]];
      cur = ED.ayarlar.hasOwnProperty(a[0]) ? ED.ayarlar[a[0]] : v;
      if (typeof cur === 'boolean') { cur = cur ? 1 : 0; }
      if (typeof v === 'boolean') { v = v ? 1 : 0; }
      h += satirHtml(a[1], a[2], !sameNum(cur, v), selHtml('ayar:' + a[0], a[3], cur));
    }
    h += '</div><div class="tercih-bolum"><div class="tercih-bolum-baslik">Sıklık ağırlıkları</div>';
    var wk = ['Sık', 'Normal', 'Seyrek'];
    for (i = 0; i < wk.length; i++) {
      cur = ED.agirliklar[wk[i]];
      h += satirHtml(wk[i], '', !sameNum(cur, DW[wk[i]]), selHtml('agirlik:' + wk[i], sayiSecenek(8), cur));
    }
    h += '</div><div class="tercih-bolum"><div class="tercih-bolum-baslik">Balık hangi günlere gelmesin</div><div class="gun-secici">';
    var yg = yasakGunler();
    for (i = 0; i < 7; i++) {
      h += '<button class="gun-sec' + (inList(yg, i) ? ' secili' : '') + '" data-eylem="balik-gun" data-gun="' + i + '">' + GUN_ADLARI[i] + '</button>';
    }
    h += '</div></div><div class="tercih-bolum"><div class="tercih-bolum-baslik">Yemek sıklıkları</div>';
    var cats = [], seen = {}, j, y, by = {};
    for (i = 0; i < BASE.yemekler.length; i++) {
      if (!seen[BASE.yemekler[i].kategori]) { seen[BASE.yemekler[i].kategori] = true; cats.push(BASE.yemekler[i].kategori); }
      by[BASE.yemekler[i].ad] = BASE.yemekler[i];
    }
    for (k = 0; k < cats.length; k++) {
      h += '<div class="tercih-grup-baslik">' + esc(cats[k]) + '</div><div class="tercih-liste">';
      for (j = 0; j < ED.yemekler.length; j++) {
        y = ED.yemekler[j];
        if (y.kategori !== cats[k]) { continue; }
        var sel = '<div class="secim secim-kucuk"><select data-tercih="siklik:' + esc(y.ad) + '">';
        for (i = 0; i < SIKLIKLAR.length; i++) { sel += opt(SIKLIKLAR[i], SIKLIKLAR[i], SIKLIKLAR[i] === y.siklik); }
        sel += '</select></div>';
        h += satirHtml(y.ad, mevsimText(y), y.siklik !== by[y.ad].siklik, sel);
      }
      h += '</div>';
    }
    h += '</div><div class="tercih-alt"><button class="btn btn-ikincil" data-eylem="tercih-varsayilan">Varsayılana dön</button></div>' +
      '</div></div>';
    return h;
  }

  function sameArr(a, b) {
    var x = a.slice(0).sort(), y = b.slice(0).sort();
    if (x.length !== y.length) { return false; }
    for (var i = 0; i < x.length; i++) { if (x[i] !== y[i]) { return false; } }
    return true;
  }

  function tercihDegis(key, val) {
    var p = key.indexOf(':');
    if (p < 0) { return; }
    var tur = key.substring(0, p), ad = key.substring(p + 1), n;
    if (tur === 'ayar') {
      var DA = varsayilanAyar();
      if (!DA.hasOwnProperty(ad)) { return; }
      var nv = (typeof DA[ad] === 'boolean') ? (val === '1') : parseFloat(val);
      if (typeof DA[ad] === 'boolean' ? nv === DA[ad] : sameNum(nv, DA[ad])) { delete tercih.ayarlar[ad]; }
      else { tercih.ayarlar[ad] = nv; }
    } else if (tur === 'agirlik') {
      var DW = varsayilanAgirlik();
      if (!DW.hasOwnProperty(ad) || ad === 'Kapalı') { return; }
      n = parseInt(val, 10);
      if (n === DW[ad]) { delete tercih.agirliklar[ad]; } else { tercih.agirliklar[ad] = n; }
    } else if (tur === 'siklik') {
      if (!byName[ad] || !inList(SIKLIKLAR, val)) { return; }
      if (val === byName[ad].siklik) { delete tercih.siklik[ad]; } else { tercih.siklik[ad] = val; }
    }
    saveTercih();
  }

  function balikGunDegis(g) {
    var yg = yasakGunler().slice(0), idx = -1, i;
    for (i = 0; i < yg.length; i++) { if (yg[i] === g) { idx = i; } }
    if (idx >= 0) { yg.splice(idx, 1); }
    else {
      if (yg.length >= 6) { return; }
      yg.push(g);
    }
    yg.sort(function (a, b) { return a - b; });
    if (sameArr(yg, varsayilanYasak())) { delete tercih.esnek['Balık']; }
    else { tercih.esnek['Balık'] = { yasak: yg }; }
    saveTercih();
  }


  var startKey = E.dateKey(today());

  function viewMonday() { return E.addDays(E.mondayOf(today()), state.view * 7); }
  function viewPlan() { return getPlan(viewMonday(), true); }

  // ---- Çizim ----
  function eslikText(day) {
    if (!day.ana) { return { t: '', yok: false }; }
    var y = byName[day.ana];
    if (y && inList(ESLIKSIZ, y.kategori)) { return { t: '', yok: false }; }
    if (day.eslik) { return { t: day.eslik, yok: false }; }
    return { t: 'tek başına', yok: true };
  }

  function heroHtml() {
    var t = today();
    var mp = getPlan(E.mondayOf(t), true);
    var idx = (t.getDay() + 6) % 7;
    var day = mp.days[idx];
    var ad = day.ana;
    var cls = 'bugun-yemek';
    var txt = ad;
    if (!ad) { txt = 'Henüz seçilmedi'; cls += ' bos'; }
    else if (ad.length > 24) { cls += ' cok-uzun'; }
    else if (ad.length > 16) { cls += ' uzun'; }
    var eslik = '';
    if (ad) {
      if (ad === DISARIDA) { eslik = 'Afiyet olsun'; }
      else if (day.eslik) { eslik = 'yanında <b>' + esc(day.eslik) + '</b>'; }
    }
    return '<div class="bugun">' +
      '<div class="bugun-tarih">' + t.getDate() + ' ' + E.AYLAR[t.getMonth()] + ' ' + E.GUNLER[idx] +
      '<span class="bugun-etiket">Bu akşam</span></div>' +
      '<div class="' + cls + '">' + esc(txt) + '</div>' +
      '<div class="bugun-eslik"' + (eslik ? '' : ' style="display:none"') + '>' + eslik + '</div>' +
      '</div>';
  }

  function rangeText(monday) {
    var sun = E.addDays(monday, 6);
    if (monday.getMonth() === sun.getMonth()) {
      return monday.getDate() + '–' + sun.getDate() + ' ' + E.AYLAR[sun.getMonth()];
    }
    return monday.getDate() + ' ' + E.AYLAR[monday.getMonth()] + ' – ' + sun.getDate() + ' ' + E.AYLAR[sun.getMonth()];
  }

  function headerHtml(monday) {
    return '<header class="ust">' + heroHtml() +
      '<div class="eylemler">' +
      '<div class="sekme">' +
      '<button class="sekme-btn' + (state.view === 0 ? ' aktif' : '') + '" data-eylem="bu-hafta">Bu hafta</button>' +
      '<button class="sekme-btn' + (state.view === 1 ? ' aktif' : '') + '" data-eylem="gelecek-hafta">Gelecek hafta</button>' +
      '</div>' +
      '<button class="btn btn-ana" data-eylem="planla">Haftanın planını yap</button>' +
      '<div class="dongu">' + rangeText(monday) + '</div>' +
      '</div></header>';
  }

  function weekHtml(plan, monday) {
    var tk = E.dateKey(today());
    var h = '<ul class="hafta">';
    for (var i = 0; i < 7; i++) {
      var day = plan.days[i];
      var date = E.addDays(monday, i);
      var dk = E.dateKey(date);
      var cls = 'gun';
      if (dk < tk) { cls += ' gecmis'; }
      if (dk === tk) { cls += ' bugun'; }
      if (day.kategori === DEVAM) { cls += ' devam'; }
      if (day.locked) { cls += ' elle'; }
      if (!day.ana) { cls += ' bos'; }
      var et = eslikText(day);
      h += '<li class="' + cls + '" data-gun="' + i + '">' +
        '<div class="gun-ust"><span class="gun-ad">' + E.GUNLER[i] + '</span><span class="gun-tarih">' +
        date.getDate() + ' ' + E.AYLAR[date.getMonth()] + '</span></div>' +
        '<div class="gun-yemek">' + (day.ana ? esc(day.ana) : 'Boş') + '</div>' +
        '<div class="gun-eslik' + (et.yok ? ' yok' : '') + '">' + esc(et.t) + '</div>' +
        '<div class="gun-alt"><span class="gun-kategori">' + esc(day.kategori) +
        '</span><span class="gun-elle">elle</span></div>' +
        '<button class="gun-yenile" data-eylem="gun-yenile" data-gun="' + i + '" aria-label="Bu güne başka kombinasyon">' +
        '<span class="gun-yenile-ikon">' + IKON_YENILE + '</span></button></li>';
    }
    return h + '</ul>';
  }

  function opt(val, label, sel) {
    return '<option value="' + esc(val) + '"' + (sel ? ' selected="selected"' : '') + '>' + esc(label) + '</option>';
  }

  function anaSelectHtml(plan, i) {
    var day = plan.days[i];
    var ay = dayMonth(day);
    var first = effCat(plan, i);
    var order = [first], k;
    for (k = 0; k < ANA_KATS.length; k++) { if (ANA_KATS[k] !== first) { order.push(ANA_KATS[k]); } }
    var ED = etkinVeri();
    var h = '<select id="sec-ana">' + opt('', '— Boş —', !day.ana);
    var seen = {};
    for (k = 0; k < order.length; k++) {
      var cat = order[k];
      var inS = '', outS = '';
      for (var j = 0; j < ED.yemekler.length; j++) {
        var y = ED.yemekler[j];
        if (y.kategori !== cat) { continue; }
        if (y.siklik === 'Kapalı' && y.ad !== day.ana) { continue; }
        seen[y.ad] = true;
        if (E.inSeason(y, ay)) { inS += opt(y.ad, y.ad, y.ad === day.ana); }
        else { outS += opt(y.ad, y.ad + ' (mevsim dışı)', y.ad === day.ana); }
      }
      if (inS || outS) { h += '<optgroup label="' + esc(cat) + '">' + inS + outS + '</optgroup>'; }
    }
    if (day.ana && !seen[day.ana]) { h += opt(day.ana, day.ana, true); }
    return h + '</select>';
  }

  function eslikSelectHtml(plan, i) {
    var day = plan.days[i];
    var ay = dayMonth(day);
    var cur = day.eslik;
    var ED = etkinVeri();
    var h = '<select id="sec-eslik">' + opt('', 'Eşlik yok', !cur);
    var seen = {};
    var g1 = '', j, y;
    if (day.ana) {
      var c = E.eslikAdaylari(etkinVeri(), day.ana, ay);
      for (j = 0; j < c.length; j++) { seen[c[j].ad] = true; g1 += opt(c[j].ad, c[j].ad, c[j].ad === cur); }
    }
    if (g1) { h += '<optgroup label="Bu yemeğe uyanlar">' + g1 + '</optgroup>'; }
    var cats = [['Çorba', 'Çorbalar'], ['Karbonhidrat', 'Karbonhidratlar']];
    for (var k = 0; k < cats.length; k++) {
      var g = '';
      for (j = 0; j < ED.yemekler.length; j++) {
        y = ED.yemekler[j];
        if (y.kategori !== cats[k][0] || seen[y.ad]) { continue; }
        if (y.siklik === 'Kapalı' && y.ad !== cur) { continue; }
        seen[y.ad] = true;
        g += opt(y.ad, y.ad, y.ad === cur);
      }
      if (g) { h += '<optgroup label="' + cats[k][1] + '">' + g + '</optgroup>'; }
    }
    if (cur && !seen[cur]) { h += opt(cur, cur, true); }
    return h + '</select>';
  }

  function panelHtml(plan, monday) {
    var i = state.panel;
    if (i < 0) { return '<div class="perde" data-eylem="kapat"></div><div class="panel"></div>'; }
    var day = plan.days[i];
    var date = E.addDays(monday, i);
    return '<div class="perde acik" data-eylem="kapat"></div>' +
      '<div class="panel acik">' +
      '<div class="panel-baslik">' + E.GUNLER[i] + ', ' + date.getDate() + ' ' + E.AYLAR[date.getMonth()] + '</div>' +
      '<div class="panel-alt">Şablon: ' + esc(effCat(plan, i)) + (day.locked ? ' · elle değiştirildi' : '') + '</div>' +
      '<label class="alan-ad">Ana yemek</label>' +
      '<div class="secim">' + anaSelectHtml(plan, i) + '</div>' +
      '<button class="btn btn-ikincil btn-tam" data-eylem="yeniden">' + IKON_YENILE + ' Bu günü yeniden seç</button>' +
      '<label class="alan-ad">Eşlik</label>' +
      '<div class="secim">' + eslikSelectHtml(plan, i) + '</div>' +
      '<label class="alan-ad">Kısayollar</label>' +
      '<div class="satir"><button class="btn btn-ikincil" data-eylem="bosalt">Günü boşalt</button>' +
      '<button class="btn btn-ikincil" data-eylem="disarida">Dışarıda yiyeceğiz</button></div>' +
      (day.locked ? '<button class="btn btn-metin" data-eylem="otomatik">Otomatiğe döndür</button>' : '') +
      '<div class="panel-kapat"><button class="btn btn-ana btn-tam" data-eylem="kapat">Tamam</button></div>' +
      '</div>';
  }

  function onayHtml(plan) {
    var o = state.onay;
    if (o === 'varsayilan') {
      return '<div class="onay acik"><div class="onay-kutu"><div class="onay-baslik">Varsayılana dönülsün mü?</div>' +
        '<div class="onay-metin">Tüm tercihlerin silinir; liste ve kurallar yemek-listesi’ndeki haline döner.</div>' +
        '<div class="onay-butonlar"><button class="btn btn-ana" data-eylem="onay-varsayilan">Evet, varsayılana dön</button>' +
        '<button class="btn btn-ikincil" data-eylem="onay-hayir">Vazgeç</button></div></div></div>';
    }
    var kutu = '<div class="onay-baslik">' + (o ? 'Haftayı yeniden dağıt?' : '') + '</div>' +
      '<div class="onay-metin">' + (o ? 'Elle değiştirdiğin ' + countLocked(plan) + ' gün var.' : '') + '</div>' +
      '<div class="onay-butonlar">' +
      '<button class="btn btn-ana" data-eylem="onay-tumu">Tamamını yeniden planla</button>' +
      '<button class="btn btn-ikincil" data-eylem="onay-koru">Değişiklikleri koru</button>' +
      '<button class="btn btn-ikincil" data-eylem="onay-hayir">Vazgeç</button></div>';
    return '<div class="onay' + (o ? ' acik' : '') + '"><div class="onay-kutu">' + kutu + '</div></div>';
  }

  function countLocked(plan) {
    var n = 0;
    for (var i = 0; i < 7; i++) { if (plan.days[i].locked) { n++; } }
    return n;
  }

  // iOS 9: ↻ karakteri her fontta yok; ikon inline SVG.
  var IKON_YENILE = '<svg class="ikon-yenile" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M13.2 8.4A5.2 5.2 0 1 1 11.6 4.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M12.4 1.4v3.3H9.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // iOS Safari'de :active stilleri ancak bir touchstart dinleyicisi varken çalışır.
  try { document.addEventListener('touchstart', function () {}, true); } catch (e) { /* yoksay */ }

  var app = document.createElement('div');
  app.className = 'app';
  root.appendChild(app);

  function render() {
    var monday = viewMonday();
    var plan = getPlan(monday, true);
    var tc = app.querySelector('.tercih');
    var st = tc ? tc.scrollTop : 0;
    app.innerHTML = headerHtml(monday) + weekHtml(plan, monday) +
      '<div class="alt-bar"><button class="tercih-ac" data-eylem="tercih-ac">Tercihler</button></div>' +
      panelHtml(plan, monday) + tercihHtml() + onayHtml(plan);
    if (st) { tc = app.querySelector('.tercih'); if (tc) { tc.scrollTop = st; } }
    applyTheme();
  }

  function applyTheme() {
    var h = hourNow();
    var gece = (h >= 21 || h < 7);
    var c = ' ' + (root.className || '') + ' ';
    var has = c.indexOf(' gece ') >= 0;
    if (gece && !has) { root.className = (root.className ? root.className + ' ' : '') + 'gece'; }
    if (!gece && has) { root.className = c.replace(' gece ', ' ').replace(/^\s+|\s+$/g, ''); }
  }

  // ---- Değişiklikler ----
  function commit() { saveStore(); render(); }

  function copyLocks(plan) {
    var L = {};
    for (var i = 0; i < 7; i++) {
      if (plan.days[i].locked) { L[String(i)] = { ana: plan.days[i].ana, eslik: plan.days[i].eslik }; }
    }
    return L;
  }

  function regenerate(keepLocks) {
    var monday = viewMonday();
    var key = E.dateKey(monday);
    var old = getPlan(monday, true);
    var locks = keepLocks ? copyLocks(old) : {};
    // Geçmiş günler (yenmiş yemekler) yeniden dağıtımda hiç değişmez.
    var tk = E.dateKey(today());
    var past = {};
    for (var i = 0; i < 7; i++) {
      if (old.days[i].tarih < tk && !locks[String(i)]) {
        locks[String(i)] = { ana: old.days[i].ana, eslik: old.days[i].eslik };
        past[i] = true;
      }
    }
    var np = E.planWeek(etkinVeri(), monday, {
      counter: (old.counter || 0) + 1,
      locked: locks,
      history: historyFor(key)
    });
    for (var j = 0; j < 7; j++) {
      if (past[j]) { np.days[j].locked = keepLocks ? !!old.days[j].locked : false; }
    }
    store.weeks[key] = np;
    state.panel = -1;
    commit();
  }

  function setDay(i, fn) {
    var plan = viewPlan();
    fn(plan, plan.days[i], i);
    commit();
  }

  function pickEslik(plan, i, ana) {
    var day = plan.days[i];
    var ay = dayMonth(day);
    var prev = i > 0 ? plan.days[i - 1].eslik : null;
    var cands = E.eslikAdaylari(etkinVeri(), ana, ay);
    var names = [];
    for (var k = 0; k < cands.length; k++) { names.push(cands[k].ad); }
    if (!names.length) { return null; }
    if (day.eslik && inList(names, day.eslik)) { return day.eslik; }
    var rng = E.mulberry32(E.hashStr(plan.monday + ':e:' + i + ':' + (new Date().getTime())));
    return E.eslikSec(etkinVeri(), ana, ay, rng, { prevEslik: prev });
  }

  function reroll(plan, i, lock) {
    var key = plan.monday;
    var np = E.rerollDay(etkinVeri(), plan, i, { history: historyFor(key) });
    np.days[i].locked = lock;
    store.weeks[key] = np;
  }

  function onEylem(a, el) {
    var plan, i;
    if (a === 'bu-hafta' || a === 'gelecek-hafta') {
      state.view = (a === 'bu-hafta') ? 0 : 1;
      state.panel = -1;
      state.onay = null;
      render();
    } else if (a === 'planla') {
      plan = viewPlan();
      if (countLocked(plan) > 0) { state.onay = 'planla'; render(); }
      else { regenerate(true); }
    } else if (a === 'onay-koru' || a === 'onay-tumu') {
      state.onay = null;
      regenerate(a === 'onay-koru');
    } else if (a === 'onay-hayir') {
      state.onay = null;
      render();
    } else if (a === 'kapat') {
      state.panel = -1;
      render();
    } else if (a === 'tercih-ac' || a === 'tercih-kapat') {
      state.tercih = (a === 'tercih-ac');
      state.panel = -1;
      state.onay = null;
      render();
    } else if (a === 'balik-gun') {
      balikGunDegis(parseInt(el.getAttribute('data-gun'), 10));
      render();
    } else if (a === 'tercih-varsayilan') {
      state.onay = 'varsayilan';
      render();
    } else if (a === 'onay-varsayilan') {
      tercih = { siklik: {}, agirliklar: {}, ayarlar: {}, esnek: {} };
      saveTercih();
      state.onay = null;
      render();
    } else if (state.panel >= 0) {
      i = state.panel;
      if (a === 'yeniden') {
        reroll(viewPlan(), i, true);
        commit();
      } else if (a === 'bosalt') {
        setDay(i, function (p, d) { d.ana = null; d.eslik = null; d.locked = true; });
      } else if (a === 'disarida') {
        setDay(i, function (p, d) { d.ana = DISARIDA; d.eslik = null; d.locked = true; });
      } else if (a === 'otomatik') {
        plan = viewPlan();
        plan.days[i].locked = false;
        reroll(plan, i, false);
        commit();
      }
    }
  }

  function onClick(e) {
    var el = e.target || e.srcElement;
    while (el && el !== app) {
      if (el.getAttribute) {
        var a = el.getAttribute('data-eylem');
        if (a === 'gun-yenile') {
          var gi = parseInt(el.getAttribute('data-gun'), 10);
          if (gi >= 0 && gi < 7) {
            reroll(viewPlan(), gi, true);
            commit();
          }
          return;
        }
        if (a) { onEylem(a, el); return; }
        var g = el.getAttribute('data-gun');
        if (g !== null && g !== '' && hasClass(el, 'gun')) {
          state.panel = parseInt(g, 10);
          render();
          return;
        }
      }
      el = el.parentNode;
    }
  }

  function onChange(e) {
    var el = e.target || e.srcElement;
    var i = state.panel;
    var tk = el && el.getAttribute ? el.getAttribute('data-tercih') : null;
    if (tk) { tercihDegis(tk, el.value); render(); return; }
    if (!el || i < 0) { return; }
    var v = el.value;
    if (el.id === 'sec-ana') {
      setDay(i, function (p, d) {
        d.ana = v || null;
        d.eslik = v ? pickEslik(p, i, v) : null;
        d.locked = true;
      });
    } else if (el.id === 'sec-eslik') {
      setDay(i, function (p, d) { d.eslik = v || null; d.locked = true; });
    }
  }

  app.addEventListener('click', onClick, false);
  app.addEventListener('change', onChange, false);

  // ---- Zamanlayıcılar ----
  function tick() {
    applyTheme();
    if (!testMode && E.dateKey(new Date()) !== startKey) {
      location.reload();
    }
  }
  loadStore();
  loadTercih();
  render();
  setInterval(tick, 60000);
  if (!testMode) {
    var n = new Date();
    var ms = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime() - n.getTime() + 1000;
    setTimeout(function () { location.reload(); }, ms);
  }

  window.YemekApp = {
    setNow: function (date) {
      nowOverride = date;
      state.view = 0;
      state.panel = -1;
      state.onay = null;
      state.tercih = false;
      render();
    },
    render: render
  };
})();
