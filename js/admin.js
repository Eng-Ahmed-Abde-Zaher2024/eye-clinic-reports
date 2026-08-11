/* =========================================================
   admin.js — منطق لوحة الإدارة: القوالب + المستخدمون + إكسل
   ========================================================= */

$(async function () {
  const session = requireAuth("admin");
  if (!session) return;
  renderTopbar(session);

  // جلب أحدث ملفات JSON من جيت هب عند التحميل
  await DB.init();

  // ---------------- Tabs ----------------
  $(".tab-btn").on("click", function () {
    const tab = $(this).data("tab");
    $(".tab-btn").removeClass("active");
    $(this).addClass("active");
    $(".tab-panel").removeClass("active");
    $("#tab-" + tab).addClass("active");
  });

  function showToast(msg, isErr) {
    const $t = $("#toast").text(msg).removeClass("err");
    if (isErr) $t.addClass("err");
    $t.addClass("show");
    setTimeout(() => $t.removeClass("show"), 2600);
  }

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

  function addFieldRow(field) {
    const key = field ? field.key : "";
    const label = field ? field.label : "";
    const $row = $(`
      <div class="dyn-field-row">
        <input type="text" class="fld-key" placeholder="key (بالإنجليزية)" value="${escapeHtml(key)}" />
        <input type="text" class="fld-label" placeholder="اسم الحقل (يظهر للموظف)" value="${escapeHtml(label)}" />
        <button type="button" class="btn btn-danger btn-sm btn-remove-field">✕</button>
      </div>
    `);
    $("#tpl_fields").append($row);
  }

  $("#addFieldRow").on("click", () => addFieldRow(null));
  $("#tpl_fields").on("click", ".btn-remove-field", function () {
    $(this).closest(".dyn-field-row").remove();
  });

  $("#btnNewTemplate").on("click", () => openTplModal(null));
  $("#tplCancel").on("click", () => $("#tplModal").removeClass("show"));

  $("#templatesList").on("click", ".btn-edit-tpl", function () {
    const id = $(this).closest(".list-item").data("id");
    openTplModal(DB.Templates.get(id));
  });
  $("#templatesList").on("click", ".btn-del-tpl", function () {
    const id = $(this).closest(".list-item").data("id");
    if (confirm("هل تريد حذف هذا القالب؟")) {
      DB.Templates.remove(id);
      renderTemplates();
      showToast("تم حذف القالب");
    }
  });

  $("#tplForm").on("submit", function (e) {
    e.preventDefault();
    const fields = [];
    $("#tpl_fields .dyn-field-row").each(function () {
      const key = $(this).find(".fld-key").val().trim();
      const label = $(this).find(".fld-label").val().trim();
      if (key && label) fields.push({ key, label });
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
    return (fields || []).map((f) => `${f.key}|${f.label}`).join(";");
  }
  function deserializeFields(str) {
    if (!str) return [];
    return String(str)
      .split(";")
      .map((chunk) => chunk.split("|"))
      .filter((p) => p.length === 2)
      .map(([key, label]) => ({ key: key.trim(), label: label.trim() }));
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
          "اسم القالب":   t.name,
          "التصنيف":      t.category || "",
          "رقم الحقل":    fi + 1,
          "مفتاح الحقل":  f.key,
          "اسم الحقل (للموظف)": f.label
        });
      });
    });

    const wsFields = XLSX.utils.json_to_sheet(fieldRows, {
      header: ["اسم القالب", "التصنيف", "رقم الحقل", "مفتاح الحقل", "اسم الحقل (للموظف)"]
    });

    wsFields["!cols"] = [
      { wch: 28 },  // اسم القالب
      { wch: 16 },  // التصنيف
      { wch: 10 },  // رقم الحقل
      { wch: 20 },  // مفتاح الحقل
      { wch: 28 }   // اسم الحقل
    ];

    const fieldHeaders = ["A1","B1","C1","D1","E1"];
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
     USERS
     ========================================================= */
  function renderUsers() {
    const users = DB.Users.all();
    const $list = $("#usersList").empty();
    users.forEach((u) => {
      const isSelf = u.id === session.userId;
      $list.append(`
        <div class="list-item" data-id="${u.id}">
          <div class="li-main">
            <div class="li-title">${escapeHtml(u.fullName)} <span class="badge ${u.role === "admin" ? "admin" : ""}">${u.role === "admin" ? "مدير" : "موظف استقبال"}</span></div>
            <div class="li-sub">اسم الدخول: ${escapeHtml(u.username)}</div>
          </div>
          <div class="li-actions">
            ${isSelf ? "" : `<button class="btn btn-danger btn-sm btn-del-user">حذف</button>`}
          </div>
        </div>
      `);
    });
  }

  $("#usersList").on("click", ".btn-del-user", function () {
    const id = $(this).closest(".list-item").data("id");
    if (confirm("هل تريد حذف هذا المستخدم؟")) {
      DB.Users.remove(id);
      renderUsers();
      showToast("تم حذف المستخدم");
    }
  });

  $("#userForm").on("submit", function (e) {
    e.preventDefault();
    const username = $("#u_username").val().trim();
    if (DB.Users.findByUsername(username)) {
      showToast("اسم المستخدم موجود بالفعل", true);
      return;
    }
    DB.Users.add({
      fullName: $("#u_fullName").val().trim(),
      username,
      password: $("#u_password").val(),
      role: $("#u_role").val()
    });
    this.reset();
    renderUsers();
    showToast("تم إضافة المستخدم بنجاح");
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
            <div class="li-title">👨‍⚕️ ${escapeHtml(d.name)}</div>
            <div class="li-sub">${escapeHtml(d.title)}</div>
          </div>
          <div class="li-actions">
            <button class="btn btn-danger btn-sm btn-del-doctor" data-id="${d.id}">حذف</button>
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
    showToast("✔ تم إضافة الطبيب بنجاح");
  });

  // --- حذف طبيب ---
  $("#doctorsList").on("click", ".btn-del-doctor", function () {
    const id = $(this).data("id");
    DB.Doctors.remove(id);
    renderDoctors();
    showToast("تم حذف الطبيب");
  });

  // --- حفظ اسم العيادة ---
  function loadClinicSettings() {
    const c = DB.Clinic.get();
    $("#s_clinicName").val(c.clinicName || "");
  }

  $("#settingsForm").on("submit", function (e) {
    e.preventDefault();
    DB.Clinic.save({ clinicName: $("#s_clinicName").val().trim() });
    showToast("✔ تم حفظ إعدادات العيادة");
  });

  $("#btnExportJson").on("click", function () {
    DB.exportAllJsonFiles();
    showToast("✔ جاري تحميل ملفات JSON (ضعها في مجلد data المرفوع على جيت هب)");
  });

  renderDoctors();
  loadClinicSettings();
});
