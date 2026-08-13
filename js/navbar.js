/**
 * navbar.js — Professional Responsive Navbar Logic
 * Handles mobile drawer, user info, and hamburger animation.
 */
(function () {
  "use strict";

  /* ─── Elements ─── */
  var hamburger = document.getElementById("navHamburger");
  var drawer = document.getElementById("navDrawer");
  var overlay = document.getElementById("navDrawerOverlay");
  var closeBtn = document.getElementById("navDrawerClose");

  /* ─── Open / Close helpers ─── */
  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add("open");
    overlay.classList.add("show");
    hamburger && hamburger.classList.add("open");
    document.body.style.overflow = "hidden"; // prevent scroll behind drawer
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove("open");
    overlay.classList.remove("show");
    hamburger && hamburger.classList.remove("open");
    document.body.style.overflow = "";
  }

  /* ─── Event listeners ─── */
  if (hamburger) hamburger.addEventListener("click", openDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (overlay) overlay.addEventListener("click", closeDrawer);

  // Close on ESC
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDrawer();
  });

  // Close drawer when a link inside it is clicked (navigation)
  if (drawer) {
    drawer.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeDrawer);
    });
  }

  /* ─── Fill user info from session ─── */
  function fillUserInfo() {
    // DB might be loaded after this script — wait a tick
    if (typeof DB === "undefined" || !DB.Session) return;

    var user = DB.Session.current();
    if (!user) return;

    var name = user.fullName || user.username || "المستخدم";
    var role = user.role === "admin" ? "مدير النظام" : "موظف استقبال";
    var initial = name.charAt(0) || "م";

    // Desktop topbar
    var topbarName = document.getElementById("topbarUserName");
    if (topbarName) topbarName.textContent = name;

    // Drawer
    var drawerName = document.getElementById("drawerUserName");
    if (drawerName) drawerName.textContent = name;

    var drawerRole = document.getElementById("drawerUserRole");
    if (drawerRole) drawerRole.textContent = role;

    var drawerAvatar = document.getElementById("drawerUserAvatar");
    if (drawerAvatar) drawerAvatar.textContent = initial;
  }

  // Try immediately, and also after DOM is fully loaded (for late-bound DB)
  fillUserInfo();
  window.addEventListener("load", fillUserInfo);
  document.addEventListener("DOMContentLoaded", function () {
    setTimeout(fillUserInfo, 100);
  });
})();
