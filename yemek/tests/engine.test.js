/* jsc altında çalışır: prelude (var DATA), src/engine.js, bu dosya. */
var E = YemekEngine;
var passN = 0, failN = 0;

function check(name, cond, detail) {
  if (cond) { passN++; print('PASS ' + name); }
  else { failN++; print('FAIL ' + name + (detail ? ' -- ' + detail : '')); }
}

var BY = {};
DATA.yemekler.forEach(function (y) { BY[y.ad] = y; });

function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
var START = new Date(2026, 10, 16);

function simulate(counter, weeks) {
  var plans = [], history = [];
  for (var w = 0; w < weeks; w++) {
    var p = E.planWeek(DATA, addDays(START, 7 * w), { history: history, counter: counter });
    plans.push(p);
    history.push(p);
  }
  return plans;
}

function ayOf(day) { return E.parseKey(day.tarih).getMonth() + 1; }
function names(plan) { return plan.days.map(function (d) { return d.ana; }); }

var plans = simulate(0, 52);
var errs;

// a) her hafta Balık
errs = [];
plans.forEach(function (p) {
  var n = p.days.filter(function (d) { return d.ana && BY[d.ana].kategori === 'Balık'; }).length;
  if (n < 1) { errs.push(p.monday); }
});
check('a) her hafta en az bir Balık', errs.length === 0, errs.join(','));

// b) mevsim
errs = [];
plans.forEach(function (p) {
  p.days.forEach(function (d) {
    var ay = ayOf(d);
    if (d.ana && !E.inSeason(BY[d.ana], ay)) { errs.push(d.tarih + ' ' + d.ana); }
    if (d.eslik && !E.inSeason(BY[d.eslik], ay)) { errs.push(d.tarih + ' ' + d.eslik); }
  });
});
check('b) mevsim dışı ana/eşlik yok', errs.length === 0, errs.slice(0, 5).join(', '));

// c) Tavuk kategorisine tavuklu çorba yok
errs = [];
plans.forEach(function (p) {
  p.days.forEach(function (d) {
    if (d.ana && d.eslik && BY[d.ana].kategori === 'Tavuk' && BY[d.eslik].kategori === 'Çorba' && BY[d.eslik].tavuklu) { errs.push(d.tarih); }
  });
});
check('c) Tavuk + tavuklu çorba yok', errs.length === 0, errs.join(','));

// d) haftada <= 1 Pratik
errs = [];
var pratikToplam = 0;
plans.forEach(function (p) {
  var n = p.days.filter(function (d) { return d.ana && BY[d.ana].kategori === 'Pratik'; }).length;
  pratikToplam += n;
  if (n > 1) { errs.push(p.monday + ':' + n); }
});
check('d) haftada en fazla 1 Pratik (toplam ' + pratikToplam + ')', errs.length === 0, errs.join(','));

// e) son 2 haftada çıkan tekrar yok (gevşeme hariç)
errs = [];
var relaxedN = 0, checkedN = 0;
plans.forEach(function (p, i) {
  var prior = {};
  [1, 2].forEach(function (k) {
    if (i - k >= 0) { names(plans[i - k]).forEach(function (n) { if (n) { prior[n] = true; } }); }
  });
  p.days.forEach(function (d) {
    if (d.locked) { return; }
    if (d.relaxed) { relaxedN++; return; }
    checkedN++;
    if (d.ana && prior[d.ana]) { errs.push(d.tarih + ' ' + d.ana); }
  });
});
check('e) son 2 hafta tekrarı yok (' + checkedN + ' gün denetlendi, ' + relaxedN + ' gevşemiş)', errs.length === 0, errs.slice(0, 5).join(', '));
// Yazın yalnızca 2 balık var (13.11.2026 kullanıcı kararı: tekrar kabul) -> eşik %15.
check('e2) gevşeme nadir (<%15)', relaxedN < 0.15 * 364, String(relaxedN));

