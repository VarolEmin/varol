#!/usr/bin/env python3
"""Plan motoru testlerini jsc ile çalıştırır."""
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc"


def main():
    data_path = os.path.join(ROOT, "dist", "data.json")
    if not os.path.exists(data_path):
        r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "build.py")])
        if r.returncode != 0 or not os.path.exists(data_path):
            print("FAIL build calismadi")
            return 1
    with open(data_path, encoding="utf-8") as f:
        data = f.read()
    tmp = tempfile.mkdtemp()
    prelude = os.path.join(tmp, "prelude.js")
    with open(prelude, "w", encoding="utf-8") as f:
        f.write("var DATA = " + data + ";\n")
    try:
        r = subprocess.run(
            [JSC, prelude, os.path.join(ROOT, "src", "engine.js"), os.path.join(ROOT, "tests", "engine.test.js")],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, universal_newlines=True)
    finally:
        try:
            os.remove(prelude)
            os.rmdir(tmp)
        except OSError:
            pass
    out = r.stdout
    print(out, end="" if out.endswith("\n") else "\n")
    fails = sum(1 for l in out.splitlines() if l.startswith("FAIL"))
    if r.returncode != 0 or fails or "OZET:" not in out:
        print("TEST BASARISIZ (jsc cikis kodu %d, FAIL %d)" % (r.returncode, fails))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
