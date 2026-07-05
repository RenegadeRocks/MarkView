/* markdown.js — configures markdown-it and renders a document to HTML.
   Features: GFM tables, footnotes, deflists, sub/sup, mark, ins, abbr,
   task lists, emoji shortcodes, KaTeX math ($..$ / $$..$$), mermaid,
   highlight.js code, heading anchors + slugs, [TOC], source line maps. */
(function (global) {
  "use strict";

  var EMOJI = {
    smile: "😄", laughing: "😆", blush: "😊", smiley: "😃", relaxed: "☺️",
    heart: "❤️", broken_heart: "💔", "+1": "👍", thumbsup: "👍", "-1": "👎",
    thumbsdown: "👎", ok_hand: "👌", punch: "👊", wave: "👋", clap: "👏",
    fire: "🔥", star: "⭐", star2: "🌟", zap: "⚡", boom: "💥", sparkles: "✨",
    tada: "🎉", rocket: "🚀", bulb: "💡", warning: "⚠️", exclamation: "❗",
    question: "❓", check: "✔️", white_check_mark: "✅", x: "❌", heavy_check_mark: "✔️",
    bug: "🐛", wrench: "🔧", hammer: "🔨", gear: "⚙️", lock: "🔒", key: "🔑",
    book: "📖", books: "📚", memo: "📝", pencil: "✏️", email: "📧", bell: "🔔",
    eyes: "👀", thinking: "🤔", joy: "😂", cry: "😢", sob: "😭", angry: "😠",
    sunglasses: "😎", wink: "😉", grin: "😁", sweat_smile: "😅", rofl: "🤣",
    coffee: "☕", pizza: "🍕", beer: "🍺", cat: "🐱", dog: "🐶", ghost: "👻",
    robot: "🤖", alien: "👽", poop: "💩", "100": "💯", muscle: "💪", pray: "🙏",
    point_right: "👉", point_left: "👈", point_up: "☝️", point_down: "👇",
    arrow_right: "➡️", arrow_left: "⬅️", arrow_up: "⬆️", arrow_down: "⬇️",
    sun: "☀️", moon: "🌙", cloud: "☁️", snowflake: "❄️", umbrella: "☔",
    apple: "🍎", green_heart: "💚", blue_heart: "💙", yellow_heart: "💛",
    purple_heart: "💜", tada2: "🎊", trophy: "🏆", medal: "🏅", dart: "🎯",
    calendar: "📅", clock: "🕐", hourglass: "⏳", telephone: "📞", computer: "💻",
    iphone: "📱", camera: "📷", movie_camera: "🎥", musical_note: "🎵", art: "🎨"
  };

  function slugify(s) {
    return String(s).trim().toLowerCase()
      .replace(/<[^>]+>/g, "")
      .replace(/[^\wÀ-￿ \-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "section";
  }

  var md = window.markdownit({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight: function (str, lang) {
      if (lang === "mermaid" || lang === "flow" || lang === "sequence") {
        return '<div class="mermaid-src" data-code="' +
          encodeURIComponent(str) + '"></div>';
      }
      var hl;
      try {
        if (lang && global.hljs && global.hljs.getLanguage(lang)) {
          hl = global.hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
        } else if (global.hljs) {
          hl = global.hljs.highlightAuto(str).value;
        }
      } catch (e) {}
      var body = hl != null ? hl : md.utils.escapeHtml(str);
      var label = lang ? '<span class="code-lang">' + md.utils.escapeHtml(lang) + "</span>" : "";
      return '<pre class="hljs-pre">' + label +
        '<code class="hljs language-' + (lang || "text") + '">' + body + "</code></pre>";
    }
  });

  // ---- plugins ----
  [
    "markdownitFootnote", "markdownitDeflist", "markdownitSub", "markdownitSup",
    "markdownitMark", "markdownitIns", "markdownitAbbr"
  ].forEach(function (name) {
    if (global[name]) md.use(global[name]);
  });

  // ---- GFM task lists ----
  md.core.ruler.after("inline", "task-lists", function (state) {
    var tokens = state.tokens;
    for (var i = 2; i < tokens.length; i++) {
      if (tokens[i].type !== "inline") continue;
      if (tokens[i - 1].type !== "paragraph_open") continue;
      if (tokens[i - 2].type !== "list_item_open") continue;
      var inline = tokens[i];
      var m = /^\[([ xX])\]\s/.exec(inline.content);
      if (!m) continue;
      var checked = m[1] !== " ";
      inline.content = inline.content.slice(m[0].length);
      if (inline.children && inline.children.length) {
        inline.children[0].content = inline.children[0].content.replace(/^\[([ xX])\]\s/, "");
      }
      var box = new state.Token("html_inline", "", 0);
      box.content = '<input class="task-checkbox" type="checkbox" disabled ' +
        (checked ? "checked" : "") + "> ";
      inline.children.unshift(box);
      tokens[i - 2].attrJoin("class", "task-list-item");
      tokens[i - 3] && tokens[i - 3].attrJoin && 0;
    }
    return true;
  });

  // ---- emoji ----
  md.core.ruler.push("emoji-shortcodes", function (state) {
    state.tokens.forEach(function (blk) {
      if (blk.type !== "inline" || !blk.children) return;
      blk.children.forEach(function (tok) {
        if (tok.type !== "text" || tok.content.indexOf(":") < 0) return;
        tok.content = tok.content.replace(/:([a-z0-9_+\-]+):/gi, function (m, name) {
          return EMOJI[name] != null ? EMOJI[name] : m;
        });
      });
    });
    return true;
  });

  // ---- math: inline $..$ and block $$..$$ ----
  function mathInline(state, silent) {
    var start = state.pos, src = state.src;
    if (src.charCodeAt(start) !== 0x24 /* $ */) return false;
    if (src.charCodeAt(start + 1) === 0x24) return false; // block handled elsewhere
    // no space right after opening $, and not escaped
    var pos = start + 1, found = -1;
    if (src.charCodeAt(pos) === 0x20 || pos >= src.length) return false;
    while (pos < src.length) {
      var ch = src.charCodeAt(pos);
      if (ch === 0x5c) { pos += 2; continue; } // backslash escape
      if (ch === 0x24) { found = pos; break; }
      pos++;
    }
    if (found < 0) return false;
    if (src.charCodeAt(found - 1) === 0x20) return false;
    var content = src.slice(start + 1, found);
    if (!content) return false;
    if (!silent) {
      var tok = state.push("math_inline", "math", 0);
      tok.content = content;
      tok.markup = "$";
    }
    state.pos = found + 1;
    return true;
  }

  function mathBlock(state, startLine, endLine, silent) {
    var pos = state.bMarks[startLine] + state.tShift[startLine];
    var max = state.eMarks[startLine];
    if (pos + 2 > max) return false;
    if (state.src.slice(pos, pos + 2) !== "$$") return false;
    var firstLine = state.src.slice(pos + 2, max);
    var content = "", nextLine = startLine, found = false, lastLine = "";
    if (firstLine.trim().slice(-2) === "$$") {
      firstLine = firstLine.trim().slice(0, -2);
      found = true;
    }
    if (found) {
      content = firstLine;
    } else {
      for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
        var mStart = state.bMarks[nextLine] + state.tShift[nextLine];
        var mMax = state.eMarks[nextLine];
        var line = state.src.slice(mStart, mMax);
        if (line.trim().slice(-2) === "$$") {
          lastLine = line.trim().slice(0, -2);
          found = true;
          break;
        }
        content += line + "\n";
      }
      content = (firstLine ? firstLine + "\n" : "") + content + lastLine;
    }
    if (!found) return false;
    if (silent) return true;
    state.line = nextLine + 1;
    var token = state.push("math_block", "math", 0);
    token.block = true;
    token.content = content.trim();
    token.markup = "$$";
    token.map = [startLine, state.line];
    return true;
  }

  md.inline.ruler.after("escape", "math_inline", mathInline);
  md.block.ruler.after("blockquote", "math_block", mathBlock,
    { alt: ["paragraph", "reference", "blockquote", "list"] });

  function renderKatex(content, display) {
    try {
      return global.katex.renderToString(content, {
        displayMode: display, throwOnError: false, strict: false,
        trust: true, output: "html"
      });
    } catch (e) {
      return '<span class="math-error" title="' +
        md.utils.escapeHtml(String(e)) + '">' + md.utils.escapeHtml(content) + "</span>";
    }
  }
  md.renderer.rules.math_inline = function (t, i) {
    return renderKatex(t[i].content, false);
  };
  md.renderer.rules.math_block = function (t, i) {
    return '<p class="math-display">' + renderKatex(t[i].content, true) + "</p>\n";
  };

  // ---- heading anchors + slugs + outline collection ----
  var lastOutline = [];
  md.core.ruler.push("heading-anchors", function (state) {
    var slugs = {}, outline = [];
    var toks = state.tokens;
    for (var i = 0; i < toks.length; i++) {
      if (toks[i].type !== "heading_open") continue;
      var inline = toks[i + 1];
      var text = inline.content;
      var base = slugify(text), slug = base, n = 1;
      while (slugs[slug]) slug = base + "-" + (n++);
      slugs[slug] = true;
      toks[i].attrSet("id", slug);
      var level = parseInt(toks[i].tag.slice(1), 10);
      outline.push({ level: level, text: text.replace(/<[^>]+>/g, ""), slug: slug,
        line: toks[i].map ? toks[i].map[0] : 0 });
    }
    lastOutline = outline;
    return true;
  });

  // ---- [TOC] ----
  function buildToc(outline) {
    if (!outline.length) return "";
    var html = '<div class="md-toc"><p class="toc-title">Table of Contents</p><ul>';
    outline.forEach(function (h) {
      html += '<li class="toc-lvl-' + h.level + '"><a href="#' + h.slug + '">' +
        md.utils.escapeHtml(h.text) + "</a></li>";
    });
    return html + "</ul></div>";
  }

  // ---- source line maps (for scroll sync) on block tokens ----
  function injectLineNumbers(md) {
    var rules = ["paragraph_open", "heading_open", "blockquote_open",
      "code_block", "fence", "list_item_open", "table_open", "hr", "math_block"];
    rules.forEach(function (rule) {
      var orig = md.renderer.rules[rule];
      md.renderer.rules[rule] = function (tokens, idx, options, env, self) {
        var tok = tokens[idx];
        if (tok.map && tok.level === 0) tok.attrSet("data-line", String(tok.map[0]));
        if (orig) return orig(tokens, idx, options, env, self);
        return self.renderToken(tokens, idx, options);
      };
    });
  }
  injectLineNumbers(md);

  // ---- link handling: mark external vs internal ----
  var defaultLink = md.renderer.rules.link_open ||
    function (t, i, o, e, s) { return s.renderToken(t, i, o); };
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    var href = tokens[idx].attrGet("href") || "";
    if (/^[a-z]+:\/\//i.test(href) || href.indexOf("mailto:") === 0) {
      tokens[idx].attrSet("data-external", "1");
    }
    return defaultLink(tokens, idx, options, env, self);
  };

  var API = {
    render: function (src) {
      var text = String(src == null ? "" : src);
      var hasToc = /^\s*\[TOC\]\s*$/im.test(text);
      var html = md.render(text);
      if (hasToc) {
        html = html.replace(/<p[^>]*>\s*\[TOC\]\s*<\/p>/i, buildToc(lastOutline));
      }
      return { html: html, outline: lastOutline.slice() };
    },
    outline: function () { return lastOutline.slice(); },
    slugify: slugify,
    md: md
  };

  global.MarkdownEngine = API;
})(window);
