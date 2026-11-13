# Haftalık Akşam Yemeği Planı — proje rehberi

Duvara sabitlenmiş iPad mini 1'de sürekli açık duran, 2 kişilik ev için haftalık akşam yemeği planı. Yapay zekâ yok; plan `yemek-listesi.md` tablolarından kurallarla üretilir.

Repo: `VarolEmin/varol`, proje klasörü `yemek/`. Branch: `main` (kullanıcı tercihi). Repo kökündeki `index.html` başka bir site, **dokunma**. Commit ve push yalnızca kullanıcı isteyince.

## 0. Roller ve çalışma biçimi

Lider: Opus 5.5 (planlar, karar verir, birleştirir, son incelemeyi yapar). Alt ajanlar `../.claude/agents/` altında:

| Ajan | Model | Görev | Kod değiştirir mi |
|---|---|---|---|
| `veri-kontrol` | haiku | `yemek-listesi.md` ve komut çıktılarını okuyup özetler, dosya arar | Hayır |
| `es5-gelistirici` | sonnet | engine.js, app.js, CSS, build scriptini yazar/düzeltir | Evet |
| `test-inceleme` | haiku | Build, test, ES5 kontrolü, ekran görüntüsü çalıştırır, raporlar | Hayır |

- Alt ajana dar ve tam görev ver: dosya yolları, kabul kriterleri, bu dosyanın bölüm numarası.
- Rapor en fazla 10 satır; dosya içeriği dökme, değişen dosya + komut + sonuç.
- Bağımsız işler paralel. Doğrulama komutla yapılır, kod okuyarak değil.
- Bir ajan iki denemede başaramazsa görev bölünür ya da lider düzeltir.

## 1. Hedef cihaz ve tarayıcı

iPad mini 1 (A1432), A5, 512 MB RAM, iOS 9.3.5, Mobile Safari 9, 1024×768 non-Retina, yatay.

**JavaScript (tarayıcıya giden her şey):** ES5. Yasak: let/const, arrow, class, default/rest param, spread, destructuring, for...of, template literal, async/await, generator, `?.`, `??`, ES modules. Yasak API: fetch (→ XMLHttpRequest), URLSearchParams, IntersectionObserver, ResizeObserver, Intl, `Array.prototype.includes`, `alert/confirm`. Serbest: Promise, JSON, localStorage (try/catch ile), querySelector, addEventListener, Math.imul, Object.keys, forEach/map/filter. Framework yok. Tarih: yalnızca `new Date(y, m, d)`; ISO string parse etme. Türkçe gün/ay adları elle.

**CSS:** Flexbox + `-webkit-` önekleri. Yok: Grid, flex `gap`, object-fit, `position: sticky` (yalnızca `-webkit-sticky`), backdrop-filter, aspect-ratio, CSS değişkenleri. `vh` kullanma.

**Ağ:** TLS 1.2 var, 1.3 yok. Let's Encrypt (ISRG Root X1) iOS 9'da güvenilmez. Çevrimdışı çalışmalı: tek dosya, veri gömülü, dış CDN/font yok; gerekirse AppCache `manifest`.

## 2. Araç zinciri (Node YOK — kullanıcı kararı)

