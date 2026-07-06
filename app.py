#!/usr/bin/env python3
"""
MarkView - a feature-rich local Markdown editor & viewer (a Typora-style clone).

Backend: pywebview (Edge WebView2). Frontend: web/ (HTML/CSS/JS).
Provides file I/O, folder trees, settings persistence, and export.
"""
import os
import re
import sys
import json
import base64
import mimetypes
import webview

APP_NAME = "MarkView"
ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, "web")

CONFIG_DIR = os.path.join(os.path.expanduser("~"), ".markview")
CONFIG_FILE = os.path.join(CONFIG_DIR, "settings.json")

MD_EXTS = (".md", ".markdown", ".mdown", ".mkd", ".mkdn", ".mdwn", ".text", ".txt")

DEFAULT_SETTINGS = {
    "theme": "github",
    "codeTheme": "github",
    "sidebarVisible": True,
    "outlineVisible": True,
    "mode": "live",            # live | source | preview
    "focusMode": False,
    "typewriterMode": False,
    "autoSave": True,
    "fontSize": 16,
    "editorFont": "",
    "lineNumbers": False,
    "spellcheck": False,
    "recentFiles": [],
    "recentFolders": [],
    "lastFolder": "",
    "windowWidth": 1200,
    "windowHeight": 800,
    "showToolbar": True,
}


def load_settings():
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        merged = dict(DEFAULT_SETTINGS)
        merged.update(data)
        return merged
    except Exception:
        return dict(DEFAULT_SETTINGS)


def save_settings(settings):
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
        return True
    except Exception as e:
        print("save_settings error:", e)
        return False