// f) Dünden devam
errs = [];
var devamN = 0;
plans.forEach(function (p) {
  p.days.forEach(function (d, i) {
    if (d.kategori !== 'Dünden devam') { return; }
    devamN++;
    var prev = p.days[i - 1];
    var py = BY[prev.ana];
    if (py.ikiGun && E.inSeason(py, ayOf(d))) {
      if (d.ana !== prev.ana) { errs.push(d.tarih + ' aynı ana değil'); }
      if (prev.eslik && d.eslik === prev.eslik) { errs.push(d.tarih + ' aynı eşlik'); }
    } else {
      if (d.ana === prev.ana) { errs.push(d.tarih + ' ana tekrarı'); }
      if (BY[d.ana].kategori !== d.kaynakKategori) { errs.push(d.tarih + ' kategori ' + BY[d.ana].kategori + '!=' + d.kaynakKategori); }
    }
  });
});
check('f) Dünden devam kuralı (' + devamN + ' gün)', errs.length === 0 && devamN > 0, errs.slice(0, 5).join(', '));

// g) tavuk haftalarında tavuklu Sebze/Bakliyat oranı
var tv = { yes: [0, 0], no: [0, 0] };
for (var c = 0; c < 20; c++) {
  simulate(c, 52).forEach(function (p) {
    var tavukHaftasi = p.days.some(function (d) { return d.kategori === 'Tavuk'; });
    var bucket = tavukHaftasi ? tv.yes : tv.no;
    p.days.forEach(function (d) {
      if (d.kategori === 'Sebze yemeği' || d.kategori === 'Bakliyat') {
        bucket[1]++;
        if (d.ana && BY[d.ana].tavuklu) { bucket[0]++; }
      }
    });
  });
}
var rYes = tv.yes[0] / tv.yes[1], rNo = tv.no[0] / tv.no[1];
check('g) tavuk haftası tavuklu oranı yüksek (' + rYes.toFixed(3) + ' > ' + rNo.toFixed(3) + ')', rYes > rNo);

// h) determinizm
var a1 = JSON.stringify(simulate(7, 10)), a2 = JSON.stringify(simulate(7, 10));
check('h) aynı girdi aynı plan', a1 === a2);
check('h2) farklı sayaç farklı plan', JSON.stringify(simulate(8, 10)) !== a1);

// i) locked günler
var lk = E.planWeek(DATA, new Date(2026, 10, 16), { counter: 3, locked: { '2': { ana: 'Nohut', eslik: 'Pirinç pilavı' }, '4': { ana: 'Dışarıda yemek', eslik: null } } });
var cnt = names(lk).filter(function (n, i) { return n === 'Nohut' && i !== 2 && i !== 3; }).length; // Perşembe = Dünden devam
check('i) locked günler korunuyor', lk.days[2].ana === 'Nohut' && lk.days[2].eslik === 'Pirinç pilavı' && lk.days[2].locked && lk.days[4].ana === 'Dışarıda yemek' && lk.days[4].eslik === null);
check('i2) locked yemek (devam günü hariç) tekrar seçilmiyor', cnt === 0, String(cnt));
var rr = E.rerollDay(DATA, lk, 0, { history: [], counter: 3 });
check('i3) rerollDay locked olmayan günü değiştirir, locked kalır', rr.days[0].ana !== lk.days[0].ana && rr.days[2].ana === 'Nohut' && rr.days[4].ana === 'Dışarıda yemek');
var rrOk = true;
for (var q = 0; q < 30; q++) {
  var base = plans[q % 52];
  var di = q % 7;
  var np = E.rerollDay(DATA, base, di, {});
  if (np.days[di].ana === null || !E.inSeason(BY[np.days[di].ana], ayOf(np.days[di]))) { rrOk = false; }
}
check('i4) rerollDay geçerli seçim üretir', rrOk);

