// Bur Oak Fence & Rail Co. — example portfolio site
// Small progressive-enhancement touches only: mobile nav toggle,
// a friendly (non-functional, no backend) quote form response,
// and an auto-updating footer year.

(function () {
  "use strict";

  // ----- mobile nav toggle -----
  var navToggle = document.getElementById("navToggle");
  var primaryNav = document.getElementById("primaryNav");

  if (navToggle && primaryNav) {
    navToggle.addEventListener("click", function () {
      var isOpen = primaryNav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    // Close the mobile menu after tapping a link
    primaryNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        primaryNav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // ----- quote form (static demo — no backend) -----
  var quoteForm = document.getElementById("quoteForm");
  var formStatus = document.getElementById("formStatus");

  if (quoteForm && formStatus) {
    quoteForm.addEventListener("submit", function (event) {
      event.preventDefault();

      if (!quoteForm.checkValidity()) {
        formStatus.textContent = "Please fill in the required fields above.";
        formStatus.style.color = "#8a5a34";
        return;
      }

      var nameField = document.getElementById("name");
      var firstName = (nameField.value || "").trim().split(" ")[0] || "there";

      formStatus.textContent =
        "Thanks, " + firstName + " — this is a demo form, so nothing was actually sent.";
      formStatus.style.color = "";
      quoteForm.reset();
    });
  }

  // ----- footer year -----
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }
})();
