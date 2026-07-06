/* app.js — top-level application controller. */
(function (global) {
  "use strict";

  var THEMES = [
    { id: "github", name: "GitHub" },
    { id: "night", name: "Night" },
    { id: "newsprint", name: "Newsprint" },
    { id: "whitey", name: "Whitey" },
    { id: "pixyll", name: "Pixyll" },
    { id: "gothic", name: "Gothic" },
    { id: "academic", name: "Academic" },
    { id: "solarized", name: "Solarized" },
    { id: "dark", name: "Dark" }
  ];
  var CODE_THEMES = {
    github: "github", night: "atom-one-dark", newsprint: "github",
    whitey: "github", pixyll: "atom-one-light", gothic: "vs2015",
    academic: "github", solarized: "atom-one-light", dark: "monokai"
  };
  // themes whose chrome + source editor should render dark
  var DARK_THEMES = { night: 1, dark: 1, gothic: 1, solarized: 1 };

  var settings = {};
  var state = {
    path: null, name: "Untitled", dirty: false, saving: false,
    zoom: 100, mode: "live", lastSaved: ""
  };
  var autosaveTimer = null;

  function api() { return global.pywebview && global.pywebview.api; }
  // Call an optional native method safely (some builds may not expose all of them).
  function native(method) {
    var a = api();
    if (a && typeof a[method] === "function") {
      return a[method].apply(a, Array.prototype.slice.call(arguments, 1));
    }
    return null;
  }

  // ---------- boot ----------
  function boot() {
    global.Files.init();
    global.Ed.init(document.getElementById("editor"), document.getElementById("write"));
    buildThemeMenu();
    bindMenus();
    bindToolbar();
    bindShortcuts();
    bindFindBar();
    bindResizers();
    bindSidebarTabs();

    global.Ed.onChange(onEditorChange);
    global.Ed.onCursor(updateStatus);

    // Load default content immediately so the app is usable even if the
    // settings bridge is slow/unavailable. A startup file (__openStartup)
    // or opened file overrides this.
    if (!state.path && !global.Ed.getValue()) {
      global.Ed.setValue(WELCOME);
      updateStatus();
    }

    // Apply persisted settings when they arrive; never let this block usage.
    loadSettings().then(function () {
      try { applySettings(); } catch (e) { window.__errors && window.__errors.push("applySettings: " + e.message); }
      global.Ed.focus();
      updateStatus();
    }).catch(function (e) {
      window.__errors && window.__errors.push("loadSettings: " + (e && e.message));
      try { applySettings(); } catch (e2) {}
      global.Ed.focus();
    });

    window.addEventListener("beforeunload", function () { persistWindow(); });
    document.getElementById("modal-close").onclick = closeModal;
    document.getElementById("modal-overlay").addEventListener("click", function (e) {
      if (e.target.id === "modal-overlay") closeModal();
    });
  }

  function loadSettings(tries) {
    // The pywebview bridge attaches methods slightly after window.pywebview
    // appears; poll until get_settings is callable (or give up ~5s later).
    tries = tries || 0;
    var a = api();
    if (!a || typeof a.get_settings !== "function") {
      if (tries > 50) { settings = {}; return Promise.resolve(); }
      return new Promise(function (res) {
        setTimeout(function () { loadSettings(tries + 1).then(res); }, 100);
      });
    }
    return a.get_settings().then(function (s) { settings = s || {}; });
  }
  function saveSettings(patch) {
    Object.assign(settings, patch);
    native("set_settings", patch);
  }

  function applySettings() {
    setTheme(settings.theme || "github", true);
    setMode(settings.mode || "live", true);
    if (settings.sidebarVisible === false) document.body.classList.add("no-sidebar");
    if (settings.outlineVisible === false) {}
    if (settings.focusMode) document.body.classList.add("focus");
    if (settings.typewriterMode) document.body.classList.add("typewriter");
    if (settings.showToolbar === false) document.body.classList.add("no-toolbar");
    state.zoom = 100;
    global.Ed.setFontSize(settings.fontSize || 16);
    buildRecentMenu();
    if (settings.lastFolder && api()) {
      api().list_dir(settings.lastFolder).then(function (tree) {
        if (tree && !tree.error) global.Files.openFolder(settings.lastFolder, tree);
      });
    }
  }

  // ---------- command dispatch ----------
  var COMMANDS = {
    "file.new": newFile,
    "file.open": openFile,
    "file.openFolder": openFolder,
    "file.newInFolder": newInFolder,
    "file.save": save,
    "file.saveAs": saveAs,
    "file.print": function () { doPrint(); },
    "export.pdf": function () { exportPDF(); },
    "export.html": function () { exportHTML(true); },
    "export.htmlPlain": function () { exportHTML(false); },
    "export.word": function () { exportWord(); },
    "app.preferences": showPreferences,
    "app.quit": function () { native("quit"); },
    "edit.undo": function () { global.Ed.cm().undo(); },
    "edit.redo": function () { global.Ed.cm().redo(); },
    "edit.find": function () { openFind(false); },
    "edit.replace": function () { openFind(true); },
    "edit.selectAll": function () { global.Ed.cm().execCommand("selectAll"); },
    "edit.copyMarkdown": copyMarkdown,
    "edit.copyHtml": copyHtml,
    "view.sidebar": function () { document.body.classList.toggle("no-sidebar"); saveSettings({ sidebarVisible: !document.body.classList.contains("no-sidebar") }); global.Ed.refresh(); },
    "view.outline": function () { switchPanel("outline"); },
    "view.live": function () { setMode("live"); },
    "view.source": function () { setMode("source"); },
    "view.reading": function () { setMode("reading"); },
    "view.focus": function () { toggleClass("focus", "focusMode"); },
    "view.typewriter": function () { toggleClass("typewriter", "typewriterMode"); global.Ed.refresh(); },
    "view.fullscreen": function () { native("toggle_fullscreen"); },
    "view.zoomIn": function () { zoom(10); },
    "view.zoomOut": function () { zoom(-10); },
    "view.zoomReset": function () { zoom(0, true); },
    "help.markdown": showMarkdownRef,
    "help.shortcuts": showShortcuts,
    "help.about": showAbout,
    "find.next": function () { findNav(1); },
    "find.prev": function () { findNav(-1); },
    "find.replace": replaceOne,
    "find.replaceAll": replaceAll,
    "find.close": closeFind
  };

  function run(cmd) {
    if (cmd.indexOf("fmt.") === 0) { global.Ed.action(cmd); return; }
    if (COMMANDS[cmd]) COMMANDS[cmd]();
  }
  global.App = global.App || {};
  global.App.run = run;

  // ---------- files ----------
  function confirmDiscard() {
    if (!state.dirty) return Promise.resolve(true);
    return new Promise(function (resolve) {
      confirmModal("Unsaved changes",
        "You have unsaved changes in “" + state.name + "”. Save before continuing?",
        [
          { label: "Save", primary: true, act: function () { save().then(function () { resolve(true); }); } },
          { label: "Don't Save", act: function () { resolve(true); } },
          { label: "Cancel", act: function () { resolve(false); } }
        ]);
    });
  }

  function newFile() {
    confirmDiscard().then(function (ok) {
      if (!ok) return;
      state.path = null; state.name = "Untitled"; state.dirty = false;
      global.Ed.setValue("");
      setTitle(); updateStatus();
      global.Ed.focus();
    });
  }

  function openFile() {
    if (!api()) return;
    confirmDiscard().then(function (ok) {
      if (!ok) return;
      api().open_file_dialog().then(function (res) {
        if (res && !res.error) loadDoc(res);
      });
    });
  }

  function openPath(path) {
    confirmDiscard().then(function (ok) {
      if (!ok || !api()) return;
      api().read_file(path).then(function (res) {
        if (res && !res.error) loadDoc(res);
        else if (res && res.error) toast("Error: " + res.error);
      });
    });
  }
  global.App.openPath = openPath;

  function loadDoc(res) {
    state.path = res.path; state.name = res.name; state.dirty = false;
    global.App.currentPath = res.path;
    global.Ed.setValue(res.content);
    setTitle(); updateStatus(); buildRecentMenu();
    global.Ed.reRender();
    global.Ed.focus();
  }

  function openFolder() {
    if (!api()) return;
    api().open_folder_dialog().then(function (res) {
      if (res && res.path) {
        global.Files.openFolder(res.path, res.tree);
        switchPanel("files");
      }
    });
  }

  function newInFolder() {
    var folder = global.Files.currentFolder();
    if (!folder) { openFolder(); return; }
    promptModal("New file", "File name:", "untitled.md", function (name) {
      if (!name || !api()) return;
      api().new_file_in(folder, name).then(function (res) {
        if (res && res.path) { global.Files.refresh(); openPath(res.path); }
      });
    });
  }

  function save() {
    if (!api()) return Promise.resolve();
    if (!state.path) return saveAs();
    return api().write_file(state.path, global.Ed.getValue()).then(function (res) {
      if (res && !res.error) { markSaved(); toast("Saved"); }
      else toast("Save failed");
    });
  }

  function saveAs() {
    if (!api()) return Promise.resolve();
    return api().save_file_dialog(state.name || "untitled.md").then(function (path) {
      if (!path) return;
      return api().write_file(path, global.Ed.getValue()).then(function (res) {
        if (res && !res.error) {
          state.path = res.path; state.name = res.name;
          global.App.currentPath = res.path;
          markSaved(); setTitle(); buildRecentMenu();
          if (global.Files.currentFolder()) global.Files.refresh();
          toast("Saved");
        }
      });
    });
  }

  function markSaved() {
    state.dirty = false;
    state.lastSaved = global.Ed.getValue();
    setTitle(); updateStatus();
  }

  function onEditorChange() {
    state.dirty = global.Ed.getValue() !== state.lastSaved;
    setTitle();
    if (settings.autoSave && state.path) {
      if (autosaveTimer) clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(function () {
        if (state.dirty && state.path && api()) {
          api().write_file(state.path, global.Ed.getValue()).then(function () { markSaved(); });
        }
      }, 1500);
    }
  }

  // ---------- rendered callback ----------
  global.App.onRendered = function (outline) {
    global.Files.renderOutline(outline);
  };
  global.App.openExternal = function (href) {
    try { window.open(href, "_blank"); } catch (e) {}
  };

  // ---------- view modes ----------
  function setMode(mode, silent) {
    state.mode = mode;
    document.body.classList.remove("mode-live", "mode-source", "mode-reading");
    document.body.classList.add("mode-" + mode);
    document.getElementById("st-mode").textContent =
      mode === "live" ? "Live" : mode === "source" ? "Source" : "Reading";
    // highlight the active view-mode button in the header
    document.querySelectorAll("#quick-actions .qa").forEach(function (b) {
      if (["view.live", "view.source", "view.reading"].indexOf(b.dataset.cmd) >= 0)
        b.classList.toggle("active", b.dataset.cmd === "view." + mode);
    });
    if (!silent) saveSettings({ mode: mode });
    if (mode !== "source") global.Ed.reRender();
    setTimeout(function () { global.Ed.refresh(); }, 30);
  }

  function toggleClass(cls, settingKey) {
    document.body.classList.toggle(cls);
    var patch = {};
    patch[settingKey] = document.body.classList.contains(cls);
    saveSettings(patch);
  }

  function zoom(delta, reset) {
    if (reset) state.zoom = 100;
    else state.zoom = Math.min(220, Math.max(50, state.zoom + delta));
    var base = (settings.fontSize || 16) * state.zoom / 100;
    global.Ed.setFontSize(Math.round(base));
    document.getElementById("write").style.fontSize = Math.round(base) + "px";
  }

  // ---------- theme ----------
  function buildThemeMenu() {
    var menu = document.getElementById("theme-menu");
    THEMES.forEach(function (t) {
      var mi = document.createElement("div");
      mi.className = "mi theme-mi";
      mi.dataset.theme = t.id;
      mi.textContent = t.name;
      mi.addEventListener("click", function () { setTheme(t.id); closeMenus(); });
      menu.appendChild(mi);
    });
  }

  function setTheme(id, silent) {
    document.getElementById("doc-theme").href = "css/themes/" + id + ".css";
    document.getElementById("hljs-theme").href =
      "vendor/highlight/" + (CODE_THEMES[id] || "github") + ".min.css";
    THEMES.forEach(function (t) { document.body.classList.remove("theme-" + t.id); });
    document.body.classList.add("theme-" + id);
    // mark dark themes so the source editor (CodeMirror) can follow suit
    document.body.classList.toggle("dark-ui", !!DARK_THEMES[id]);
    document.getElementById("st-theme").textContent = id;
    document.querySelectorAll(".theme-mi").forEach(function (m) {
      m.classList.toggle("checked", m.dataset.theme === id);
    });
    if (!silent) saveSettings({ theme: id });
    global.Ed.setMermaidTheme();
    setTimeout(function () { global.Ed.reRender(); }, 60);
  }

  // ---------- menus ----------
  function bindMenus() {
    document.querySelectorAll("#menubar .menu > span").forEach(function (span) {
      span.addEventListener("click", function (e) {
        e.stopPropagation();
        var menu = span.parentElement;
        var wasOpen = menu.classList.contains("open");
        closeMenus();
        if (!wasOpen) menu.classList.add("open");
      });
    });
    document.querySelectorAll(".mi[data-cmd]").forEach(function (mi) {
      mi.addEventListener("click", function (e) {
        e.stopPropagation();
        run(mi.dataset.cmd);
        closeMenus();
      });
    });
    document.querySelectorAll("#quick-actions .qa").forEach(function (b) {
      b.addEventListener("click", function () { run(b.dataset.cmd); });
    });
    document.addEventListener("click", closeMenus);
  }
  function closeMenus() {
    document.querySelectorAll("#menubar .menu.open").forEach(function (m) {
      m.classList.remove("open");
    });
  }

  function buildRecentMenu() {
    var el = document.getElementById("recent-menu");
    el.innerHTML = "";
    var recent = settings.recentFiles || [];
    if (!recent.length) {
      el.innerHTML = '<div class="mi disabled">No recent files</div>';
      return;
    }
    recent.slice(0, 12).forEach(function (p) {
      var mi = document.createElement("div");
      mi.className = "mi";
      mi.textContent = p.replace(/^.*[\\/]/, "");
      mi.title = p;
      mi.addEventListener("click", function () { openPath(p); closeMenus(); });
      el.appendChild(mi);
    });
  }

  function bindToolbar() {
    document.querySelectorAll("#toolbar .tb").forEach(function (b) {
      b.addEventListener("click", function () { run(b.dataset.cmd); });
    });
  }

  function bindSidebarTabs() {
    document.querySelectorAll(".side-tab").forEach(function (tab) {
      tab.addEventListener("click", function () { switchPanel(tab.dataset.panel); });
    });
  }
  function switchPanel(name) {
    document.body.classList.remove("no-sidebar");
    document.querySelectorAll(".side-tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.panel === name);
    });
    document.querySelectorAll(".side-panel").forEach(function (p) {
      p.classList.toggle("active", p.dataset.panel === name);
    });
    global.Ed.refresh();
  }

  // ---------- shortcuts ----------
  function bindShortcuts() {
    document.addEventListener("keydown", function (e) {
      var mod = e.ctrlKey || e.metaKey;
      var k = e.key.toLowerCase();
      if (mod && !e.shiftKey && !e.altKey) {
        var map = {
          "n": "file.new", "o": "file.open", "s": "file.save", "p": "file.print",
          "f": "edit.find", "h": "edit.replace", "b": "fmt.bold", "i": "fmt.italic",
          "u": "fmt.underline", "k": "fmt.link", "`": "fmt.code", "\\": "view.sidebar",
          "/": "view.live", ",": "app.preferences", "=": "view.zoomIn", "-": "view.zoomOut",
          "1": "fmt.h1", "2": "fmt.h2", "3": "fmt.h3", "4": "fmt.h4", "5": "fmt.h5",
          "6": "fmt.h6", "0": "fmt.paragraph"
        };
        if (map[k]) { e.preventDefault(); run(map[k]); return; }
      }
      if (mod && e.shiftKey && k === "s") { e.preventDefault(); run("file.saveAs"); return; }
      if (mod && e.shiftKey && k === "k") { e.preventDefault(); run("fmt.codeblock"); return; }
      if (e.key === "F8") { e.preventDefault(); run("view.focus"); }
      if (e.key === "F9") { e.preventDefault(); run("view.typewriter"); }
      if (e.key === "F11") { e.preventDefault(); run("view.fullscreen"); }
      if (e.key === "Escape") { closeFind(); closeMenus(); closeModal(); }
    });
  }

  // ---------- find & replace ----------
  var findState = { query: "", cursor: null, matches: 0 };
  function bindFindBar() {
    var input = document.getElementById("find-input");
    input.addEventListener("input", function () { doFind(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); findNav(e.shiftKey ? -1 : 1); }
    });
    document.getElementById("find-case").addEventListener("change", function () { doFind(input.value); });
    document.getElementById("find-regex").addEventListener("change", function () { doFind(input.value); });
    document.querySelectorAll("#find-bar [data-cmd]").forEach(function (b) {
      b.addEventListener("click", function () { run(b.dataset.cmd); });
    });
    document.getElementById("replace-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); replaceOne(); }
    });
  }
  function openFind(withReplace) {
    var bar = document.getElementById("find-bar");
    bar.classList.remove("hidden");
    document.getElementById("replace-input").classList.toggle("hidden", !withReplace);
    document.getElementById("replace-btn").classList.toggle("hidden", !withReplace);
    document.getElementById("replace-all-btn").classList.toggle("hidden", !withReplace);
    var sel = global.Ed.cm().getSelection();
    var input = document.getElementById("find-input");
    if (sel) input.value = sel;
    input.focus(); input.select();
    doFind(input.value);
  }
  function closeFind() {
    document.getElementById("find-bar").classList.add("hidden");
    var cm = global.Ed.cm();
    cm.getAllMarks().forEach(function (m) { if (m.className === "cm-search-hit") m.clear(); });
    cm.focus();
  }
  function buildQuery(str) {
    var caseSens = document.getElementById("find-case").checked;
    var regex = document.getElementById("find-regex").checked;
    if (regex) {
      try { return new RegExp(str, caseSens ? "g" : "gi"); } catch (e) { return null; }
    }
    return caseSens ? str : new RegExp(str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  }
  function doFind(str) {
    findState.query = str;
    var cm = global.Ed.cm();
    cm.getAllMarks().forEach(function (m) { if (m.className === "cm-search-hit") m.clear(); });
    if (!str) { document.getElementById("find-count").textContent = ""; return; }
    var query = buildQuery(str);
    if (!query) { document.getElementById("find-count").textContent = "bad regex"; return; }
    var cursor = cm.getSearchCursor(query, { line: 0, ch: 0 });
    var count = 0;
    while (cursor.findNext()) {
      cm.markText(cursor.from(), cursor.to(), { className: "cm-search-hit" });
      count++;
      if (count > 5000) break;
    }
    findState.matches = count;
    document.getElementById("find-count").textContent = count + " matches";
    findState.cursor = cm.getSearchCursor(buildQuery(str), cm.getCursor());
  }
  function findNav(dir) {
    var cm = global.Ed.cm();
    if (!findState.query) return;
    var q = buildQuery(findState.query);
    var cur = cm.getSearchCursor(q, dir > 0 ? cm.getCursor("to") : cm.getCursor("from"));
    var found = dir > 0 ? cur.findNext() : cur.findPrevious();
    if (!found) {
      cur = cm.getSearchCursor(q, dir > 0 ? { line: 0, ch: 0 } : { line: cm.lineCount(), ch: 0 });
      found = dir > 0 ? cur.findNext() : cur.findPrevious();
    }
    if (found) {
      cm.setSelection(cur.from(), cur.to());
      cm.scrollIntoView({ from: cur.from(), to: cur.to() }, 80);
    }
  }
  function replaceOne() {
    var cm = global.Ed.cm();
    var repl = document.getElementById("replace-input").value;
    if (cm.getSelection()) {
      cm.replaceSelection(repl);
      global.Ed.render();
    }
    findNav(1);
    setTimeout(function () { doFind(findState.query); }, 10);
  }
  function replaceAll() {
    if (!findState.query) return;   // guard: empty query would match everywhere and loop
    var cm = global.Ed.cm();
    var repl = document.getElementById("replace-input").value;
    var q = buildQuery(findState.query);
    if (!q) return;
    var cur = cm.getSearchCursor(q, { line: 0, ch: 0 }), n = 0;
    cm.operation(function () {
      while (cur.findNext()) { cur.replace(repl); n++; }
    });
    global.Ed.render();
    toast(n + " replaced");
    doFind(findState.query);
  }

  // ---------- export ----------
  function fullHtmlDoc(styled) {
    var res = global.MarkdownEngine.render(global.Ed.getValue());
    var body = res.html;
    if (!styled) {
      return "<!DOCTYPE html>\n<html><head><meta charset='utf-8'><title>" +
        esc(state.name) + "</title></head>\n<body>" + body + "</body></html>";
    }
    var theme = collectCss("doc-theme");
    var hljs = collectCss("hljs-theme");
    var katexCss = collectKatexCss();
    var html = "<!DOCTYPE html>\n<html><head><meta charset='utf-8'>\n<title>" +
      esc(state.name) + "</title>\n<style>\n" +
      BASE_EXPORT_CSS + "\n" + katexCss + "\n" + hljs + "\n" + theme +
      "\n</style></head>\n<body class='theme-" + (settings.theme || "github") +
      "'>\n<article id='write'>\n" + body + "\n</article>\n</body></html>";
    return html;
  }

  function collectCss(id) {
    // inline the linked stylesheet by reading document.styleSheets
    var link = document.getElementById(id);
    if (!link) return "";
    for (var i = 0; i < document.styleSheets.length; i++) {
      var ss = document.styleSheets[i];
      if (ss.href && link.href && ss.href === link.href) {
        return cssText(ss);
      }
    }
    return "";
  }
  function collectKatexCss() {
    for (var i = 0; i < document.styleSheets.length; i++) {
      var ss = document.styleSheets[i];
      if (ss.href && ss.href.indexOf("katex") >= 0) return cssText(ss);
    }
    return "";
  }
  function cssText(ss) {
    try {
      var out = "";
      var rules = ss.cssRules || [];
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        // Inline @import rules (rule.styleSheet) so the imported sheet's rules
        // are embedded — a raw @import with a relative URL cannot resolve in a
        // standalone exported HTML file (this is where _base.css lives).
        if (rule.styleSheet) out += cssText(rule.styleSheet) + "\n";
        else out += rule.cssText + "\n";
      }
      return out;
    } catch (e) { return ""; }
  }

  function exportHTML(styled) {
    if (!api()) return;
    var name = (state.name || "document").replace(/\.[^.]+$/, "") + ".html";
    api().export_dialog(name, "html").then(function (path) {
      if (!path) return;
      // styled export embeds KaTeX fonts (via export_html); styleless is plain text
      var write = styled ? api().export_html : api().export_text;
      write.call(api(), path, fullHtmlDoc(styled)).then(function (res) {
        toast(res && res.path ? "Exported HTML" : "Export failed");
      });
    });
  }

  function exportWord() {
    if (!api()) return;
    var name = (state.name || "document").replace(/\.[^.]+$/, "") + ".docx";
    api().export_dialog(name, "docx").then(function (path) {
      if (!path) return;
      var res = global.MarkdownEngine.render(global.Ed.getValue());
      api().export_docx(path, res.html).then(function (r) {
        toast(r && r.path ? "Exported Word (" + (r.engine || "") + ")" : "Export failed");
      });
    });
  }

  function exportPDF() {
    // Use the print pipeline; user chooses "Save as PDF" in the print dialog.
    infoModal("Export to PDF",
      "<p>The print dialog will open. Choose <b>“Save as PDF”</b> (or “Microsoft Print to PDF”) as the printer and click Save.</p>" +
      "<p>The current theme is used for styling.</p>",
      "Open Print Dialog", function () { doPrint(); });
  }
  function doPrint() {
    var prev = state.mode;
    setMode("reading", true);
    setTimeout(function () {
      window.print();
      setMode(prev, true);
    }, 250);
  }

  function copyMarkdown() {
    navigator.clipboard.writeText(global.Ed.getValue()).then(function () { toast("Markdown copied"); });
  }
  function copyHtml() {
    var res = global.MarkdownEngine.render(global.Ed.getValue());
    navigator.clipboard.writeText(res.html).then(function () { toast("HTML copied"); });
  }

  // ---------- status ----------
  function updateStatus() {
    var s = global.Ed.stats();
    var c = global.Ed.cursorInfo();
    document.getElementById("st-words").textContent = s.words + " words";
    document.getElementById("st-chars").textContent = s.chars + " chars";
    document.getElementById("st-read").textContent = s.read + " min read";
    document.getElementById("st-pos").textContent = "Ln " + c.line + ", Col " + c.col;
    document.getElementById("st-sel").textContent = c.selLen ? (c.selLen + " selected") : "";
    document.getElementById("st-file").textContent =
      (state.dirty ? "● " : "") + (state.name || "Untitled");
  }

  function setTitle() {
    var t = (state.dirty ? "● " : "") + (state.name || "Untitled") + " — MarkView";
    document.title = t;
    native("set_title", t);
    updateStatus();
  }

  // ---------- resizers ----------
  function bindResizers() {
    dragResize("sidebar-resizer", "sidebar", "width", 140, 500);
    dragResize("pane-resizer", "editor-pane", "flexBasis", 200, 2000, true);
  }
  function dragResize(handleId, targetId, prop, min, max, flex) {
    var handle = document.getElementById(handleId);
    var target = document.getElementById(targetId);
    if (!handle) return;
    handle.addEventListener("mousedown", function (e) {
      e.preventDefault();
      var startX = e.clientX;
      var startW = target.getBoundingClientRect().width;
      document.body.style.cursor = "col-resize";
      function move(ev) {
        var w = Math.min(max, Math.max(min, startW + (ev.clientX - startX)));
        if (flex) target.style.flexBasis = w + "px";
        else target.style.width = w + "px";
        global.Ed.refresh();
      }
      function up() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        document.body.style.cursor = "";
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }

  function persistWindow() {
    saveSettings({ windowWidth: window.innerWidth, windowHeight: window.innerHeight });
  }

  // ---------- modals ----------
  function openModal(title, bodyHtml) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").innerHTML = bodyHtml;
    document.getElementById("modal-overlay").classList.remove("hidden");
  }
  function closeModal() { document.getElementById("modal-overlay").classList.add("hidden"); }

  function confirmModal(title, msg, buttons) {
    var html = "<p>" + esc(msg) + "</p><div class='modal-actions'></div>";
    openModal(title, html);
    var box = document.querySelector(".modal-actions");
    buttons.forEach(function (b) {
      var btn = document.createElement("button");
      btn.textContent = b.label;
      btn.className = "modal-btn" + (b.primary ? " primary" : "");
      btn.onclick = function () { closeModal(); b.act(); };
      box.appendChild(btn);
    });
  }
  function infoModal(title, html, actionLabel, act) {
    openModal(title, html + "<div class='modal-actions'></div>");
    var box = document.querySelector(".modal-actions");
    var ok = document.createElement("button");
    ok.textContent = actionLabel || "OK";
    ok.className = "modal-btn primary";
    ok.onclick = function () { closeModal(); if (act) act(); };
    box.appendChild(ok);
  }
  function promptModal(title, label, def, cb) {
    openModal(title, "<label class='modal-label'>" + esc(label) +
      "</label><input class='modal-input' id='modal-input' value='" + esc(def || "") +
      "'><div class='modal-actions'></div>");
    var input = document.getElementById("modal-input");
    input.focus(); input.select();
    input.onkeydown = function (e) { if (e.key === "Enter") { closeModal(); cb(input.value); } };
    var box = document.querySelector(".modal-actions");
    var ok = document.createElement("button");
    ok.className = "modal-btn primary"; ok.textContent = "OK";
    ok.onclick = function () { closeModal(); cb(input.value); };
    box.appendChild(ok);
  }
  global.App.fileContextMenu = function (path, e) {
    promptModal("Rename / Delete", "New name (blank + OK keeps; type DELETE to remove):",
      path.replace(/^.*[\\/]/, ""), function (val) {
        if (!api()) return;
        if (val === "DELETE") {
          api().delete_path(path).then(function () { global.Files.refresh(); });
        } else if (val && val !== path.replace(/^.*[\\/]/, "")) {
          api().rename_path(path, val).then(function () { global.Files.refresh(); });
        }
      });
  };

  // ---------- preferences ----------
  function showPreferences() {
    var html =
      "<div class='pref-grid'>" +
      pref("Theme", themeSelect()) +
      pref("Editor font size", "<input type='number' id='pref-font' min='10' max='40' value='" + (settings.fontSize || 16) + "'>") +
      pref("Auto-save", checkbox("pref-autosave", settings.autoSave)) +
      pref("Typewriter mode", checkbox("pref-typewriter", settings.typewriterMode)) +
      pref("Focus mode", checkbox("pref-focus", settings.focusMode)) +
      pref("Show toolbar", checkbox("pref-toolbar", settings.showToolbar !== false)) +
      "</div><div class='modal-actions'></div>";
    openModal("Preferences", html);
    var box = document.querySelector(".modal-actions");
    var ok = document.createElement("button");
    ok.className = "modal-btn primary"; ok.textContent = "Apply";
    ok.onclick = function () {
      var font = parseInt(document.getElementById("pref-font").value, 10) || 16;
      var autosave = document.getElementById("pref-autosave").checked;
      var tw = document.getElementById("pref-typewriter").checked;
      var fc = document.getElementById("pref-focus").checked;
      var tb = document.getElementById("pref-toolbar").checked;
      var theme = document.getElementById("pref-theme").value;
      saveSettings({ fontSize: font, autoSave: autosave, typewriterMode: tw, focusMode: fc, showToolbar: tb });
      global.Ed.setFontSize(font);
      document.getElementById("write").style.fontSize = font + "px";
      document.body.classList.toggle("typewriter", tw);
      document.body.classList.toggle("focus", fc);
      document.body.classList.toggle("no-toolbar", !tb);
      setTheme(theme);
      closeModal();
    };
    box.appendChild(ok);
  }
  function pref(label, control) {
    return "<div class='pref-row'><span>" + label + "</span>" + control + "</div>";
  }
  function checkbox(id, val) {
    return "<input type='checkbox' id='" + id + "'" + (val ? " checked" : "") + ">";
  }
  function themeSelect() {
    var s = "<select id='pref-theme'>";
    THEMES.forEach(function (t) {
      s += "<option value='" + t.id + "'" + (t.id === settings.theme ? " selected" : "") + ">" + t.name + "</option>";
    });
    return s + "</select>";
  }

  // ---------- help ----------
  function showAbout() {
    infoModal("About MarkView",
      "<div class='about'><h2>MarkView</h2>" +
      "<p>A feature-rich local Markdown editor &amp; viewer.</p>" +
      "<p>Live preview · KaTeX math · Mermaid diagrams · syntax highlighting · " +
      "9 themes · export to PDF/HTML/Word · outline · file tree · focus &amp; typewriter modes.</p>" +
      "<p class='dim'>Built with Python + pywebview, markdown-it, CodeMirror, KaTeX, Mermaid, highlight.js.</p></div>",
      "Close");
  }
  function showShortcuts() {
    var rows = [
      ["Ctrl+N", "New"], ["Ctrl+O", "Open"], ["Ctrl+S", "Save"], ["Ctrl+Shift+S", "Save As"],
      ["Ctrl+P", "Print / PDF"], ["Ctrl+F", "Find"], ["Ctrl+H", "Replace"],
      ["Ctrl+B", "Bold"], ["Ctrl+I", "Italic"], ["Ctrl+U", "Underline"], ["Ctrl+K", "Link"],
      ["Ctrl+`", "Inline code"], ["Ctrl+Shift+K", "Code fence"],
      ["Ctrl+1..6", "Heading 1–6"], ["Ctrl+0", "Paragraph"],
      ["Ctrl+\\", "Toggle sidebar"], ["Ctrl+/", "Live preview"],
      ["F8", "Focus mode"], ["F9", "Typewriter mode"], ["F11", "Fullscreen"],
      ["Ctrl+=", "Zoom in"], ["Ctrl+-", "Zoom out"], ["Ctrl+,", "Preferences"]
    ];
    var html = "<table class='sc-table'>";
    rows.forEach(function (r) { html += "<tr><td><kbd>" + r[0] + "</kbd></td><td>" + r[1] + "</td></tr>"; });
    html += "</table>";
    infoModal("Keyboard Shortcuts", html, "Close");
  }
  function showMarkdownRef() {
    confirmDiscard().then(function (ok) {
      if (!ok) return;
      state.path = null; state.name = "Markdown Reference"; state.dirty = false;
      global.App.currentPath = null;
      global.Ed.setValue(MD_REF); global.Ed.reRender();
      setTitle();
    });
  }

  // ---------- misc ----------
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add("hidden"); }, 1800);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // startup file hook (called from python)
  global.__openStartup = function (data) {
    if (data && !data.error) loadDoc(data);
  };

  // ---------- self-test diagnostics (pushed to Python; no cross-thread evaluate_js) ----------
  function runSelfDiag() {
    var write = document.getElementById("write");
    var diag = {
      booted: !!global.App.__booted,
      errors: global.__errors || [],
      hasEngine: !!global.MarkdownEngine,
      cmMounted: !!document.querySelector(".CodeMirror"),
      editorValueLen: global.Ed.getValue().length,
      previewChildren: write ? write.children.length : -1,
      previewHasKatex: write ? !!write.querySelector(".katex") : false,
      previewHasMermaid: write ? !!write.querySelector(".mermaid-rendered,.mermaid-src") : false,
      previewHasCode: write ? !!write.querySelector("pre code") : false,
      previewHasTable: write ? !!write.querySelector("table") : false,
      previewHasTask: write ? !!write.querySelector(".task-checkbox") : false,
      outlineItems: document.querySelectorAll(".outline-item").length,
      theme: document.body.className,
      statusWords: (document.getElementById("st-words") || {}).textContent,
      apiKeys: Object.keys((global.pywebview && global.pywebview.api) || {}).sort().join(",")
    };
    var r = global.MarkdownEngine.render(
      "# H\n\n**b** *i* `c`\n\n- [ ] a\n- [x] b\n\n$x^2$\n\n$$\\int x$$\n\n" +
      "| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nvar x=1;\n```\n\n[TOC]\n");
    diag.render = {
      hasKatex: r.html.indexOf("katex") >= 0,
      hasTaskbox: r.html.indexOf("task-checkbox") >= 0,
      hasTable: r.html.indexOf("<table") >= 0,
      hasToc: r.html.indexOf("md-toc") >= 0,
      outline: r.outline.length
    };
    // verify the source editor follows a dark theme (Night)
    try {
      var savedClass = document.body.className;
      setTheme("night", true);
      var ep = document.getElementById("editor-pane");
      diag.darkEditorBg = getComputedStyle(ep).backgroundColor;
      diag.hasDarkUi = document.body.classList.contains("dark-ui");
      document.body.className = savedClass;
      setTheme((settings.theme || "github"), true);
    } catch (e) {
      diag.darkProbeError = String(e);
    }
    // verify styled HTML export inlines _base.css (a base-only selector must appear)
    try {
      var exported = fullHtmlDoc(true);
      diag.exportHasBaseCss = exported.indexOf("task-list-item") >= 0;
      // the assembled export must carry KaTeX @font-face src refs for the
      // backend to embed as data URIs
      diag.exportHasKatexSrc = /src\s*:[^;{}]*KaTeX_[^;{}]*\.woff2/.test(exported);
      // write a real styled export to disk so the harness can verify it end-to-end
      if (global.pywebview && global.pywebview.api && global.pywebview.api.selftest_export)
        global.pywebview.api.selftest_export(exported);
    } catch (e2) {
      diag.exportError = String(e2);
    }
    if (global.pywebview && global.pywebview.api)
      global.pywebview.api.selftest_report(JSON.stringify(diag));
  }
  function trySelftest(tries) {
    tries = tries || 0;
    if (tries > 60) return;
    if (global.pywebview && global.pywebview.api && global.pywebview.api.selftest_mode) {
      global.pywebview.api.selftest_mode().then(function (on) {
        if (!on) return;
        var wait = function () {
          if (global.App.__booted && global.Ed && global.Ed.cm && global.Ed.cm())
            setTimeout(runSelfDiag, 1800);
          else setTimeout(wait, 200);
        };
        wait();
      });
    } else {
      setTimeout(function () { trySelftest(tries + 1); }, 250);
    }
  }
  trySelftest(0);

  // ---------- content ----------
  var WELCOME = [
    "# Welcome to MarkView",
    "",
    "A feature-rich local Markdown editor and viewer — a **Typora-style** clone that runs entirely on your machine.",
    "",
    "## Try it out",
    "",
    "- Type Markdown on the left, see it **live** on the right",
    "- `Ctrl+B` **bold**, `Ctrl+I` *italic*, `Ctrl+K` links",
    "- Switch themes from the **Themes** menu",
    "- Open a folder to browse your notes",
    "",
    "### Task lists",
    "",
    "- [x] Live preview",
    "- [x] Math & diagrams",
    "- [ ] Write something great",
    "",
    "### Math",
    "",
    "Inline $E = mc^2$ and display:",
    "",
    "$$",
    "\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}",
    "$$",
    "",
    "### Diagram",
    "",
    "```mermaid",
    "graph LR",
    "  A[Write] --> B[Preview]",
    "  B --> C{Export}",
    "  C --> D[PDF]",
    "  C --> E[HTML]",
    "  C --> F[Word]",
    "```",
    "",
    "### Code",
    "",
    "```python",
    "def greet(name):",
    "    return f\"Hello, {name}!\"",
    "```",
    "",
    "> Tip: press `Ctrl+,` to open Preferences, or **Help → Keyboard Shortcuts**.",
    "",
    "| Feature | Supported |",
    "| --- | :---: |",
    "| Live preview | ✅ |",
    "| Export PDF | ✅ |",
    "| Themes | ✅ |",
    ""
  ].join("\n");

  var MD_REF = [
    "# Markdown Reference",
    "",
    "## Headings",
    "```", "# H1", "## H2", "### H3", "```",
    "",
    "## Emphasis",
    "```", "**bold**  *italic*  ~~strike~~  ==highlight==  `code`", "```",
    "**bold**  *italic*  ~~strike~~  ==highlight==  `code`",
    "",
    "## Lists",
    "```", "- bullet", "  - nested", "1. ordered", "- [ ] task", "- [x] done", "```",
    "",
    "## Links & images",
    "```", "[label](https://example.com)", "![alt](image.png)", "```",
    "",
    "## Blockquote",
    "> Quoted text",
    "",
    "## Code fence",
    "````", "```js", "console.log('hi')", "```", "````",
    "",
    "## Table",
    "```", "| A | B |", "| --- | --- |", "| 1 | 2 |", "```",
    "| A | B |", "| --- | --- |", "| 1 | 2 |",
    "",
    "## Math",
    "Inline `$a^2+b^2=c^2$` → $a^2+b^2=c^2$",
    "",
    "## Footnotes",
    "Here is a footnote[^1].",
    "",
    "[^1]: The footnote text.",
    "",
    "## Diagrams (Mermaid)",
    "````", "```mermaid", "sequenceDiagram", "  Alice->>Bob: Hello", "```", "````",
    ""
  ].join("\n");

  var BASE_EXPORT_CSS =
    "*{box-sizing:border-box}body{margin:0;padding:0}" +
    "#write{max-width:860px;margin:0 auto;padding:40px 30px;}" +
    "img{max-width:100%}table{border-collapse:collapse}" +
    ".task-checkbox{margin-right:.4em}";

  function safeBoot() {
    if (global.App.__booted) return;
    global.App.__booted = true;
    boot();
  }
  global.App.boot = safeBoot;

  // Start once the pywebview API bridge is ready. In a plain browser (no bridge)
  // fall back to a timer so the UI still comes up for testing.
  if (global.pywebview && global.pywebview.api) safeBoot();
  window.addEventListener("pywebviewready", safeBoot);
  setTimeout(safeBoot, 900);
})(window);
