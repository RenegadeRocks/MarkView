"""Deterministic self-test. The page pushes diagnostics to Python via the API
bridge (writing OUTFILE); a watcher thread closes the window once it appears."""
import os, sys, time, json, threading, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import webview
import app as mv

OUTFILE = os.path.join(tempfile.gettempdir(), "markview_selftest.json")
if os.path.exists(OUTFILE):
    os.remove(OUTFILE)
os.environ["MARKVIEW_SELFTEST"] = OUTFILE


def _is_dark(css_color):
    """True if a CSS rgb(...) color is dark (low luminance)."""
    if not css_color:
        return False
    nums = [int(x) for x in __import__("re").findall(r"\d+", css_color)[:3]]
    return len(nums) == 3 and sum(nums) < 300


def watcher(window):
    for _ in range(160):  # up to ~16s
        if os.path.exists(OUTFILE) and os.path.getsize(OUTFILE) > 0:
            time.sleep(0.3)
            break
        time.sleep(0.1)
    try:
        window.destroy()
    except Exception:
        pass


def main():
    api = mv.Api()
    window = webview.create_window("MarkView SelfTest",
                                   url=os.path.join(mv.WEB, "index.html"),
                                   js_api=api, width=1200, height=800)
    api.window = window
    webview.start(lambda: threading.Thread(target=watcher, args=(window,), daemon=True).start(),
                  http_server=True, storage_path=mv.CONFIG_DIR)

    if not os.path.exists(OUTFILE):
        print("SELFTEST: FAIL (no report produced)")
        sys.exit(2)
    d = json.load(open(OUTFILE, encoding="utf-8"))
    print(json.dumps(d, indent=2))
    r = d.get("render", {})
    checks = {
        "booted": d.get("booted"),
        "no js errors": not d.get("errors"),
        "engine loaded": d.get("hasEngine"),
        "codemirror mounted": d.get("cmMounted"),
        "welcome rendered": d.get("previewChildren", 0) > 3,
        "katex in preview": d.get("previewHasKatex"),
        "code highlighted": d.get("previewHasCode"),
        "table rendered": d.get("previewHasTable"),
        "task list": d.get("previewHasTask"),
        "outline built": d.get("outlineItems", 0) > 0,
        "render:katex": r.get("hasKatex"),
        "render:table": r.get("hasTable"),
        "render:toc": r.get("hasToc"),
        "render:tasks": r.get("hasTaskbox"),
        "editor themes dark": _is_dark(d.get("darkEditorBg")) and d.get("hasDarkUi"),
    }
    print("\n--- checks ---")
    for k, v in checks.items():
        print(("  PASS  " if v else "  FAIL  ") + k)
    ok = all(checks.values())
    print("\nSELFTEST:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