Bu Mac'te Node yok ve kurulmayacak. Yalnızca sistemde hazır olanlar:
- **Python 3.9** (yalnız standart kütüphane): build ve kontroller.
- **JavaScriptCore `jsc`** (Safari'nin JS motoru): `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc` — engine testleri ve sözdizimi kontrolü.

Komutlar (`yemek/` içinden):
- `python3 scripts/build.py` → doğrular, `dist/index.html` üretir.
- `python3 scripts/test.py` → `tests/engine.test.js`'i jsc ile çalıştırır; sonda FREKANS RAPORU basar (ağırlık değişikliklerinde buna bak).
- `python3 scripts/check.py` → tarayıcı JS'i (inline dahil) için ES5 yasaklı sözdizimi/API taraması + jsc ile parse; CSS yasaklı özellik taraması.
- Ekran görüntüsü: Claude uygulamasının tarayıcı paneli 1024×768'e ayarlanarak (Playwright yok); telefon için 375×812.
- **Yayın:** `python3 scripts/build.py --yayin` → `yemek/index.html` + `yemek/yemek.appcache` (iOS 9 çevrimdışı önbellek, sürüm hash'li). Commit + push `main` → GitHub Pages: https://varolemin.github.io/varol/yemek/ . `dist/` git'e girmez.

**Sertifika (13.11.2026 openssl ile doğrulandı):** `*.github.io` → Let's Encrypt YR1 → Root YR → ISRG Root X1, TLS 1.2 var, HTTP 301 ile HTTPS'e yönleniyor (HSTS). iOS 9 ISRG Root X1'e güvenmez → iPad'e bir kez kök sertifika yüklenmeli: Safari'de `http://x1.i.lencr.org/` (SHA-256 96:BC:EC:06…08:C6) → profili yükle.

## Tercihler ekranı
En altta silik "Tercihler" bağlantısı → tam ekran ayarlar. localStorage `yemekPlani.tercih.v1`, yalnızca md/varsayılandan farklı değerler saklanır (cihaza özel). Uygulama her motor çağrısında `etkinVeri()` (YEMEK_DATA kopyası + tercihler) kullanır. Motor kural sabitlerini `data.ayarlar`'dan okur; varsayılanlar `YemekEngine.VARSAYILAN_AYARLAR` (tekrarHafta 2, seyrekBeklemeHafta 6, pratikKatsayi 0.15, haftaSonuPratikCarpan 2, tavukHaftasiCarpan 2, salcaFiltresi, tavukCorbaFiltresi). Tercih değişince mevcut planlar yeniden üretilmez.

## iOS 9 uyumluluk notları (13.11.2026 denetimi)
- Gerçek cihaz/simülatör yok (Xcode yok; güncel Xcode iOS 9 simülatörü desteklemez). Denetim: kullanılan tüm JS çağrıları ve CSS özellikleri Safari 9 desteğiyle karşılaştırıldı + `check.py` + jsc parse.
- Özel karakter ikonları (↻ vb.) kullanma: iOS 9 fontlarında olmayabilir → inline SVG.
- `:active` için app.js'te boş `touchstart` dinleyicisi var; silme.
- Click delegasyonu yapılan buton olmayan öğelere (`.gun`, `.perde`) `cursor: pointer` şart (iOS div'lerde click üretmez).

## Görsel kimlik
Adaçayı yeşili palet (parlak yeşil yok), vurgu soluk gül rengi; arka planda çok hafif inline SVG dal/çiçek süsleri (kozmos, papatya, lavanta, damarlı yaprak) — `python3 scripts/susler.py` üretir, style.css'te SUSLER bloğunu elle düzenleme. "Dünden devam" günlerinde yemek adı bilerek soluk. Telefonda (≤760px) tek sütun düzen.

## 3. Veri

`yemek-listesi.md` tek doğruluk kaynağı; 5 tablo: Yemekler, Kombinasyonlar, Haftalık Şablon, Sıklık Ağırlıkları, Kurallar. Kullanıcı düzenlemeye devam eder. **Kendiliğinden değiştirme**; veri sorunu görürsen sor. "X'i ekle / Y'yi çıkar" denince yalnızca bu dosyayı güncelle, build + test çalıştır, 3 satırla bildir.

`scripts/build.py` parse eder, doğrular, `dist/index.html` üretir (CSS, JS, veri inline).
**Hata (build durur, satır numaralı Türkçe mesaj):** bilinmeyen kategori/sıklık/taban/ay adı; Kombinasyonlar'da Yemekler'de olmayan ad (veya eşliğin Çorba/Karbonhidrat olmaması); tekrarlı yemek adı; şablonda eksik/tekrarlı gün; Evet/Hayır dışı değer.
**Uyarı (build sürer):** kombinasyonu olmayan ana yemek; bir ay × kategori için aday kalmaması.

## 4. Plan motoru (`src/engine.js`)

Saf ES5, DOM'a dokunmaz, UMD (tarayıcı + jsc testleri). Yalnızca akşam yemeği. Öğün = ana yemek + (çorba **veya** karbonhidrat) ya da tek başına; asla üç çeşit.

1. **Hafta döngüsü:** sabit `ANCHOR = 16.11.2026 Pazartesi = Hafta 1`. Döngü haftası = ((hafta farkı mod 4) + 4) mod 4 + 1 (öncesi tarihler de doğru).
2. **Mevsim:** günün ayı; mevsim dışı ana yemek ve eşlik seçilmez.
3. **Aday havuzu:** kategori tutar, Kapalı değil, mevsiminde, bu hafta seçilmemiş, son 2 haftada çıkmamış; Seyrek ise son 6 haftada çıkmamış (`SEYREK_BEKLEME_HAFTA`). Boşsa önce bu iki tekrar kuralı birlikte, sonra "bu hafta" kuralı gevşer.
4. **Seçim:** sıklık ağırlıklı rastgele (Sık 4, Normal 2, Seyrek 1, Kapalı 0 — tablodan okunur).
   **Esnek günler** (md tablo 6): Balık ve Dışarıda şablondaki güne sabit değil. Şablon birimlere ayrılır (gün + ardındaki "Dünden devam" = bölünmez çift), esnek birimler kalan dizinin boşluklarına yerleşir; Balık Çarşamba/Cuma'ya gelmez. Önce Balık günü eşit olasılıkla seçilir. Yerleşim tohumu yalnızca pazartesi tarihi → bir haftanın gün düzeni yeniden planlamada değişmez. `plan.days[i].kaynakKategori` devam gününün ait olduğu kategori.
5. **Dünden devam:** önceki günün ana yemeği gelir, yalnızca "2 gün yenir = Evet" ise; değilse önceki günün şablon kategorisinden yeni yemek. Eşlik önceki günden farklı; mümkünse türü de değişir (çorba ↔ karbonhidrat).
6. **Pratik yemekler:** kendi günleri yok. Sebze/Bakliyat/Tavuk/Et günlerinde havuza katılır, yalnızca ertesi gün "Dünden devam" değilse. Ağırlık × `PRATIK_KATSAYI` (0.15), Cumartesi/pazar ×2. Haftada en fazla 1 (hedef: haftaların ~%25'i).
7. **Tavuk haftası:** o hafta şablonda Tavuk günü varsa Sebze/Bakliyat seçiminde "Tavuklu olabilir = Evet" ağırlığı ×2.
8. **Eşlik:** yalnızca Kombinasyonlar'dan; mevsiminde ve Kapalı olmayanlar, sıklık ağırlıklı. Güvenlik ağı:
   - **Tavuk kategorisindeki** ana yemeğe tavuklu çorba (Çorba + Tavuklu olabilir = Evet) gelmez. (Kullanıcı kararı: kural yalnızca Tavuk kategorisi için; tavuklu olabilir sebze/bakliyata uygulanmaz.)
   - Ana yemek Salçalı ise Salçalı eşlik gelmez; seçenek kalmazsa bu filtre gevşer.
   - Salata bowl, Dışarıda, Yeni tarif günlerine eşlik gelmez.
9. **Tohumlu rastgelelik:** mulberry32, tohum = hash(pazartesi tarihi `YYYY-MM-DD` + yeniden üretme sayacı). Aynı hafta aynı plan.

## 5. Arayüz (`src/app.js`, `src/style.css`)

- Duvar görünümü: üstte bugünün tarihi + bugünün yemeği çok büyük; altında 7 gün, bugün vurgulu, geçmiş soluk. 1024×768 yatayda kaydırmasız. Dokunma hedefi ≥ 44px.
- "Haftanın planını yap": haftayı dağıtır, kaydeder; elle değişmiş gün varsa sayfa içi onay: "Tamamını yeniden planla" / "Değişiklikleri koru" / "Vazgeç". ("Tümünü sıfırla" butonu kaldırıldı; döngü haftası ve "Yarın" satırı gösterilmez.)
- Gün kartında tam gün adı + ↻ ikonu: panel açmadan yalnızca o günü yeniden seçer (elle sayılır).
- Gün düzenleme paneli: Ana yemek `<select>` (önce aynı kategori, sonra diğerleri, optgroup) + "Bu günü yeniden seç"; Eşlik `<select>` ("Eşlik yok", o yemeğin kombinasyonları, sonra tüm çorba/karbonhidrat); kısayollar "Günü boşalt", "Dışarıda yiyeceğiz". Elle değişen günler yeniden üretimde korunur; "Tümünü sıfırla" var.
- Yeniden dağıtımda geçmiş günler (bugünden önceki) hiç değişmez.
- "Bu hafta / Gelecek hafta" sekmesi (alışveriş planı için); açılışta hep "Bu hafta".
- Test parametreleri: `?tarih=YYYY-MM-DD&saat=HH` (bugünü ve saati taklit eder, yenileme zamanlayıcısını kapatır).
- O hafta plan yoksa otomatik üret. Gece 00:00'da sayfa yenilenir.
- localStorage `yemekPlani.v1`; son 6 hafta saklanır.
- 21:00–07:00 koyu, düşük parlaklık tema.
- `apple-mobile-web-app-capable` meta.

## 6. Aşamalar

1. CLAUDE.md, alt ajanlar, `scripts/build.py`; mevcut liste hatasız geçer.
2. `src/engine.js` + `tests/engine.test.js` (jsc). 52 haftalık simülasyon: her hafta balık; mevsim dışı yok; Tavuk kategorisine tavuklu çorba yok; haftada ≤ 1 pratik; son 2 haftada çıkan tekrar yok (gevşeme hariç); Dünden devam doğru; tavuk haftalarında ikinci tavuklu yemek oranı daha yüksek.
3. **Tasarım — başlamadan önce kullanıcıdan onay al** (taslak/mockup göster). Sonra `src/app.js`, `src/style.css`.
4. Doğrulama: `check.py` (ES5 + CSS), 1024×768 ekran görüntüleri (normal + panel açık), kullanıcıya göster.
5. Barındırma: iOS 9'da açılabilecek seçenekleri araştır (öncelik GitHub Pages `varolemin.github.io/varol/yemek/`); kök sertifikayı `openssl s_client` ile doğrula; 2–3 seçenek sun, karar kullanıcının; yayın adımlarını anlat.

Kullanıcıyla iletişim Türkçe. Aşama 1–2 arka arkaya; aşama 3 öncesi onay.