// j) döngü haftası
check('j) cycleWeek 16.11.2026=1', E.cycleWeek(new Date(2026, 10, 16)) === 1);
check('j) cycleWeek 23.11.2026=2', E.cycleWeek(new Date(2026, 10, 23)) === 2);
check('j) cycleWeek 09.11.2026=4', E.cycleWeek(new Date(2026, 10, 9)) === 4);
check('j) cycleWeek hafta içi gün aynı hafta', E.cycleWeek(new Date(2026, 10, 22)) === 1);
check('j) dateKey/mondayOf', E.dateKey(E.mondayOf(new Date(2026, 10, 22))) === '2026-11-16');

// k) üç çeşit yok, eşliksiz kategoriler
errs = [];
plans.forEach(function (p) {
  p.days.forEach(function (d) {
    if (d.ana && ['Salata bowl', 'Dışarıda', 'Yeni tarif'].indexOf(BY[d.ana].kategori) >= 0 && d.eslik !== null) { errs.push(d.tarih); }
    if (d.eslik && BY[d.eslik].kategori !== 'Çorba' && BY[d.eslik].kategori !== 'Karbonhidrat') { errs.push(d.tarih + ' eşlik türü'); }
    if (d.hasOwnProperty('ucuncu')) { errs.push(d.tarih + ' üçüncü'); }
  });
});
check('k) eşliksiz kategorilerde eşlik yok, eşlik tek ve çorba/karbonhidrat', errs.length === 0, errs.join(','));

// l) eşlik kombinasyondan
errs = [];
plans.forEach(function (p) {
  p.days.forEach(function (d) {
    if (d.eslik && (DATA.kombinasyonlar[d.ana] || []).indexOf(d.eslik) < 0) { errs.push(d.tarih + ' ' + d.ana + '/' + d.eslik); }
  });
});
check('l) eşlik ana yemeğin kombinasyonlarından', errs.length === 0, errs.slice(0, 5).join(', '));

// m) Esnek günler
var GUNSAY = function (arr) { var o = {}; arr.forEach(function (g) { o[g] = (o[g] || 0) + 1; }); return o; };
var MULTI = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
var allPlans = [];
MULTI.forEach(function (c) { allPlans = allPlans.concat(simulate(c, 52)); });
function katDays(plan, kat) {
  var r = [];
  plan.days.forEach(function (d, i) { if (d.kategori === kat) { r.push(i); } });
  return r;
}
errs = [];
allPlans.forEach(function (p) {
  var b = katDays(p, 'Balık');
  if (b.length !== 1 || b[0] === 2 || b[0] === 4) { errs.push(p.monday + ':' + b.join('/')); }
});
check('m-a) Balık Çarşamba/Cuma değil, haftada tam 1 (' + allPlans.length + ' hafta)', errs.length === 0, errs.slice(0, 5).join(', '));

var balikG = {}, disG = {};
allPlans.forEach(function (p) {
  katDays(p, 'Balık').forEach(function (i) { balikG[i] = true; });
  katDays(p, 'Dışarıda').forEach(function (i) { disG[i] = true; });
});
check('m-b) Balık >= 3 farklı güne düşüyor (' + Object.keys(balikG).join(',') + ')', Object.keys(balikG).length >= 3);
check('m-b2) Dışarıda >= 3 farklı güne düşüyor (' + Object.keys(disG).join(',') + ')', Object.keys(disG).length >= 3);

function sortedCats(p) { return p.days.map(function (d) { return d.kategori; }).sort().join('|'); }
errs = [];
allPlans.forEach(function (p) {
  var t = DATA.sablon[String(p.cycleWeek)].map(function (o) { return o.kategori; }).sort().join('|');
  if (sortedCats(p) !== t) { errs.push(p.monday + ' çok-küme'); }
  p.days.forEach(function (d, i) {
    if (d.kategori === 'Dünden devam') {
      var pr = p.days[i - 1];
      if (!pr || d.kaynakKategori !== (pr.kaynakKategori || pr.kategori) || pr.kaynakKategori === 'Dünden devam') { errs.push(d.tarih + ' devam'); }
    } else if (d.kaynakKategori !== d.kategori) { errs.push(d.tarih + ' kaynak'); }
  });
});
check('m-c) devam günü biriminin arkasında, kategori çok-kümesi şablonla aynı', errs.length === 0, errs.slice(0, 5).join(', '));

