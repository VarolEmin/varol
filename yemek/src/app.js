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
  var D = window.YEMEK_DATA;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var root = document.body;
  if (!E || !D || !D.yemekler || !D.sablon) {
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
    p = E.planWeek(D, monday, { counter: 0, history: historyFor(key) });
    store.weeks[key] = p;
    saveStore();
    return p;
  }

  // ---- Veri yardımcıları ----
  var byName = {};
  (function () {
    for (var i = 0; i < D.yemekler.length; i++) { byName[D.yemekler[i].ad] = D.yemekler[i]; }
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
  var state = { view: 0, panel: -1, onay: null };
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
        '<span class="gun-yenile-ikon">↻</span></button></li>';
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
    var h = '<select id="sec-ana">' + opt('', '— Boş —', !day.ana);
    var seen = {};
    for (k = 0; k < order.length; k++) {
      var cat = order[k];
      var inS = '', outS = '';
      for (var j = 0; j < D.yemekler.length; j++) {
        var y = D.yemekler[j];
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
    var h = '<select id="sec-eslik">' + opt('', 'Eşlik yok', !cur);
    var seen = {};
    var g1 = '', j, y;
    if (day.ana) {
      var c = E.eslikAdaylari(D, day.ana, ay);
      for (j = 0; j < c.length; j++) { seen[c[j].ad] = true; g1 += opt(c[j].ad, c[j].ad, c[j].ad === cur); }
    }
    if (g1) { h += '<optgroup label="Bu yemeğe uyanlar">' + g1 + '</optgroup>'; }
    var cats = [['Çorba', 'Çorbalar'], ['Karbonhidrat', 'Karbonhidratlar']];
    for (var k = 0; k < cats.length; k++) {
      var g = '';
      for (j = 0; j < D.yemekler.length; j++) {
        y = D.yemekler[j];
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
      '<button class="btn btn-ikincil btn-tam" data-eylem="yeniden">↻ Bu günü yeniden seç</button>' +
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

  var app = document.createElement('div');
  app.className = 'app';
  root.appendChild(app);

  function render() {
    var monday = viewMonday();
    var plan = getPlan(monday, true);
    app.innerHTML = headerHtml(monday) + weekHtml(plan, monday) + panelHtml(plan, monday) + onayHtml(plan);
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
    var np = E.planWeek(D, monday, {
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
    var cands = E.eslikAdaylari(D, ana, ay);
    var names = [];
    for (var k = 0; k < cands.length; k++) { names.push(cands[k].ad); }
    if (!names.length) { return null; }
    if (day.eslik && inList(names, day.eslik)) { return day.eslik; }
    var rng = E.mulberry32(E.hashStr(plan.monday + ':e:' + i + ':' + (new Date().getTime())));
    return E.eslikSec(D, ana, ay, rng, { prevEslik: prev });
  }

  function reroll(plan, i, lock) {
    var key = plan.monday;
    var np = E.rerollDay(D, plan, i, { history: historyFor(key) });
    np.days[i].locked = lock;
    store.weeks[key] = np;
  }

  function onEylem(a) {
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
        if (a) { onEylem(a); return; }
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
      render();
    },
    render: render
  };
})();
