#!/usr/bin/env python3
"""Arka plan doğa süslerini (inline SVG) üretir ve src/style.css içindeki
/* SUSLER-BASLA */ ... /* SUSLER-BITIR */ bloğunu yeniden yazar.
Kullanım: python3 scripts/susler.py   (ardından build.py)"""
import math
import os
import urllib.parse

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS = os.path.join(KOK, "src", "style.css")

GUNDUZ = dict(stem="#7f9b76", leaf="#9ab68f", vein="#76946c", rose="#e6b0b8", rose_d="#cc8f9a",
              lilac="#cdb8da", lilac_d="#a990bd", white="#fbfaf5", white_d="#c9c3b8",
              center="#e2c47c", center_d="#c4a35a", lav="#b8a1d0", op=0.62)
GECE = dict(stem="#31432d", leaf="#33472f", vein="#2a3b27", rose="#58404a", rose_d="#4a3540",
            lilac="#463f55", lilac_d="#3b3449", white="#3a3c35", white_d="#30322c",
            center="#5a4f33", center_d="#4b422b", lav="#433b52", op=0.75)


def f(v):
    return ("%.1f" % v).rstrip("0").rstrip(".")


def yaprak(x, y, uz, gen, aci, c):
    return ("<g transform='translate(%s %s) rotate(%s)'>"
            "<path d='M0 0C%s -%s %s -%s %s 0C%s %s %s %s 0 0Z' fill='%s'/>"
            "<path d='M2 0L%s 0' stroke='%s' stroke-width='.8' fill='none'/></g>") % (
        f(x), f(y), f(aci), f(uz * .28), f(gen), f(uz * .7), f(gen), f(uz),
        f(uz * .7), f(gen), f(uz * .28), f(gen), c["leaf"], f(uz - 3), c["vein"])


def kozmos(x, y, r, don, renk, koyu, c):
    p = []
    for k in range(6):
        a = k * 60 + don
        p.append("<path transform='rotate(%s)' d='M0 0C-%s -%s -%s -%s 0 -%s C%s -%s %s -%s 0 0Z' "
                 "fill='%s' stroke='%s' stroke-width='.7'/>" % (
                     f(a), f(r * .32), f(r * .3), f(r * .5), f(r * .92), f(r),
                     f(r * .5), f(r * .92), f(r * .32), f(r * .3), renk, koyu))
        # yaprak ortası çizgisi
        p.append("<path transform='rotate(%s)' d='M0 -%s L0 -%s' stroke='%s' stroke-width='.5' opacity='.6'/>" % (
            f(a), f(r * .3), f(r * .75), koyu))
    nok = "".join("<circle cx='%s' cy='%s' r='.9' fill='%s'/>" % (
        f(math.cos(math.radians(t)) * r * .14), f(math.sin(math.radians(t)) * r * .14), c["center_d"])
        for t in range(0, 360, 60))
    return "<g transform='translate(%s %s)'>%s<circle r='%s' fill='%s'/>%s</g>" % (
        f(x), f(y), "".join(p), f(r * .22), c["center"], nok)


def papatya(x, y, r, c):
    p = []
    for k in range(12):
        p.append("<ellipse transform='rotate(%d) translate(0 -%s)' rx='%s' ry='%s' fill='%s' stroke='%s' stroke-width='.6'/>" % (
            k * 30, f(r * .55), f(r * .16), f(r * .45), c["white"], c["white_d"]))
    return "<g transform='translate(%s %s)'>%s<circle r='%s' fill='%s' stroke='%s' stroke-width='.6'/></g>" % (
        f(x), f(y), "".join(p), f(r * .26), c["center"], c["center_d"])


def tomurcuk(x, y, aci, c):
    return ("<g transform='translate(%s %s) rotate(%s)'>"
            "<path d='M0 0C-4 -5 -3 -12 0 -15C3 -12 4 -5 0 0Z' fill='%s' stroke='%s' stroke-width='.6'/>"
            "<path d='M0 0C-3 -2 -4 -5 -3 -7M0 0C3 -2 4 -5 3 -7' stroke='%s' stroke-width='1.2' fill='none'/></g>") % (
        f(x), f(y), f(aci), c["rose"], c["rose_d"], c["stem"])


def lavanta(x1, y1, x2, y2, c):
    s = "<path d='M%s %sL%s %s' stroke='%s' stroke-width='1.2'/>" % (f(x1), f(y1), f(x2), f(y2), c["stem"])
    n = 7
    for i in range(n):
        t = 0.45 + 0.55 * i / (n - 1)
        x = x1 + (x2 - x1) * t
        y = y1 + (y2 - y1) * t
        aci = math.degrees(math.atan2(y2 - y1, x2 - x1)) + 90
        for yon in (-1, 1):
            s += "<ellipse transform='translate(%s %s) rotate(%s)' cx='%s' rx='2.2' ry='3.6' fill='%s'/>" % (
                f(x), f(y), f(aci + yon * 35), f(yon * 2.5), c["lav"])
    return s


def svg(gen, yuk, icerik, c):
    return ("<svg xmlns='http://www.w3.org/2000/svg' width='%d' height='%d' viewBox='0 0 %d %d'>"
            "<g opacity='%s' fill='none' stroke-linecap='round'>%s</g></svg>") % (gen, yuk, gen, yuk, c["op"], icerik)


