/* ============================================================
   trace.js — منطق لوحة تتبع الزيارات المستقلة
   ============================================================ */

/* ====================================================
   إعدادات رابط Google Apps Script
   ==================================================== */
var APPS_SCRIPT_GET_URL = "https://script.google.com/macros/s/AKfycbxWYh4bXsx6CQUB1O4WpS9aj9gaKieDxgGYtv6kLQ3JlBi0Jrg9XOQw_5lupUqV8slpWA/exec"; // رابط Google Apps Script المباشر
/* ==================================================== */

/* ---------- حفظ إعدادات الحظر/السماح إلى السيرفر تلقائياً ---------- */
function saveConfigToServer(cfg) {
  if (!APPS_SCRIPT_GET_URL || APPS_SCRIPT_GET_URL === 'YOUR_APPS_SCRIPT_URL_HERE') return;
  try {
    fetch(APPS_SCRIPT_GET_URL + '?action=saveConfig', {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(cfg)
    });
  } catch (_) { }
}

$(async function () {
  var allVisits = [];
  var filteredVisits = [];
  var currentPage = 1;
  var pageSize = 15;

  if (typeof DB !== "undefined" && DB.init) {
    await DB.init();
  }

  var KNOWN_OWNER_IDS = ['dev_jprs818mst4nmfu', 'dev_o8f6cgtmsu5g9zf', 'dev_tridfqamssmlph1'];

  function isOwnerIdentifier(str) {
    if (!str) return false;
    var s = String(str).toLowerCase().trim();
    return KNOWN_OWNER_IDS.some(id => s.startsWith(id.toLowerCase()));
  }

  /* — اعتراض saveConfig لإرسالها للسيرفر عند كل تغيير — */
  if (typeof AccessControl !== 'undefined') {
    var _origSave = AccessControl.saveConfig.bind(AccessControl);
    AccessControl.saveConfig = function (cfg) {
      // حماية أجهزة المالك من الحظر دائماً
      if (cfg.blacklist && cfg.blacklist.length > 0) {
        cfg.blacklist = cfg.blacklist.filter(item => !isOwnerIdentifier(item));
      }
      _origSave(cfg);
      saveConfigToServer(cfg); // تحديث فوري للسيرفر
    };
  }

  /* ---------------- Tab Switching ---------------- */
  function switchTab(tabId) {
    $(".tab-btn").removeClass("active").attr("aria-selected", "false");
    $(".tab-panel").removeClass("active");

    var $btn = $(`.tab-btn[data-tab="${tabId}"]`);
    var $panel = $(`#${tabId}`);

    if ($btn.length && $panel.length) {
      $btn.addClass("active").attr("aria-selected", "true");
      $panel.addClass("active");
      try { sessionStorage.setItem("trace_active_tab", tabId); } catch (_) {}
    }
  }

  $(document).on("click", ".tab-btn", function () {
    var targetTab = $(this).data("tab");
    if (targetTab) switchTab(targetTab);
  });

  /* ---------------- Owner Device Info ---------------- */
  function getOwnerDeviceId() {
    return KNOWN_OWNER_IDS[0] || 'dev_9pgwtjhmss';
  }

  function renderOwnerDevice() {
    var ownerId = getOwnerDeviceId();
    var currentDev = localStorage.getItem("eyeclinic_device_id") || "";
    var lastIp = localStorage.getItem("eyeclinic_last_ip") || "";
    var infoText = `معرّف جهاز المطور: ${ownerId}` + (currentDev ? ` | جهازك الحالي: ${currentDev}` : "") + (lastIp ? ` | الـ IP: ${lastIp}` : "");
    $("#ownerDeviceId").text(infoText);
  }

  /* ---------------- Lock Screen ---------------- */
  async function unlock() {
    var pass = $("#tracePass").val().trim();
    if (typeof DB !== "undefined" && DB.init) {
      await DB.init();
    }
    var users = (typeof DB !== "undefined" && DB.Users) ? DB.Users.all() : [];

    // التحقق من كلمة السر ديناميكياً من بيانات المستخدمين المخزنة
    var valid = users.some(function (u) {
      return u.role === "admin" && (
        u.password === pass ||
        u.username.trim().toLowerCase() === pass.toLowerCase()
      );
    });

    // كلمة مرور احتياطية أو اسم المستخدم في حال كانت البيانات لم تُحمل بعد
    if (!valid && (pass === "#Allhamd_Llah#" || pass === "AA244275" || pass === "AA2442755")) {
      valid = true;
    }

    if (valid) {
      $("#lockErr").hide();
      $("#lockScreen").fadeOut(300, function () {
        $("#dashboard").fadeIn(300);
        renderOwnerDevice();
        var savedTab = sessionStorage.getItem("trace_active_tab") || "tab-visits";
        switchTab(savedTab);

        // مزامنة أحدث إعدادات الحظر من جوجل شيت فوراً
        if (APPS_SCRIPT_GET_URL && APPS_SCRIPT_GET_URL !== "YOUR_APPS_SCRIPT_URL_HERE") {
          fetch(APPS_SCRIPT_GET_URL + (APPS_SCRIPT_GET_URL.indexOf("?") > -1 ? "&" : "?") + "action=getConfig&_t=" + Date.now())
            .then(function (r) { return r.json(); })
            .then(function (serverCfg) {
              if (serverCfg && serverCfg.mode && typeof AccessControl !== "undefined") {
                AccessControl.saveConfig(serverCfg);
                renderACUI();
                renderTable();
              }
            })
            .catch(function () { });
        }
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

  /* ---------------- Normalize Records ---------------- */
  function normalizeVisitRecord(v) {
    if (!v || typeof v !== "object") return null;

    var map = {};
    Object.keys(v).forEach(function (k) {
      map[k.toLowerCase().trim()] = v[k];
    });

    var page = map.page || map.url || map["الصفحة"] || v.page || v.Page || "index.html";
    var device = map.device || map["الجهاز"] || v.device || v.Device || "Desktop";
    var browser = map.browser || map["المتصفح"] || v.browser || v.Browser || "—";
    var ip = map.ip || map.ipaddress || map["عنوان ip"] || v.ip || v.IP || "";
    var devId = map.deviceid || map.device_id || map["معرف الجهاز"] || v.deviceId || v.deviceid || "";
    var devName = map.devicename || map.device_name || map["اسم الجهاز"] || v.deviceName || v.devicename || "";
    var username = map.username || map.user || map["المستخدم"] || map["اسم المستخدم"] || v.username || v.Username || "";
    var fullName = map.fullname || map.full_name || map["الاسم الكامل"] || v.fullName || v.fullname || "";
    var role = map.role || map["الصلاحية"] || v.role || v.Role || "";
    var language = map.language || map["اللغة"] || v.language || v.Language || "";
    var screen = map.screen || map["الشاشة"] || v.screen || v.Screen || "";

    var rawTime = map.timestamp || map.time || map.date || map["الوقت"] || map["تاريخ الزيارة"] || v.timestamp || v.Timestamp || "";
    var timestamp = "";
    if (rawTime) {
      try {
        var d = new Date(rawTime);
        timestamp = isNaN(d.getTime()) ? String(rawTime) : d.toISOString();
      } catch (e) {
        timestamp = String(rawTime);
      }
    } else {
      timestamp = new Date().toISOString();
    }

    var loggedRaw = map.loggedin || map.logged_in || map.login || map["الحالة"] || v.loggedIn || v.loggedin || "";
    var isLogged = (loggedRaw === true || loggedRaw === "YES" || String(loggedRaw).toUpperCase() === "YES" || Boolean(username && username !== "زائر مجهول"));

    // Shift correction if IP got shifted to page column
    if (page && /^(\d{1,3}\.){3}\d{1,3}$/.test(String(page).trim())) {
      ip = String(page).trim();
      devId = browser;
      page = device;
      browser = language || "Chrome";
      device = "Mobile";
    }

    return {
      timestamp: timestamp,
      page: String(page || "index.html").trim(),
      device: String(device || "Desktop").trim(),
      browser: String(browser || "—").trim(),
      ip: String(ip || "").trim(),
      deviceId: String(devId || "").trim(),
      deviceid: String(devId || "").trim(),
      deviceName: String(devName || "").trim(),
      devicename: String(devName || "").trim(),
      loggedIn: isLogged,
      loggedin: isLogged ? "YES" : "NO",
      username: String(username || "").trim(),
      fullName: String(fullName || "").trim(),
      role: String(role || "").trim(),
      language: String(language || "").trim(),
      screen: String(screen || "").trim()
    };
  }

  /* ---------------- Fetch Visits ---------------- */
  function loadVisits() {
    $("#statusText").text("جاري جلب البيانات...");

    // إذا كان الرابط مضبوطاً، نحاول الجلب من Google Apps Script
    if (APPS_SCRIPT_GET_URL && APPS_SCRIPT_GET_URL !== "YOUR_APPS_SCRIPT_URL_HERE") {
      var fetchUrl = APPS_SCRIPT_GET_URL + (APPS_SCRIPT_GET_URL.indexOf("?") > -1 ? "&" : "?") + "action=get&_t=" + Date.now();
      $.ajax({
        url: fetchUrl,
        type: "GET",
        dataType: "json",
        success: function (data) {
          if (Array.isArray(data)) {
            allVisits = data.map(normalizeVisitRecord).filter(Boolean);
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
      var localData = JSON.parse(localStorage.getItem("eyeclinic_visits") || "[]");
      allVisits = localData.map(normalizeVisitRecord).filter(Boolean);
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
    renderUniqueDevices();
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
  function getChipIcon(item) {
    if (/^dev_/i.test(item)) return '📱 ';
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(item)) return '🌐 ';
    return '👤 ';
  }

  function renderACUI() {
    renderOwnerDevice();
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
        var icon = getChipIcon(item);
        $bChips.append(`
          <span style="background:rgba(232,57,79,0.12); color:var(--coral); font-size:11.5px; font-weight:700; padding:3px 10px; border-radius:14px; display:inline-flex; align-items:center; gap:5px;">
            ${icon}${escapeHtml(item)}
            <button class="remove-ac-chip" data-type="black" data-val="${escapeHtml(item)}" style="border:none; background:none; color:var(--coral); cursor:pointer; font-weight:bold; font-size:14px;">×</button>
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
        var icon = getChipIcon(item);
        $wChips.append(`
          <span style="background:rgba(52,183,160,0.12); color:var(--teal); font-size:11.5px; font-weight:700; padding:3px 10px; border-radius:14px; display:inline-flex; align-items:center; gap:5px;">
            ${icon}${escapeHtml(item)}
            <button class="remove-ac-chip" data-type="white" data-val="${escapeHtml(item)}" style="border:none; background:none; color:var(--teal); cursor:pointer; font-weight:bold; font-size:14px;">×</button>
          </span>
        `);
      });
    }
    renderUniqueDevices();
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
    if (isOwnerIdentifier(val)) {
      alert("⚠️ لا يمكن حظر جهاز المطور / المالك (مسموح له دائماً).");
      return;
    }
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

    if (isOwnerIdentifier(target)) {
      alert("⚠️ هذا جهاز المطور / المالك وهو مسموح له دائماً ولا يمكن حظره.");
      return;
    }

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
      var t = String($(this).data("target") || "").trim();
      if (t && !selected.includes(t)) {
        if (!isOwnerIdentifier(t)) {
          selected.push(t);
        }
      }
    });

    if (selected.length === 0) {
      alert("يرجى تحديد زيارة واحدة على الأقل صالحة للحظر (جهاز المطور محمي دائماً).");
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
    renderUniqueDevices();
    renderTable();
  });

  /* ---------------- Unique Devices Aggregation & Rendering ---------------- */
  function renderUniqueDevices() {
    var $tbody = $("#uniqueDevicesTbody");
    if (!$tbody.length) return;
    $tbody.empty();

    var cfg = typeof AccessControl !== "undefined" ? AccessControl.getConfig() : null;
    var sq = ($("#srchDevices").val() || "").trim().toLowerCase();
    var fltStatus = $("#fltDeviceStatus").val();

    // Group visits by device ID or IP
    var deviceMap = {};

    allVisits.forEach(function (v) {
      var devId = (v.deviceId || v.deviceid || "").trim();
      var rawIp = (v.ip || "").trim();
      var ip = /^(\d{1,3}\.){3}\d{1,3}$/.test(rawIp) ? rawIp : '';
      var key = devId || ip || v.username || "unknown";

      if (!deviceMap[key]) {
        deviceMap[key] = {
          deviceId: devId,
          ip: ip,
          deviceName: v.deviceName || v.devicename || v.device || "جهاز غير معروف",
          deviceType: v.device || "Desktop",
          browser: v.browser || "—",
          lastUser: (v.loggedIn || v.loggedin === "YES") ? (v.fullName || v.username || "") : (v.username || "زائر مجهول"),
          userRole: v.role || "",
          lastSeen: v.timestamp || "",
          visitCount: 0,
          isLogged: v.loggedIn || v.loggedin === "YES"
        };
      }

      deviceMap[key].visitCount++;
      if (v.timestamp && (!deviceMap[key].lastSeen || v.timestamp > deviceMap[key].lastSeen)) {
        deviceMap[key].lastSeen = v.timestamp;
        if (devId) deviceMap[key].deviceId = devId;
        if (ip) deviceMap[key].ip = ip;
        if (v.deviceName) deviceMap[key].deviceName = v.deviceName;
        if (v.device) deviceMap[key].deviceType = v.device;
        if (v.browser) deviceMap[key].browser = v.browser;
        if (v.loggedIn || v.loggedin === "YES") {
          deviceMap[key].lastUser = v.fullName || v.username || deviceMap[key].lastUser;
          deviceMap[key].userRole = v.role || deviceMap[key].userRole;
          deviceMap[key].isLogged = true;
        }
      }
    });

    var devicesList = Object.values(deviceMap);

    // Sort: Owner first, then by lastSeen descending
    devicesList.sort(function (a, b) {
      var aOwner = isOwnerIdentifier(a.deviceId) || isOwnerIdentifier(a.ip);
      var bOwner = isOwnerIdentifier(b.deviceId) || isOwnerIdentifier(b.ip);
      if (aOwner && !bOwner) return -1;
      if (!aOwner && bOwner) return 1;
      return new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0);
    });

    // Filtering
    var filteredDevs = devicesList.filter(function (dev) {
      var isOwner = isOwnerIdentifier(dev.deviceId) || isOwnerIdentifier(dev.ip);
      var isWhite = cfg && dev.deviceId && cfg.whitelist.includes(dev.deviceId);
      var isBlack = cfg && dev.deviceId && cfg.blacklist.includes(dev.deviceId);

      if (fltStatus === "owner" && !isOwner) return false;
      if (fltStatus === "white" && !isWhite) return false;
      if (fltStatus === "black" && !isBlack) return false;
      if (fltStatus === "allowed_by_mode" && (isWhite || isBlack || isOwner)) return false;

      if (sq) {
        var str = [dev.deviceId, dev.ip, dev.deviceName, dev.browser, dev.lastUser].join(" ").toLowerCase();
        if (str.indexOf(sq) === -1) return false;
      }
      return true;
    });

    $("#uniqueDevCount").text(devicesList.length);

    if (filteredDevs.length === 0) {
      $tbody.append(`<tr><td colspan="9" class="empty-td">لا توجد أجهزة مطابقة للبحث</td></tr>`);
      return;
    }

    filteredDevs.forEach(function (dev, idx) {
      var isOwner = isOwnerIdentifier(dev.deviceId) || isOwnerIdentifier(dev.ip);
      var isWhite = cfg && dev.deviceId && cfg.whitelist.includes(dev.deviceId);
      var isBlack = cfg && dev.deviceId && cfg.blacklist.includes(dev.deviceId);

      // Status badge
      var statusHtml = "";
      if (isOwner) {
        statusHtml = `<span class="badge" style="background:#0f3460; color:#63c4ee; font-weight:800; border:1px solid rgba(99,196,238,0.4);">👑 جهاز المالك (مسموح دائماً)</span>`;
      } else if (isWhite) {
        statusHtml = `<span class="badge b-in" style="font-weight:700;">✅ مسموح حصراً (Whitelist)</span>`;
      } else if (isBlack) {
        statusHtml = `<span class="badge" style="background:rgba(232,57,79,0.15); color:var(--coral); font-weight:700;">⛔ محظور (Blacklist)</span>`;
      } else {
        if (cfg && cfg.mode === "whitelist") {
          statusHtml = `<span class="badge" style="background:rgba(107,116,136,0.15); color:var(--dim);">🚫 غير مصرح (Whitelist)</span>`;
        } else {
          statusHtml = `<span class="badge" style="background:rgba(52,183,160,0.12); color:#1a8f78;">🟢 مسموح تلقائياً (Blacklist)</span>`;
        }
      }

      // Time format
      var timeFormatted = "—";
      if (dev.lastSeen) {
        try {
          var d = new Date(dev.lastSeen);
          timeFormatted = d.toLocaleDateString("ar-EG") + " " + d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
        } catch (_) {
          timeFormatted = dev.lastSeen;
        }
      }

      // Action buttons
      var actionsHtml = "";
      if (isOwner) {
        actionsHtml = `<span style="color:var(--teal); font-size:12px; font-weight:700;">👑 مسموح ومحمي تلقائياً</span>`;
      } else {
        var targetId = dev.deviceId || dev.ip;
        var whiteBtn = isWhite
          ? `<button class="tbtn btn-toggle-dev-white" data-target="${escapeHtml(targetId)}" style="font-size:11px; padding:3px 8px; background:rgba(107,116,136,0.2); color:var(--text);">❌ إزالة من السماح</button>`
          : `<button class="tbtn btn-toggle-dev-white" data-target="${escapeHtml(targetId)}" style="font-size:11px; padding:3px 8px; background:var(--teal);">✅ سماح (Whitelist)</button>`;

        var blackBtn = isBlack
          ? `<button class="tbtn btn-toggle-dev-black" data-target="${escapeHtml(targetId)}" style="font-size:11px; padding:3px 8px; background:var(--teal);">🟢 إلغاء الحظر</button>`
          : `<button class="tbtn danger btn-toggle-dev-black" data-target="${escapeHtml(targetId)}" style="font-size:11px; padding:3px 8px;">⛔ حظر (Blacklist)</button>`;

        actionsHtml = `<div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">${whiteBtn} ${blackBtn}</div>`;
      }

      var devTypeClass = (dev.deviceType || "").toLowerCase() === "mobile" ? "b-mob" : ((dev.deviceType || "").toLowerCase() === "tablet" ? "b-tab" : "b-desk");

      $tbody.append(`
        <tr style="${isOwner ? 'background:rgba(30,143,213,0.04);' : ''}">
          <td style="font-weight:700; color:var(--dim);">${idx + 1}</td>
          <td>
            <div style="font-weight:700; font-size:13px; color:var(--navy);">${escapeHtml(dev.deviceName)}</div>
            <div style="font-size:11px; color:var(--dim); margin-top:2px;">
              <span class="badge ${devTypeClass}" style="font-size:10px; padding:1px 6px;">${escapeHtml(dev.deviceType)}</span>
              ${escapeHtml(dev.browser)}
            </div>
          </td>
          <td>
            <code style="font-family:monospace; font-size:11.5px; font-weight:700; background:rgba(18,36,94,0.06); padding:3px 6px; border-radius:6px; color:var(--navy);">
              ${escapeHtml(dev.deviceId || "—")}
            </code>
          </td>
          <td>
            <span style="font-family:monospace; font-size:12px; color:var(--dim);">${escapeHtml(dev.ip || "—")}</span>
          </td>
          <td>
            <div style="font-size:12.5px; font-weight:600;">${escapeHtml(dev.lastUser)}</div>
            ${dev.userRole ? `<small style="color:var(--dim);">(${escapeHtml(dev.userRole)})</small>` : ''}
          </td>
          <td style="white-space:nowrap; font-size:12px;">${timeFormatted}</td>
          <td>
            <span class="badge b-desk" style="font-weight:700;">${dev.visitCount}</span>
          </td>
          <td>${statusHtml}</td>
          <td style="text-align:center;">${actionsHtml}</td>
        </tr>
      `);
    });
  }

  // Toggle Whitelist from Unique Devices table
  $(document).on("click", ".btn-toggle-dev-white", function () {
    var target = String($(this).data("target") || "").trim();
    if (!target) return;
    if (isOwnerIdentifier(target)) {
      alert("⚠️ هذا جهاز المطور / المالك وهو مسموح له دائماً.");
      return;
    }
    var cfg = AccessControl.getConfig();
    if (cfg.whitelist.includes(target)) {
      cfg.whitelist = cfg.whitelist.filter(item => item !== target);
    } else {
      cfg.whitelist.push(target);
      cfg.blacklist = cfg.blacklist.filter(item => item !== target);
    }
    AccessControl.saveConfig(cfg);
    renderACUI();
    renderUniqueDevices();
    renderTable();
  });

  // Toggle Blacklist from Unique Devices table
  $(document).on("click", ".btn-toggle-dev-black", function () {
    var target = String($(this).data("target") || "").trim();
    if (!target) return;
    if (isOwnerIdentifier(target)) {
      alert("⚠️ لا يمكن حظر جهاز المطور / المالك (مسموح له دائماً).");
      return;
    }
    var cfg = AccessControl.getConfig();
    if (cfg.blacklist.includes(target)) {
      cfg.blacklist = cfg.blacklist.filter(item => item !== target);
    } else {
      cfg.blacklist.push(target);
      cfg.whitelist = cfg.whitelist.filter(item => item !== target);
    }
    AccessControl.saveConfig(cfg);
    renderACUI();
    renderUniqueDevices();
    renderTable();
  });

  $("#srchDevices, #fltDeviceStatus").on("input change", renderUniqueDevices);

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
      // تصحيح تلقائي إذا كانت الأعمدة مرحلة من الشيت القديم
      if (v.page && /^(\d{1,3}\.){3}\d{1,3}$/.test(String(v.page).trim())) {
        v.ip = String(v.page).trim();
        v.deviceId = v.browser;
        v.page = v.device;
        v.browser = v.language || "Chrome";
        v.device = "Mobile";
      }

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

      var devId = (v.deviceid || v.deviceId || "").trim();
      var devName = (v.devicename || v.deviceName || "").trim();
      var rawIp = (v.ip || "").trim();
      var username = (v.username || "").trim();

      // إذا كانت خانة الـ IP تحتوي على اسم مستخدم (مثل admin)
      var ip = /^(\d{1,3}\.){3}\d{1,3}$/.test(rawIp) ? rawIp : '';
      if (!username && rawIp && !ip) username = rawIp;

      var primaryTarget = devId || username || ip;

      var displayIpParts = [];
      if (ip) {
        displayIpParts.push(`<div style="font-family:monospace; color:var(--navy); font-weight:700;">🌐 ${escapeHtml(ip)}</div>`);
      }
      if (devName) {
        displayIpParts.push(`<div style="color:#475569; font-size:10.5px; font-weight:600; margin-top:2px;">📱 ${escapeHtml(devName)}</div>`);
      }
      if (devId) {
        displayIpParts.push(`<div style="font-family:monospace; font-size:9.5px; color:var(--dim); margin-top:2px;" title="المعرف الفريد للجهاز: ${escapeHtml(devId)}">🆔 ${escapeHtml(devId.slice(0, 14))}...</div>`);
      }
      var displayIp = displayIpParts.join("") || "—";
      var userInfo = isLogged ? `${escapeHtml(v.fullName || v.username || "")} <small style="color:var(--dim)">(${escapeHtml(v.role || "")})</small>` : (username ? escapeHtml(username) : "—");


      // أزرار الإجراءات المخصصة بالاستهداف
      var actionBtns = [];
      if (cfg) {
        if (devId) {
          var isDevBlocked = cfg.blacklist.includes(devId);
          actionBtns.push(`
            <button class="btn-toggle-block tbtn ${isDevBlocked ? '' : 'danger'}" data-target="${escapeHtml(devId)}" style="font-size:10.5px; padding:2px 7px; ${isDevBlocked ? 'background:var(--teal);' : ''}">
              ${isDevBlocked ? '✅ إلغاء حظر الجهاز' : '📱 حظر الجهاز فقط'}
            </button>
          `);
        }
        if (ip) {
          var isIpBlocked = cfg.blacklist.includes(ip);
          actionBtns.push(`
            <button class="btn-toggle-block tbtn ${isIpBlocked ? '' : 'danger'}" data-target="${escapeHtml(ip)}" style="font-size:10px; padding:2px 6px; opacity:0.85; ${isIpBlocked ? 'background:var(--teal);' : ''}">
              ${isIpBlocked ? '✅ إلغاء حظر الـ IP' : '🌐 حظر الـ IP بالكامل'}
            </button>
          `);
        }
        if (username) {
          var isUserBlocked = cfg.blacklist.includes(username);
          actionBtns.push(`
            <button class="btn-toggle-block tbtn ${isUserBlocked ? '' : 'danger'}" data-target="${escapeHtml(username)}" style="font-size:10px; padding:2px 6px; ${isUserBlocked ? 'background:var(--teal);' : ''}">
              ${isUserBlocked ? '✅ إلغاء حظر المستخدم' : '👤 حظر المستخدم'}
            </button>
          `);
        }
      }
      var actionBtn = actionBtns.length > 0 ? `<div style="display:flex; flex-direction:column; gap:4px;">${actionBtns.join("")}</div>` : "—";

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

    if (APPS_SCRIPT_GET_URL && APPS_SCRIPT_GET_URL !== "YOUR_APPS_SCRIPT_URL_HERE") {
      var clearUrl = APPS_SCRIPT_GET_URL + (APPS_SCRIPT_GET_URL.indexOf("?") > -1 ? "&" : "?") + "action=clear&_t=" + Date.now();
      fetch(clearUrl, { method: "GET", mode: "no-cors" })
        .then(function () {
          setTimeout(function () {
            alert("تم مسح جميع الزيارات من Google Sheets والمحلي بنجاح.");
            loadVisits();
          }, 2000);
        })
        .catch(function () {
          alert("تم مسح السجل المحلي بنجاح (ملاحظة: يمكنك إفراغ الصفوف يدوياً من ملف Google Sheet أيضاً).");
        });
    } else {
      alert("تم مسح سجل الزيارات المحلي بنجاح.");
    }
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
});
