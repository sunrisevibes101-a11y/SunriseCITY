(function () {
  "use strict";

  /* ---- sticky header shadow on scroll ---- */
  var header = document.getElementById("site-header");
  function onScroll() {
    if (!header) return;
    if (window.scrollY > 8) {
      header.classList.add("is-scrolled");
    } else {
      header.classList.remove("is-scrolled");
    }
  }
  document.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---- mobile nav toggle ---- */
  var navToggle = document.getElementById("nav-toggle");
  var nav = document.getElementById("primary-nav");

  function closeNav() {
    if (!navToggle || !nav) return;
    navToggle.setAttribute("aria-expanded", "false");
    nav.classList.remove("is-open");
  }

  if (navToggle && nav) {
    navToggle.addEventListener("click", function () {
      var isOpen = navToggle.getAttribute("aria-expanded") === "true";
      navToggle.setAttribute("aria-expanded", String(!isOpen));
      nav.classList.toggle("is-open", !isOpen);
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeNav);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeNav();
    });
  }

  /* ---- demo quote form: no backend, just a friendly confirmation ---- */
  var form = document.getElementById("quote-form");
  var success = document.getElementById("quote-success");

  if (form && success) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      if (typeof form.reportValidity === "function" && !form.reportValidity()) {
        return;
      }

      form.hidden = true;
      success.hidden = false;
      success.setAttribute("tabindex", "-1");
      success.focus();
    });
  }
})();
