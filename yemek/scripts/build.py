#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""yemek-listesi.md -> dist/data.json + dist/index.html (yalnız standart kütüphane)."""
import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

KATEGORILER = ["Sebze yemeği", "Bakliyat", "Tavuk", "Et", "Balık", "Pratik", "Salata bowl",
               "Dışarıda", "Yeni tarif", "Çorba", "Karbonhidrat"]
ESLIK_KATEGORILERI = ("Çorba", "Karbonhidrat")
ANA_DEGIL = ("Çorba", "Karbonhidrat", "Dışarıda", "Yeni tarif", "Salata bowl")
SIKLIKLAR = ["Sık", "Normal", "Seyrek", "Kapalı"]
TABANLAR = ["Salçalı", "Zeytinyağlı", "Yoğurtlu", "Sade"]
AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos",
         "Eylül", "Ekim", "Kasım", "Aralık"]
GUNLER = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
DUNDEN = "Dünden devam"

BASLIKLAR = {1: "yemekler", 2: "kombinasyonlar", 3: "sablon", 4: "agirliklar", 5: "kurallar", 6: "esnek"}

hatalar = []
uyarilar = []


def hata(satir, mesaj):
    hatalar.append("HATA satır %d: %s" % (satir, mesaj))


def parse_tablolar(yol):
    """Bölüm adı -> [(satır_no, [hücreler])] (başlık ve ayırıcı satırlar atılır)."""
    with open(yol, encoding="utf-8") as f:
        satirlar = f.read().split("\n")
    bolumler = {}
    mevcut = None
    gorulen_baslik = False
    for no, ham in enumerate(satirlar, 1):
        s = ham.strip()
        if s.startswith("## "):
            mevcut = None
            ad = s[3:].strip()
            num = ad.split(".", 1)[0].strip()
            if num.isdigit() and int(num) in BASLIKLAR:
                mevcut = BASLIKLAR[int(num)]
                bolumler[mevcut] = []
                gorulen_baslik = False
            continue
        if mevcut is None or not s.startswith("|"):
            continue
        govde = s[1:]
        if govde.endswith("|"):
            govde = govde[:-1]
        hucreler = [h.strip() for h in govde.split("|")]
        if all(set(h) <= set("-: ") and h for h in hucreler):
            continue  # ayırıcı
        if not gorulen_baslik:
            gorulen_baslik = True
            continue  # tablo başlığı
        bolumler[mevcut].append((no, hucreler))
    return bolumler


def evet_hayir(satir, deger, alan):
    if deger == "Evet":
        return True
    if deger == "Hayır":
        return False
    hata(satir, "'%s' alanı Evet/Hayır olmalı, bulunan: '%s'" % (alan, deger))
    return False


def parse_mevsim(satir, deger):
    d = deger.strip()
    if d == "Her mevsim":
        return None
    for ayrac in ("–", "-", "—"):
        if ayrac in d:
            a, b = [p.strip() for p in d.split(ayrac, 1)]
            if a not in AYLAR:
                hata(satir, "bilinmeyen ay adı '%s' (mevsim: '%s')" % (a, deger))
                return None
            if b not in AYLAR:
                hata(satir, "bilinmeyen ay adı '%s' (mevsim: '%s')" % (b, deger))
                return None
            return {"bas": AYLAR.index(a) + 1, "son": AYLAR.index(b) + 1}
    if d in AYLAR:
        return {"bas": AYLAR.index(d) + 1, "son": AYLAR.index(d) + 1}
    hata(satir, "bilinmeyen mevsim/ay değeri '%s'" % deger)
    return None


def hucre(h, i):
    return h[i] if i < len(h) else ""


def yemekleri_isle(satirlar):
    yemekler, satir_of = [], {}
    for no, h in satirlar:
        if len(h) < 8:
            hata(no, "Yemekler satırında 8 sütun bekleniyor, %d bulundu" % len(h))
        ad = hucre(h, 0)
        if not ad:
            hata(no, "yemek adı boş")
            continue
        kat = hucre(h, 1)
        if kat not in KATEGORILER:
            hata(no, "bilinmeyen kategori '%s' (%s)" % (kat, ad))
        mevsim = parse_mevsim(no, hucre(h, 2))
        sik = hucre(h, 3)
        if sik not in SIKLIKLAR:
            hata(no, "bilinmeyen sıklık '%s' (%s)" % (sik, ad))
        iki = evet_hayir(no, hucre(h, 4), "2 gün yenir")
        tav = evet_hayir(no, hucre(h, 5), "Tavuklu olabilir")
        taban = hucre(h, 6)
        if taban != "" and taban not in TABANLAR:
            hata(no, "bilinmeyen taban '%s' (%s)" % (taban, ad))
        if ad in satir_of:
            hata(no, "tekrarlı yemek adı '%s' (ilk tanım satır %d)" % (ad, satir_of[ad]))
            continue
        satir_of[ad] = no
        yemekler.append({"ad": ad, "kategori": kat, "mevsim": mevsim, "siklik": sik,
                         "ikiGun": iki, "tavuklu": tav, "taban": taban, "not": hucre(h, 7)})
    return yemekler, satir_of