errs = [];
allPlans.slice(0, 120).forEach(function (p, q) {
  var di = q % 7;
  var np = E.rerollDay(DATA, p, di, {});
  var np2 = E.rerollDay(DATA, np, (di + 3) % 7, {});
  if (JSON.stringify(np.days.map(function (d) { return [d.kategori, d.kaynakKategori]; })) !== JSON.stringify(p.days.map(function (d) { return [d.kategori, d.kaynakKategori]; }))) { errs.push(p.monday); }
  if (JSON.stringify(np2.days.map(function (d) { return d.kategori; })) !== JSON.stringify(p.days.map(function (d) { return d.kategori; }))) { errs.push(p.monday + ' x2'); }
});
check('m-d) rerollDay kategori düzenini değiştirmiyor', errs.length === 0, errs.slice(0, 5).join(', '));

// e) frekans simülasyonu: 200 tohum x 52 hafta
var SIM = frekansSim(200, 52);
function frekansSim(seeds, weeks) {
  var cnt = {}, eslikCnt = {}, pratikHafta = 0, haftaN = 0, balikGun = [0, 0, 0, 0, 0, 0, 0], disGun = [0, 0, 0, 0, 0, 0, 0], disN = 0;
  for (var s = 0; s < seeds; s++) {
    simulate(s, weeks).forEach(function (p) {
      haftaN++;
      var pr = false;
      p.days.forEach(function (d, i) {
        if (d.ana) {
          cnt[d.ana] = (cnt[d.ana] || 0) + 1;
          if (BY[d.ana].kategori === 'Pratik') { pr = true; }
        }
        if (d.eslik) { eslikCnt[d.eslik] = (eslikCnt[d.eslik] || 0) + 1; }
        if (d.kategori === 'Balık') { balikGun[i]++; }
        if (d.kategori === 'Dışarıda') { disGun[i]++; disN++; }
      });
      if (pr) { pratikHafta++; }
    });
  }
  return { cnt: cnt, eslikCnt: eslikCnt, pratikOran: pratikHafta / haftaN, balikGun: balikGun, disGun: disGun, disN: disN, haftaN: haftaN, seeds: seeds };
}
check('m-e) haftalık pratik oranı <= %45 (' + (SIM.pratikOran * 100).toFixed(1) + '%)', SIM.pratikOran <= 0.45);
var katlar = {};
function ortYil(l) { var t = 0; l.forEach(function (y) { t += (SIM.cnt[y.ad] || 0); }); return t / l.length / SIM.seeds; }
DATA.yemekler.forEach(function (y) { if (y.siklik !== 'Kapalı') { (katlar[y.kategori] = katlar[y.kategori] || []).push(y); } });
errs = [];
var cmpN = 0, perKat = [];
Object.keys(katlar).forEach(function (k) {
  var sik = katlar[k].filter(function (y) { return y.siklik === 'Sık'; });
  var sey = katlar[k].filter(function (y) { return y.siklik === 'Seyrek'; });
  if (sik.length < 2 || !sey.length || k === 'Çorba' || k === 'Karbonhidrat') { return; }
  cmpN++;
  var a = ortYil(sey), b = ortYil(sik);
  perKat.push(k + ' ' + a.toFixed(1) + '/' + b.toFixed(1));
  if (!(a <= b / 2)) { errs.push(k + ' seyrek ' + a.toFixed(2) + ' sık ' + b.toFixed(2)); }
});
check('m-e2) Seyrek ort. <= Sık ort./2 (' + perKat.join(', ') + ')', cmpN > 0 && errs.length === 0, errs.join('; '));
check('m-e3) haftalık pratik oranı %20-30 (' + (SIM.pratikOran * 100).toFixed(1) + '%)', SIM.pratikOran >= 0.20 && SIM.pratikOran <= 0.30);

