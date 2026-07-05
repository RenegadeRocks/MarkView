/* files.js — folder tree, outline panel, and in-folder search. */
(function (global) {
  "use strict";

  var treeEl, outlineEl, folderName, searchInput, searchResults;
  var currentFolder = "";
  var expanded = {};

  function api() { return global.pywebview && global.pywebview.api; }

  function initFiles() {
    treeEl = document.getElementById("file-tree");
    outlineEl = document.getElementById("outline");
    folderName = document.getElementById("folder-name");
    searchInput = document.getElementById("global-search");
    searchResults = document.getElementById("search-results");

    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") runSearch(searchInput.value);
    });
  }

  function openFolder(path, tree) {
    currentFolder = path;
    folderName.textContent = path.replace(/^.*[\\/]/, "") || path;
    folderName.title = path;
    treeEl.innerHTML = "";
    renderLevel(treeEl, tree, path);
  }

  function renderLevel(container, entries, parentPath) {
    if (!entries || entries.error) {
      container.innerHTML = '<div class="tree-empty">Empty</div>';
      return;
    }
    entries.forEach(function (entry) {
      var row = document.createElement("div");
      row.className = "tree-row" + (entry.dir ? " is-dir" : " is-file");
      row.style.paddingLeft = "6px";
      var icon = document.createElement("span");
      icon.className = "tree-icon";
      icon.textContent = entry.dir ? (expanded[entry.path] ? "▾" : "▸") : "📄";
      var label = document.createElement("span");
      label.className = "tree-label";
      label.textContent = entry.name;
      row.appendChild(icon);
      row.appendChild(label);
      row.dataset.path = entry.path;
      container.appendChild(row);

      var childBox = null;
      if (entry.dir) {
        childBox = document.createElement("div");
        childBox.className = "tree-children";
        childBox.style.paddingLeft = "12px";
        container.appendChild(childBox);
        if (expanded[entry.path]) loadChildren(childBox, entry.path);
        row.addEventListener("click", function (e) {
          e.stopPropagation();
          expanded[entry.path] = !expanded[entry.path];
          icon.textContent = expanded[entry.path] ? "▾" : "▸";
          if (expanded[entry.path]) loadChildren(childBox, entry.path);
          else childBox.innerHTML = "";
        });
      } else {
        row.addEventListener("click", function (e) {
          e.stopPropagation();
          global.App.openPath(entry.path);
          markActive(row);
        });
        row.addEventListener("contextmenu", function (e) {
          e.preventDefault();
          global.App.fileContextMenu(entry.path, e);
        });
      }
    });
  }

  function loadChildren(box, path) {
    if (!api()) return;
    box.innerHTML = '<div class="tree-loading">…</div>';
    api().list_dir(path).then(function (entries) {
      box.innerHTML = "";
      renderLevel(box, entries, path);
    });
  }

  function markActive(row) {
    treeEl.querySelectorAll(".tree-row.active").forEach(function (r) {
      r.classList.remove("active");
    });
    row.classList.add("active");
  }

  function refreshTree() {
    if (currentFolder && api()) {
      api().list_dir(currentFolder).then(function (tree) {
        openFolder(currentFolder, tree);
      });
    }
  }

  // ---------- outline ----------
  function renderOutline(outline) {
    if (!outlineEl) return;
    if (!outline || !outline.length) {
      outlineEl.innerHTML = '<div class="tree-empty">No headings</div>';
      return;
    }
    outlineEl.innerHTML = "";
    outline.forEach(function (h) {
      var item = document.createElement("div");
      item.className = "outline-item lvl-" + h.level;
      item.textContent = h.text;
      item.title = h.text;
      item.addEventListener("click", function () {
        global.Ed.scrollToLine(h.line);
        var t = document.querySelector('#write [id="' + h.slug + '"]');
        if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      outlineEl.appendChild(item);
    });
  }

  // ---------- search ----------
  function runSearch(query) {
    if (!query || !currentFolder || !api()) return;
    searchResults.innerHTML = '<div class="tree-loading">Searching…</div>';
    searchAll(currentFolder, query.toLowerCase(), []).then(function (hits) {
      if (!hits.length) {
        searchResults.innerHTML = '<div class="tree-empty">No matches</div>';
        return;
      }
      searchResults.innerHTML = "";
      hits.slice(0, 200).forEach(function (h) {
        var item = document.createElement("div");
        item.className = "search-hit";
        item.innerHTML = '<div class="sh-file">' + h.name + "</div>" +
          '<div class="sh-line">' + escapeHtml(h.snippet) + "</div>";
        item.addEventListener("click", function () { global.App.openPath(h.path); });
        searchResults.appendChild(item);
      });
    });
  }

  function searchAll(folder, q, acc) {
    return api().list_dir(folder).then(function (entries) {
      if (!entries || entries.error) return acc;
      var chain = Promise.resolve();
      entries.forEach(function (e) {
        chain = chain.then(function () {
          if (e.dir) return searchAll(e.path, q, acc);
          return api().read_file(e.path).then(function (res) {
            if (res && res.content) {
              var lines = res.content.split("\n");
              for (var i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().indexOf(q) >= 0) {
                  acc.push({ name: e.name, path: e.path, snippet: lines[i].trim().slice(0, 100) });
                  break;
                }
              }
            }
          });
        });
      });
      return chain.then(function () { return acc; });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  global.Files = {
    init: initFiles,
    openFolder: openFolder,
    renderOutline: renderOutline,
    refresh: refreshTree,
    currentFolder: function () { return currentFolder; }
  };
})(window);
