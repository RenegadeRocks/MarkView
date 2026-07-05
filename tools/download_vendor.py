"""Download all frontend libraries into web/vendor for fully offline use."""
import os, sys, urllib.request, ssl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(ROOT, "web", "vendor")
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

JS = "https://cdn.jsdelivr.net/npm"
CDNJS = "https://cdnjs.cloudflare.com/ajax/libs"

FILES = {
    # markdown-it core + plugins (UMD builds)
    "markdown-it/markdown-it.min.js": f"{JS}/markdown-it@14.1.0/dist/markdown-it.min.js",
    "markdown-it/markdown-it-footnote.min.js": f"{JS}/markdown-it-footnote@4.0.0/dist/markdown-it-footnote.min.js",
    "markdown-it/markdown-it-deflist.min.js": f"{JS}/markdown-it-deflist@3.0.0/dist/markdown-it-deflist.min.js",
    "markdown-it/markdown-it-sub.min.js": f"{JS}/markdown-it-sub@2.0.0/dist/markdown-it-sub.min.js",
    "markdown-it/markdown-it-sup.min.js": f"{JS}/markdown-it-sup@2.0.0/dist/markdown-it-sup.min.js",
    "markdown-it/markdown-it-mark.min.js": f"{JS}/markdown-it-mark@4.0.0/dist/markdown-it-mark.min.js",
    "markdown-it/markdown-it-ins.min.js": f"{JS}/markdown-it-ins@4.0.0/dist/markdown-it-ins.min.js",
    "markdown-it/markdown-it-abbr.min.js": f"{JS}/markdown-it-abbr@2.0.0/dist/markdown-it-abbr.min.js",
    "markdown-it/markdown-it-emoji.min.js": f"{JS}/markdown-it-emoji@3.0.0/dist/index.min.js",
    # highlight.js
    "highlight/highlight.min.js": f"{CDNJS}/highlight.js/11.9.0/highlight.min.js",
    "highlight/github.min.css": f"{CDNJS}/highlight.js/11.9.0/styles/github.min.css",
    "highlight/github-dark.min.css": f"{CDNJS}/highlight.js/11.9.0/styles/github-dark.min.css",
    "highlight/atom-one-dark.min.css": f"{CDNJS}/highlight.js/11.9.0/styles/atom-one-dark.min.css",
    "highlight/atom-one-light.min.css": f"{CDNJS}/highlight.js/11.9.0/styles/atom-one-light.min.css",
    "highlight/monokai.min.css": f"{CDNJS}/highlight.js/11.9.0/styles/monokai.min.css",
    "highlight/vs2015.min.css": f"{CDNJS}/highlight.js/11.9.0/styles/vs2015.min.css",
    # KaTeX
    "katex/katex.min.js": f"{JS}/katex@0.16.11/dist/katex.min.js",
    "katex/katex.min.css": f"{JS}/katex@0.16.11/dist/katex.min.css",
    "katex/contrib/mhchem.min.js": f"{JS}/katex@0.16.11/dist/contrib/mhchem.min.js",
    # mermaid (single self-contained bundle)
    "mermaid/mermaid.min.js": f"{JS}/mermaid@11.4.1/dist/mermaid.min.js",
}

# KaTeX woff2 fonts
KATEX_FONTS = [
    "KaTeX_AMS-Regular", "KaTeX_Caligraphic-Bold", "KaTeX_Caligraphic-Regular",
    "KaTeX_Fraktur-Bold", "KaTeX_Fraktur-Regular", "KaTeX_Main-Bold",
    "KaTeX_Main-BoldItalic", "KaTeX_Main-Italic", "KaTeX_Main-Regular",
    "KaTeX_Math-BoldItalic", "KaTeX_Math-Italic", "KaTeX_SansSerif-Bold",
    "KaTeX_SansSerif-Italic", "KaTeX_SansSerif-Regular", "KaTeX_Script-Regular",
    "KaTeX_Size1-Regular", "KaTeX_Size2-Regular", "KaTeX_Size3-Regular",
    "KaTeX_Size4-Regular", "KaTeX_Typewriter-Regular",
]
for f in KATEX_FONTS:
    for ext in ("woff2", "woff", "ttf"):
        FILES[f"katex/fonts/{f}.{ext}"] = f"{JS}/katex@0.16.11/dist/fonts/{f}.{ext}"

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, context=ctx, timeout=60).read()

ok = 0
fail = []
for rel, url in FILES.items():
    dest = os.path.join(VENDOR, rel.replace("/", os.sep))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        ok += 1
        continue
    try:
        data = fetch(url)
        with open(dest, "wb") as fh:
            fh.write(data)
        ok += 1
        print(f"OK  {rel}  ({len(data)} bytes)")
    except Exception as e:
        fail.append((rel, str(e)))
        print(f"ERR {rel}: {e}")

print(f"\nDone. {ok} ok, {len(fail)} failed.")
if fail:
    for rel, e in fail:
        print("  FAIL", rel, e)
    sys.exit(1)