def dal(c):
    s = ("<path d='M352 276C300 238 248 196 196 160S96 88 46 44' stroke='%s' stroke-width='2'/>"
         "<path d='M214 172C206 146 206 122 214 100' stroke='%s' stroke-width='1.5'/>"
         "<path d='M128 112C118 100 116 88 120 76' stroke='%s' stroke-width='1.3'/>"
         "<path d='M286 228C282 208 288 190 300 178' stroke='%s' stroke-width='1.3'/>") % ((c["stem"],) * 4)
    for x, y, uz, gen, a in [(312, 244, 34, 9, -140), (300, 238, 30, 8, 150), (262, 208, 32, 8, -150),
                             (246, 202, 28, 7, 140), (176, 146, 32, 8, -145), (160, 142, 28, 7, 150),
                             (100, 96, 28, 7, -150), (84, 88, 24, 6, 145), (210, 130, 22, 6, -40),
                             (206, 118, 20, 5, 200), (62, 58, 20, 5, -150)]:
        s += yaprak(x, y, uz, gen, a, c)
    s += lavanta(330, 262, 312, 168, c)
    s += kozmos(46, 44, 19, 8, c["rose"], c["rose_d"], c)
    s += kozmos(214, 98, 16, 20, c["rose"], c["rose_d"], c)
    s += kozmos(300, 176, 12, 0, c["lilac"], c["lilac_d"], c)
    s += tomurcuk(120, 76, -10, c) + tomurcuk(150, 130, 30, c)
    s += papatya(250, 150, 10, c)
    return svg(360, 280, s, c)


def kume(c):
    s = ("<path d='M10 112C30 90 44 64 50 34M50 34C70 54 92 62 118 58M30 92C44 96 60 104 70 118' "
         "stroke='%s' stroke-width='1.4'/>") % c["stem"]
    for x, y, uz, gen, a in [(34, 84, 22, 6, -70), (28, 98, 20, 5, -150), (86, 60, 20, 5, -20),
                             (104, 60, 18, 5, 20), (58, 108, 18, 5, 40)]:
        s += yaprak(x, y, uz, gen, a, c)
    s += papatya(50, 30, 15, c) + kozmos(122, 56, 10, 12, c["lilac"], c["lilac_d"], c)
    s += tomurcuk(72, 116, 160, c)
    s += papatya(170, 28, 8, c) + kozmos(208, 52, 7, 0, c["rose"], c["rose_d"], c)
    return svg(230, 130, s, c)


def cimen(c):
    s = ""
    for x, h, b in [(14, 46, 8), (26, 60, -6), (40, 40, 10), (120, 52, -8), (134, 38, 6),
                    (210, 56, 9), (224, 42, -7), (282, 50, 6)]:
        s += "<path d='M%s 92C%s %s %s %s %s %s' stroke='%s' stroke-width='1.4'/>" % (
            x, x + b * .2, 92 - h * .5, x + b * .6, 92 - h * .8, x + b, 92 - h, c["stem"])
    s += "<path d='M60 92C62 70 66 52 72 40M170 92C168 72 166 56 160 44M250 92C252 76 256 62 262 54' stroke='%s' stroke-width='1.2'/>" % c["stem"]
    s += yaprak(62, 74, 18, 5, -60, c) + yaprak(168, 70, 16, 4, -120, c) + yaprak(253, 78, 16, 4, -60, c)
    s += papatya(72, 36, 10, c) + kozmos(160, 40, 9, 10, c["rose"], c["rose_d"], c) + papatya(263, 50, 8, c)
    s += lavanta(96, 92, 104, 36, c) + lavanta(190, 92, 184, 44, c)
    s += tomurcuk(128, 54, 10, c)
    return svg(300, 96, s, c)


def uri(s):
    return 'url("data:image/svg+xml;charset=utf8,' + urllib.parse.quote(s, safe="/:=' ,.()-") + '")'


def blok():
    g = [uri(dal(GUNDUZ)), uri(kume(GUNDUZ)), uri(cimen(GUNDUZ))]
    n = [uri(dal(GECE)), uri(kume(GECE)), uri(cimen(GECE))]
    return """/* SUSLER-BASLA — scripts/susler.py üretir, elle düzenleme */
body {
  background-image: %s, %s, %s;
  background-repeat: no-repeat, no-repeat, no-repeat;
  background-position: right 14px top 268px, left 8px top 6px, left 2px top 430px;
  background-size: 380px 296px, 230px 130px, 300px 96px;
}
body.gece {
  background-image: %s, %s, %s;
}
@media (max-width: 760px) {
  body {
    background-image: %s, %s;
    background-position: right -14px top -10px, left 0 top 0;
    background-size: 170px 132px, 150px 85px;
  }
  body.gece { background-image: %s, %s; }
}
/* SUSLER-BITIR */""" % tuple(g + n + [g[0], g[1], n[0], n[1]])


def main():
    css = open(CSS, encoding="utf-8").read()
    a = css.index("/* SUSLER-BASLA")
    b = css.index("/* SUSLER-BITIR */") + len("/* SUSLER-BITIR */")
    css = css[:a] + blok() + css[b:]
    open(CSS, "w", encoding="utf-8").write(css)
    print("OK: süsler yazıldı")


if __name__ == "__main__":
    main()
