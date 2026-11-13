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
check('e2) gevşeme nadir (<%10)', relaxedN < 0.10 * 364, String(relaxedN));

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
      if (BY[d.ana].kategori !== prev.kategori) { errs.push(d.tarih + ' kategori ' + BY[d.ana].kategori + '!=' + prev.kategori); }
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

print('');
print('OZET: ' + passN + ' PASS, ' + failN + ' FAIL');