// Seyrek bekleme: 6 hafta içinde iki kez çıkmaz (gevşemeyen günlerde)
errs = [];
for (var sd = 0; sd < 20; sd++) {
  var sp = simulate(sd, 52);
  sp.forEach(function (p, i) {
    p.days.forEach(function (d) {
      if (d.locked || d.relaxed || !d.ana || BY[d.ana].siklik !== 'Seyrek') { return; }
      for (var k = 1; k <= 6; k++) {
        if (i - k >= 0 && names(sp[i - k]).indexOf(d.ana) >= 0) { errs.push(sd + ':' + d.tarih + ' ' + d.ana); return; }
      }
    });
  });
}
check('m-f) Seyrek ana yemek 6 hafta içinde tekrar etmiyor', errs.length === 0, errs.slice(0, 5).join(', '));
// yerleşim tohumu yalnız tarihe bağlı: dağılım için 520 farklı hafta
var bg = [0, 0, 0, 0, 0, 0, 0];
for (var bw = 0; bw < 520; bw++) {
  E.planWeek(DATA, addDays(START, 7 * bw), { counter: 0 }).days.forEach(function (d, i) { if (d.kategori === 'Balık') { bg[i]++; } });
}
errs = [];
[0, 1, 3, 5, 6].forEach(function (g) { if (bg[g] / 520 < 0.08) { errs.push(g + ':' + (100 * bg[g] / 520).toFixed(1)); } });
check('m-g) Balık günü dağılımı her izinli gün >= %8 (Sal/Per şablon yapısı gereği düşük kalır)', errs.length === 0, errs.join(','));

// n) yerleşim counter'dan bağımsız; geçmiş günler kilitliyken de düzen bozulmaz
errs = [];
var lockErrs = [];
for (var wk = 0; wk < 52; wk++) {
  var mon = addDays(START, 7 * wk);
  var base0 = E.planWeek(DATA, mon, { counter: 0 });
  var cat0 = base0.days.map(function (d) { return d.kategori + '/' + d.kaynakKategori; }).join('|');
  var lockedW = { '0': { ana: base0.days[0].ana, eslik: base0.days[0].eslik }, '1': { ana: base0.days[1].ana, eslik: base0.days[1].eslik } };
  for (var cc = 0; cc <= 20; cc++) {
    var pc = E.planWeek(DATA, mon, { counter: cc });
    if (pc.days.map(function (d) { return d.kategori + '/' + d.kaynakKategori; }).join('|') !== cat0) { errs.push(wk + ':' + cc); }
    var pl = E.planWeek(DATA, mon, { counter: cc, locked: lockedW });
    var nb = pl.days.filter(function (d) { return d.kategori === 'Balık'; }).length;
    if (nb !== 1) { lockErrs.push(wk + ':' + cc + ' balık ' + nb); }
    for (var di = 2; di < 7; di++) {
      if (pl.days[di].ana && pl.days[di].ana === pl.days[di - 1].ana && pl.days[di].ana === pl.days[di - 2].ana) { lockErrs.push(wk + ':' + cc + ' 3 gün ' + pl.days[di].ana); }
    }
    for (di = 1; di < 7; di++) {
      if (pl.days[di].kategori !== 'Dünden devam' && pl.days[di].ana && pl.days[di].ana === pl.days[di - 1].ana) { lockErrs.push(wk + ':' + cc + ' devam dışı tekrar ' + pl.days[di].ana); }
    }
  }
}
check('n) yerleşim counter 0..20 için aynı', errs.length === 0, errs.slice(0, 5).join(', '));
check('n2) Pzt-Sal kilitliyken her hafta 1 balık, 3 gün tekrar yok', lockErrs.length === 0, lockErrs.slice(0, 5).join(', '));


