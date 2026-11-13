#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ES5/iOS 9 uyumluluk denetimi: dist/index.html (inline JS+CSS) ve src/style.css.
Yalnız standart kütüphane + jsc. Kullanım: check.py [--selftest] [--no-build]"""
import bisect
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc"

PUNCTS = sorted([
    ">>>=", "...", "===", "!==", "**=", "<<=", ">>=", ">>>", "=>", "?.", "??", "**", "==", "!=", "<=",
    ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", ">>",
    "{", "}", "(", ")", "[", "]", ";", ",", ".", "<", ">", "+", "-", "*", "/", "%", "&", "|", "^",
    "!", "~", "?", ":", "=", "@", "#"], key=lambda p: -len(p))
REGEX_KW = set("return typeof case in void delete new else do throw instanceof".split())
OBJ_PREV = set("= ( , : [ ! & | ? + - * / % < > ~ ^ => && || == === != !== += -= <= >= ??".split())
OBJ_PREV_KW = set("return typeof in case".split())
KEYWORDS = "let const class async await yield import export static extends super".split()
BAD_IDENTS = ("URLSearchParams", "IntersectionObserver", "ResizeObserver", "Intl", "Symbol", "WeakMap")
BAD_METHODS = ("includes", "startsWith", "endsWith", "padStart", "repeat", "find", "findIndex",
               "closest", "matches")
BAD_FUNCS = ("fetch", "alert", "confirm", "prompt")
WORDCH = re.compile(r"[\w$]")
NUM_RE = re.compile(r"0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?")


def lex(src):
    """-> (tokens, errors). token = (tip, deger, indeks); tip: id num str tmpl re p."""
    toks, errs = [], []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c in " \t\r\n\f\v\u00a0\ufeff\u2028\u2029":
            i += 1
            continue
        if src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
            continue
        if src.startswith("/*", i):
            j = src.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        if c in "'\"":
            j = i + 1
            while j < n and src[j] != c and src[j] != "\n":
                j += 2 if src[j] == "\\" else 1
            toks.append(("str", src[i + 1:j], i))
            i = j + 1
            continue
        if c == "`":
            errs.append((i, "template literal (backtick) yasak", "backtick"))
            j, depth = i + 1, 0
            while j < n:
                if src[j] == "\\":
                    j += 2
                    continue
                if src.startswith("${", j):
                    depth += 1
                    j += 2
                    continue
                if src[j] == "}" and depth:
                    depth -= 1
                elif src[j] == "`" and not depth:
                    break
                j += 1
            toks.append(("tmpl", "", i))
            i = j + 1
            continue
        if c.isalpha() or c in "_$" or ord(c) > 127:
            j = i + 1
            while j < n and (src[j].isalnum() or src[j] in "_$" or ord(src[j]) > 127):
                j += 1
            toks.append(("id", src[i:j], i))
            i = j
            continue
        m = NUM_RE.match(src, i) if (c.isdigit() or (c == "." and i + 1 < n and src[i + 1].isdigit())) else None
        if m:
            toks.append(("num", m.group(0), i))
            i = m.end()
            continue
        if c == "/":
            p = toks[-1] if toks else None
            allowed = (p is None or (p[0] == "p" and p[1] not in (")", "]", "++", "--")) or
                      (p[0] == "id" and p[1] in REGEX_KW))
            if allowed:
                j, incls = i + 1, False
                while j < n and src[j] != "\n":
                    if src[j] == "\\":
                        j += 2
                        continue
                    if src[j] == "[":
                        incls = True
                    elif src[j] == "]":
                        incls = False
                    elif src[j] == "/" and not incls:
                        break
                    j += 1
                j += 1
                while j < n and (src[j].isalnum() or src[j] == "_"):
                    j += 1
                toks.append(("re", src[i:j], i))
                i = j
                continue
        for p in PUNCTS:
            if src.startswith(p, i):
                if p == "?." and i + 2 < n and src[i + 2].isdigit():
                    p = "?"
                toks.append(("p", p, i))
                i += len(p)
                break
        else:
            i += 1
    return toks, errs


def match_paren(toks, k):
    d = 0
    for j in range(k, len(toks)):
        if toks[j][0] == "p":
            if toks[j][1] == "(":
                d += 1
            elif toks[j][1] == ")":
                d -= 1
                if d == 0:
                    return j
    return -1


def analyze(src):
    """-> [(indeks, mesaj, seviye, kod)] ; seviye HATA|UYARI"""
    toks, lerrs = lex(src)
    out = [(i, m, "HATA", k) for (i, m, k) in lerrs]
    stack, pdepth, fors = [], 0, []
    N = len(toks)

    def T(k):
        return toks[k] if 0 <= k < N else (None, None, -1)

    for k in range(N):
        tip, val, idx = toks[k]
        pt, pv, _ = T(k - 1)
        nt, nv, _ = T(k + 1)
        if tip == "p":
            if val == "=>":
                out.append((idx, "arrow function yasak", "HATA", "=>"))
            elif val == "...":
                out.append((idx, "spread/rest (...) yasak", "HATA", "..."))
            elif val == "?.":
                out.append((idx, "optional chaining (?.) yasak", "HATA", "?."))
            elif val == "??":
                out.append((idx, "nullish coalescing (??) yasak", "HATA", "??"))
            elif val in ("**", "**="):
                out.append((idx, "üs alma operatörü (**) yasak", "HATA", "**"))
            if val == "{":
                obj = (pt == "p" and pv in OBJ_PREV) or (pt == "id" and pv in OBJ_PREV_KW)
                stack.append("o" if obj else "b")
            elif val == "(":
                pdepth += 1
                stack.append("(")
                if pt == "id" and pv == "for":
                    fors.append(pdepth)
            elif val == "[":
                if pt == "p" and pv in ("{", ",") and stack and stack[-1] == "o":
                    out.append((idx, "hesaplanmış özellik adı yasak", "HATA", "computed"))
                stack.append("[")
            elif val in ("}", ")", "]"):
                if val == ")":
                    if fors and fors[-1] == pdepth:
                        fors.pop()
                    pdepth -= 1
                if stack:
                    stack.pop()
        elif tip == "id":
            after_dot = pt == "p" and pv == "."
            if val in KEYWORDS and not after_dot:
                key = nt == "p" and nv == ":" and pt == "p" and pv in ("{", ",") and stack and stack[-1] == "o"
                if not key:
                    out.append((idx, "yasak anahtar kelime: " + val, "HATA", val))
            if val == "of" and fors and not after_dot:
                out.append((idx, "for...of yasak", "HATA", "of"))
            if val == "function":
                if nt == "p" and nv == "*":
                    out.append((idx, "generator (function*) yasak", "HATA", "function*"))
                q = k + 1
                if T(q)[0] == "id":
                    q += 1
                if T(q)[0] == "p" and T(q)[1] == "(":
                    e = match_paren(toks, q)
                    d = 0
                    for j in range(q, e):
                        tv = toks[j]
                        if tv[0] == "p":
                            if tv[1] in ("(", "[", "{"):
                                d += 1
                            elif tv[1] in (")", "]", "}"):
                                d -= 1
                            elif tv[1] == "=" and d == 1:
                                out.append((tv[2], "varsayılan parametre yasak", "HATA", "defparam"))
                                break
            if val == "var" and nt == "p" and nv in ("{", "["):
                out.append((T(k + 1)[2], "destructuring yasak", "HATA", "destruct"))
            if (pt == "p" and pv in ("{", ",") and stack and stack[-1] == "o" and nt == "p" and nv == "("
                    and val != "function"):
                e = match_paren(toks, k + 1)
                if e >= 0 and T(e + 1)[0] == "p" and T(e + 1)[1] == "{":
                    out.append((idx, "kısa nesne metodu yasak: " + val + "() {", "HATA", "shortmethod"))
            call = nt == "p" and nv == "("
            if val in BAD_IDENTS:
                out.append((idx, "yasak API: " + val, "HATA", val))
            if val in BAD_FUNCS and call:
                out.append((idx, "yasak API: " + val + "(", "HATA", val))
            if val in ("Map", "Set") and not after_dot and (call or (pt == "id" and pv == "new")):
                out.append((idx, "yasak API: " + val, "HATA", val))
            if after_dot and val in BAD_METHODS and call:
                out.append((idx, "yasak API: ." + val + "(", "HATA", "." + val))
            if after_dot and val == "remove" and call and nv == "(" and T(k + 2)[1] == ")":
                out.append((idx, ".remove() iOS 9'da güvenilmez; parentNode.removeChild kullan", "UYARI", ".remove"))
            if val == "Array" and nt == "p" and nv == "." and T(k + 2)[1] == "from":
                out.append((idx, "yasak API: Array.from", "HATA", "Array.from"))
            if val == "Object" and nt == "p" and nv == "." and T(k + 2)[1] == "assign":
                out.append((idx, "yasak API: Object.assign", "HATA", "Object.assign"))
            if val == "Date" and nt == "p" and nv == "." and T(k + 2)[1] == "parse":
                out.append((idx, "yasak API: Date.parse", "HATA", "Date.parse"))
            if val == "Date" and pt == "id" and pv == "new" and call and T(k + 2)[0] == "str":
                out.append((idx, "new Date(string) yasak; new Date(y, m, d) kullan", "HATA", "dateparse"))
            if after_dot and val == "toggle" and call and T(k - 2)[1] == "classList":
                e = match_paren(toks, k + 1)
                d = 0
                for j in range(k + 1, e):
                    tv = toks[j]
                    if tv[0] == "p" and tv[1] in ("(", "[", "{"):
                        d += 1
                    elif tv[0] == "p" and tv[1] in (")", "]", "}"):
                        d -= 1
                    elif tv[0] == "p" and tv[1] == "," and d == 1:
                        out.append((idx, "classList.toggle 2. argüman iOS 9'da yok", "UYARI", "toggle2"))
                        break
    return sorted(out)


def posfn(text, line0=1, col0=1):
    starts = [0]
    for m in re.finditer("\n", text):
        starts.append(m.end())

    def pos(i):
        ln = bisect.bisect_right(starts, i) - 1
        col = i - starts[ln] + 1
        if ln == 0:
            col += col0 - 1
        return ln + line0, col
    return pos


def blank_comments(css):
    return re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), css, flags=re.S)


CSS_ERR = [
    (r"display\s*:\s*(?:-webkit-)?(?:inline-)?grid\b", "display: grid yasak"),
    (r"(?<![\w-])(?:-ms-)?grid(?:-[\w-]+)?\s*:", "grid özelliği yasak"),
    (r"(?<![\w-])(?:row-|column-)?gap\s*:", "gap yasak"),
    (r"object-fit", "object-fit yasak"),
    (r"position\s*:\s*sticky", "position: sticky yasak (-webkit-sticky serbest)"),
    (r"backdrop-filter", "backdrop-filter yasak"),
    (r"aspect-ratio", "aspect-ratio yasak"),
    (r"var\(\s*--", "CSS değişkeni var(--) yasak"),
    (r"(?<![\w-])--[\w-]+\s*:", "özel özellik (--x) yasak"),
    (r"(?<![\w.#-])[+-]?(?:\d+\.?\d*|\.\d+)(?:vh|vw|vmin|vmax)\b", "vh/vw/vmin/vmax birimi yasak"),
    (r"@supports", "@supports yasak"),
    (r":(?:is|where|has)\(", ":is/:where/:has yasak"),
    (r"(?<![\w-])(?:clamp|min|max)\(", "clamp()/min()/max() yasak"),
]
FLEX_PROPS = ("flex", "align-items", "justify-content", "flex-direction", "flex-wrap")


def check_css(css, pos_of):
    """css: ham metin; pos_of(i)->(satır,sütun). -> [(satır,sütun,mesaj,seviye)]"""
    css = blank_comments(css)
    out = []
    for rx, msg in CSS_ERR:
        for m in re.finditer(rx, css):
            l, c = pos_of(m.start())
            out.append((l, c, msg, "HATA"))
    for m in re.finditer(r"([^{}]*)\{([^{}]*)\}", css):
        body, base = m.group(2), m.start(2)
        decls = []
        off = 0
        for part in body.split(";"):
            if ":" in part:
                lead = len(part) - len(part.lstrip())
                p, v = part.split(":", 1)
                decls.append((p.strip().lower(), v.strip().lower(), base + off + lead))
            off += len(part) + 1
        names = [d[0] for d in decls]
        for p, v, at in decls:
            l, c = pos_of(at)
            if p == "display" and v in ("flex", "inline-flex"):
                ok = any(q == "display" and w == "-webkit-" + v for q, w, _ in decls)
                if not ok:
                    out.append((l, c, "display: %s için aynı blokta display: -webkit-%s yok" % (v, v), "UYARI"))
            elif p in FLEX_PROPS and "-webkit-" + p not in names:
                out.append((l, c, "%s için -webkit-%s öneki yok" % (p, p), "UYARI"))
    return sorted(set(out))


def jsc_check(src, label):
    """-> hata metni veya None"""
    if not os.path.exists(JSC):
        return None
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "blok.js")
        drv = os.path.join(d, "drv.js")
        with open(f, "w", encoding="utf-8") as fh:
            fh.write(src)
        with open(drv, "w", encoding="utf-8") as fh:
            fh.write('var p=%s;try{if(typeof checkSyntax==="function"){checkSyntax(p);}'
                     'else{new Function(readFile(p));}print("OK");}'
                     'catch(e){print("ERR "+e);}\n' % json.dumps(f))
        r = subprocess.run([JSC, drv], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           universal_newlines=True, timeout=60)
        o = (r.stdout + r.stderr).strip()
        if "OK" in o.split("\n")[-1:] or o.endswith("OK"):
            return None
        return o.replace("ERR ", "", 1) or "jsc hata verdi"


SCRIPT_RE = re.compile(r"<script\b([^>]*)>(.*?)</script\s*>", re.S | re.I)
STYLE_RE = re.compile(r"<style\b([^>]*)>(.*?)</style\s*>", re.S | re.I)


def check_html(path, rel):
    res = []  # (sev, where, line, col, msg)
    with open(path, encoding="utf-8") as f:
        html = f.read()
    pos = posfn(html)
    n = 0
    for m in SCRIPT_RE.finditer(html):
        n += 1
        attrs, body = m.group(1), m.group(2)
        where = "%s[script %d]" % (rel, n)
        l0, c0 = pos(m.start())
        if re.search(r"type\s*=\s*[\"']?module", attrs, re.I):
            res.append(("HATA", where, l0, c0, '<script type="module"> yasak'))
        sm = re.search(r"src\s*=\s*[\"']?([^\"'\s>]+)", attrs, re.I)
        if sm:
            src = sm.group(1)
            if re.match(r"(?:https?:)?//", src, re.I):
                res.append(("HATA", where, l0, c0, "harici script kaynağı: " + src))
                continue
            sp = os.path.join(os.path.dirname(path), src)
            if os.path.exists(sp):
                with open(sp, encoding="utf-8") as f:
                    body, where, bl, bc = f.read(), "%s(%s)" % (where, src), 1, 1
            else:
                res.append(("HATA", where, l0, c0, "script dosyası yok: " + src))
                continue
        else:
            bl, bc = pos(m.start(2))
        bp = posfn(body, bl, bc)
        for i, msg, sev, _ in analyze(body):
            l, c = bp(i)
            res.append((sev, where, l, c, msg))
        err = jsc_check(body, where)
        if err:
            res.append(("HATA", where, bl, bc, "jsc sözdizimi hatası: " + err))
    k = 0
    for m in STYLE_RE.finditer(html):
        k += 1
        bl, bc = pos(m.start(2))
        bp = posfn(m.group(2), bl, bc)
        for l, c, msg, sev in check_css(m.group(2), bp):
            res.append((sev, "%s[style %d]" % (rel, k), l, c, msg))
    # HTML iskeleti: script/style içeriği boşaltılmış kopya
    blank = lambda mm: re.sub(r"[^\n]", " ", mm.group(0))
    bare = STYLE_RE.sub(blank, SCRIPT_RE.sub(blank, html))
    bare = re.sub(r"<!--.*?-->", blank, bare, flags=re.S)
    for m in re.finditer(r"<(?:script|link|img|iframe|source|video|audio)\b[^>]*>", html, re.I):
        pass
    for m in re.finditer(r"<(link|img|iframe|source|video|audio|script)\b[^>]*>", bare, re.I):
        for a in re.finditer(r"\b(?:src|href|data-src)\s*=\s*[\"']?\s*((?:https?:)?//[^\"'\s>]+)", m.group(0), re.I):
            l, c = pos(m.start())
            res.append(("HATA", rel, l, c, "harici kaynak: " + a.group(1)))
    for m in re.finditer(r"url\(\s*[\"']?((?:https?:)?//[^)\"']+)", html, re.I):
        l, c = pos(m.start())
        res.append(("HATA", rel, l, c, "CSS'te harici kaynak: " + m.group(1)))
    for m in re.finditer(r"@import\s+[\"']?(?:https?:)?//", html, re.I):
        l, c = pos(m.start())
        res.append(("HATA", rel, l, c, "@import harici kaynak"))
    if not re.search(r"<meta\b[^>]*apple-mobile-web-app-capable", bare, re.I):
        res.append(("HATA", rel, 1, 1, "apple-mobile-web-app-capable meta etiketi eksik"))
    return res


def need_build():
    out = os.path.join(ROOT, "dist", "index.html")
    if not os.path.exists(out):
        return True
    t = os.path.getmtime(out)
    srcs = [os.path.join(ROOT, "yemek-listesi.md"), os.path.join(ROOT, "scripts", "build.py")]
    sd = os.path.join(ROOT, "src")
    if os.path.isdir(sd):
        srcs += [os.path.join(sd, x) for x in os.listdir(sd)]
    srcs = [s for s in srcs if os.path.exists(s)]
    srcs.append(os.path.join(os.path.dirname(ROOT), "yemek-listesi.md"))
    return any(os.path.exists(s) and os.path.getmtime(s) > t for s in srcs)


def run_all(build=True):
    res = []
    if build and need_build():
        print("dist eski/yok -> python3 scripts/build.py")
        r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "build.py")],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, universal_newlines=True)
        if r.returncode != 0:
            print(r.stdout.strip())
            print("HATA scripts/build.py başarısız (exit %d)" % r.returncode)
            print("OZET: 1 hata, 0 uyarı")
            return 1
    hp = os.path.join(ROOT, "dist", "index.html")
    if not os.path.exists(hp):
        print("HATA dist/index.html yok\nOZET: 1 hata, 0 uyarı")
        return 1
    res += check_html(hp, "dist/index.html")
    cp = os.path.join(ROOT, "src", "style.css")
    if os.path.exists(cp):
        with open(cp, encoding="utf-8") as f:
            css = f.read()
        for l, c, msg, sev in check_css(css, posfn(css)):
            res.append((sev, "src/style.css", l, c, msg))
    res.sort(key=lambda x: (x[0] != "HATA", x[1], x[2], x[3]))
    for sev, where, l, c, msg in res:
        print("%s %s %d:%d %s" % (sev, where, l, c, msg))
    e = sum(1 for r in res if r[0] == "HATA")
    w = len(res) - e
    print("OZET: %d hata, %d uyarı" % (e, w))
    return 1 if e else 0


# ---------------------------------------------------------------- selftest
JS_BAD = [  # (kod, örnek)
    ("backtick", "var a = `x`;"), ("=>", "var f = x => x;"), ("...", "f(...a);"),
    ("?.", "a?.b;"), ("??", "a ?? b;"), ("**", "a ** 2;"),
    ("let", "let a = 1;"), ("const", "const a = 1;"), ("class", "class A {}"),
    ("async", "async function f(){}"), ("await", "await f();"), ("yield", "yield 1;"),
    ("import", "import a from 'b';"), ("export", "export var a;"),
    ("of", "for (var x of y) {}"), ("function*", "function* g(){}"),
    ("static", "var s = static;"), ("extends", "a extends b;"), ("super", "super();"),
    ("shortmethod", "var o = { ad() { return 1; } };"),
    ("shortmethod", "var o = { a: 1, ad(x) { return 1; } };"),
    ("computed", "var o = { [k]: 1 };"), ("computed", "var o = { a: 1, [k]: 1 };"),
    ("defparam", "function f(a = 1) {}"), ("defparam", "var g = function (a, b = 2) {};"),
    ("destruct", "var {a} = o;"), ("destruct", "var [a] = o;"),
    ("fetch", "fetch('/x');"), ("URLSearchParams", "new URLSearchParams();"),
    ("IntersectionObserver", "new IntersectionObserver(f);"), ("ResizeObserver", "new ResizeObserver(f);"),
    ("Intl", "Intl.DateTimeFormat();"), (".includes", "a.includes(1);"),
    (".startsWith", "a.startsWith('x');"), (".endsWith", "a.endsWith('x');"),
    (".padStart", "a.padStart(2);"), (".repeat", "a.repeat(2);"), (".find", "a.find(f);"),
    (".findIndex", "a.findIndex(f);"), ("Array.from", "Array.from(a);"),
    ("Object.assign", "Object.assign({}, a);"), ("Symbol", "Symbol('a');"),
    ("Map", "var m = new Map();"), ("Set", "var s = new Set();"), ("WeakMap", "new WeakMap();"),
    ("alert", "alert('x');"), ("confirm", "confirm('x');"), ("prompt", "prompt('x');"),
    ("dateparse", "new Date('2026-11-16');"), ("dateparse", 'new Date("2026-11-16");'),
    ("Date.parse", "Date.parse(s);"), (".closest", "e.closest('a');"), (".matches", "e.matches('a');"),
    (".remove", "e.remove();"), ("toggle2", "e.classList.toggle('a', true);"),
]
JS_OK = [
    "var s = 'let const `x` => ... ?. ?? ** class of';",
    'var s = "async await yield import export static super fetch(";',
    "// let const => `x` ... fetch(\nvar a = 1;",
    "/* class `x` => a.includes(1) */ var a = 1;",
    "var r = /`[`]=>/g; var q = a / b / c;",
    "var r = /let|const|\\/\\*/;",
    "var o = { a: 1, b: function () { return 1; }, 'c': [1, 2] };",
    "var a = b ? .5 : 1; var c = x?.5:1;",
    "for (var i = 0; i < 3; i++) {} var of = 1;",
    "var a = [1, [2, 3]]; f(a, [1]); g(1, [2]);",
    "x.static = 1; x.class = 2; o.of = 3; var k = { 'class': 1, static: 2 };",
    "e.classList.toggle('a'); a.indexOf('x'); a.push(1);",
    "if (a, b(c)) { d(); } for (var i = 0, n = f(x); i < n; i++) {}",
    "var d = new Date(2026, 10, 16); var s = new Date(y, m, d);",
    "function f(a, b) { return a === 1 ? { x: 1 } : { y: 2 }; }",
    "var s = 'it\\'s `ok` =>'; var t = \"a\\\"b `\";",
    "var x = a.get(1); o.map(function (z) { return z; });",
    "window.YEMEK_DATA = {\"a\": [\"Mercimek çorbası\", 1, null], \"b\": {\"c\": true}};",
]
CSS_BAD = [
    ("a{display:grid}", "display: grid"), ("a{display: inline-grid}", "display: grid"),
    ("a{grid-template-columns:1fr}", "grid özelliği"), ("a{gap:4px}", "gap"),
    ("a{row-gap:4px}", "gap"), ("a{column-gap:4px}", "gap"), ("a{object-fit:cover}", "object-fit"),
    ("a{position:sticky}", "sticky"), ("a{backdrop-filter:blur(2px)}", "backdrop-filter"),
    ("a{aspect-ratio:1}", "aspect-ratio"), ("a{color:var(--x)}", "var(--"),
    ("a{--x:1}", "özel özellik"), ("a{height:100vh}", "vh/vw"), ("a{width:50vw}", "vh/vw"),
    ("a{width:5vmin}", "vh/vw"), ("a{width:5vmax}", "vh/vw"), ("@supports (display:grid){a{b:c}}", "@supports"),
    ("a:is(b){c:d}", ":is"), ("a:where(b){c:d}", ":is"), ("a:has(b){c:d}", ":is"),
    ("a{width:clamp(1px,2px,3px)}", "clamp"), ("a{width:min(1px,2px)}", "clamp"), ("a{width:max(1px,2px)}", "clamp"),
]
CSS_WARN = [
    ("a{display:flex}", "display: flex"), ("a{display:-webkit-flex}a{align-items:center}", "align-items"),
    ("a{-webkit-box-flex:1;flex:1}", "flex için"), ("a{justify-content:center}", "justify-content"),
    ("a{flex-direction:column}", "flex-direction"), ("a{flex-wrap:wrap}", "flex-wrap"),
]
CSS_OK = [
    "/* display:grid gap:1px var(--x) 100vh */ a{color:red}",
    "a{position:-webkit-sticky}", "a{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center}",
    "a{-webkit-flex:1;flex:1;-webkit-flex-direction:row;flex-direction:row}",
    "a{width:100%;font-size:12px;max-width:10px;min-height:5px}", ".vh-box{margin:0}",
    "a{-webkit-justify-content:center;justify-content:center;-webkit-flex-wrap:wrap;flex-wrap:wrap}",
]


def selftest():
    fails = []
    for kod, src in JS_BAD:
        got = [k for (_, _, _, k) in analyze(src)]
        if kod not in got:
            fails.append("kaçırıldı [%s]: %s (bulunan: %s)" % (kod, src, got))
        elif kod in ("let", "const") and False:
            pass
    for src in JS_OK:
        got = analyze(src)
        if got:
            fails.append("yanlış pozitif: %s -> %s" % (src, [(g[1], g[3]) for g in got]))
    for src, key in CSS_BAD + CSS_WARN:
        got = check_css(src, posfn(src))
        if not any(key in g[2] for g in got):
            fails.append("CSS kaçırıldı [%s]: %s -> %s" % (key, src, [g[2] for g in got]))
    for src in CSS_OK:
        got = check_css(src, posfn(src))
        if got:
            fails.append("CSS yanlış pozitif: %s -> %s" % (src, [g[2] for g in got]))
    # konum doğruluğu
    r = analyze("var a = 1;\n  var b = x => 1;")
    p = posfn("var a = 1;\n  var b = x => 1;")
    if not r or p(r[0][0]) != (2, 13):
        fails.append("konum yanlış: %s" % (r and p(r[0][0])))
    # jsc
    if os.path.exists(JSC):
        if jsc_check("var a = 1; function f(){ return a; }", "t"):
            fails.append("jsc: geçerli kod reddedildi")
        if not jsc_check("var a = ;", "t"):
            fails.append("jsc: geçersiz kod kabul edildi")
    # HTML
    with tempfile.TemporaryDirectory() as d:
        hp = os.path.join(d, "x.html")
        with open(hp, "w", encoding="utf-8") as f:
            f.write('<html><head><script type="module">var a=1;</script>'
                    '<link rel="stylesheet" href="https://x.com/a.css"></head>'
                    '<body><script>var s="<img src=\\"http://x\\">";</script></body></html>')
        msgs = [m for (_, _, _, _, m) in check_html(hp, "x.html")]
        for key in ("type=\"module\"", "harici kaynak: https://x.com/a.css", "apple-mobile-web-app-capable"):
            if not any(key in m for m in msgs):
                fails.append("HTML kaçırıldı: " + key)
        if any("http://x" in m for m in msgs):
            fails.append("HTML yanlış pozitif (string içi img)")
    total = len(JS_BAD) + len(JS_OK) + len(CSS_BAD) + len(CSS_WARN) + len(CSS_OK) + 6
    for f in fails:
        print("SELFTEST BAŞARISIZ:", f)
    print("SELFTEST: %s (%d durum, %d başarısız)" % ("GEÇTİ" if not fails else "KALDI", total, len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    sys.exit(run_all(build="--no-build" not in sys.argv))