def kombinasyonlari_isle(satirlar, yemekler):
    kat_of = dict((y["ad"], y["kategori"]) for y in yemekler)
    komb = {}
    for no, h in satirlar:
        ana = hucre(h, 0)
        if ana not in kat_of:
            hata(no, "Kombinasyonlar'da ana yemek '%s' Yemekler tablosunda yok" % ana)
        if ana in komb:
            hata(no, "Kombinasyonlar'da tekrarlı ana yemek '%s'" % ana)
        eslikler = []
        for e in h[1:6]:
            if not e:
                continue
            if e not in kat_of:
                hata(no, "eşlik '%s' Yemekler tablosunda yok (%s)" % (e, ana))
            elif kat_of[e] not in ESLIK_KATEGORILERI:
                hata(no, "eşlik '%s' kategorisi '%s'; Çorba veya Karbonhidrat olmalı (%s)"
                     % (e, kat_of[e], ana))
            eslikler.append(e)
        komb[ana] = eslikler
    return komb


def sablonu_isle(satirlar):
    sablon = {}
    for no, h in satirlar:
        hafta, gun, kat, nt = hucre(h, 0), hucre(h, 1), hucre(h, 2), hucre(h, 3)
        if hafta not in ("1", "2", "3", "4"):
            hata(no, "geçersiz hafta '%s' (1-4 olmalı)" % hafta)
            continue
        if gun not in GUNLER:
            hata(no, "bilinmeyen gün '%s'" % gun)
            continue
        if kat != DUNDEN and kat not in KATEGORILER:
            hata(no, "şablonda bilinmeyen kategori '%s' (hafta %s %s)" % (kat, hafta, gun))
        liste = sablon.setdefault(hafta, [])
        if any(o["gun"] == gun for o in liste):
            hata(no, "hafta %s için '%s' günü tekrarlı" % (hafta, gun))
            continue
        liste.append({"gun": gun, "kategori": kat, "not": nt, "_satir": no})
    ilk = satirlar[0][0] if satirlar else 1
    for hafta in ("1", "2", "3", "4"):
        liste = sablon.get(hafta, [])
        mevcut = set(o["gun"] for o in liste)
        eksik = [g for g in GUNLER if g not in mevcut]
        if eksik:
            hata(liste[0]["_satir"] if liste else ilk,
                 "hafta %s için eksik gün: %s" % (hafta, ", ".join(eksik)))
        liste.sort(key=lambda o: GUNLER.index(o["gun"]))
        sablon[hafta] = liste
    for hafta in sablon:
        for o in sablon[hafta]:
            o.pop("_satir", None)
    return dict((k, sablon[k]) for k in sorted(sablon))


def agirliklari_isle(satirlar):
    ag, ilk = {}, satirlar[0][0] if satirlar else 1
    for no, h in satirlar:
        s, v = hucre(h, 0), hucre(h, 1)
        if s not in SIKLIKLAR:
            hata(no, "Sıklık Ağırlıkları'nda bilinmeyen sıklık '%s'" % s)
            continue
        try:
            ag[s] = int(v)
        except ValueError:
            try:
                ag[s] = float(v)
            except ValueError:
                hata(no, "'%s' için ağırlık sayı olmalı, bulunan: '%s'" % (s, v))
    for s in SIKLIKLAR:
        if s not in ag and not any(("satır" in e and ("'%s'" % s) in e) for e in hatalar):
            hata(ilk, "Sıklık Ağırlıkları'nda '%s' tanımlı değil" % s)
    return dict((s, ag[s]) for s in SIKLIKLAR if s in ag)


def esnek_isle(satirlar, sablon):
    esnek = {}
    for no, h in satirlar:
        kat = hucre(h, 0)
        if kat not in KATEGORILER:
            hata(no, "Esnek Günler'de bilinmeyen kategori '%s'" % kat)
            continue
        if kat in esnek:
            hata(no, "Esnek Günler'de tekrarlı kategori '%s'" % kat)
            continue
        yasak = []
        for g in [p.strip() for p in hucre(h, 1).split(",")]:
            if not g:
                continue
            if g not in GUNLER:
                hata(no, "Esnek Günler'de bilinmeyen gün adı '%s' (%s)" % (g, kat))
            elif GUNLER.index(g) not in yasak:
                yasak.append(GUNLER.index(g))
        esnek[kat] = {"yasak": sorted(yasak), "_satir": no}
    for kat in esnek:
        for hafta in sablon:
            n = sum(1 for o in sablon[hafta] if o["kategori"] == kat)
            if n > 1:
                hata(esnek[kat]["_satir"], "esnek kategori '%s' şablonda hafta %s içinde %d kez geçiyor (en çok 1)"
                     % (kat, hafta, n))
    for kat in esnek:
        esnek[kat].pop("_satir", None)
    return esnek


def ayda_mi(mevsim, ay):
    if mevsim is None:
        return True
    b, s = mevsim["bas"], mevsim["son"]
    return (b <= ay <= s) if b <= s else (ay >= b or ay <= s)