class Api:
    """Exposed to the frontend as window.pywebview.api.*"""

    def __init__(self):
        self.window = None
        self.settings = load_settings()

    # ---------- settings ----------
    def get_settings(self):
        return self.settings

    def set_settings(self, patch):
        try:
            if isinstance(patch, str):
                patch = json.loads(patch)
            self.settings.update(patch)
            save_settings(self.settings)
            return True
        except Exception as e:
            print("set_settings error:", e)
            return False

    # ---------- file dialogs ----------
    def open_file_dialog(self):
        result = self.window.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
            file_types=("Markdown & Text (*.md;*.markdown;*.txt;*.text)",
                        "All files (*.*)"),
        )
        if not result:
            return None
        return self._read(result[0])

    def open_folder_dialog(self):
        result = self.window.create_file_dialog(webview.FOLDER_DIALOG)
        if not result:
            return None
        folder = result[0]
        self._push_recent("recentFolders", folder)
        self.settings["lastFolder"] = folder
        save_settings(self.settings)
        return {"path": folder, "tree": self.list_dir(folder)}

    def save_file_dialog(self, default_name="untitled.md"):
        result = self.window.create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=default_name,
            file_types=("Markdown (*.md)", "All files (*.*)"),
        )
        if not result:
            return None
        if isinstance(result, (list, tuple)):
            result = result[0]
        return result

    def export_dialog(self, default_name, kind):
        types = {
            "html": ("HTML file (*.html)", "All files (*.*)"),
            "pdf": ("PDF file (*.pdf)", "All files (*.*)"),
            "docx": ("Word document (*.docx)", "All files (*.*)"),
            "doc": ("Word document (*.doc)", "All files (*.*)"),
            "md": ("Markdown (*.md)", "All files (*.*)"),
        }.get(kind, ("All files (*.*)",))
        result = self.window.create_file_dialog(
            webview.SAVE_DIALOG, save_filename=default_name, file_types=types
        )
        if not result:
            return None
        if isinstance(result, (list, tuple)):
            result = result[0]
        return result

    # ---------- file io ----------
    def _read(self, path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            self._push_recent("recentFiles", path)
            save_settings(self.settings)
            return {"path": path, "content": content, "name": os.path.basename(path)}
        except Exception as e:
            return {"error": str(e)}

    def read_file(self, path):
        return self._read(path)

    def write_file(self, path, content):
        try:
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(content)
            self._push_recent("recentFiles", path)
            save_settings(self.settings)
            return {"path": path, "name": os.path.basename(path)}
        except Exception as e:
            return {"error": str(e)}

    def export_text(self, path, content):
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            return {"path": path}
        except Exception as e:
            return {"error": str(e)}

    def export_html(self, path, html):
        """Write a styled HTML export with KaTeX fonts embedded as data URIs so
        the file renders math correctly anywhere (fully self-contained)."""
        try:
            html = self._embed_katex_fonts(html)
            with open(path, "w", encoding="utf-8") as f:
                f.write(html)
            return {"path": path}
        except Exception as e:
            return {"error": str(e)}

    def _embed_katex_fonts(self, html):
        """Replace KaTeX @font-face `src:` declarations with a single inline
        woff2 data URI. KaTeX CSS lists woff2/woff/ttf; every modern browser
        supports woff2, so embedding only woff2 keeps exports small (~200 KB)."""
        fonts_dir = os.path.join(WEB, "vendor", "katex", "fonts")
        if not os.path.isdir(fonts_dir):
            return html
        cache = {}

        def data_uri(basename):
            if basename in cache:
                return cache[basename]
            fp = os.path.join(fonts_dir, basename)
            uri = None
            if os.path.exists(fp):
                with open(fp, "rb") as fh:
                    b = base64.b64encode(fh.read()).decode("ascii")
                uri = "data:font/woff2;base64," + b
            cache[basename] = uri
            return uri

        def repl(match):
            body, term = match.group(1), match.group(2)
            fm = re.search(r"(KaTeX_[A-Za-z0-9\-]+\.woff2)", body)
            if not fm:
                return match.group(0)
            uri = data_uri(fm.group(1))
            if not uri:
                return match.group(0)
            return 'src:url(' + uri + ') format("woff2")' + term

        # Match each `src: ...` declaration (KaTeX @font-face); handle both the
        # `;`-terminated (CSSOM-serialized) and `}`-terminated (minified) forms.
        return re.sub(r"(src\s*:[^;{}]+)([;}])", repl, html)

    def export_docx(self, path, html):
        """Best-effort HTML -> .docx. Falls back to Word-openable HTML."""
        try:
            try:
                from htmldocx import HtmlToDocx  # type: ignore
                from docx import Document  # type: ignore
                doc = Document()
                HtmlToDocx().add_html_to_document(html, doc)
                if not path.lower().endswith(".docx"):
                    path += ".docx"
                doc.save(path)
                return {"path": path, "engine": "htmldocx"}
            except Exception:
                # Fallback: Word opens HTML documents saved with a .doc extension
                if path.lower().endswith(".docx"):
                    path = path[:-1]  # -> .doc
                elif not path.lower().endswith(".doc"):
                    path += ".doc"
                doc_html = (
                    "<html xmlns:o='urn:schemas-microsoft-com:office:office' "
                    "xmlns:w='urn:schemas-microsoft-com:office:word' "
                    "xmlns='http://www.w3.org/TR/REC-html40'>"
                    "<head><meta charset='utf-8'></head><body>" + html + "</body></html>"
                )
                with open(path, "w", encoding="utf-8") as f:
                    f.write(doc_html)
                return {"path": path, "engine": "html-doc"}
        except Exception as e:
            return {"error": str(e)}

    # ---------- folder tree ----------
    def list_dir(self, path):
        try:
            entries = []
            with os.scandir(path) as it:
                for e in it:
                    name = e.name
                    if name.startswith("."):
                        continue
                    if e.is_dir():
                        entries.append({"name": name, "path": e.path, "dir": True})
                    elif name.lower().endswith(MD_EXTS):
                        entries.append({"name": name, "path": e.path, "dir": False})
            entries.sort(key=lambda x: (not x["dir"], x["name"].lower()))
            return entries
        except Exception as e:
            return {"error": str(e)}

    def new_file_in(self, folder, name):
        try:
            if not name.lower().endswith(MD_EXTS):
                name += ".md"
            path = os.path.join(folder, name)
            if not os.path.exists(path):
                with open(path, "w", encoding="utf-8") as f:
                    f.write("# " + os.path.splitext(name)[0] + "\n\n")
            return {"path": path, "name": name}
        except Exception as e:
            return {"error": str(e)}

    def rename_path(self, old, new_name):
        try:
            new_path = os.path.join(os.path.dirname(old), new_name)
            os.rename(old, new_path)
            return {"path": new_path}
        except Exception as e:
            return {"error": str(e)}

    def delete_path(self, path):
        try:
            if os.path.isdir(path):
                import shutil
                shutil.rmtree(path)
            else:
                os.remove(path)
            return {"ok": True}
        except Exception as e:
            return {"error": str(e)}

    # ---------- images (for embedding on export) ----------
    def image_data_uri(self, path):
        try:
            mime = mimetypes.guess_type(path)[0] or "image/png"
            with open(path, "rb") as f:
                b = base64.b64encode(f.read()).decode("ascii")
            return "data:%s;base64,%s" % (mime, b)
        except Exception:
            return None

    def resolve_image(self, base_path, src):
        """Resolve a possibly-relative image path against the doc, return data URI."""
        try:
            if src.startswith(("http://", "https://", "data:")):
                return src
            if base_path:
                candidate = os.path.normpath(os.path.join(os.path.dirname(base_path), src))
                if os.path.exists(candidate):
                    return self.image_data_uri(candidate)
            if os.path.exists(src):
                return self.image_data_uri(src)
        except Exception:
            pass
        return src

    def save_image_from_clipboard(self, base_path, data_uri):
        """Persist a pasted/dropped image next to the doc; return relative path."""
        try:
            header, b64 = data_uri.split(",", 1)
            ext = ".png"
            if "jpeg" in header or "jpg" in header:
                ext = ".jpg"
            elif "gif" in header:
                ext = ".gif"
            elif "webp" in header:
                ext = ".webp"
            folder = os.path.dirname(base_path) if base_path else CONFIG_DIR
            assets = os.path.join(folder, "assets")
            os.makedirs(assets, exist_ok=True)
            import time
            fname = "img_%d%s" % (int(time.time() * 1000), ext)
            full = os.path.join(assets, fname)
            with open(full, "wb") as f:
                f.write(base64.b64decode(b64))
            return "assets/" + fname
        except Exception as e:
            return {"error": str(e)}

    # ---------- window ----------
    def set_title(self, title):
        try:
            self.window.title = title
        except Exception:
            pass

    def print_page(self):
        # trigger the browser print dialog (used for PDF export)
        try:
            self.window.evaluate_js("window.print();")
        except Exception:
            pass

    def toggle_fullscreen(self):
        try:
            self.window.toggle_fullscreen()
        except Exception:
            pass

    def quit(self):
        try:
            self.window.destroy()
        except Exception:
            pass

    # ---------- self-test hooks (used by tools/selftest.py) ----------
    def selftest_mode(self):
        return bool(os.environ.get("MARKVIEW_SELFTEST"))

    def selftest_report(self, data):
        p = os.environ.get("MARKVIEW_SELFTEST")
        if p:
            try:
                with open(p, "w", encoding="utf-8") as f:
                    f.write(data if isinstance(data, str) else json.dumps(data))
            except Exception as e:
                print("selftest_report err", e)
        return True

    def selftest_export(self, html):
        """Write a real styled export (fonts embedded) so the harness can verify
        the file on disk is self-contained."""
        p = os.environ.get("MARKVIEW_SELFTEST")
        if not p:
            return None
        out = p + ".export.html"
        self.export_html(out, html)
        return out

    # ---------- helpers ----------
    def _push_recent(self, key, value):
        lst = self.settings.get(key, [])
        if value in lst:
            lst.remove(value)
        lst.insert(0, value)
        self.settings[key] = lst[:15]


def get_startup_file():
    for arg in sys.argv[1:]:
        if os.path.isfile(arg) and arg.lower().endswith(MD_EXTS):
            return os.path.abspath(arg)
    return None


def main():
    api = Api()
    settings = api.settings
    index = os.path.join(WEB, "index.html")

    startup = get_startup_file()
    if startup:
        os.environ["MARKVIEW_STARTUP"] = startup

    window = webview.create_window(
        APP_NAME,
        url=index,
        js_api=api,
        width=int(settings.get("windowWidth", 1200)),
        height=int(settings.get("windowHeight", 800)),
        min_size=(720, 480),
        text_select=True,
        background_color="#ffffff",
    )
    api.window = window

    def on_start():
        if startup:
            data = api._read(startup)
            js = "window.__openStartup && window.__openStartup(%s)" % json.dumps(data)
            try:
                window.evaluate_js(js)
            except Exception:
                pass

    webview.start(on_start, debug=("--debug" in sys.argv), http_server=True,
                  private_mode=False, storage_path=CONFIG_DIR)


if __name__ == "__main__":
    main()
