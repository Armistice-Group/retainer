// Theme toggle, search dialog, mobile menu, code copy, tabs and the
// "On this page" highlight. No dependencies besides Pagefind UI.
(function () {
  var root = document.documentElement;

  // Theme: follows the OS until toggled, then remembers the choice.
  document.querySelector(".theme-btn").addEventListener("click", function () {
    var dark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch { /* storage blocked */ }
  });

  // Search (Pagefind), opened with the button, "/" or Cmd/Ctrl+K.
  var dialog = document.querySelector(".search-dialog");
  var ui = null;
  function openSearch() {
    if (!ui && window.PagefindUI) {
      ui = new window.PagefindUI({ element: "#search", showSubResults: true, showImages: false, resetStyles: false });
    }
    dialog.showModal();
    setTimeout(function () {
      var input = dialog.querySelector("input");
      if (input) input.focus();
    }, 30);
  }
  document.querySelector(".search-btn").addEventListener("click", openSearch);
  dialog.addEventListener("click", function (e) {
    if (e.target === dialog) dialog.close();
  });
  document.addEventListener("keydown", function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((e.key === "/" && !typing) || (e.key === "k" && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      openSearch();
    }
  });

  // Mobile menu.
  var menu = document.querySelector(".menu-btn");
  menu.addEventListener("click", function () {
    var open = document.body.classList.toggle("nav-open");
    menu.setAttribute("aria-expanded", String(open));
  });

  // Copy buttons.
  document.querySelectorAll(".code-block .copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var code = btn.parentElement.querySelector("pre").innerText;
      navigator.clipboard.writeText(code.replace(/\n$/, "")).then(function () {
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = "Copy"; }, 1500);
      });
    });
  });

  // Code groups and tabs.
  document.querySelectorAll(".code-group, .tabs").forEach(function (group) {
    var buttons = group.querySelectorAll(":scope > .code-tabs > button");
    var panels = group.querySelectorAll(":scope > .code-panel");
    buttons.forEach(function (btn, i) {
      btn.addEventListener("click", function () {
        buttons.forEach(function (b, j) { b.setAttribute("aria-selected", String(i === j)); });
        panels.forEach(function (p, j) { p.hidden = i !== j; });
      });
    });
  });

  // Open an accordion when a link points into it.
  function openTarget() {
    var id = decodeURIComponent(location.hash.slice(1));
    var el = id && document.getElementById(id);
    var d = el && el.closest("details");
    if (d) { d.open = true; el.scrollIntoView(); }
  }
  window.addEventListener("hashchange", openTarget);
  openTarget();

  // Highlight the current section in "On this page".
  var links = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
  if (links.length && "IntersectionObserver" in window) {
    var byId = {};
    links.forEach(function (a) { byId[decodeURIComponent(a.hash.slice(1))] = a; });
    var io = new IntersectionObserver(function () {
      var heads = document.querySelectorAll(".prose h2[id], .prose h3[id]");
      var current = null;
      for (var i = 0; i < heads.length; i++) {
        if (heads[i].getBoundingClientRect().top < 120) current = heads[i].id;
      }
      links.forEach(function (a) { a.classList.remove("active"); });
      if (current && byId[current]) byId[current].classList.add("active");
    }, { rootMargin: "-60px 0px -70% 0px" });
    document.querySelectorAll(".prose h2[id], .prose h3[id]").forEach(function (h) { io.observe(h); });
  }
})();
