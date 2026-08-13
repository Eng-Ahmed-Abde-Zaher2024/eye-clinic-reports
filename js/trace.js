/* ============================================================
   trace.js — منطق لوحة تتبع الزيارات المستقلة
   ============================================================ */

/* ====================================================
   ⚙️ إعدادات كلمة السر ورابط Google Apps Script
   ==================================================== */
var TRACE_PASSWORD = "Admin@123"; // كلمة سر صفحة التتبع
var APPS_SCRIPT_GET_URL = "https://script.google.com/macros/s/AKfycbxWYh4bXsx6CQUB1O4WpS9aj9gaKieDxgGYtv6kLQ3JlBi0Jrg9XOQw_5lupUqV8slpWA/exec"; // رابط Google Apps Script المباشر
/* ==================================================== */

$(function () {
  var allVisits = [];
  var filteredVisits = [];
  var currentPage = 1;
  var pageSize = 15;

  /* ---------------- Lock Screen ---------------- */
  function unlock() {
    var pass = $("#tracePass").val().trim();
    // السماح بـ Admin@123 أو admin أو كلمة السر في المتغير
    if (pass === TRACE_PASSWORD || pass === "admin" || pass === "Admin@123") {
      $("#lockScreen").fadeOut(300, function () {
        $("#dashboard").fadeIn(300);
        renderACUI();
        loadVisits();
      });
    } else {
      $("#lockErr").slideDown(200);
    }
  }

  $("#lockBtn").on("click", unlock);
  $("#tracePass").on("keypress", function (e) {
    if (e.which === 13) unlock();
  });

  $("#btnLock").on("click", function () {
    $("#dashboard").fadeOut(300, function () {
      $("#lockScreen").fadeIn(300);
      $("#tracePass").val("");
      $("#lockErr").hide();
    });
  });

  /* ---------------- Fetch Visits ---------------- */
  function loadVisits() {
    $("#statusText").text("جاري جلب البيانات...");

    // إذا كان الرابط مضبوطاً، نحاول الجلب من Google Apps Script
    if (APPS_SCRIPT_GET_URL && APPS_SCRIPT_GET_URL !== "YOUR_APPS_SCRIPT_URL_HERE") {
      var fetchUrl = APPS_SCRIPT_GET_URL + (APPS_SCRIPT_GET_URL.indexOf("?") > -1 ? "&" : "?") + "action=get";
      $.ajax({
        url: fetchUrl,
        type: "GET",
        dataType: "json",
        success: function (data) {
          if (Array.isArray(data)) {
            allVisits = data;
            $("#statusText").text("تم التحميل من Google Sheets بنجاح (" + allVisits.length + " زيارة)");
          } else {
            fallbackLocal();
          }
          applyFilters();
        },
        error: function () {
          fallbackLocal();
        }
      });
    } else {
      fallbackLocal();
    }
  }

  function fallbackLocal() {
    try {
      allVisits = JSON.parse(localStorage.getItem("eyeclinic_visits") || "[]");
      $("#statusText").text("ملاحظة: تُعرض زيارات المتصفح المحلي (قم بإعداد Google Sheets للجلب من كل الأجهزة). الإجمالي: " + allVisits.length);
    } catch (e) {
      allVisits = [];
      $("#statusText").text("لا توجد بيانات زيارات حتّى الآن.");
    }
    applyFilters();
  }

  $("#btnRefresh").on("click", loadVisits);

  /* ---------------- Filtering ---------------- */
  function applyFilters() {
    var q = $("#srch").val().trim().toLowerCase();
    var fltLogin = $("#fltLogin").val();
    var fltDevice = $("#fltDevice").val();

    filteredVisits = allVisits.filter(function (v) {
      if (fltLogin === "YES" && !v.loggedIn && v.loggedin !== "YES") return false;
      if (fltLogin === "NO" && (v.loggedIn || v.loggedin === "YES")) return false;

      if (fltDevice && (v.device || "").toLowerCase() !== fltDevice.toLowerCase()) return false;

      if (q) {
        var str = [
          v.page, v.browser, v.device, v.username, v.fullName, v.role, v.language, v.screen
        ].join(" ").toLowerCase();
        if (str.indexOf(q) === -1) return false;
      }

      return true;
    });

    currentPage = 1;
    renderStats();
    renderCharts();
    renderRankings();
    renderTable();
  }

  $("#srch").on("input", applyFilters);
  $("#fltLogin, #fltDevice").on("change", applyFilters);

  /* ---------------- Render Stats ---------------- */
  function renderStats() {
    var total = filteredVisits.length;
    var loggedInCount = 0;
    var anonCount = 0;
    var todayCount = 0;
    var deskCount = 0;

    var todayStr = new Date().toISOString().slice(0, 10);

    filteredVisits.forEach(function (v) {
      var isLogged = v.loggedIn || v.loggedin === "YES";
      if (isLogged) loggedInCount++;
      else anonCount++;

      var dateStr = (v.timestamp || "").slice(0, 10);
      if (dateStr === todayStr) todayCount++;

      if ((v.device || "").toLowerCase() === "desktop") deskCount++;
    });

    $("#sTotal").text(total);
    $("#sIn").text(loggedInCount);
    $("#sAnon").text(anonCount);
    $("#sToday").text(todayCount);
    $("#sDesk").text(deskCount);
  }

  /* ---------------- Render Charts ---------------- */
  function renderCharts() {
    // 1. Bar Chart (آخر 7 أيام)
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }

    var counts = {};
    days.forEach(function (day) { counts[day] = 0; });

    filteredVisits.forEach(function (v) {
      var dateStr = (v.timestamp || "").slice(0, 10);
      if (counts[dateStr] !== undefined) {
        counts[dateStr]++;
      }
    });

    var maxVal = 1;
    days.forEach(function (day) {
      if (counts[day] > maxVal) maxVal = counts[day];
    });

    var $barChart = $("#barChart").empty();
    days.forEach(function (day) {
      var val = counts[day];
      var pct = Math.round((val / maxVal) * 100);
      var dayLabel = day.slice(5); // MM-DD

      $barChart.append(`
        <div class="bar-col">
          <div class="bar-num">${val}</div>
          <div class="bar-fill" style="height:${pct}%;" title="${day}: ${val} زيارة"></div>
          <div class="bar-day">${dayLabel}</div>
        </div>
      `);
    });

    // 2. Donut Chart (الأجهزة)
    var devCounts = { Desktop: 0, Mobile: 0, Tablet: 0, Other: 0 };
    filteredVisits.forEach(function (v) {
      var dev = v.device || "Other";
      if (devCounts[dev] !== undefined) devCounts[dev]++;
      else devCounts.Other++;
    });

    var totalDev = filteredVisits.length || 1;
    var colors = { Desktop: "#1e8fd5", Mobile: "#f5820c", Tablet: "#8b5cf6", Other: "#6b7488" };

    var svg = document.getElementById("donutSvg");
    if (svg) {
      svg.innerHTML = "";
      var cx = 65, cy = 65, r = 45;
      var accumulatedAngle = 0;

      Object.keys(devCounts).forEach(function (key) {
        var cnt = devCounts[key];
        if (cnt === 0) return;
        var fraction = cnt / totalDev;
        var angle = fraction * 360;

        var startAngle = accumulatedAngle;
        var endAngle = accumulatedAngle + angle;
        accumulatedAngle += angle;

        var x1 = cx + r * Math.cos(Math.PI * startAngle / 180);
        var y1 = cy + r * Math.sin(Math.PI * startAngle / 180);
        var x2 = cx + r * Math.cos(Math.PI * endAngle / 180);
        var y2 = cy + r * Math.sin(Math.PI * endAngle / 180);

        var largeArc = angle > 180 ? 1 : 0;
        var pathData = [
          `M ${cx} ${cy}`,
          `L ${x1} ${y1}`,
          `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
          "Z"
        ].join(" ");

        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathData);
        path.setAttribute("fill", colors[key] || "#6b7488");
        svg.appendChild(path);
      });

      // Inner circle for donut hole
      var hole = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hole.setAttribute("cx", cx);
      hole.setAttribute("cy", cy);
      hole.setAttribute("r", 28);
      hole.setAttribute("fill", "#ffffff");
      svg.appendChild(hole);
    }

    var $legend = $("#donutLegend").empty();
    Object.keys(devCounts).forEach(function (key) {
      var cnt = devCounts[key];
      var pct = Math.round((cnt / totalDev) * 100);
      $legend.append(`
        <div class="legend-row">
          <div class="legend-dot" style="background:${colors[key]}"></div>
          <div class="legend-lbl">${key}</div>
          <div class="legend-val">${cnt} (${pct}%)</div>
        </div>
      `);
    });
  }

  /* ---------------- Render Rankings ---------------- */
  function renderRankings() {
    // 1. Pages Ranking
    var pageCounts = {};
    filteredVisits.forEach(function (v) {
      var p = v.page || "index.html";
      pageCounts[p] = (pageCounts[p] || 0) + 1;
    });

    var pageList = Object.keys(pageCounts).map(function (k) { return { name: k, count: pageCounts[k] }; });
    pageList.sort(function (a, b) { return b.count - a.count; });

    var maxP = pageList.length > 0 ? pageList[0].count : 1;
    var $rPages = $("#rankPages").empty();
    pageList.slice(0, 5).forEach(function (item) {
      var pct = Math.round((item.count / maxP) * 100);
      $rPages.append(`
        <div class="rank-row">
          <span class="rank-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          <div class="rank-bar-bg"><div class="rank-bar-fill" style="width:${pct}%;"></div></div>
          <span class="rank-count">${item.count}</span>
        </div>
      `);
    });

    // 2. Users Ranking
    var userCounts = {};
    filteredVisits.forEach(function (v) {
      var isLogged = v.loggedIn || v.loggedin === "YES";
      var uname = isLogged ? (v.fullName || v.username || "مستخدم") : "زائر مجهول";
      userCounts[uname] = (userCounts[uname] || 0) + 1;
    });

    var userList = Object.keys(userCounts).map(function (k) { return { name: k, count: userCounts[k] }; });
    userList.sort(function (a, b) { return b.count - a.count; });

    var maxU = userList.length > 0 ? userList[0].count : 1;
    var $rUsers = $("#rankUsers").empty();
    userList.slice(0, 5).forEach(function (item) {
      var pct = Math.round((item.count / maxU) * 100);
      $rUsers.append(`
        <div class="rank-row">
          <span class="rank-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          <div class="rank-bar-bg"><div class="rank-bar-fill" style="width:${pct}%;"></div></div>
          <span class="rank-count">${item.count}</span>
        </div>
      `);
    });
  }

  /* ---------------- Access Control Management ---------------- */
  function renderACUI() {
    if (typeof AccessControl === "undefined") return;
    var cfg = AccessControl.getConfig();

    $("#modeBlacklist").prop("checked", cfg.mode === "blacklist");
    $("#modeWhitelist").prop("checked", cfg.mode === "whitelist");
    $("#acPhone").val(cfg.subscriptionPhone || "01126611570");
    $("#acPrice").val(cfg.priceText || "100 ج.م شهرياً عبر انستا باي (InstaPay)");

    // Blacklist chips
    var $bChips = $("#blacklistChips").empty();
    if (cfg.blacklist.length === 0) {
      $bChips.html('<span style="font-size:12px; color:var(--dim)">لا توجد عناصر محظورة</span>');
    } else {
      cfg.blacklist.forEach(function (item) {
        $bChips.append(`
          <span style="background:rgba(232,57,79,0.12); color:var(--coral); font-size:12px; font-weight:700; padding:3px 10px; border-radius:14px; display:inline-flex; align-items:center; gap:6px;">
            ${escapeHtml(item)}
            <button class="remove-ac-chip" data-type="black" data-val="${escapeHtml(item)}" style="border:none; background:none; color:var(--coral); cursor:pointer; font-weight:bold;">×</button>
          </span>
        `);
      });
    }

    // Whitelist chips
    var $wChips = $("#whitelistChips").empty();
    if (cfg.whitelist.length === 0) {
      $wChips.html('<span style="font-size:12px; color:var(--dim)">لا توجد عناصر مسموح بها حصراً</span>');
    } else {
      cfg.whitelist.forEach(function (item) {
        $wChips.append(`
          <span style="background:rgba(52,183,160,0.12); color:var(--teal); font-size:12px; font-weight:700; padding:3px 10px; border-radius:14px; display:inline-flex; align-items:center; gap:6px;">
            ${escapeHtml(item)}
            <button class="remove-ac-chip" data-type="white" data-val="${escapeHtml(item)}" style="border:none; background:none; color:var(--teal); cursor:pointer; font-weight:bold;">×</button>
          </span>
        `);
      });
    }
  }

  // Radio mode change
  $("input[name='acMode']").on("change", function () {
    if (typeof AccessControl === "undefined") return;
    var cfg = AccessControl.getConfig();
    cfg.mode = $(this).val();
    AccessControl.saveConfig(cfg);
    renderACUI();
    renderTable();
  });

  // Save Settings button
  $("#btnSaveACSettings").on("click", function () {
    if (typeof AccessControl === "undefined") return;
    var cfg = AccessControl.getConfig();
    cfg.subscriptionPhone = $("#acPhone").val().trim() || "01126611570";
    cfg.priceText = $("#acPrice").val().trim() || "100 ج.م شهرياً عبر انستا باي (InstaPay)";
    AccessControl.saveConfig(cfg);
    alert("تم حفظ إعدادات اشتراك انستا باي بنجاح!");
  });

  // Add Blacklist item
  $("#btnAddBlack").on("click", function () {
    var val = $("#acNewInput").val().trim();
    if (!val) return;
    var cfg = AccessControl.getConfig();
    if (!cfg.blacklist.includes(val)) {
      cfg.blacklist.push(val);
      AccessControl.saveConfig(cfg);
    }
    $("#acNewInput").val("");
    renderACUI();
    renderTable();
  });

  // Add Whitelist item
  $("#btnAddWhite").on("click", function () {
    var val = $("#acNewInput").val().trim();
    if (!val) return;
    var cfg = AccessControl.getConfig();
    if (!cfg.whitelist.includes(val)) {
      cfg.whitelist.push(val);
      AccessControl.saveConfig(cfg);
    }
    $("#acNewInput").val("");
    renderACUI();
    renderTable();
  });

  // Remove Chip
  $(document).on("click", ".remove-ac-chip", function () {
    var type = $(this).data("type");
    var val = $(this).data("val");
    var cfg = AccessControl.getConfig();
    if (type === "black") {
      cfg.blacklist = cfg.blacklist.filter(item => item !== val);
    } else if (type === "white") {
      cfg.whitelist = cfg.whitelist.filter(item => item !== val);
    }
    AccessControl.saveConfig(cfg);
    renderACUI();
    renderTable();
  });

  // Quick Block/Unblock toggle from visits table
  $(document).on("click", ".btn-toggle-block", function () {
    var target = String($(this).data("target")).trim();
    if (!target) return;

    var cfg = AccessControl.getConfig();
    var isBlack = cfg.blacklist.includes(target);

    if (isBlack) {
      cfg.blacklist = cfg.blacklist.filter(item => item !== target);
    } else {
      cfg.blacklist.push(target);
    }
    AccessControl.saveConfig(cfg);
    renderACUI();
    renderTable();
  });

  // Check all / uncheck all
  $(document).on("change", "#chkAllVisits", function () {
    $(".visit-chk").prop("checked", $(this).is(":checked"));
  });

  // Bulk Blacklist Add
  $("#btnBulkBlack").on("click", function () {
    if (typeof AccessControl === "undefined") return;
    var selected = [];
    $(".visit-chk:checked").each(function () {
      var t = $(this).data("target");
      if (t && !selected.includes(t)) selected.push(String(t).trim());
    });

    if (selected.length === 0) {
      alert("يرجى تحديد زيارة واحدة على الأقل من الجدول لاستخدام الإجراء الجماعي.");
      return;
    }

    var cfg = AccessControl.getConfig();
    selected.forEach(function (t) {
      if (!cfg.blacklist.includes(t)) cfg.blacklist.push(t);
    });
    AccessControl.saveConfig(cfg);
    alert("تمت إضافة (" + selected.length + ") عناصر إلى القائمة السوداء بالحظر.");
    renderACUI();
    renderTable();
  });

  // Bulk Whitelist Add
  $("#btnBulkWhite").on("click", function () {
    if (typeof AccessControl === "undefined") return;
    var selected = [];
    $(".visit-chk:checked").each(function () {
      var t = $(this).data("target");
      if (t && !selected.includes(t)) selected.push(String(t).trim());
    });

    if (selected.length === 0) {
      alert("يرجى تحديد زيارة واحدة على الأقل من الجدول لاستخدام الإجراء الجماعي.");
      return;
    }

    var cfg = AccessControl.getConfig();
    selected.forEach(function (t) {
      if (!cfg.whitelist.includes(t)) cfg.whitelist.push(t);
    });
    AccessControl.saveConfig(cfg);
    alert("تمت إضافة (" + selected.length + ") عناصر إلى القائمة البيضاء بالسماح.");
    renderACUI();
    renderTable();
  });

  /* ---------------- Render Table & Pagination ---------------- */
  function renderTable() {
    var $tbody = $("#vtbody").empty();
    $("#chkAllVisits").prop("checked", false);

    if (filteredVisits.length === 0) {
      $tbody.append(`<tr><td colspan="10" class="empty-td">لا توجد سجلات زيارة مطابقة</td></tr>`);
      $("#pagination").empty();
      return;
    }

    var cfg = typeof AccessControl !== "undefined" ? AccessControl.getConfig() : null;

    var totalPages = Math.ceil(filteredVisits.length / pageSize);
    if (currentPage > totalPages) currentPage = totalPages;

    var start = (currentPage - 1) * pageSize;
    var pageItems = filteredVisits.slice(start, start + pageSize);

    pageItems.forEach(function (v, idx) {
      var isLogged = v.loggedIn || v.loggedin === "YES";
      var statusBadge = isLogged ? `<span class="badge b-in">مسجّل</span>` : `<span class="badge b-out">مجهول</span>`;
      var devClass = (v.device || "").toLowerCase();
      var devBadgeClass = devClass === "mobile" ? "b-mob" : (devClass === "tablet" ? "b-tab" : "b-desk");
      var devBadge = `<span class="badge ${devBadgeClass}">${escapeHtml(v.device || "Desktop")}</span>`;

      var timeStr = "";
      if (v.timestamp) {
        try {
          var d = new Date(v.timestamp);
          timeStr = d.toLocaleDateString("ar-EG") + " " + d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
        } catch (e) {
          timeStr = v.timestamp;
        }
      }

      var primaryTarget = (v.username || v.ip || v.deviceId || v.fullName || "").trim();
      var displayIp = v.ip ? `<span style="font-family:monospace; font-size:11.5px; background:rgba(30,143,213,0.08); color:var(--navy); padding:2px 6px; border-radius:4px;">🌐 ${escapeHtml(v.ip)}</span>` : (v.deviceId ? `<span style="font-family:monospace; font-size:10px; color:var(--dim);">📱 ${escapeHtml(v.deviceId.slice(0,12))}</span>` : "—");
      var userInfo = isLogged ? `${escapeHtml(v.fullName || v.username || "")} <small style="color:var(--dim)">(${escapeHtml(v.role || "")})</small>` : "—";

      // زر الإجراء السريع (حظر / إلغاء حظر)
      var actionBtn = "—";
      if (primaryTarget && cfg) {
        var isBlockedItem = cfg.blacklist.includes(primaryTarget);
        if (isBlockedItem) {
          actionBtn = `<button class="btn-toggle-block tbtn" data-target="${escapeHtml(primaryTarget)}" style="background:var(--teal); font-size:11px; padding:3px 8px;">✅ إلغاء الحظر</button>`;
        } else {
          actionBtn = `<button class="btn-toggle-block tbtn danger" data-target="${escapeHtml(primaryTarget)}" style="font-size:11px; padding:3px 8px;">⛔ حظر</button>`;
        }
      }

      $tbody.append(`
        <tr>
          <td><input type="checkbox" class="visit-chk" data-target="${escapeHtml(primaryTarget)}" style="cursor:pointer;" /></td>
          <td>${start + idx + 1}</td>
          <td style="white-space:nowrap;">${timeStr}</td>
          <td><span class="pg-chip">${escapeHtml(v.page || "index.html")}</span></td>
          <td>${devBadge}</td>
          <td>${escapeHtml(v.browser || "—")}</td>
          <td>${displayIp}</td>
          <td>${statusBadge}</td>
          <td>${userInfo}</td>
          <td>${actionBtn}</td>
        </tr>
      `);
    });

    // Pagination buttons
    var $pg = $("#pagination").empty();
    if (totalPages > 1) {
      $pg.append(`<button class="pg-btn" ${currentPage === 1 ? "disabled" : ""} data-pg="${currentPage - 1}">السابق</button>`);
      for (var p = 1; p <= totalPages; p++) {
        if (p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)) {
          $pg.append(`<button class="pg-btn ${p === currentPage ? "active" : ""}" data-pg="${p}">${p}</button>`);
        } else if (p === currentPage - 3 || p === currentPage + 3) {
          $pg.append(`<span style="align-self:center;color:var(--dim)">...</span>`);
        }
      }
      $pg.append(`<button class="pg-btn" ${currentPage === totalPages ? "disabled" : ""} data-pg="${currentPage + 1}">التالي</button>`);
    }
  }

  $(document).on("click", ".pg-btn[data-pg]", function () {
    currentPage = parseInt($(this).data("pg"), 10);
    renderTable();
  });

  /* ---------------- Exports & Actions ---------------- */
  $("#btnCSV").on("click", function () {
    if (filteredVisits.length === 0) return alert("لا توجد بيانات للتصدير");
    var keys = ["timestamp", "page", "device", "browser", "loggedIn", "username", "fullName", "role", "language", "screen"];
    var csv = "\uFEFF" + keys.join(",") + "\n";

    filteredVisits.forEach(function (v) {
      var row = keys.map(function (k) {
        var val = String(v[k] || "").replace(/"/g, '""');
        return '"' + val + '"';
      });
      csv += row.join(",") + "\n";
    });

    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "visits_report_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  $("#btnJSON").on("click", function () {
    if (filteredVisits.length === 0) return alert("لا توجد بيانات للتصدير");
    var jsonStr = JSON.stringify(filteredVisits, null, 2);
    var blob = new Blob([jsonStr], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "visits_backup_" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  /* Clear Modal */
  $("#btnClear").on("click", function () {
    $("#confirmOverlay").addClass("open");
  });
  $("#mCancel").on("click", function () {
    $("#confirmOverlay").removeClass("open");
  });
  $("#mConfirm").on("click", function () {
    localStorage.removeItem("eyeclinic_visits");
    allVisits = [];
    applyFilters();
    $("#confirmOverlay").removeClass("open");
    alert("تم مسح سجل الزيارات المحلي بنجاح.");
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
});