// ---- Ayarlar (data.ayarlar) ----
function kopya(ek) {
  var d = JSON.parse(JSON.stringify(DATA));
  if (ek) { ek(d); }
  return d;
}
function simData(d, seeds, weeks) {
  var all = [];
  for (var s = 0; s < seeds; s++) {
    var h = [];
    for (var w = 0; w < weeks; w++) {
      var p = E.planWeek(d, addDays(START, 7 * w), { history: h, counter: s });
      h.push(p); all.push(p);
    }
  }
  return all;
}
function sayDay(ps, fn) {
  var n = 0;
  ps.forEach(function (p) { p.days.forEach(function (d) { if (fn(d)) { n++; } }); });
  return n;
}
check('n-a) ayarlar(data) varsayılanları birleştirir', E.ayarlar(DATA).tekrarHafta === 2 && E.ayarlar({ ayarlar: { tekrarHafta: 0 } }).tekrarHafta === 0 && E.ayarlar({ ayarlar: { tekrarHafta: 0 } }).seyrekBeklemeHafta === 6 && E.VARSAYILAN_AYARLAR.salcaFiltresi === true);

var dP = kopya(function (d) { d.ayarlar = { pratikKatsayi: 0 }; });
var pn = sayDay(simData(dP, 3, 52), function (d) { return d.ana && BY[d.ana].kategori === 'Pratik'; });
check('n-b) pratikKatsayi 0 → hiç pratik yok', pn === 0, String(pn));

var dT = kopya(function (d) { d.ayarlar = { tekrarHafta: 0, seyrekBeklemeHafta: 0 }; });
var tp = simData(dT, 3, 52);
var tr = sayDay(tp, function (d) { return d.relaxed; });
check('n-c) tekrarHafta 0 & seyrek 0 → çalışır, gevşeme yok', tp.length === 156 && tr === 0, String(tr));

function salcaCift(ps) {
  return sayDay(ps, function (d) { return d.ana && d.eslik && BY[d.ana].taban === 'Salçalı' && BY[d.eslik].kategori === 'Çorba'; });
}
// Gerçek veride Salçalı-Salçalı kombinasyonu yok; kopyada tüm çorbaları Salçalı yap.
function salcaVeri(ek) {
  return kopya(function (d) {
    d.yemekler.forEach(function (y) { if (y.kategori === 'Çorba') { y.taban = 'Salçalı'; } });
    d.ayarlar = ek;
  });
}
var scAcik = salcaCift(simData(salcaVeri({}), 4, 52));
var scKapali = salcaCift(simData(salcaVeri({ salcaFiltresi: false }), 4, 52));
check('n-d) salcaFiltresi false → Salçalı-Salçalı görülür (' + scKapali + '), açıkken daha az (' + scAcik + ')', scKapali > 0 && scKapali > scAcik);

var kapali = null;
DATA.yemekler.forEach(function (y) { if (!kapali && y.kategori === 'Balık' && y.siklik === 'Sık') { kapali = y.ad; } });
var dK = kopya(function (d) { d.yemekler.forEach(function (y) { if (y.ad === kapali) { y.siklik = 'Kapalı'; } }); });
var kc = sayDay(simData(dK, 2, 52), function (d) { return d.ana === kapali; });
check('n-e) siklik Kapalı yapılan veri kopyası → ' + kapali + ' hiç çıkmaz', kc === 0, String(kc));

var dB = kopya(function (d) { d.esnek['Balık'].yasak = [0, 1, 2, 3, 4, 5, 6]; });
var bp = simData(dB, 2, 52);
var bn = 0;
bp.forEach(function (p) { if (!p.days.some(function (d) { return d.ana && BY[d.ana].kategori === 'Balık'; })) { bn++; } });
check('n-f) Balık yasak [0..6] → çökme yok, her hafta balık', bp.length === 104 && bn === 0, String(bn));

