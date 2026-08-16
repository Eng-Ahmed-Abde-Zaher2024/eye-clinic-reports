/* =========================================================
   admin.js — منطق لوحة الإدارة: القوالب + المستخدمون + إكسل
   ========================================================= */

$(async function () {
  const session = requireAuth("admin");
  if (!session) return;
  renderTopbar(session);

  // جلب أحدث ملفات JSON من جيت هب عند التحميل
  await DB.init();

  // ---------------- Tabs Management (مع تذكر التاب النشط عند الـ Refresh) ----------------
  function activateTab(tab) {
    if (!tab) return;
    const $btn = $(`.tab-btn[data-tab="${tab}"]`);
    const $panel = $(`#tab-${tab}`);
    if ($btn.length && $panel.length) {
      $(".tab-btn").removeClass("active");
      $btn.addClass("active");
      $(".tab-panel").removeClass("active");
      $panel.addClass("active");
      if (tab === "settings") {
        loadClinicSettings();
        renderDoctors();
      }
      try {
        sessionStorage.setItem("eyeclinic_admin_tab", tab);
        history.replaceState(null, null, "#" + tab);
      } catch (_) {}
    }
  }

  $(".tab-btn").on("click", function () {
    const tab = $(this).data("tab");
    activateTab(tab);
  });

  // استعادة التاب النشط فوراً عند فتح الصفحة أو عمل Refresh
  const initialTab = (location.hash ? location.hash.replace("#", "") : "") || sessionStorage.getItem("eyeclinic_admin_tab");
  if (initialTab) {
    activateTab(initialTab);
  }

  function showToast(msg, isErr) {
    const $t = $("#toast").text(msg).removeClass("err");
    if (isErr) $t.addClass("err");
    $t.addClass("show");
    setTimeout(() => $t.removeClass("show"), 2600);
  }

  /* =========================================================
     UNIVERSAL POPUP CONFIRMATION SYSTEM
     ========================================================= */
  let activeConfirmCallback = null;

  function showConfirmPopup(options) {
    const title = options.title || "تأكيد الإجراء";
    const message = options.message || "هل أنت تأكد من الاستمرار؟";
    const confirmText = options.confirmText || "نعم، تأكيد الإجراء";
    const cancelText = options.cancelText || "إلغاء";
    const isDanger = options.type !== "info";

    $("#confirmPopupTitle").text(title);
    $("#confirmPopupMessage").text(message);
    $("#confirmPopupOkBtn").text(confirmText);
    $("#confirmPopupCancelBtn").text(cancelText);

    if (isDanger) {
      $("#confirmPopupOkBtn").removeClass("btn-primary").addClass("btn-danger");
      $("#confirmPopupIcon").css("background", "#fdeef0").html(`
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#e11d48" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      `);
    } else {
      $("#confirmPopupOkBtn").removeClass("btn-danger").addClass("btn-primary");
      $("#confirmPopupIcon").css("background", "#eaf4fd").html(`
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1e8fd5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      `);
    }

    activeConfirmCallback = options.onConfirm || null;
    $("#confirmPopupModal").addClass("show");
  }

  $("#confirmPopupOkBtn").on("click", function () {
    $("#confirmPopupModal").removeClass("show");
    if (typeof activeConfirmCallback === "function") {
      activeConfirmCallback();
      activeConfirmCallback = null;
    }
  });

  $("#confirmPopupCancelBtn, #confirmPopupModal").on("click", function (e) {
    if (e.target === this || e.target.id === "confirmPopupCancelBtn") {
      $("#confirmPopupModal").removeClass("show");
      activeConfirmCallback = null;
    }
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* =========================================================
     TEMPLATES
     ========================================================= */
  let editingTplId = null;

  function renderTemplates() {
    const templates = DB.Templates.all();
    const $list = $("#templatesList").empty();
    if (templates.length === 0) {
      $list.append(`<div class="empty-fields-note">لا توجد قوالب بعد. أضف قالبًا جديدًا أو استورد ملف إكسل.</div>`);
      return;
    }
    templates.forEach((t) => {
      $list.append(`
        <div class="list-item" data-id="${t.id}">
          <div class="li-main">
            <div class="li-title">${escapeHtml(t.name)}</div>
            <div class="li-sub">${escapeHtml(t.category || "بدون تصنيف")} · ${(t.fields || []).length} حقل متغيّر</div>
          </div>
          <div class="li-actions">
            <button class="btn btn-outline btn-sm btn-edit-tpl">تعديل</button>
            <button class="btn btn-danger btn-sm btn-del-tpl">حذف</button>
          </div>
        </div>
      `);
    });
  }

  function openTplModal(tpl) {
    editingTplId = tpl ? tpl.id : null;
    $("#tplModalTitle").text(tpl ? "تعديل القالب" : "قالب جديد");
    $("#tpl_name").val(tpl ? tpl.name : "");
    $("#tpl_category").val(tpl ? tpl.category : "");
    $("#tpl_body").val(tpl ? stripToPlaceholderText(tpl.bodyHtml) : "");
    $("#tpl_fields").empty();
    const fields = tpl && tpl.fields && tpl.fields.length ? tpl.fields : [{ key: "name", label: "اسم المريض" }, { key: "age", label: "السن" }];
    fields.forEach(addFieldRow);
    $("#tplModal").addClass("show");
  }

  function stripToPlaceholderText(html) {
    // نحول أقرب تقريب لنص عادي قابل للتحرير مع الحفاظ على placeholders
    return (html || "")
      .replace(/<\/p>/g, "\n")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  let lastCursorPos = 0;

  // حفظ موضع المؤشر باستمرار أثناء التفاعل مع نص التقرير
  $(document).on("keyup click focus select blur change", "#tpl_body", function () {
    if (this.selectionStart !== undefined && this.selectionStart !== null) {
      lastCursorPos = this.selectionStart;
    }
  });

  function insertPlaceholderAtCursor(rawKey, rawLabel, shouldFocus) {
    const key = String(rawKey || "").trim();
    const label = String(rawLabel || "").trim();
    if (!key) {
      if (shouldFocus) showToast("يرجى كتابة مفتاح الحقل بالإنجليزية أولاً (مثل: test)", true);
      return;
    }

    const tag = label ? `${label}: {{${key}}}` : `{{${key}}}`;
    const textarea = document.getElementById("tpl_body");
    if (!textarea) return;

    const val = textarea.value || "";
    let pos = (document.activeElement === textarea && textarea.selectionStart !== undefined)
              ? textarea.selectionStart
              : lastCursorPos;

    if (pos < 0 || pos > val.length) pos = val.length;

    const prefix = (pos > 0 && val[pos - 1] !== "\n" && val[pos - 1] !== " ") ? "\n" : "";
    const fullText = prefix + tag;

    const newVal = val.substring(0, pos) + fullText + val.substring(pos);
    textarea.value = newVal;

    const newPos = pos + fullText.length;
    lastCursorPos = newPos;

    // عدم سحب المؤشر أو الـ focus إلا لو كان ذلك بضغط زر الإدراج الصريح
    if (shouldFocus) {
      textarea.focus();
      try {
        textarea.setSelectionRange(newPos, newPos);
      } catch (_) {}
    }
  }

  function escapeRegex(str) {
    return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function addFieldRow(field, autoFocus) {
    const key          = field ? (field.key          || "") : "";
    const label        = field ? (field.label        || "") : "";
    const type         = field ? (field.type         || "text") : "text";
    const options      = field ? (field.options      || "") : "";
    const defaultValue = field ? (field.defaultValue !== undefined ? field.defaultValue : (field.default !== undefined ? field.default : "")) : "";

    const typeOptions = [
      { val: "text",     lbl: "نص قصير" },
      { val: "textarea", lbl: "فقرة / نص طويل" },
      { val: "number",   lbl: "رقم" },
      { val: "date",     lbl: "تاريخ" },
      { val: "select",   lbl: "قائمة منسدلة" }
    ];
    const typeSelectHtml = typeOptions
      .map(o => `<option value="${o.val}"${type === o.val ? " selected" : ""}>${o.lbl}</option>`)
      .join("");

    const optionsDisplay = (type === "select") ? "" : "display:none;";

    const $row = $(`
      <div class="dyn-field-row" data-prev-key="${escapeHtml(key)}" data-prev-label="${escapeHtml(label)}">
        <input type="text" class="fld-key" placeholder="key (إنجليزي)" value="${escapeHtml(key)}" />
        <input type="text" class="fld-label" placeholder="اسم الحقل (للموظف)" value="${escapeHtml(label)}" />
        <select class="fld-type" title="نوع الحقل">${typeSelectHtml}</select>
        <input type="text" class="fld-options" placeholder="خيارات مفصولة بفاصلة (مثال: اليمنى,اليسرى)" value="${escapeHtml(options)}" style="${optionsDisplay}" />
        <input type="text" class="fld-default" placeholder="القيمة الافتراضية / النص التلقائي" value="${escapeHtml(defaultValue)}" title="القيمة الافتراضية للتوليد التلقائي" />
        <button type="button" class="btn btn-outline btn-sm btn-insert-field" title="إدراج الحقل في نص القالب">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-left:3px"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>
          إدراج
        </button>
        <button type="button" class="btn btn-danger btn-sm btn-remove-field" title="حذف الحقل">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `);
    $("#tpl_fields").append($row);

    // إظهار/إخفاء حقل الخيارات عند تغيير النوع
    $row.find(".fld-type").on("change", function () {
      const isSelect = $(this).val() === "select";
      $row.find(".fld-options").toggle(isSelect);
    });

    if (autoFocus) {
      $row.find(".fld-key").focus();
    }
  }

  $("#addFieldRow").on("click", function () {
    const textarea = document.getElementById("tpl_body");
    if (textarea && textarea.selectionStart !== undefined) {
      lastCursorPos = textarea.selectionStart;
    }
    addFieldRow(null, true);
  });

  // عند الضغط على زر ✕ (حذف الحقل) -> حذف السطر الخاص به فوريًا حيًا من نص التقرير
  $("#tpl_fields").on("click", ".btn-remove-field", function () {
    const $row = $(this).closest(".dyn-field-row");
    const key = $row.find(".fld-key").val().trim() || $row.data("prev-key");
    if (key) {
      const $body = $("#tpl_body");
      let text = $body.val() || "";
      const escapedKey = escapeRegex(key);
      const reRemove = new RegExp("(?:[^\\n]*:{1}\\s*)?\\{\\{\\s*" + escapedKey + "\\s*\\}\\}\\n?", "g");
      text = text.replace(reRemove, "");
      $body.val(text);
    }
    $row.remove();
  });

  // إدراج الحقل والاسم العربي عند ضغط زر 📌 إدراج الصريح
  $("#tpl_fields").on("click", ".btn-insert-field", function () {
    const $row = $(this).closest(".dyn-field-row");
    const key = $row.find(".fld-key").val();
    const label = $row.find(".fld-label").val();
    insertPlaceholderAtCursor(key, label, true);
  });

  // المزامنة الحية الفورية (Live Sync) عند الكتابة أو التعديل دون سحب المؤشر إطلاقاً
  $("#tpl_fields").on("input", ".fld-key, .fld-label", function () {
    const $row = $(this).closest(".dyn-field-row");
    const oldKey = $row.data("prev-key") || "";
    const oldLabel = $row.data("prev-label") || "";

    const newKey = $row.find(".fld-key").val().trim();
    const newLabel = $row.find(".fld-label").val().trim();

    const $body = $("#tpl_body");
    let text = $body.val() || "";

    // 1. إذا قمت بمسح المفتاح بالكامل -> احذف السطر الخاص به فوريًا من نص التقرير
    if (!newKey && oldKey) {
      const escapedOldKey = escapeRegex(oldKey);
      const reRemove = new RegExp("(?:[^\\n]*:{1}\\s*)?\\{\\{\\s*" + escapedOldKey + "\\s*\\}\\}\\n?", "g");
      text = text.replace(reRemove, "");
      $body.val(text);
      $row.data("prev-key", "");
      $row.data("prev-label", "");
      return;
    }

    if (!newKey) return;

    const oldTag = `{{${oldKey}}}`;
    const newTag = `{{${newKey}}}`;
    const newFullStr = newLabel ? `${newLabel}: ${newTag}` : newTag;

    // 2. إذا كان المفتاح القديم موجوداً بالفعل في النص -> استبدله وطبّق التعديل فوريًا حيًا
    if (oldKey && (text.includes(oldTag) || text.includes(`{{ ${oldKey} }}`))) {
      const escapedOldKey = escapeRegex(oldKey);
      const reOld = new RegExp("(?:[^\\n]*:{1}\\s*)?\\{\\{\\s*" + escapedOldKey + "\\s*\\}\\}", "g");
      text = text.replace(reOld, newFullStr);
      $body.val(text);
    } else if (newLabel && text.includes(newTag)) {
      // 3. إذا تغير الاسم العربي فقط
      const escapedNewKey = escapeRegex(newKey);
      const reUpdateLabel = new RegExp("(?:[^\\n]*:{1}\\s*)?\\{\\{\\s*" + escapedNewKey + "\\s*\\}\\}", "g");
      text = text.replace(reUpdateLabel, newFullStr);
      $body.val(text);
    }

    $row.data("prev-key", newKey);
    $row.data("prev-label", newLabel);
  });

  // عند انتهاء المستخدم من كتابة المفتاح والتأكيد
  $("#tpl_fields").on("change", ".fld-key", function () {
    const $row = $(this).closest(".dyn-field-row");
    const newKey = $row.find(".fld-key").val().trim();
    const newLabel = $row.find(".fld-label").val().trim();
    if (!newKey) return;
    const $body = $("#tpl_body");
    let text = $body.val() || "";
    if (!text.includes("{{" + newKey + "}}")) {
      insertPlaceholderAtCursor(newKey, newLabel, false);
    }
  });

  $("#btnNewTemplate").on("click", () => openTplModal(null));
  $("#tplCancel").on("click", () => $("#tplModal").removeClass("show"));

  $("#templatesList").on("click", ".btn-edit-tpl", function () {
    const id = $(this).closest(".list-item").data("id");
    openTplModal(DB.Templates.get(id));
  });
  $("#templatesList").on("click", ".btn-del-tpl", function () {
    const id = $(this).closest(".list-item").data("id");
    const tpl = DB.Templates.get(id);
    const tplName = tpl ? tpl.name : "هذا القالب";
    showConfirmPopup({
      title: "حذف قالب",
      message: `هل أنت متاكد من حذف "${tplName}"؟ لن تظهر التقارير المرتبطة به في قائمة الاختيار بعد الآن.`,
      confirmText: "حذف القالب",
      type: "danger",
      onConfirm: function () {
        DB.Templates.remove(id);
        renderTemplates();
        showToast("تم حذف القالب بنجاح");
      }
    });
  });

  $("#tplForm").on("submit", function (e) {
    e.preventDefault();
    const fields = [];
    $("#tpl_fields .dyn-field-row").each(function () {
      const key          = $(this).find(".fld-key").val().trim();
      const label        = $(this).find(".fld-label").val().trim();
      const type         = $(this).find(".fld-type").val() || "text";
      const options      = $(this).find(".fld-options").val().trim();
      const defaultValue = $(this).find(".fld-default").val();
      if (key && label) {
        const item = { key, label, type, options };
        if (defaultValue !== undefined && defaultValue !== "") {
          item.defaultValue = defaultValue;
        }
        fields.push(item);
      }
    });

    if (fields.length === 0) {
      showToast("أضف حقلًا متغيّرًا واحدًا على الأقل", true);
      return;
    }

    // نحول النص العادي إلى فقرات HTML بسيطة
    const rawBody = $("#tpl_body").val();
    const bodyHtml = rawBody
      .split(/\n+/)
      .filter((l) => l.trim().length)
      .map((l) => `<p>${escapeHtml(l).replace(/&#123;&#123;/g, "{{").replace(/&#125;&#125;/g, "}}")}</p>`)
      .join("");
    // أعد فك أي هروب زائد لعلامات {{ }}
    const finalBody = bodyHtml.replace(/\{\{\s*/g, "{{").replace(/\s*\}\}/g, "}}");

    const data = {
      name: $("#tpl_name").val().trim(),
      category: $("#tpl_category").val().trim(),
      fields,
      bodyHtml: finalBody
    };

    if (editingTplId) {
      DB.Templates.update(editingTplId, data);
      showToast("تم تحديث القالب");
    } else {
      DB.Templates.add(data);
      showToast("تم إضافة القالب");
    }
    $("#tplModal").removeClass("show");
    renderTemplates();
  });

  /* ---------------- Excel export/import ---------------- */
  function serializeFields(fields) {
    // صيغة: key|label|type|options|defaultValue
    return (fields || []).map((f) => `${f.key}|${f.label}|${f.type || "text"}|${f.options || ""}|${f.defaultValue || f.default || ""}`).join(";");
  }
  function deserializeFields(str) {
    if (!str) return [];
    return String(str)
      .split(";")
      .map((chunk) => chunk.split("|"))
      .filter((p) => p.length >= 2)
      .map((p) => ({
        key:          (p[0] || "").trim(),
        label:        (p[1] || "").trim(),
        type:         (p[2] || "text").trim() || "text",
        options:      (p[3] || "").trim(),
        defaultValue: (p[4] || "").trim()
      }))
      .filter((f) => f.key && f.label);
  }

  /* ============================================================
     Excel Export — تصدير منظم وجاهز للاستيراد
     ============================================================ */
  $("#btnExportTemplates").on("click", function () {
    const templates = DB.Templates.all();
    if (templates.length === 0) {
      showToast("لا توجد قوالب لتصديرها", true);
      return;
    }

    const wb = XLSX.utils.book_new();

    /* ── الشيت الأول: بيانات القوالب ── */
    const tplRows = templates.map((t, i) => ({
      "#":        i + 1,
      "اسم القالب":    t.name,
      "التصنيف":       t.category || "",
      "عدد الحقول":    (t.fields || []).length,
      "نص التقرير":    stripToPlaceholderText(t.bodyHtml),
      "fields_raw":    serializeFields(t.fields)          // مخفي للاستيراد
    }));

    const wsTpl = XLSX.utils.json_to_sheet(tplRows, {
      header: ["#", "اسم القالب", "التصنيف", "عدد الحقول", "نص التقرير", "fields_raw"]
    });

    // عرض الأعمدة
    wsTpl["!cols"] = [
      { wch: 4 },   // #
      { wch: 28 },  // اسم القالب
      { wch: 16 },  // التصنيف
      { wch: 12 },  // عدد الحقول
      { wch: 70 },  // نص التقرير
      { wch: 50 }   // fields_raw
    ];

    // تنسيق الصف الأول (رأس الجدول) — خلفية زرقاء داكنة + نص أبيض
    const tplHeaders = ["A1","B1","C1","D1","E1","F1"];
    tplHeaders.forEach(ref => {
      if (!wsTpl[ref]) return;
      wsTpl[ref].s = {
        font:    { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
        fill:    { fgColor: { rgb: "12245E" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true }
      };
    });

    XLSX.utils.book_append_sheet(wb, wsTpl, "القوالب");

    /* ── الشيت الثاني: الحقول المتغيرة ── */
    const fieldRows = [];
    templates.forEach(t => {
      (t.fields || []).forEach((f, fi) => {
        fieldRows.push({
          "اسم القالب":          t.name,
          "التصنيف":             t.category || "",
          "رقم الحقل":           fi + 1,
          "مفتاح الحقل":         f.key,
          "اسم الحقل (للموظف)": f.label,
          "نوع الحقل":           f.type || "text",
          "خيارات القائمة":      f.options || ""
        });
      });
    });

    const wsFields = XLSX.utils.json_to_sheet(fieldRows, {
      header: ["اسم القالب", "التصنيف", "رقم الحقل", "مفتاح الحقل", "اسم الحقل (للموظف)", "نوع الحقل", "خيارات القائمة"]
    });

    wsFields["!cols"] = [
      { wch: 28 },  // اسم القالب
      { wch: 16 },  // التصنيف
      { wch: 10 },  // رقم الحقل
      { wch: 20 },  // مفتاح الحقل
      { wch: 28 },  // اسم الحقل
      { wch: 14 },  // نوع الحقل
      { wch: 36 }   // خيارات القائمة
    ];

    const fieldHeaders = ["A1","B1","C1","D1","E1","F1","G1"];
    fieldHeaders.forEach(ref => {
      if (!wsFields[ref]) return;
      wsFields[ref].s = {
        font:    { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
        fill:    { fgColor: { rgb: "1E8FD5" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true }
      };
    });

    XLSX.utils.book_append_sheet(wb, wsFields, "الحقول المتغيرة");

    /* ── الشيت الثالث: تعليمات الاستيراد ── */
    const instructions = [
      { "تعليمات الاستيراد": "لاستيراد قوالب جديدة، استخدم شيت القوالب فقط" },
      { "تعليمات الاستيراد": "الأعمدة المطلوبة: اسم القالب | التصنيف | نص التقرير | fields_raw" },
      { "تعليمات الاستيراد": "أو بالإنجليزية: name | category | body | fields" },
      { "تعليمات الاستيراد": "عمود fields_raw: اكتب الحقول بصيغة: key|label;key|label" },
      { "تعليمات الاستيراد": "مثال: name|اسم المريض;age|السن;date|التاريخ" },
      { "تعليمات الاستيراد": "في نص التقرير، استخدم {{key}} لإدراج قيمة الحقل تلقائياً" },
      { "تعليمات الاستيراد": "مثال: اسم المريض: {{name}} — السن: {{age}} سنة" }
    ];

    const wsInfo = XLSX.utils.json_to_sheet(instructions, { header: ["تعليمات الاستيراد"] });
    wsInfo["!cols"] = [{ wch: 90 }];
    wsInfo["A1"].s = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
      fill: { fgColor: { rgb: "34B7A0" } },
      alignment: { horizontal: "center" }
    };

    XLSX.utils.book_append_sheet(wb, wsInfo, "تعليمات الاستيراد");

    /* ── تحميل الملف ── */
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `قوالب_مركز_الخبراء_${stamp}.xlsx`);
    showToast(`✅ تم تصدير ${templates.length} قالب بنجاح`);
  });


  $("#excelInput").on("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });

        // نبحث عن شيت القوالب بالاسم العربي أو الإنجليزي أو أول شيت
        let sheetName = wb.SheetNames.find(n => n === "القوالب" || n === "Templates") || wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        let added = 0;
        rows.forEach((row) => {
          // قبول الأعمدة العربية والإنجليزية والمختلطة
          const name     = String(row.name     || row["اسم القالب"]  || "").trim();
          const category = String(row.category || row["التصنيف"]     || "").trim();
          const bodyRaw  = String(row.body     || row["نص التقرير"]  || "").trim();
          // fields_raw هو الاسم الجديد، fields و"الحقول" للتوافق مع الإصدارات القديمة
          const fieldsRaw = String(
            row.fields_raw || row.fields || row["الحقول"] || ""
          ).trim();

          if (!name || !bodyRaw) return;   // تجاهل الصفوف الفارغة

          const fields = deserializeFields(fieldsRaw);
          const bodyHtml = bodyRaw
            .split(/\r?\n+/)
            .filter((l) => l.trim().length)
            .map((l) => `<p>${escapeHtmlKeepBraces(l)}</p>`)
            .join("");

          DB.Templates.add({ name, category, fields, bodyHtml });
          added++;
        });

        if (added > 0) {
          $("#importSummary").html(
            `<span style="color:#1e8fd5;font-weight:700">✅ تم استيراد ${added} قالب بنجاح من شيت "${sheetName}"</span>`
          );
          showToast(`✅ تم استيراد ${added} قالب بنجاح`);
        } else {
          $("#importSummary").html(
            `<span style="color:#d23a4f">⚠️ لم يتم العثور على صفوف صالحة — تأكد من أعمدة: اسم القالب، نص التقرير</span>`
          );
        }
        renderTemplates();
      } catch (err) {
        console.error(err);
        $("#importSummary").html(
          `<span style="color:#d23a4f">❌ تعذّرت قراءة الملف — تأكد أنه بصيغة Excel صحيحة (.xlsx)</span>`
        );
        showToast("فشل استيراد الملف", true);
      }
      $("#excelInput").val("");
    };
    reader.readAsBinaryString(file);
  });

  function escapeHtmlKeepBraces(str) {
    return escapeHtml(str).replace(/\{\{\s*/g, "{{").replace(/\s*\}\}/g, "}}");
  }

  /* =========================================================
     USERS — إدارة كاملة للمستخدمين (CRUD + Popups)
     ========================================================= */
  function renderUsers() {
    const users = DB.Users.all();
    const $list = $("#usersList").empty();
    const currentSession = DB.Session.current();
    const currentUserId = currentSession ? currentSession.userId : session.userId;

    if (users.length === 0) {
      $list.html(`<div class="empty-fields-note">لا يوجد مستخدمون بعد.</div>`);
      return;
    }

    users.forEach((u) => {
      const isSelf = u.id === currentUserId;
      $list.append(`
        <div class="list-item" data-id="${u.id}">
          <div class="li-main">
            <div class="li-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-left:4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              ${escapeHtml(u.fullName)}
              <span class="badge ${u.role === "admin" ? "admin" : ""}">${u.role === "admin" ? "مدير" : "موظف استقبال"}</span>
              ${isSelf ? '<span class="badge" style="background:#eaf8f4;color:#10b981;">حسابك الحالي</span>' : ""}
            </div>
            <div class="li-sub" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px;">
              <span><strong>اسم الدخول:</strong> ${escapeHtml(u.username)}</span>
              <span>·</span>
              <span><strong>كلمة المرور:</strong> <code class="pwd-code" data-pwd="${escapeHtml(u.password)}">••••••••</code></span>
              <button type="button" class="btn-toggle-pwd" style="border:none;background:none;cursor:pointer;font-size:13px;color:var(--blue);padding:0 2px;" title="إظهار / إخفاء كلمة المرور">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
            </div>
          </div>
          <div class="li-actions">
            <button class="btn btn-outline btn-sm btn-edit-user" title="تعديل حساب المستخدم">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-left:3px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              تعديل
            </button>
            ${isSelf ? "" : `<button class="btn btn-danger btn-sm btn-del-user" title="حذف حساب المستخدم"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-left:3px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>حذف</button>`}
          </div>
        </div>
      `);
    });
  }

  // --- إظهار / إخفاء كلمة المرور ---
  $("#usersList").on("click", ".btn-toggle-pwd", function () {
    const $btn = $(this);
    const $code = $btn.siblings("span").find(".pwd-code");
    const pwd = $code.data("pwd");
    if ($code.text() === "••••••••") {
      $code.text(pwd).css({ background: "#ffffff", border: "1px solid var(--line)", padding: "2px 6px", borderRadius: "5px", color: "#1b2340", fontWeight: "700" });
      $btn.html(`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`);
    } else {
      $code.text("••••••••").css({ background: "none", border: "none", padding: "0", color: "inherit", fontWeight: "normal" });
      $btn.html(`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`);
    }
  });

  // --- إضافة مستخدم جديد ---
  $("#userForm").on("submit", function (e) {
    e.preventDefault();
    const username = $("#u_username").val().trim();
    const fullName = $("#u_fullName").val().trim();
    const password = $("#u_password").val();
    const role = $("#u_role").val();

    if (DB.Users.findByUsername(username)) {
      showToast("اسم المستخدم موجود بالفعل، يرجى اختيار اسم آخر", true);
      return;
    }

    DB.Users.add({ fullName, username, password, role });
    this.reset();
    renderUsers();
    showToast("تم إضافة المستخدم بنجاح");
  });

  // --- فتح نافذة تعديل المستخدم ---
  function openUserEditModal(user) {
    if (!user) return;
    $("#edit_u_id").val(user.id);
    $("#edit_u_fullName").val(user.fullName || "");
    $("#edit_u_username").val(user.username || "");
    $("#edit_u_password").val(user.password || "");
    $("#edit_u_role").val(user.role || "agent");
    $("#userEditModal").addClass("show");
  }

  $("#cancelUserEditBtn, #userEditModal").on("click", function (e) {
    if (e.target === this || e.target.id === "cancelUserEditBtn") {
      $("#userEditModal").removeClass("show");
    }
  });

  $("#usersList").on("click", ".btn-edit-user", function () {
    const id = $(this).closest(".list-item").data("id");
    const user = DB.Users.all().find((u) => u.id === id);
    openUserEditModal(user);
  });

  // --- حفظ تعديل بيانات المستخدم ---
  $("#userEditForm").on("submit", function (e) {
    e.preventDefault();
    const id = $("#edit_u_id").val();
    const fullName = $("#edit_u_fullName").val().trim();
    const username = $("#edit_u_username").val().trim();
    const password = $("#edit_u_password").val();
    const role = $("#edit_u_role").val();

    if (!fullName || !username || !password) {
      showToast("يرجى ملء جميع الحقول المطلوبة", true);
      return;
    }

    // التحقق من تكرار اسم المستخدم مع حساب آخر
    const duplicate = DB.Users.all().find((u) => u.username.trim().toLowerCase() === username.toLowerCase() && u.id !== id);
    if (duplicate) {
      showToast("اسم المستخدم هذا مستخدم بالفعل للحساب آخر", true);
      return;
    }

    DB.Users.update(id, { fullName, username, password, role });

    // إذا كان الحساب الذي تم تعديله هو حساب الجلسة الحالية -> تحديث البيانات "لتسمع" في الهيدر والنافبار فورياً وتحديث لقطة كلمة المرور
    const currentSession = DB.Session.current();
    if (currentSession && (currentSession.userId === id || (currentSession.username && currentSession.username.toLowerCase() === username.toLowerCase()))) {
      DB.Session.login({ id, username, fullName, role, password });
      $("#topbarUserName").text(fullName);
      $("#drawerUserName").text(fullName);
      $("#drawerUserRole").text(role === "admin" ? "مدير النظام" : "موظف استقبال");
      const avatar = fullName.charAt(0) || "م";
      $("#drawerUserAvatar").text(avatar);
    }

    $("#userEditModal").removeClass("show");
    renderUsers();
    showToast("تم تحديث بيانات المستخدم بنجاح. تذكر تصدير users.json ورفعه لـ GitHub لتنفيذه على باقي الأجهزة.");
  });

  // --- حذف مستخدم (عبر بوب-أب التنبيه) ---
  $("#usersList").on("click", ".btn-del-user", function () {
    const id = $(this).closest(".list-item").data("id");
    const user = DB.Users.all().find((u) => u.id === id);
    const uName = user ? (user.fullName || user.username) : "هذا المستخدم";

    showConfirmPopup({
      title: "حذف حساب مستخدم",
      message: `هل أنت متأكد من حذف حساب "${uName}"؟ لن يتمكن من تسجيل الدخول للنظام بعد الآن.`,
      confirmText: "حذف حساب المستخدم",
      type: "danger",
      onConfirm: function () {
        DB.Users.remove(id);
        renderUsers();
        showToast("تم حذف المستخدم بنجاح");
      }
    });
  });

  renderTemplates();
  renderUsers();

  /* =========================================================
     SETTINGS TAB — قائمة الأطباء + إعدادات العيادة
     ========================================================= */

  // --- عرض قائمة الأطباء ---
  function renderDoctors() {
    const doctors = DB.Doctors.all();
    const $list = $("#doctorsList").empty();
    if (doctors.length === 0) {
      $list.html(`<p style="font-size:13px;color:var(--text-dim);text-align:center;padding:16px 0;">لا يوجد أطباء مضافون بعد.</p>`);
      return;
    }
    doctors.forEach((d) => {
      $list.append(`
        <div class="list-item">
          <div class="li-main">
            <div class="li-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-left:4px;"><path d="M4.8 2.3A.3.3 0 0 0 4.5 2h-1a.3.3 0 0 0-.3.3v7.2a4.5 4.5 0 0 0 9 0V2.3a.3.3 0 0 0-.3-.3h-1a.3.3 0 0 0-.3.3v7.2a2.7 2.7 0 0 1-5.4 0V2.3z"/><path d="M8 13.7v3.8a2.5 2.5 0 0 0 5 0v-1"/><circle cx="18" cy="16" r="3"/></svg>
              ${escapeHtml(d.name)}
            </div>
            <div class="li-sub">${escapeHtml(d.title)}</div>
          </div>
          <div class="li-actions">
            <button class="btn btn-danger btn-sm btn-del-doctor" data-id="${d.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-left:3px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              حذف
            </button>
          </div>
        </div>
      `);
    });
  }

  // --- إضافة طبيب ---
  $("#doctorForm").on("submit", function (e) {
    e.preventDefault();
    const name = $("#d_name").val().trim();
    const title = $("#d_title").val().trim();
    if (!name || !title) return;
    DB.Doctors.add({ name, title });
    this.reset();
    renderDoctors();
    showToast("تم إضافة الطبيب بنجاح");
  });

  // --- حذف طبيب (عبر بوب-أب التنبيه) ---
  $("#doctorsList").on("click", ".btn-del-doctor", function () {
    const id = $(this).data("id");
    const d = DB.Doctors.get(id);
    const dName = d ? d.name : "هذا الطبيب";

    showConfirmPopup({
      title: "حذف طبيب",
      message: `هل أنت متأكد من حذف الطبيب "${dName}" من القائمة؟`,
      confirmText: "حذف الطبيب",
      type: "danger",
      onConfirm: function () {
        DB.Doctors.remove(id);
        renderDoctors();
        showToast("تم حذف الطبيب");
      }
    });
  });

  // --- حفظ اسم العيادة وإعدادات الطباعة ---
  function loadClinicSettings() {
    const c = DB.Clinic.get();
    $("#s_clinicName").val(c.clinicName || "");
    // الافتراضي: كل العناصر ظاهرة (true)
    $("#s_showLogo").prop("checked",      c.printLogo      !== false);
    $("#s_showHeader").prop("checked",    c.printHeader    !== false);
    $("#s_showFooter").prop("checked",    c.printFooter    !== false);
    $("#s_showWatermark").prop("checked", c.printWatermark !== false);

    const offset = (c.printOffsetTop !== undefined && c.printOffsetTop !== null) ? Number(c.printOffsetTop) : 0;
    $("#s_printOffsetTop").val(offset);
    $("#offsetValBadge").text(offset + " mm");
  }

  // تحديث فوري لقيمة الإزاحة عند تحريك السلايدر
  $("#s_printOffsetTop").on("input", function () {
    const val = $(this).val();
    $("#offsetValBadge").text(val + " mm");
  });

  $("#settingsForm").on("submit", function (e) {
    e.preventDefault();
    DB.Clinic.save({
      clinicName:     $("#s_clinicName").val().trim(),
      printLogo:      $("#s_showLogo").is(":checked"),
      printHeader:    $("#s_showHeader").is(":checked"),
      printFooter:    $("#s_showFooter").is(":checked"),
      printWatermark: $("#s_showWatermark").is(":checked"),
      printOffsetTop: Number($("#s_printOffsetTop").val()) || 0
    });

    // فتح بوب-أب النجاح (Save Success Modal)
    $("#saveSuccessModal").addClass("show");
  });

  // إغلاق بوب-أب النجاح
  $("#closeSaveModalBtn, #saveSuccessModal").on("click", function (e) {
    if (e.target === this || e.target.id === "closeSaveModalBtn") {
      $("#saveSuccessModal").removeClass("show");
    }
  });

  $("#btnExportJson").on("click", function () {
    DB.exportAllJsonFiles();
    showToast("✔ جاري تحميل ملفات JSON (ضعها في مجلد data المرفوع على جيت هب)");
  });

  $("#btnExportTemplatesJson").on("click", function () {
    DB.downloadJsonFile("templates.json", DB.Templates.all());
    showToast("✔ تم تصدير templates.json بنجاح (ضعه في مجلد data المرفوع على جيت هب)");
  });

  $("#btnExportUsersJson").on("click", function () {
    DB.downloadJsonFile("users.json", DB.Users.all());
    showToast("✔ تم تصدير users.json بنجاح (ضعه في مجلد data المرفوع على جيت هب)");
  });

  $("#btnExportDoctorsJson").on("click", function () {
    DB.downloadJsonFile("doctors.json", DB.Doctors.all());
    showToast("✔ تم تصدير doctors.json بنجاح (ضعه في مجلد data المرفوع على جيت هب)");
  });

  $("#btnExportClinicJson").on("click", function () {
    DB.downloadJsonFile("clinic.json", DB.Clinic.get());
    showToast("✔ تم تصدير clinic.json بنجاح (ضعه في مجلد data المرفوع على جيت هب)");
  });

  renderDoctors();
  loadClinicSettings();
});
