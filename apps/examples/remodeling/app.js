/* ==========================================================================
   Ledger & Beam Remodeling — portfolio example site
   Small progressive-enhancement script: mobile nav toggle, sticky header
   shadow, footer year, and a client-side-only "thank you" state for the
   quote form (there is no backend — this is a static portfolio piece).
   ========================================================================== */

(function () {
  'use strict';

  // ---------- Mobile nav toggle ----------
  var navToggle = document.getElementById('nav-toggle');
  var mainNav = document.getElementById('main-nav');

  if (navToggle && mainNav) {
    navToggle.addEventListener('click', function () {
      var isOpen = mainNav.classList.toggle('is-open');
      navToggle.classList.toggle('is-open', isOpen);
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    // Close the mobile menu after tapping a link
    mainNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        mainNav.classList.remove('is-open');
        navToggle.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ---------- Sticky header shadow on scroll ----------
  var header = document.getElementById('site-header');
  if (header) {
    var onScroll = function () {
      if (window.scrollY > 8) {
        header.style.boxShadow = '0 6px 20px rgba(20, 23, 28, 0.08)';
      } else {
        header.style.boxShadow = 'none';
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---------- Footer year ----------
  var yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  // ---------- Quote form (demo only — no backend) ----------
  var form = document.getElementById('quote-form');
  var formNote = document.getElementById('form-note');

  if (form && formNote) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      formNote.textContent = 'Thanks! This is a demo form on a portfolio example site, so nothing was actually sent.';
      form.reset();
    });
  }

})();