var dW = kopya(function (d) { d.agirliklar = { 'Sık': 1, 'Normal': 1, 'Seyrek': 1, 'Kapalı': 0 }; });
function seyrekOran(d) {
  var ps = simData(d, 3, 52);
  var tot = sayDay(ps, function (x) { return x.ana; });
  return sayDay(ps, function (x) { return x.ana && BY[x.ana].siklik === 'Seyrek'; }) / tot;
}
var so0 = seyrekOran(DATA), so1 = seyrekOran(dW);
check('n-g) ağırlıklar eşitlenince Seyrek oranı yükselir (' + so0.toFixed(3) + ' → ' + so1.toFixed(3) + ')', so1 > so0);

print('');
print('OZET: ' + passN + ' PASS, ' + failN + ' FAIL');

print('');
print('=== FREKANS RAPORU (' + SIM.seeds + ' tohum x 52 hafta; yılda ortalama çıkış) ===');
Object.keys(katlar).forEach(function (k) {
  if (['Çorba', 'Karbonhidrat'].indexOf(k) >= 0) { return; }
  print('[' + k + ']');
  katlar[k].slice().sort(function (x, y) { return (SIM.cnt[y.ad] || 0) - (SIM.cnt[x.ad] || 0); }).forEach(function (y) {
    print('  ' + y.ad + ' (' + y.siklik + '): ' + ((SIM.cnt[y.ad] || 0) / SIM.seeds).toFixed(1));
  });
});
// mevsimindeyken haftalık çıkma oranı
var mevsimHafta = function (y) {
  var n = 0;
  for (var dd = 0; dd < 364; dd++) { if (E.inSeason(y, addDays(START, dd).getMonth() + 1)) { n++; } }
  return n / 7;
};
function oran(y) { var h = mevsimHafta(y); return h ? (SIM.cnt[y.ad] || 0) / SIM.seeds / h : 0; }
print('--- Mevsimindeyken haftalık çıkma oranı (yılda çıkış / mevsimdeki hafta) ---');
Object.keys(katlar).forEach(function (k) {
  if (['Çorba', 'Karbonhidrat'].indexOf(k) >= 0) { return; }
  print('[' + k + '] ' + katlar[k].map(function (y) { return y.ad + ' (' + y.siklik + ') ' + oran(y).toFixed(2); }).join('; '));
});
print('--- Kategori bazında Sık/Normal/Seyrek ortalamaları (yıllık çıkış | mevsimli haftalık oran) ---');
Object.keys(katlar).forEach(function (k) {
  if (['Çorba', 'Karbonhidrat'].indexOf(k) >= 0) { return; }
  var parts = [];
  ['Sık', 'Normal', 'Seyrek'].forEach(function (sk) {
    var l = katlar[k].filter(function (y) { return y.siklik === sk; });
    if (!l.length) { return; }
    var r = 0; l.forEach(function (y) { r += oran(y); });
    parts.push(sk + ' ' + ortYil(l).toFixed(1) + ' | ' + (r / l.length).toFixed(2));
  });
  print('[' + k + '] ' + parts.join('; '));
});
print('Haftalık pratik oranı: %' + (SIM.pratikOran * 100).toFixed(1));
var gn = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
function dag(arr, tot) { return arr.map(function (v, i) { return gn[i] + ' %' + (tot ? (100 * v / tot).toFixed(1) : '0.0'); }).join(', '); }
print('Balık günü dağılımı: ' + dag(SIM.balikGun, SIM.haftaN));
print('Dışarıda günü dağılımı: ' + dag(SIM.disGun, SIM.disN));
print('En sık 10 eşlik:');
Object.keys(SIM.eslikCnt).sort(function (x, y) { return SIM.eslikCnt[y] - SIM.eslikCnt[x]; }).slice(0, 10).forEach(function (n) {
  print('  ' + n + ': ' + (SIM.eslikCnt[n] / SIM.seeds).toFixed(1));
});
