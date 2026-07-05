# MarkView

A feature-rich, local Markdown editor & viewer for Windows — a Typora-style
app that runs entirely on your machine. Built with **Python + pywebview**
(uses the built-in Edge WebView2 engine) and a self-contained web frontend.
No Node, no browser, no internet required after setup.

---

## Quick start

1. **Install the dependency** (one time):
   - Double-click **`install.bat`**, or run:
     ```
     py -m pip install pywebview
     ```
2. **Run the app**:
   - Double-click **`MarkView.vbs`** (no console window), or
   - Double-click **`run.bat`** (keeps a console for troubleshooting), or
   - From a terminal: `py app.py`
3. Open a file with **File → Open**, or a whole folder with **File → Open Folder**.

You can also open a file directly: `py app.py "C:\path\to\notes.md"`.

> **Tip:** create a desktop shortcut to `MarkView.vbs` and set its icon for a
> proper app-like launch. To make MarkView the default for `.md` files, use
> Windows *Open with → Choose another app → Browse* and point it at a small
> wrapper that runs `pyw app.py "%1"`.

---

## Features

### Editing & preview
- **Live preview** — type Markdown on the left, see it rendered on the right,
  updating as you type, with **scroll sync** (the preview follows the source
  using real source-line mapping; double-click a preview block to jump the
  cursor there).
- **Three view modes**: Live Preview, Source Code, and Reading (preview only).
- **Focus mode** (`F8`) — dims every line except the one you're editing.
- **Typewriter mode** (`F9`) — keeps the current line vertically centered.
- **Syntax-highlighted source editor** (CodeMirror) with line wrapping,
  bracket matching, auto-close brackets, and smart list continuation.

### Markdown support
- Headings, bold/italic/strikethrough, blockquotes, horizontal rules
- Ordered / unordered / **task lists** (`- [ ] / - [x]`)
- **Tables** (GFM), footnotes, definition lists
- `==highlight==`, `~sub~`, `^sup^`, `++ins++`, abbreviations
- **Emoji shortcodes** (`:rocket:` → 🚀)
- **Math** with KaTeX — inline `$E=mc^2$` and display `$$…$$` (incl. mhchem)
- **Diagrams** with Mermaid — flowcharts, sequence, Gantt, etc.
- **Code fences** with syntax highlighting for ~190 languages (highlight.js)
- `[TOC]` table-of-contents generation and clickable heading anchors

### Themes
Nine document themes, switchable live from the **Themes** menu — the editor
chrome adapts to light/dark automatically:
GitHub · Night · Newsprint · Whitey · Pixyll · Gothic · Academic · Solarized · Dark.
Each theme lives in `web/css/themes/<name>.css` and only sets a small palette;
copy one to make your own.

### Navigation
- **File tree** sidebar (open a folder to browse; click to open, right-click to
  rename/delete)
- **Outline** panel — auto-generated from headings; click to jump
- **Search in folder** — full-text search across your notes
- **Find & Replace** (`Ctrl+F` / `Ctrl+H`) with case-sensitivity and regex

### Export
- **PDF** — via the print pipeline (choose *Save as PDF* / *Microsoft Print to
  PDF*); uses the current theme and print-optimized CSS
- **HTML** — fully self-contained, styles inlined (also a styleless variant)
- **Word** — `.docx` if `python-docx` + `htmldocx` are installed, otherwise a
  Word-openable HTML document
- **Copy as Markdown / HTML** from the Edit menu

### Convenience
- **Auto-save** (toggle in Preferences) plus manual `Ctrl+S`
- **Recent files** list, remembered window size, last opened folder
- **Live word / character count** and estimated reading time in the status bar
- **Zoom** (`Ctrl+=` / `Ctrl+-`), fullscreen (`F11`)
- Preferences dialog, keyboard-shortcut reference, and a built-in Markdown guide

---

## Keyboard shortcuts

| Shortcut | Action | Shortcut | Action |
| --- | --- | --- | --- |
| `Ctrl+N` | New | `Ctrl+B` | Bold |
| `Ctrl+O` | Open | `Ctrl+I` | Italic |
| `Ctrl+S` | Save | `Ctrl+U` | Underline |
| `Ctrl+Shift+S` | Save As | `Ctrl+K` | Link |
| `Ctrl+P` | Print / PDF | `` Ctrl+` `` | Inline code |
| `Ctrl+F` | Find | `Ctrl+Shift+K` | Code fence |
| `Ctrl+H` | Replace | `Ctrl+1…6` | Heading 1–6 |
| `Ctrl+\` | Toggle sidebar | `Ctrl+0` | Paragraph |
| `Ctrl+/` | Live preview | `F8` | Focus mode |
| `Ctrl+,` | Preferences | `F9` | Typewriter mode |
| `Ctrl+=` / `Ctrl+-` | Zoom in / out | `F11` | Fullscreen |

---

## Project layout

```
MDfileviewer/
├─ app.py                 # Python backend: window, file I/O, settings, export
├─ MarkView.vbs           # silent launcher (no console)
├─ run.bat / install.bat  # console launcher / dependency installer
├─ requirements.txt
├─ web/
│  ├─ index.html          # UI shell
│  ├─ css/
│  │  ├─ app.css          # application chrome & layout
│  │  ├─ print.css        # PDF/print styles
│  │  └─ themes/          # _base.css + 9 document themes
│  ├─ js/
│  │  ├─ markdown.js      # markdown-it pipeline (math, mermaid, TOC, etc.)
│  │  ├─ editor.js        # CodeMirror + live preview + formatting
│  │  ├─ files.js         # file tree, outline, search
│  │  └─ app.js           # commands, menus, export, settings, find/replace
│  └─ vendor/             # offline copies of all libraries
└─ tools/
   ├─ download_vendor.py  # re-download frontend libs
   ├─ download_cm.py      # re-download CodeMirror
   └─ selftest.py         # automated smoke test
```

Settings are stored at `~/.markview/settings.json`.

---

## Bundled libraries (offline)

markdown-it (+ footnote/deflist/sub/sup/mark/ins/abbr), CodeMirror 5,
KaTeX 0.16 (with fonts), Mermaid 11, highlight.js 11. All vendored under
`web/vendor/` so the app works with no network access. To refresh them, run
`py tools/download_vendor.py` and `py tools/download_cm.py`.

---

## Notes

- Requires the **Edge WebView2 runtime**, which ships with Windows 11 (and most
  updated Windows 10 machines). If the window is blank, install "WebView2
  Runtime" from Microsoft.
- Optional richer Word export: `py -m pip install python-docx htmldocx`.
- Verify a build at any time with `py tools/selftest.py` (exit code 0 = pass).
