/* editor.js — CodeMirror source editor + live preview, scroll sync,
   mermaid rendering, stats, and markdown formatting actions. */
(function (global) {
  "use strict";

  var cm, previewEl, editorPane, previewPane;
  var renderTimer = null, onChangeCb = null, onCursorCb = null;
  var lastHTML = "";
  var mermaidReady = false;
  var syncingFromEditor = false, syncingFromPreview = false;

  function initMermaid() {
    if (!global.mermaid) return;
    try {
      global.mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        theme: document.body.classList.contains("theme-night") ||
               document.body.classList.contains("theme-dark") ? "dark" : "default"
      });
      mermaidReady = true;
    } catch (e) { console.warn("mermaid init", e); }
  }

  function Editor(textarea, preview) {
    previewEl = preview;
    editorPane = document.getElementById("editor-pane");
    previewPane = document.getElementById("preview-pane");

    cm = global.CodeMirror.fromTextArea(textarea, {
      mode: "gfm",
      lineNumbers: false,
      lineWrapping: true,
      theme: "default",
      autofocus: true,
      styleActiveLine: false,
      matchBrackets: true,
      autoCloseBrackets: true,
      indentUnit: 4,
      tabSize: 4,
      placeholder: "Start writing… (Markdown supported)",
      extraKeys: {
        "Enter": "newlineAndIndentContinueMarkdownList",
        "Tab": function (c) {
          if (c.somethingSelected()) c.indentSelection("add");
          else c.replaceSelection("    ", "end");
        },
        "Shift-Tab": function (c) { c.indentSelection("subtract"); }
      }
    });

    cm.on("change", function () {
      scheduleRender();
      if (onChangeCb) onChangeCb();
    });
    cm.on("cursorActivity", function () {
      if (onCursorCb) onCursorCb();
      applyTypewriter();
    });
    cm.on("scroll", syncPreviewFromEditor);

    // preview -> editor scroll sync
    previewPane.addEventListener("scroll", syncEditorFromPreview);

    // clicking preview places cursor at nearest source line
    previewEl.addEventListener("dblclick", function (e) {
      var el = e.target.closest("[data-line]");
      if (el) {
        var line = parseInt(el.getAttribute("data-line"), 10);
        cm.setCursor({ line: line, ch: 0 });
        cm.focus();
      }
    });

    initMermaid();
    return this;
  }

  function scheduleRender() {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(renderNow, 90);
  }

  function renderNow() {
    var res = global.MarkdownEngine.render(cm.getValue());
    if (res.html !== lastHTML) {
      previewEl.innerHTML = res.html;
      lastHTML = res.html;
      renderMermaid();
      wireLinks();
      global.App && global.App.onRendered && global.App.onRendered(res.outline);
    }
  }

  function renderMermaid() {
    if (!mermaidReady) return;
    var nodes = previewEl.querySelectorAll(".mermaid-src");
    if (!nodes.length) return;
    nodes.forEach(function (node, i) {
      var code = decodeURIComponent(node.getAttribute("data-code") || "");
      var id = "mmd-" + Date.now() + "-" + i;
      try {
        global.mermaid.render(id, code).then(function (out) {
          node.innerHTML = out.svg;
          node.classList.remove("mermaid-src");
          node.classList.add("mermaid-rendered");
        }).catch(function (err) {
          node.innerHTML = '<pre class="mermaid-error">' + String(err) + "</pre>";
        });
      } catch (e) {
        node.innerHTML = '<pre class="mermaid-error">' + String(e) + "</pre>";
      }
    });
  }

  function wireLinks() {
    previewEl.querySelectorAll("a[href]").forEach(function (a) {
      a.onclick = function (e) {
        var href = a.getAttribute("href") || "";
        if (href.charAt(0) === "#") {
          e.preventDefault();
          var t = previewEl.querySelector('[id="' + href.slice(1) + '"]');
          if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (/^[a-z]+:\/\//i.test(href)) {
          e.preventDefault();
          global.App && global.App.openExternal && global.App.openExternal(href);
        }
      };
    });
    // resolve relative images to data URIs via backend
    if (global.App && global.App.currentPath) {
      previewEl.querySelectorAll("img[src]").forEach(function (img) {
        var src = img.getAttribute("src") || "";
        if (src.startsWith("http") || src.startsWith("data:")) return;
        if (global.pywebview && global.pywebview.api) {
          global.pywebview.api.resolve_image(global.App.currentPath, src)
            .then(function (uri) { if (uri) img.src = uri; });
        }
      });
    }
  }

  // ---------- scroll sync ----------
  function lineElements() {
    return previewEl.querySelectorAll("[data-line]");
  }
  function syncPreviewFromEditor() {
    if (syncingFromPreview) return;
    if (!document.body.classList.contains("mode-live")) return;
    syncingFromEditor = true;
    var info = cm.getScrollInfo();
    var topLine = cm.lineAtHeight(info.top, "local");
    var els = lineElements(), target = null, prev = null;
    for (var i = 0; i < els.length; i++) {
      var l = parseInt(els[i].getAttribute("data-line"), 10);
      if (l >= topLine) { target = els[i]; break; }
      prev = els[i];
    }
    var ref = target || prev;
    if (ref) {
      var top = ref.offsetTop - 20;
      previewPane.scrollTop = top;
    } else if (info.height - info.clientHeight > 0) {
      var ratio = info.top / (info.height - info.clientHeight);
      previewPane.scrollTop = ratio * (previewPane.scrollHeight - previewPane.clientHeight);
    }
    setTimeout(function () { syncingFromEditor = false; }, 30);
  }
  function syncEditorFromPreview() {
    if (syncingFromEditor) return;
    if (!document.body.classList.contains("mode-live")) return;
    syncingFromPreview = true;
    var els = lineElements(), scrollTop = previewPane.scrollTop, target = null;
    for (var i = 0; i < els.length; i++) {
      if (els[i].offsetTop >= scrollTop) { target = els[i]; break; }
    }
    if (target) {
      var line = parseInt(target.getAttribute("data-line"), 10);
      var h = cm.heightAtLine(line, "local");
      cm.scrollTo(null, h - 20);
    }
    setTimeout(function () { syncingFromPreview = false; }, 30);
  }

  // ---------- typewriter ----------
  function applyTypewriter() {
    if (!document.body.classList.contains("typewriter")) return;
    var cursor = cm.getCursor();
    var h = cm.charCoords(cursor, "local").top;
    var half = cm.getScrollInfo().clientHeight / 2;
    cm.scrollTo(null, h - half);
  }

  // ---------- stats ----------
  function stats() {
    var text = cm.getValue();
    var words = (text.match(/[A-Za-z0-9À-ɏ一-鿿]+/g) || []).length;
    var chars = text.length;
    var charsNoSpace = text.replace(/\s/g, "").length;
    var lines = cm.lineCount();
    var read = Math.max(1, Math.round(words / 200));
    return { words: words, chars: chars, charsNoSpace: charsNoSpace, lines: lines, read: read };
  }

  // ---------- formatting helpers ----------
  function toggleWrap(before, after) {
    after = after == null ? before : after;
    var sel = cm.getSelection();
    if (sel) {
      if (sel.startsWith(before) && sel.endsWith(after) && sel.length >= before.length + after.length) {
        cm.replaceSelection(sel.slice(before.length, sel.length - after.length), "around");
      } else {
        cm.replaceSelection(before + sel + after, "around");
      }
    } else {
      var cur = cm.getCursor();
      cm.replaceSelection(before + after);
      cm.setCursor({ line: cur.line, ch: cur.ch + before.length });
    }
    cm.focus();
  }

  function eachSelectedLine(fn) {
    var from = cm.getCursor("from"), to = cm.getCursor("to");
    cm.operation(function () {
      for (var l = from.line; l <= to.line; l++) {
        var text = cm.getLine(l);
        cm.replaceRange(fn(text, l), { line: l, ch: 0 }, { line: l, ch: text.length });
      }
    });
    cm.focus();
  }

  function setHeading(level) {
    eachSelectedLine(function (text) {
      text = text.replace(/^#{1,6}\s+/, "");
      return level === 0 ? text : new Array(level + 1).join("#") + " " + text;
    });
  }

  function toggleLinePrefix(prefix) {
    var from = cm.getCursor("from"), all = true;
    for (var l = from.line; l <= cm.getCursor("to").line; l++) {
      if (cm.getLine(l).indexOf(prefix) !== 0) { all = false; break; }
    }
    eachSelectedLine(function (text) {
      if (all) return text.slice(prefix.length);
      return prefix + text;
    });
  }

  function orderedList() {
    var from = cm.getCursor("from"), n = 1;
    eachSelectedLine(function (text) {
      return (n++) + ". " + text.replace(/^\d+\.\s+/, "");
    });
  }

  function insertBlock(text, selectOffset) {
    var cur = cm.getCursor();
    var pre = cur.ch === 0 ? "" : "\n";
    cm.replaceSelection(pre + text);
    cm.focus();
  }

  var ACTIONS = {
    "fmt.bold": function () { toggleWrap("**"); },
    "fmt.italic": function () { toggleWrap("*"); },
    "fmt.underline": function () { toggleWrap("<u>", "</u>"); },
    "fmt.strike": function () { toggleWrap("~~"); },
    "fmt.code": function () { toggleWrap("`"); },
    "fmt.highlight": function () { toggleWrap("==", "=="); },
    "fmt.h1": function () { setHeading(1); },
    "fmt.h2": function () { setHeading(2); },
    "fmt.h3": function () { setHeading(3); },
    "fmt.h4": function () { setHeading(4); },
    "fmt.h5": function () { setHeading(5); },
    "fmt.h6": function () { setHeading(6); },
    "fmt.paragraph": function () { setHeading(0); },
    "fmt.ul": function () { toggleLinePrefix("- "); },
    "fmt.ol": function () { orderedList(); },
    "fmt.task": function () { toggleLinePrefix("- [ ] "); },
    "fmt.quote": function () { toggleLinePrefix("> "); },
    "fmt.codeblock": function () { insertBlock("```\n" + (cm.getSelection() || "") + "\n```\n"); },
    "fmt.math": function () { insertBlock("$$\n" + (cm.getSelection() || "") + "\n$$\n"); },
    "fmt.hr": function () { insertBlock("\n---\n"); },
    "fmt.toc": function () { insertBlock("\n[TOC]\n"); },
    "fmt.table": function () {
      insertBlock("\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n" +
        "| Cell | Cell | Cell |\n| Cell | Cell | Cell |\n");
    },
    "fmt.link": function () {
      var sel = cm.getSelection() || "text";
      cm.replaceSelection("[" + sel + "](https://)");
      cm.focus();
    },
    "fmt.image": function () {
      var sel = cm.getSelection() || "alt";
      cm.replaceSelection("![" + sel + "](https://)");
      cm.focus();
    },
    "fmt.clear": function () {
      var sel = cm.getSelection();
      if (sel) cm.replaceSelection(sel.replace(/[*_`~=]|<\/?u>/g, ""));
    }
  };

  // ---------- public API ----------
  global.Ed = {
    init: Editor,
    cm: function () { return cm; },
    getValue: function () { return cm.getValue(); },
    setValue: function (v) {
      cm.setValue(v || "");
      cm.clearHistory();
      renderNow();
    },
    onChange: function (cb) { onChangeCb = cb; },
    onCursor: function (cb) { onCursorCb = cb; },
    render: renderNow,
    stats: stats,
    focus: function () { cm.focus(); },
    action: function (name) { if (ACTIONS[name]) { ACTIONS[name](); scheduleRender(); return true; } return false; },
    cursorInfo: function () {
      var c = cm.getCursor();
      var sel = cm.getSelection();
      return { line: c.line + 1, col: c.ch + 1, selLen: sel.length,
        selWords: sel ? (sel.match(/\S+/g) || []).length : 0 };
    },
    scrollToLine: function (line) {
      var h = cm.heightAtLine(line, "local");
      cm.scrollTo(null, h - 40);
      cm.setCursor({ line: line, ch: 0 });
    },
    refresh: function () { cm.refresh(); },
    setFontSize: function (px) {
      document.getElementById("panes").style.fontSize = px + "px";
      cm.refresh();
    },
    insertText: function (t) { cm.replaceSelection(t); scheduleRender(); },
    setMermaidTheme: initMermaid,
    reRender: function () { lastHTML = "___force___"; renderNow(); }
  };
})(window);