def uyarilari_uret(yemekler, komb, sablon):
    for y in yemekler:
        if y["kategori"] not in ANA_DEGIL and y["ad"] not in komb:
            uyarilar.append("UYARI: '%s' (%s) için Kombinasyonlar'da satır yok" % (y["ad"], y["kategori"]))
    kullanilan = []
    for hafta in sablon:
        for o in sablon[hafta]:
            if o["kategori"] in KATEGORILER and o["kategori"] not in kullanilan:
                kullanilan.append(o["kategori"])
    for kat in [k for k in KATEGORILER if k in kullanilan]:
        bos = [AYLAR[a - 1] for a in range(1, 13)
               if not any(y["kategori"] == kat and y["siklik"] != "Kapalı" and ayda_mi(y["mevsim"], a)
                          for y in yemekler)]
        for ay in bos:
            uyarilar.append("UYARI: '%s' kategorisinde %s ayı için aday yemek yok" % (kat, ay))


def oku(yol):
    try:
        with open(yol, encoding="utf-8") as f:
            return f.read()
    except IOError:
        return ""


def html_uret(veri_json, kok, manifest=None):
    css = oku(os.path.join(kok, "src", "style.css"))
    eng = oku(os.path.join(kok, "src", "engine.js"))
    app = oku(os.path.join(kok, "src", "app.js"))
    veri = veri_json.replace("</", "<\\/")
    return (
        '<!DOCTYPE html>\n<html lang="tr"' + (' manifest="%s"' % manifest if manifest else '') + '>\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-status-bar-style" content="black">\n'
        '<title>Yemek Planı</title>\n<style>\n' + css + '\n</style>\n</head>\n<body>\n'
        '<script>window.YEMEK_DATA = ' + veri + ';</script>\n'
        '<script>\n' + eng + '\n</script>\n'
        '<script>\n' + app + '\n</script>\n</body>\n</html>\n')


def main():
    ap = argparse.ArgumentParser(description="Yemek planı build")
    ap.add_argument("--input", default=os.path.join(ROOT, "yemek-listesi.md"))
    ap.add_argument("--out", default=os.path.join(ROOT, "dist"))
    ap.add_argument("--yayin", action="store_true",
                    help="GitHub Pages için yemek/index.html ve yemek.appcache de üret")
    args = ap.parse_args()

    bol = parse_tablolar(args.input)
    for no in sorted(BASLIKLAR):
        if no == 6:
            continue  # isteğe bağlı (geriye uyum)
        if BASLIKLAR[no] not in bol:
            hata(1, "'## %d.' başlıklı tablo bulunamadı" % no)
    yemekler, _ = yemekleri_isle(bol.get("yemekler", []))
    komb = kombinasyonlari_isle(bol.get("kombinasyonlar", []), yemekler)
    sablon = sablonu_isle(bol.get("sablon", []))
    agirlik = agirliklari_isle(bol.get("agirliklar", []))
    esnek = esnek_isle(bol.get("esnek", []), sablon)

    if hatalar:
        for e in hatalar:
            sys.stderr.write(e + "\n")
        sys.stderr.write("%d hata, build durdu.\n" % len(hatalar))
        return 1

    uyarilari_uret(yemekler, komb, sablon)
    for u in uyarilar:
        sys.stderr.write(u + "\n")

    veri = {"yemekler": yemekler, "kombinasyonlar": komb, "sablon": sablon, "agirliklar": agirlik,
            "esnek": esnek}
    veri_json = json.dumps(veri, ensure_ascii=False)
    if not os.path.isdir(args.out):
        os.makedirs(args.out)
    with open(os.path.join(args.out, "data.json"), "w", encoding="utf-8") as f:
        f.write(json.dumps(veri, ensure_ascii=False, indent=1))
    html = html_uret(veri_json, ROOT)
    yol = os.path.join(args.out, "index.html")
    with open(yol, "w", encoding="utf-8") as f:
        f.write(html)
    if args.yayin:
        # GitHub Pages kopyası: yemek/index.html + çevrimdışı önbellek (iOS 9 AppCache).
        import hashlib
        yayin_html = html_uret(veri_json, ROOT, manifest="yemek.appcache")
        surum = hashlib.sha1(yayin_html.encode("utf-8")).hexdigest()[:12]
        with open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8") as f:
            f.write(yayin_html)
        with open(os.path.join(ROOT, "yemek.appcache"), "w", encoding="utf-8") as f:
            f.write("CACHE MANIFEST\n# surum " + surum + "\n\nCACHE:\nindex.html\n\nNETWORK:\n*\n")
        print("YAYIN: yemek/index.html + yemek/yemek.appcache (surum %s)" % surum)
    kb = os.path.getsize(yol) / 1024.0
    print("OK: %d yemek, %d kombinasyon, %d uyarı -> %s (%.1f KB)"
          % (len(yemekler), len(komb), len(uyarilar), os.path.relpath(yol, os.getcwd()), kb))
    return 0


if __name__ == "__main__":
    sys.exit(main())
