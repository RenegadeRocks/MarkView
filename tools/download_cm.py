"""Download CodeMirror 5 (single-file UMD builds) for the source editor."""
import os, ssl, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(ROOT, "web", "vendor", "codemirror")
CM = "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16"
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE

FILES = {
    "codemirror.min.js": f"{CM}/codemirror.min.js",
    "codemirror.min.css": f"{CM}/codemirror.min.css",
    "meta.min.js": f"{CM}/mode/meta.min.js",
    "mode/markdown.min.js": f"{CM}/mode/markdown/markdown.min.js",
    "mode/gfm.min.js": f"{CM}/mode/gfm/gfm.min.js",
    "mode/xml.min.js": f"{CM}/mode/xml/xml.min.js",
    "mode/javascript.min.js": f"{CM}/mode/javascript/javascript.min.js",
    "mode/css.min.js": f"{CM}/mode/css/css.min.js",
    "mode/htmlmixed.min.js": f"{CM}/mode/htmlmixed/htmlmixed.min.js",
    "mode/python.min.js": f"{CM}/mode/python/python.min.js",
    "mode/clike.min.js": f"{CM}/mode/clike/clike.min.js",
    "mode/shell.min.js": f"{CM}/mode/shell/shell.min.js",
    "mode/sql.min.js": f"{CM}/mode/sql/sql.min.js",
    "mode/yaml.min.js": f"{CM}/mode/yaml/yaml.min.js",
    "mode/go.min.js": f"{CM}/mode/go/go.min.js",
    "mode/rust.min.js": f"{CM}/mode/rust/rust.min.js",
    "addon/continuelist.min.js": f"{CM}/addon/edit/continuelist.min.js",
    "addon/closebrackets.min.js": f"{CM}/addon/edit/closebrackets.min.js",
    "addon/matchbrackets.min.js": f"{CM}/addon/edit/matchbrackets.min.js",
    "addon/placeholder.min.js": f"{CM}/addon/display/placeholder.min.js",
    "addon/active-line.min.js": f"{CM}/addon/selection/active-line.min.js",
    "addon/overlay.min.js": f"{CM}/addon/mode/overlay.min.js",
    "addon/searchcursor.min.js": f"{CM}/addon/search/searchcursor.min.js",
}

ok, fail = 0, []
for rel, url in FILES.items():
    dest = os.path.join(VENDOR, rel.replace("/", os.sep))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        ok += 1; continue
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, context=ctx, timeout=60).read()
        open(dest, "wb").write(data)
        ok += 1; print("OK ", rel, len(data))
    except Exception as e:
        fail.append((rel, str(e))); print("ERR", rel, e)
print(f"\nDone. {ok} ok, {len(fail)} failed.")
