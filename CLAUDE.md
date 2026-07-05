# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MarkView — a local, Typora-style Markdown editor & viewer for Windows. Native
desktop app built with **Python + pywebview** (Edge WebView2) wrapping a
self-contained web frontend. There is **no build step and no Node/npm** on the
target machine; the app runs Python directly and loads plain HTML/CSS/JS.

## Commands

```bash
py -m pip install pywebview          # one-time dependency (optional: python-docx htmldocx for richer .docx export)
py app.py                            # run the app
py app.py "C:\path\to\notes.md"      # open a file on launch
py app.py --debug                    # run with WebView2 devtools open
py tools/selftest.py                 # automated end-to-end test — exit code 0 = pass
py tools/download_vendor.py          # re-download vendored frontend libs into web/vendor/
py tools/download_cm.py              # re-download CodeMirror into web/vendor/codemirror/
```

`MarkView.vbs` (silent, no console) and `run.bat` are convenience launchers.
There is no linter or unit-test framework — `tools/selftest.py` is the test suite.

## Architecture

Two halves talk over the **pywebview bridge**:

- **`app.py`** — the Python backend. The `Api` class is exposed to the frontend:
  every public method becomes `window.pywebview.api.<method>()` returning a
  Promise in JS. It owns all file I/O, folder listing, settings persistence
  (`~/.markview/settings.json`), and export. `main()` creates the window with
  `http_server=True` (frontend is served over http, not `file://`).

- **`web/`** — the frontend. Loaded as global-namespaced modules via ordered
  `<script>` tags in `index.html` (no bundler, no modules). Each file attaches
  one global; **load order matters**:
  - `js/markdown.js` → `window.MarkdownEngine` — configures markdown-it and does
    `render(src) -> {html, outline}`.
  - `js/editor.js` → `window.Ed` — CodeMirror source editor + live preview
    pipeline + all markdown formatting actions.
  - `js/files.js` → `window.Files` — file tree, outline panel, folder search.
  - `js/app.js` → `window.App` — top-level controller: menus, commands,
    view modes, find/replace, export, settings, keyboard shortcuts.

### Command dispatch
All UI actions (menu items, toolbar buttons, shortcuts, find-bar) carry a
`data-cmd` string and route through `App.run(cmd)`. `fmt.*` commands delegate to
`Ed.action(name)`; everything else is looked up in the `COMMANDS` map in
`app.js`. To add an action: add a `data-cmd` in `index.html` and a handler in
`COMMANDS` (or a formatting action in `ACTIONS` in `editor.js`).

### Rendering & live preview
Source text → `MarkdownEngine.render()` → HTML injected into `#write` (the
content root; matches the Typora `#write` convention that themes target).
markdown-it block tokens are tagged with `data-line` attributes; **scroll sync**
maps editor scroll position to the nearest `data-line` element (and back).
Mermaid diagrams and relative images are resolved *after* the HTML is injected
(mermaid renders async; images go through `Api.resolve_image` → data URI). Math
is a custom markdown-it rule that calls KaTeX at render time.

### Themes
`web/css/themes/_base.css` holds all document structure using CSS variables;
each theme file is **palette-only** and `@import "_base.css"`. To add a theme:
create `themes/<id>.css`, then register it in **two places in `app.js`** — the
`THEMES` array and the `CODE_THEMES` map (which picks the highlight.js stylesheet).

### Offline vendoring
Everything under `web/vendor/` (markdown-it + 7 plugins, CodeMirror 5, KaTeX +
fonts, Mermaid, highlight.js) is committed so the app works with no network. The
`tools/download_*.py` scripts are the source of truth for versions/URLs. To add a
markdown-it plugin: download it, add a `<script>` in `index.html`, and add its
UMD global name to the plugin list in `markdown.js`.

### Export
- **PDF**: no library — switches to reading mode and calls `window.print()`;
  `web/css/print.css` styles the output (user picks "Save as PDF").
- **HTML**: `app.js` inlines the active theme + highlight + KaTeX CSS by reading
  `document.styleSheets`, producing a self-contained file.
- **Word**: `Api.export_docx` uses `htmldocx` if installed, else writes a
  Word-openable HTML document with a `.doc` extension.

## Critical gotcha: the bridge is not ready immediately

`window.pywebview` appears slightly **before** its `api` methods are attached.
Calling a bridge method too early throws `"X is not a function"`. Two guards
exist and must be preserved:
- `loadSettings()` in `app.py`'s frontend counterpart polls until
  `get_settings` is callable.
- Optional native calls (`set_title`, `quit`, `toggle_fullscreen`, `set_settings`)
  go through the `native()` helper in `app.js`, which no-ops if the method
  isn't there yet.

Boot loads default/welcome content immediately and applies persisted settings
asynchronously, so the app is usable even if the bridge is slow.

## Testing & verifying changes

Run `py tools/selftest.py`. It launches a real window and the page **pushes DOM
diagnostics back to Python via the bridge** (writing a temp JSON), then a watcher
thread closes the window. It deliberately avoids cross-thread `evaluate_js`,
which deadlocks/floods COM errors on the WinForms backend. Do **not** rely on
screenshots: WebView2 content is GPU-composited and comes out blank via
PrintWindow.
