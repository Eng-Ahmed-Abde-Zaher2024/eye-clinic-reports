/* =========================================================
   db.js — طبقة البيانات المرتبطة بملفات JSON والتحميل المحلي
   تصل بين ملفات data/*.json والمتصفح
   ========================================================= */

const DB = (() => {
  const KEYS = {
    users: "eyeclinic_users",
    templates: "eyeclinic_templates",
    session: "eyeclinic_session",
    clinic: "eyeclinic_settings",
    doctors: "eyeclinic_doctors"
  };

  function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error("DB read error", key, e);
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ---------- جلب ملفات JSON من الخادم وتحديث localStorage دائماً ----------
  async function loadJsonFiles() {
    // التصفح المباشر من الملفات (file://) لا يدعم fetch() في المتصفحات الحديثة بسبب سياسة CORS
    if (window.location.protocol === "file:") {
      return;
    }

    try {
      const fetchJson = (url) =>
        fetch(url + "?t=" + Date.now(), { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

      // جلب جميع ملفات JSON دائماً مع تجاوز كاش المتصفح تماماً
      const [doctors, templates, clinic, users] = await Promise.all([
        fetchJson("data/doctors.json"),
        fetchJson("data/templates.json"),
        fetchJson("data/clinic.json"),
        fetchJson("data/users.json")
      ]);

      // ─── الأطباء: تحديث من الخادم إلا إذا كانت هناك تعديلات محلية غير مُصدرة ───
      if (doctors && Array.isArray(doctors) && doctors.length > 0) {
        if (localStorage.getItem("eyeclinic_doctors_dirty") !== "true") {
          write(KEYS.doctors, doctors);
        }
      }

      // ─── القوالب: تحديث من الخادم إلا إذا كانت هناك تعديلات محلية غير مُصدرة ───
      if (templates && Array.isArray(templates) && templates.length > 0) {
        if (localStorage.getItem("eyeclinic_templates_dirty") !== "true") {
          const localTemplates = read(KEYS.templates, []);
          const remoteIds = new Set(templates.map((t) => t.id));
          const localOnly = localTemplates.filter((t) => !remoteIds.has(t.id));
          write(KEYS.templates, [...templates, ...localOnly]);
        }
      }

      // ─── إعدادات العيادة: تحديث من الخادم إلا إذا كانت هناك تعديلات محلية غير مُصدرة ───
      if (clinic && typeof clinic === "object" && Object.keys(clinic).length > 0) {
        if (localStorage.getItem("eyeclinic_clinic_dirty") !== "true") {
          write(KEYS.clinic, clinic);
        }
      }

      // ─── المستخدمون: تحديث من الخادم ما لم تكن هناك تعديلات محلية غير مُصدرة ───
      if (users && Array.isArray(users) && users.length > 0) {
        if (localStorage.getItem("eyeclinic_users_dirty") !== "true") {
          write(KEYS.users, users);
        }
      }

      // تسجيل توقيت نجاح المزامنة مع الخادم
      localStorage.setItem("eyeclinic_last_sync_time", new Date().toISOString());
    } catch (e) {
      console.warn("لم يتم التمكن من قراءة ملفات JSON الحية، الاعتماد على التخزين المحلي", e);
    }

    migrateSingleLineHeader();
    purgeTreatmentFromStoredTemplates();
  }

  function restoreMissingDefaultValues() {
    const templates = read(KEYS.templates, null);
    if (!templates || !Array.isArray(templates)) return;
    let changed = false;
    const updated = templates.map(t => {
      const defaultTpl = DEFAULT_TEMPLATES.find(dt => dt.id === t.id);
      if (!defaultTpl) return t;
      let tChanged = false;
      const fields = (t.fields || []).map(f => {
        if (f.defaultValue === undefined && f.default === undefined) {
          const df = (defaultTpl.fields || []).find(dField => dField.key === f.key);
          if (df && (df.defaultValue !== undefined || df.default !== undefined)) {
            tChanged = true;
            return { ...f, defaultValue: df.defaultValue || df.default };
          }
        }
        return f;
      });
      if (tChanged) {
        changed = true;
        return { ...t, fields };
      }
      return t;
    });
    if (changed) write(KEYS.templates, updated);
  }

  // ترحيل: تحويل سطر اسم المريض / السن / التاريخ من فقرة واحدة إلى ثلاث فقرات
  function migrateSingleLineHeader() {
    restoreMissingDefaultValues();
    const templates = read(KEYS.templates, null);
    if (!templates) return;
    // يتطابق مع &nbsp;&nbsp; أو &amp;nbsp;&amp;nbsp;
    const SP = "(?:&(?:amp;)?nbsp;){2}";
    const OLD = new RegExp(
      `<p>(<strong>اسم المريض:<\\/strong> \\{\\{name\\}\\}) ${SP} (<strong>[^<]+<\\/strong> \\{\\{age\\}\\} سنة) ${SP} (<strong>[^<]+<\\/strong> \\{\\{date\\}\\})<\\/p>`,
      "g"
    );
    let changed = false;
    const updated = templates.map(t => {
      if (!t.bodyHtml) return t;
      const body = t.bodyHtml.replace(OLD, (_, p1, p2, p3) => {
        changed = true;
        return `<p>${p1}</p><p>${p2}</p><p>${p3}</p>`;
      });
      return { ...t, bodyHtml: body };
    });
    if (changed) write(KEYS.templates, updated);
  }

  // ترحيل: حذف حقل العلاج الموصوف (treatment) من جميع القوالب المحفوظة في localStorage
  function purgeTreatmentFromStoredTemplates() {
    const templates = read(KEYS.templates, null);
    if (!templates || !Array.isArray(templates)) return;
    let changed = false;
    const updated = templates.map(t => {
      let tChanged = false;
      let fields = t.fields || [];
      if (fields.some(f => f.key === "treatment")) {
        fields = fields.filter(f => f.key !== "treatment");
        tChanged = true;
      }
      let bodyHtml = t.bodyHtml || "";
      if (bodyHtml.includes("treatment") || bodyHtml.includes("العلاج الموصوف")) {
        bodyHtml = bodyHtml.replace(/<p>[^<]*\{\{\s*treatment\s*\}\}[^<]*<\/p>/gi, "");
        bodyHtml = bodyHtml.replace(/<p>[^<]*العلاج الموصوف[^<]*<\/p>/gi, "");
        tChanged = true;
      }
      if (tChanged) changed = true;
      return { ...t, fields, bodyHtml };
    });
    if (changed) write(KEYS.templates, updated);
  }

  const DEFAULT_TEMPLATES = [
    {
      id: "t_general_exam",
      name: "تقرير فحص عيون عام",
      category: "كشف عام",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name",      label: "اسم المريض",                    type: "text",     options: "" },
        { key: "age",       label: "السن",                          type: "number",   options: "" },
        { key: "date",      label: "التاريخ",                       type: "date",     options: "" },
        { key: "eye",       label: "العين محل الفحص",              type: "select",   options: "اليمنى,اليسرى,كلتا العينين,لا يوجد" },
        { key: "diagnosis", label: "التشخيص",                      type: "textarea", options: "", defaultValue: "ضعف حدة الإبصار الناتج عن عيوب الإنكسار (Refractive Errors) مع إجهاد بصري مزمن وجفاف سطحي بالقرنية يستدعي النظارة والقطرات المرطبة." },
        { key: "rest_days", label: "مدة الراحة الطبية (مثل: 3 أيام)", type: "text",     options: "", defaultValue: "3 أيام" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>التاريخ:</strong> {{date}}</p><p><strong>العين محل الفحص:</strong> {{eye}}</p><p>تم إجراء فحص شامل لقاع العين وقياس ضغط العين وحدة الإبصار، وقد تبين الآتي:</p><p><strong>التشخيص:</strong> {{diagnosis}}</p><p><strong>الراحة الطبية:</strong> يحتاج المريض إلى راحة طبية لمدة <strong>{{rest_days}}</strong> اعتبارات لراحة العين وعدم الإجهاد.</p>"
    },
    {
      id: "t_sick_leave",
      name: "تقرير إجازة مرضية وراحة طبية",
      category: "إجازات وراحة",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name",       label: "اسم المريض",                          type: "text",     options: "" },
        { key: "age",        label: "السن",                                type: "number",   options: "" },
        { key: "date",       label: "تاريخ التقرير",                       type: "date",     options: "" },
        { key: "diagnosis",  label: "المرض / التشخيص الطبي",              type: "textarea", options: "", defaultValue: "التهاب حاد بالملتحمة والقرنية (Acute Keratoconjunctivitis) مع احمرار شديد وإفرازات، يستدعي الراحة التامة وعدم التعرض للضوء والأتربة." },
        { key: "rest_days",  label: "مدة الإجازة المرضية (مثل: أسبوع)",  type: "text",     options: "", defaultValue: "أسبوع" },
        { key: "start_date", label: "تاريخ بداية الإجازة",               type: "date",     options: "" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>تاريخ التقرير:</strong> {{date}}</p><p>يشهد الطبيب المعالج بأن المريض المذكور أعلاه قد حضر للعيادة وتم فحص حالته الصحية وتبين أنه يعاني من: <strong>{{diagnosis}}</strong>.</p><p>وبناءً على التقييم الطبي ونظراً لحاجة العين للراحة التامة وعدم التعرض للإجهاد أو الغبار، يوصى بمنحه إجازة مرضية وراحة طبية لمدة <strong>{{rest_days}}</strong> تبدأ من يوم <strong>{{start_date}}</strong>.</p><p>هذا التقرير أعطي بناءً على طلب المريض لتقديمه لمن يهمه الأمر.</p>"
    },
    {
      id: "t_lasik_op",
      name: "تقرير عملية الليزك وتصحيح الإبصار",
      category: "الليزك والجراحات",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name",         label: "اسم المريض",                          type: "text",     options: "" },
        { key: "age",          label: "السن",                                type: "number",   options: "" },
        { key: "date",         label: "تاريخ العملية",                       type: "date",     options: "" },
        { key: "eye",          label: "العين",                               type: "select",   options: "اليمنى,اليسرى,كلتا العينين" },
        { key: "diagnosis",    label: "التشخيص",                              type: "textarea", options: "", defaultValue: "حاسر نظر مركّب مع حسر استجماتيزمي بالعينين (Compound Myopic Astigmatism) وخضوع لعملية تصحيح الإبصار بالفيمتو ليزك بنجاح." },
        { key: "power_before", label: "درجة النظر قبل العملية",             type: "text",     options: "", defaultValue: "-4.50 D / -1.25 D x 180°" },
        { key: "notes",        label: "ملاحظات ما بعد العملية",             type: "textarea", options: "", defaultValue: "التئام ممتازة لطبقة الفلاب مع شفافية كاملة بالقرنية وعدم وجود أي عتمات." },
        { key: "rest_days",    label: "مدة الراحة الموصى بها (مثل: 5 أيام)", type: "text",     options: "", defaultValue: "5 أيام" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>تاريخ العملية:</strong> {{date}}</p><p><strong>العين التي أُجريت لها العملية:</strong> {{eye}}</p><p><strong>التشخيص:</strong> {{diagnosis}}</p><p><strong>درجة النظر قبل العملية:</strong> {{power_before}}</p><p>تمت عملية تصحيح الإبصار بتقنية الليزك بنجاح ودون أي مضاعفات أثناء الإجراء.</p><p><strong>ملاحظات ما بعد العملية:</strong> {{notes}}</p><p><strong>الراحة والتعافي:</strong> يحتاج المريض لراحة تامة وتجنب إجهاد العين والفرك لمدة <strong>{{rest_days}}</strong> مع الالتزام بالقطرات الموصوفة.</p>"
    },
    {
      id: "t_cataract",
      name: "تقرير جراحة المياه البيضاء وزرع عدسة",
      category: "الجراحات",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name",         label: "اسم المريض",                         type: "text",     options: "" },
        { key: "age",          label: "السن",                               type: "number",   options: "" },
        { key: "date",         label: "تاريخ الجراحة",                      type: "date",     options: "" },
        { key: "eye",          label: "العين محل الجراحة",                  type: "select",   options: "اليمنى,اليسرى,كلتا العينين" },
        { key: "diagnosis",    label: "التشخيص",                              type: "textarea", options: "", defaultValue: "عتمة بالعدسة الكريستالية (مياه بيضاء Cataract) مع تدني حدة الإبصار وخضوع لجراحة الفاكو وزراعة عدسة مطوية داخل العين." },
        { key: "lens_type",    label: "نوع العدسة المزروعة",               type: "text",     options: "", defaultValue: "عدسة مطوية أكريليك خلفية (Foldable Intraocular Lens)" },
        { key: "power",        label: "قوة العدسة (Power)",                 type: "text",     options: "", defaultValue: "+21.50 D" },
        { key: "post_op_care", label: "تعليمات القطرات والغيار",           type: "textarea", options: "", defaultValue: "استخدام قطرات المضاد الحيوي والكورتيزون بانتظام، مع تجنب وصول الماء للعين أو حكها لمدة أسبوعين." },
        { key: "rest_days",    label: "مدة الراحة الطبية (مثل: 10 أيام)", type: "text",     options: "", defaultValue: "10 أيام" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>تاريخ الجراحة:</strong> {{date}}</p><p><strong>العين محل الجراحة:</strong> {{eye}}</p><p><strong>التشخيص:</strong> {{diagnosis}}</p><p>تم إجراء جراحة إزالة المياه البيضاء (Cataract Extraction) بالموجات فوق الصوتية (الفاكو) وزرع عدسة مطوية مطابقة داخل العين:</p><p><strong>نوع العدسة المزروعة:</strong> {{lens_type}} &nbsp;&nbsp; <strong>قوة العدسة (Power):</strong> {{power}}</p><p><strong>تعليمات العناية:</strong> {{post_op_care}}</p><p><strong>الراحة الطبية:</strong> يوصى بمنح المريض إجازة وراحة طبية لمدة <strong>{{rest_days}}</strong> للتعافي التام ومنع دخول الماء أو الأتربة للعين.</p>"
    },
    {
      id: "t_glaucoma",
      name: "تقرير فحص المياه الزرقاء (الجلوكوما)",
      category: "الفحوصات المتخصصة",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name",       label: "اسم المريض",                     type: "text",     options: "" },
        { key: "age",        label: "السن",                           type: "number",   options: "" },
        { key: "date",       label: "التاريخ",                        type: "date",     options: "" },
        { key: "diagnosis",  label: "التشخيص",                      type: "textarea", options: "", defaultValue: "مياه زرقاء أولية مفتوحة الزاوية (Primary Open Angle Glaucoma) مع ارتفاع ضغط العين وتغيرات حليمية بالعصب البصري." },
        { key: "iop_right",  label: "ضغط العين اليمنى (mmHg)",       type: "number",   options: "", defaultValue: 22 },
        { key: "iop_left",   label: "ضغط العين اليسرى (mmHg)",       type: "number",   options: "", defaultValue: 18 },
        { key: "field_test", label: "نتيجة مجال الإبصار",            type: "textarea", options: "", defaultValue: "تراجع جزئي في الحقل البصري الجانبي للعين اليمنى مع ثبات الحقل البصري للعين اليسرى." }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>التاريخ:</strong> {{date}}</p><p><strong>التشخيص:</strong> {{diagnosis}}</p><p>تم تقييم حالة المياه الزرقاء ومتابعة ضغط العين والعصب البصري وكان الفحص كالآتي:</p><p><strong>قياس ضغط العين اليمنى (IOP OD):</strong> {{iop_right}} mmHg &nbsp;&nbsp; <strong>العين اليسرى (IOP OS):</strong> {{iop_left}} mmHg</p><p><strong>نتائج فحص مجال الإبصار (Visual Field):</strong> {{field_test}}</p>"
    },
    {
      id: "t_diabetic_retina",
      name: "تقرير متابعة اعتلال الشبكية السكري",
      category: "الشبكية",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name",            label: "اسم المريض",                     type: "text",     options: "" },
        { key: "age",             label: "السن",                           type: "number",   options: "" },
        { key: "date",            label: "التاريخ",                        type: "date",     options: "" },
        { key: "eye",             label: "العين المفحوصة",                 type: "select",   options: "اليمنى,اليسرى,كلتا العينين" },
        { key: "diagnosis",       label: "التشخيص",                      type: "textarea", options: "", defaultValue: "اعتلال شبكية سكري غير تكاثري متقدم (Non-Proliferative Diabetic Retinopathy - NPDR) مع ارتشاح بمركز اللطخة الصفراء بالعين." },
        { key: "stage",           label: "مرحلة اعتلال الشبكية",          type: "text",     options: "", defaultValue: "اعتلال سكري غير تكاثري متوسط إلى شديد (Moderate to Severe NPDR)" },
        { key: "laser_sessions",  label: "جلسات الليزر / العلاج المنجز", type: "textarea", options: "", defaultValue: "تم عمل جلسات ليزر شبكي جزئي (Focal Laser Photocoagulation) لحماية مركز البصر." },
        { key: "recommendations", label: "التوصيات وموعد المتابعة",       type: "textarea", options: "", defaultValue: "المتابعة الدورية لقاع العين كل 3 أشهر مع ضبط المستوى التراكمي للسكر HbA1c أقل من 7%." }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>التاريخ:</strong> {{date}}</p><p><strong>العين المفحوصة:</strong> {{eye}}</p><p><strong>التشخيص:</strong> {{diagnosis}}</p><p>تم فحص قاع العين لمريض السكر وتبين وجود تغيرات بالشبكية وفق التقييم التالي:</p><p><strong>مرحلة اعتلال الشبكية:</strong> {{stage}}</p><p><strong>جلسات الليزر / العلاج السابق:</strong> {{laser_sessions}}</p><p><strong>التوصيات الطبية:</strong> {{recommendations}} وضبط مستوى السكر بالدم والمتابعة الدورية خلال شهرين.</p>"
    },
    {
      id: "t_refraction",
      name: "تقرير قياس كشف النظارة الطبية",
      category: "النظارات والقياسات",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name",      label: "اسم المريض",         type: "text",     options: "" },
        { key: "age",       label: "السن",               type: "number",   options: "" },
        { key: "date",      label: "التاريخ",            type: "date",     options: "" },
        { key: "diagnosis", label: "التشخيص",          type: "textarea", options: "", defaultValue: "حسر نظر مع استجماتيزم غير منتظم بالعينين (Myopia with Astigmatism) يستدعي ارتداء نظارة طبية للمسافات والقراءة." },
        { key: "sph_od",    label: "Sph اليمنى",         type: "text",     options: "", defaultValue: "-2.50" },
        { key: "cyl_od",    label: "Cyl اليمنى",         type: "text",     options: "", defaultValue: "-0.75" },
        { key: "axis_od",   label: "Axis اليمنى",        type: "text",     options: "", defaultValue: "180" },
        { key: "sph_os",    label: "Sph اليسرى",         type: "text",     options: "", defaultValue: "-2.00" },
        { key: "cyl_os",    label: "Cyl اليسرى",         type: "text",     options: "", defaultValue: "-1.00" },
        { key: "axis_os",   label: "Axis اليسرى",        type: "text",     options: "", defaultValue: "175" },
        { key: "add",       label: "إضافة القراءة (ADD)", type: "text",     options: "", defaultValue: "+1.50" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>التاريخ:</strong> {{date}}</p><p><strong>التشخيص:</strong> {{diagnosis}}</p><p><strong>مقاسات النظارة الطبية الموصوفة (Prescription):</strong></p><p><strong>العين اليمنى (OD):</strong> Sph: {{sph_od}} | Cyl: {{cyl_od}} | Axis: {{axis_od}}°</p><p><strong>العين اليسرى (OS):</strong> Sph: {{sph_os}} | Cyl: {{cyl_os}} | Axis: {{axis_os}}°</p><p><strong>إضافة القراءة (ADD):</strong> {{add}}</p><p>يوصى بارتداء النظارة أثناء القراءة أو قيادة السيارة حسب التوجيهات.</p>"
    },
    {
      id: "t_crosslinking",
      name: "تقرير تثبيت القرنية المخروطية",
      category: "القرنية",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name",      label: "اسم المريض",                              type: "text",     options: "" },
        { key: "age",       label: "السن",                                    type: "number",   options: "" },
        { key: "date",      label: "تاريخ الإجراء",                           type: "date",     options: "" },
        { key: "eye",       label: "العين المعالجة",                           type: "select",   options: "اليمنى,اليسرى,كلتا العينين" },
        { key: "diagnosis", label: "التشخيص",                              type: "textarea", options: "", defaultValue: "قرنية مخروطية متقدمة (Keratoconus) مع تحدب بانسجة القرنية وزيادة قياس Kmax وخضوع لإجراء تثبيت القرنية الضوئي CXL." },
        { key: "kmax",      label: "قيمة انحناء القرنية (Kmax)",             type: "text",     options: "", defaultValue: "52.4 D" },
        { key: "post_care", label: "تعليمات الضمادة والقطرات",               type: "textarea", options: "", defaultValue: "ارتداء الضمادة العلاجية المائية والالتزام بالقطرات والمرطبات مع تجنب فرك العين تماماً." },
        { key: "rest_days", label: "مدة الراحة من العمل/الدراسة (مثل: أسبوع)", type: "text",     options: "", defaultValue: "أسبوع كامل" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>التاريخ:</strong> {{date}}</p><p><strong>العين المعالجة:</strong> {{eye}} &nbsp;&nbsp; <strong>قيمة انحناء القرنية Kmax:</strong> {{kmax}}</p><p><strong>التشخيص:</strong> {{diagnosis}}</p><p>تم خضوع المريض لإجراء تثبيت القرنية الضوئي (Corneal Cross-Linking CXL) بنجاح لحماية القرنية من التحدب.</p><p><strong>العناية بالضمادة الشفافة:</strong> {{post_care}}</p><p><strong>فترة الراحة والراحة من العمل:</strong> يتطلب الإجراء راحة طبية وعدم التعرض للضوء الساطع لمدة <strong>{{rest_days}}</strong>.</p>"
    },
    {
      id: "t_retinal_injection",
      name: "تقرير حقن شبكية العين (Anti-VEGF)",
      category: "الشبكية",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name",        label: "اسم المريض",                         type: "text",     options: "" },
        { key: "age",         label: "السن",                               type: "number",   options: "" },
        { key: "date",        label: "تاريخ الحقن",                        type: "date",     options: "" },
        { key: "eye",         label: "العين المحقونة",                     type: "select",   options: "اليمنى,اليسرى,كلتا العينين" },
        { key: "diagnosis",   label: "التشخيص",                              type: "textarea", options: "", defaultValue: "ارتشاح سكري بمركز اللطخة الصفراء (Diabetic Macular Edema - DME) يستدعي الحقن الدوري لمضادات نمو الأوعية الدموية (Anti-VEGF)." },
        { key: "drug_name",   label: "اسم عقار الحقن (مثل: Eylea/Lucentis)", type: "text",     options: "", defaultValue: "Eylea (Aflibercept)" },
        { key: "dose_number", label: "رقم الجلسة (مثل: الأولى)",          type: "text",     options: "", defaultValue: "الثانية (Second Dose)" },
        { key: "next_dose",   label: "موعد الجلسة القادمة",               type: "date",     options: "" },
        { key: "rest_days",   label: "مدة الراحة الطبية (مثل: 3 أيام)",  type: "text",     options: "", defaultValue: "3 أيام" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>تاريخ الحقن:</strong> {{date}}</p><p><strong>العين التي تم حقنها:</strong> {{eye}}</p><p><strong>التشخيص:</strong> {{diagnosis}}</p><p>تم إعطاء المريض حقنة داخل السائل الزجاجي (Intravitreal Injection) بمادة: <strong>{{drug_name}}</strong> (الجلسة رقم: {{dose_number}}).</p><p><strong>موعد الجلسة القادمة:</strong> {{next_dose}}</p><p><strong>الراحة والملاحظة:</strong> يُنصح المريض بالراحة والامتناع عن غسل العين بالماء لمدة <strong>{{rest_days}}</strong> للوقاية من العدوى.</p>"
    },
    {
      id: "t_conjunctivitis",
      name: "تقرير التهاب ملتحمة العين والراحة الوقائية",
      category: "التهابات وعدوى",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name",            label: "اسم المريض",                             type: "text",     options: "" },
        { key: "age",             label: "السن",                                   type: "number",   options: "" },
        { key: "date",            label: "التاريخ",                                type: "date",     options: "" },
        { key: "eye",             label: "العين المصابة",                          type: "select",   options: "اليمنى,اليسرى,كلتا العينين" },
        { key: "diagnosis",       label: "التشخيص",                              type: "textarea", options: "", defaultValue: "التهاب ملتحمة فيروسي حاد شديد العدوى (Acute Viral Conjunctivitis) مع تورم بالثنيات واحتقان ملتحمي يستدعي العزل الوقائي." },
        { key: "contagious_type", label: "نوع الالتحاب",                          type: "select",   options: "فيروسي,بكتيري,تحسسي" },
        { key: "rest_days",       label: "مدة الراحة والرمز الوقائي (مثل: 4 أيام)", type: "text",     options: "", defaultValue: "5 أيام" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>التاريخ:</strong> {{date}}</p><p><strong>العين المصابة:</strong> {{eye}}</p><p>تبين بعد الفحص الإكلينيكي إصابة المريض بـ: <strong>{{contagious_type}}</strong> (التهاب ملتحمة العين).</p><p><strong>التشخيص:</strong> {{diagnosis}}</p><p><strong>تنبيه وراحة وقائية:</strong> نظراً لأن الحالة قد تكون معدية وتستلزم راحة العين، يوصى بالابتعاد عن العمل ومكان الدراسة لمدة <strong>{{rest_days}}</strong> لتجنب العدوى والتعافي.</p>"
    },
    {
      id: "t_pterygium",
      name: "تقرير استئصال الظفرة (اللحمية بالعين)",
      category: "الجراحات",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name",       label: "اسم المريض",                          type: "text",     options: "" },
        { key: "age",        label: "السن",                                type: "number",   options: "" },
        { key: "date",       label: "تاريخ العملية",                       type: "date",     options: "" },
        { key: "eye",        label: "العين محل الجراحة",                   type: "select",   options: "اليمنى,اليسرى,كلتا العينين" },
        { key: "diagnosis",  label: "التشخيص",                              type: "textarea", options: "", defaultValue: "ظفرة ملتحمية ممتدة على سطح القرنية (Pterygium) متسببة في استجماتيزم وتدني الرؤية وخضوع للاستئصال والترقيع الذاتي." },
        { key: "graft_type", label: "نوع الترقيع المستعمل",               type: "text",     options: "", defaultValue: "ترقيع ملتحمي ذاتي بدون غرز (Conjunctival Autograft with Fibrin Glue)" },
        { key: "rest_days",  label: "مدة الراحة الموصى بها (مثل: أسبوع)", type: "text",     options: "", defaultValue: "7 أيام" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>تاريخ العملية:</strong> {{date}}</p><p><strong>العين محل الجراحة:</strong> {{eye}}</p><p><strong>التشخيص:</strong> {{diagnosis}}</p><p>تم استئصال الظفرة الملتحمية (Pterygium Excision) بنجاح مع ترقيع الملتحمة الذاتي: <strong>{{graft_type}}</strong>.</p><p><strong>الراحة الموصى بها:</strong> يستلزم الوضع راحة طبية وتغطية العين لمدة <strong>{{rest_days}}</strong> لمنع الأتربة والغبار.</p>"
    },
    {
      id: "t_dcr",
      name: "تقرير جراحة تسليك انسداد القناة الدمعية",
      category: "الجراحات",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name",       label: "اسم المريض",                         type: "text",     options: "" },
        { key: "age",        label: "السن",                               type: "number",   options: "" },
        { key: "date",       label: "تاريخ العملية",                      type: "date",     options: "" },
        { key: "eye",        label: "العين",                              type: "select",   options: "اليمنى,اليسرى,كلتا العينين" },
        { key: "diagnosis",  label: "التشخيص",                              type: "textarea", options: "", defaultValue: "انسداد كيس ودفق القناة الدمعية (Nasolacrimal Duct Obstruction - NLDO) مع دمعان متكرر وخضوع لجراحة DCR مع تركيب دعامة سيليكون." },
        { key: "procedure",  label: "تفاصيل الجراحة (DCR)",              type: "textarea", options: "", defaultValue: "تسليك القناة الدمعية وعمل فتحة بين الكيس الدمعي والتجويف الأنفي (External DCR)" },
        { key: "stent_info", label: "أنبوبة السيليكون المزروعة",         type: "text",     options: "", defaultValue: "دعامات سيليكون مزدوجة مؤقتة (Bicanalicular Silicone Stent)" },
        { key: "rest_days",  label: "مدة الراحة الطبية (مثل: 7 أيام)",  type: "text",     options: "", defaultValue: "7 أيام" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>تاريخ العملية:</strong> {{date}}</p><p><strong>العين:</strong> {{eye}}</p><p><strong>التشخيص:</strong> {{diagnosis}}</p><p>تم إجراء عملية جراحة القناة الدمعية (Dacryocystorhinostomy - DCR): <strong>{{procedure}}</strong> مع تركيب أنبوبة سيليكون مؤقتة: <strong>{{stent_info}}</strong>.</p><p><strong>الراحة والتعافي:</strong> يحتاج المريض إلى راحة من الإجهاد البدني والنفخ من الأنف لمدة <strong>{{rest_days}}</strong>.</p>"
    },
    {
      id: "t_strabismus",
      name: "تقرير جراحة إصلاح الحول",
      category: "حول وجراحة أطفال",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name",      label: "اسم المريض",                           type: "text",     options: "" },
        { key: "age",       label: "السن",                                 type: "number",   options: "" },
        { key: "date",      label: "تاريخ العملية",                        type: "date",     options: "" },
        { key: "eye",       label: "العين المعالجة",                       type: "select",   options: "اليمنى,اليسرى,كلتا العينين" },
        { key: "diagnosis", label: "التشخيص",                              type: "textarea", options: "", defaultValue: "حول إنسي/وحشي مكتسب (Concomitant Strabismus) مع اضطراب التوازن العضلي للعينين وخضوع لجراحة تعديل عضلات العين." },
        { key: "muscles",   label: "العضلات المعدلة",                      type: "text",     options: "", defaultValue: "إرجاع العضلة الإنسية الداخلية وتقصير العضلة الوحشية الخارجية" },
        { key: "alignment", label: "استقامة المحور بعد الجراحة",          type: "text",     options: "", defaultValue: "استقامة كاملة ومثالية للمحور البصري بنسبة 100%" },
        { key: "rest_days", label: "مدة الراحة الطبية (مثل: أسبوعين)",   type: "text",     options: "", defaultValue: "أسبوعين" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>تاريخ العملية:</strong> {{date}}</p><p><strong>العين/العضلات المعالجة:</strong> {{eye}} — {{muscles}}</p><p><strong>التشخيص:</strong> {{diagnosis}}</p><p>تمت عملية تعديل عضلات العين وتعديل استقامة المحور البصري بنجاح.</p><p><strong>استقامة العينين بعد العملية:</strong> {{alignment}}</p><p><strong>فترة الراحة الطبية:</strong> يمنح المريض راحة طبية وتوقف عن المجهود لمدة <strong>{{rest_days}}</strong>.</p>"
    },
    {
      id: "t_dry_eye",
      name: "تقرير تقييم جفاف العين الشديد",
      category: "الفحوصات المتخصصة",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name",           label: "اسم المريض",                   type: "text",     options: "" },
        { key: "age",            label: "السن",                         type: "number",   options: "" },
        { key: "date",           label: "التاريخ",                      type: "date",     options: "" },
        { key: "diagnosis",      label: "التشخيص",                      type: "textarea", options: "", defaultValue: "متلازمة جفاف العين الشديد (Severe Evaporative Dry Eye Syndrome) وتلف الفيلم الدمعي مع اعتلال الطبقة السطحية للقرنية." },
        { key: "schirmer",       label: "قياس اختبار شيرمر (mm)",       type: "number",   options: "", defaultValue: 4 },
        { key: "tbut",           label: "قياس تكسر الدمع TBUT (ثانية)", type: "number",   options: "", defaultValue: 3 },
        { key: "treatment_plan", label: "القطرات البديلة والخطة",       type: "textarea", options: "", defaultValue: "استخدام بدائل الدمع الخالية من المواد الحافظة مع مرهم ترطيب ليلي وسدادات القناة الدمعية." }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>التاريخ:</strong> {{date}}</p><p><strong>التشخيص:</strong> {{diagnosis}}</p><p>تم إجراء فحص جفاف العين المتقدم وكانت النتائج كالتالي:</p><p><strong>اختبار شيرمر (Schirmer Test):</strong> {{schirmer}} mm &nbsp;&nbsp; <strong>زمن تكسر الفيلم الدمعي (TBUT):</strong> {{tbut}} ثانية</p><p><strong>العلاج والبدائل الدمعية:</strong> {{treatment_plan}} وتجنب التكييف والشاشات لفترات طويلة.</p>"
    },
    {
      id: "t_corneal_abrasion",
      name: "تقرير إصابة وخدش بالقرنية (طوارئ)",
      category: "طوارئ وإصابات",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name",      label: "اسم المريض",                         type: "text",     options: "" },
        { key: "age",       label: "السن",                               type: "number",   options: "" },
        { key: "date",      label: "تاريخ المعاينة",                     type: "date",     options: "" },
        { key: "eye",       label: "العين المصابة",                      type: "select",   options: "اليمنى,اليسرى,كلتا العينين" },
        { key: "diagnosis", label: "التشخيص",                              type: "textarea", options: "", defaultValue: "خدش سطحي حاد بالطبقة الطلائية للقرنية (Corneal Epithelial Abrasion) مع تهيج شديد وانقباض بالحدقة نتيجة إصابة مباشرة." },
        { key: "cause",     label: "سبب الإصابة",                        type: "text",     options: "", defaultValue: "احتراك بكسوة خارجية / إصابة جسم سطحي" },
        { key: "rest_days", label: "مدة الراحة الطبية (مثل: 4 أيام)",  type: "text",     options: "", defaultValue: "4 أيام" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>تاريخ المعاينة:</strong> {{date}}</p><p><strong>العين المصابة:</strong> {{eye}}</p><p><strong>التشخيص:</strong> {{diagnosis}}</p><p>حضر المريض إلى قسم الطوارئ وتبين وجود خدش سطحي في القرنية (Corneal Abrasion) نتيجة: <strong>{{cause}}</strong>.</p><p><strong>الإجازة والراحة الطبية:</strong> نظراً لألم الخدش وحاجة النسيج التغطوي للاحتيام، يُمنح المريض راحة طبية لمدة <strong>{{rest_days}}</strong>.</p>"
    },
    {
      id: "t_oct_scan",
      name: "تقرير فحص قاع العين بالأشعة المقطعية OCT",
      category: "فحوصات وأشعة",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name",              label: "اسم المريض",               type: "text",     options: "" },
        { key: "age",               label: "السن",                     type: "number",   options: "" },
        { key: "date",              label: "تاريخ الفحص",              type: "date",     options: "" },
        { key: "eye",               label: "العين المفحوصة",           type: "select",   options: "اليمنى,اليسرى,كلتا العينين" },
        { key: "diagnosis",         label: "التشخيص والنتيجة",         type: "textarea", options: "", defaultValue: "تغيرات بتركيب طبقات الشبكية واللطخة الصفراء وارتشاح بمركز البصر بناءً على فحص الأشعة المقطعية للشبكية (OCT)." },
        { key: "macular_thickness", label: "سمك مركز اللطخة (µm)",    type: "number",   options: "", defaultValue: 385 },
        { key: "fovea_status",      label: "حالة التقعر المركزي",      type: "text",     options: "", defaultValue: "ارتشاح كيسي خفيف بمركز اللطخة الصفراء مع فقدان التقعر الطبيعي" },
        { key: "summary",           label: "الخلاصة والدروس",          type: "textarea", options: "", defaultValue: "تغيرات سكرية باللطخة الصفراء تستدعي المتابعة والعلاج بالمحقن الداخلي." }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>تاريخ الفحص:</strong> {{date}}</p><p><strong>العين المفحوصة:</strong> {{eye}}</p><p><strong>التشخيص:</strong> {{diagnosis}}</p><p>نتائج التصوير المقطعي للشبكية ولطخة العين (Optical Coherence Tomography - OCT):</p><p><strong>سمك مركز اللطخة (Central Macular Thickness):</strong> {{macular_thickness}} µm</p><p><strong>حالة التقعر المركزي (Foveal Contour):</strong> {{fovea_status}}</p><p><strong>الخلاصة:</strong> {{summary}}</p>"
    },
    {
      id: "t_retinal_detachment",
      name: "تقرير جراحة انفصال الشبكية",
      category: "الشبكية",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "head_position", label: "الوضعية المطلوبة للرأس", type: "text", options: "" },
        { key: "rest_days", label: "مدة الراحة التامة (مثل: شهر كامل)", type: "text", options: "" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>تاريخ الجراحة:</strong> {{date}}</p><p><strong>العين محل الجراحة:</strong> {{eye}}</p><p>تم إجراء جراحة استئصال الجسم الزجاجي وتثبيت الشبكية (Vitrectomy &amp; Retinal Reattachment) بنجاح.</p><p><strong>المادة المحقونة داخل العين (Tamponade):</strong> {{tamponade}}</p><p><strong>الوضعية المطلوبة للرأس:</strong> {{head_position}}</p><p><strong>الراحة التامة المطلوبة:</strong> يحتاج المريض لراحة تامة بالسرير والإجازة المرضية لمدة <strong>{{rest_days}}</strong> متواصلة.</p>"
    },
    {
      id: "t_visual_fitness",
      name: "تقرير تقييم اللياقة البصرية والقيادة",
      category: "تقارير رسمية",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name", label: "اسم المريض", type: "text", options: "" },
        { key: "age", label: "السن", type: "number", options: "" },
        { key: "date", label: "التاريخ", type: "date", options: "" },
        { key: "va_right", label: "حدّة إبصار العين اليمنى", type: "text", options: "" },
        { key: "va_left", label: "حدّة إبصار العين اليسرى", type: "text", options: "" },
        { key: "color_vision", label: "تمييز الألوان (إيشيهارا)", type: "select", options: "طبيعي,خلل جزئي,عمى ألوان" },
        { key: "result", label: "نتيجة التقييم", type: "select", options: "لائق,غير لائق,لائق بشروط" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>التاريخ:</strong> {{date}}</p><p>بناءً على طلب المريض لتحديد كفاءة حدة الإبصار واللياقة البصرية، أظهر الفحص النتائج التالية:</p><p><strong>حدّة الإبصار للعين اليمنى:</strong> {{va_right}} &nbsp;&nbsp; <strong>حدّة الإبصار للعين اليسرى:</strong> {{va_left}}</p><p><strong>تمييز الألوان (Ishihara Test):</strong> {{color_vision}}</p><p><strong>النتيجة والتوصية:</strong> المريض {{result}} من الناحية البصرية لممارسة القيادة/العمل.</p>"
    },
    {
      id: "t_foreign_body",
      name: "تقرير إزالة جسم غريب من القرنية",
      category: "طوارئ وإصابات",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name", label: "اسم المريض", type: "text", options: "" },
        { key: "age", label: "السن", type: "number", options: "" },
        { key: "date", label: "تاريخ الإجراء", type: "date", options: "" },
        { key: "eye", label: "العين المصابة", type: "select", options: "اليمنى,اليسرى,كلتا العينين" },
        { key: "object_type", label: "نوع الجسم الغريب (رايش حديد / زجاج)", type: "text", options: "" },
        { key: "rest_days", label: "مدة الراحة الطبية (مثل: 3 أيام)", type: "text", options: "" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}}</p><p><strong>السن:</strong> {{age}} سنة</p><p><strong>تاريخ الإجراء:</strong> {{date}}</p><p><strong>العين المصابة:</strong> {{eye}}</p><p>تمت إزالة جسم غريب (<strong>{{object_type}}</strong>) من طبقة القرنية السطحية تحت البنج الموضعي وتنظيف حلقة الصدأ (Rust Ring).</p><p><strong>فترة الراحة الطبية:</strong> يحتاج المريض إلى راحة وتغطية العين لمدة <strong>{{rest_days}}</strong> لمنع التلوث والتئام القرنية.</p>"
    },
    {
      id: "t_amblyopia",
      name: "تقرير تقييم كسل العين وعلاج الأطفال",
      category: "حول وجراحة أطفال",
      createdAt: "2026-08-11T12:00:00.000Z",
      fields: [
        { key: "name", label: "اسم المريض الطفل", type: "text", options: "" },
        { key: "age", label: "السن", type: "number", options: "" },
        { key: "date", label: "التاريخ", type: "date", options: "" },
        { key: "eye", label: "العين المصابة بالكسل", type: "select", options: "اليمنى,اليسرى,كلتا العينين" },
        { key: "patching_hours", label: "عدد ساعات تغطية العين يومياً", type: "number", options: "" },
        { key: "drops_glasses", label: "النظارة والقطرات المساعدة", type: "textarea", options: "" },
        { key: "followup", label: "موعد إعادة التقييم", type: "date", options: "" }
      ],
      bodyHtml: "<p><strong>اسم المريض الطفل:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنوات &nbsp;&nbsp; <strong>التاريخ:</strong> {{date}}</p><p><strong>العين المصابة بالكسل (Amblyopia):</strong> {{eye}}</p><p>تم تقييم حالة كسل العين الوظيفي ووضع بروتوكول العلاج بالتغطية كالآتي:</p><p><strong>عدد ساعات تغطية العين السليمة يومياً:</strong> {{patching_hours}} ساعات</p><p><strong>النظارة والعلاج المساعد:</strong> {{drops_glasses}}</p><p><strong>موعد إعادة التقييم:</strong> {{followup}}</p>"
    }
  ];

  function seed() {
    if (!localStorage.getItem(KEYS.users)) {
      write(KEYS.users, [
        { id: "u_msrpzdxnbwkxt", username: "AA244275", password: "#Allhamd_Llah#", fullName: "مدير النظام", role: "admin" },
        { id: "u_msrpzdxn1ct7b", username: "agent", password: "Agent@123", fullName: "موظف الاستقبال", role: "agent" }
      ]);
    }
    const currentTemplates = read(KEYS.templates, []);
    const hasOldPhraming = currentTemplates.some(t => t.bodyHtml && t.bodyHtml.includes("إدارة المركز"));
    if (!localStorage.getItem(KEYS.templates) || currentTemplates.length < 20 || hasOldPhraming) {
      write(KEYS.templates, DEFAULT_TEMPLATES);
    }
    if (!localStorage.getItem(KEYS.doctors)) {
      write(KEYS.doctors, [
        {
          id: "d_doc1",
          name: "د. أحمد عبد الوهاب",
          title: "استشاري طب وجراحة العيون والليزك"
        },
        {
          id: "d_doc2",
          name: "د. محمود مصطفى",
          title: "أخصائي جراحة المياه البيضاء وتصحيح الإبصار"
        }
      ]);
    }
    if (!localStorage.getItem(KEYS.clinic)) {
      write(KEYS.clinic, { clinicName: "مركز الخبراء لطب وجراحة العيون والليزك", logo: "assets/logo.png" });
    }
  }

  seed();

  // ---------------------- Users ----------------------
  const Users = {
    all() { return read(KEYS.users, []); },
    findByUsername(username) {
      return this.all().find((u) => u.username.trim().toLowerCase() === username.trim().toLowerCase());
    },
    add(user) {
      const users = this.all();
      user.id = uid("u");
      users.push(user);
      write(KEYS.users, users);
      localStorage.setItem("eyeclinic_users_dirty", "true");
      return user;
    },
    update(id, changes) {
      const users = this.all().map((u) => (u.id === id ? { ...u, ...changes } : u));
      write(KEYS.users, users);
      localStorage.setItem("eyeclinic_users_dirty", "true");
    },
    remove(id) {
      const users = this.all().filter((u) => u.id !== id);
      write(KEYS.users, users);
      localStorage.setItem("eyeclinic_users_dirty", "true");
    }
  };

  // ---------------------- Templates ----------------------
  const Templates = {
    all() { return read(KEYS.templates, []); },
    get(id) { return this.all().find((t) => t.id === id); },
    add(tpl) {
      const templates = this.all();
      tpl.id = uid("t");
      tpl.createdAt = new Date().toISOString();
      templates.push(tpl);
      write(KEYS.templates, templates);
      localStorage.setItem("eyeclinic_templates_dirty", "true");
      return tpl;
    },
    update(id, changes) {
      const templates = this.all().map((t) => (t.id === id ? { ...t, ...changes } : t));
      write(KEYS.templates, templates);
      localStorage.setItem("eyeclinic_templates_dirty", "true");
    },
    remove(id) {
      const templates = this.all().filter((t) => t.id !== id);
      write(KEYS.templates, templates);
      localStorage.setItem("eyeclinic_templates_dirty", "true");
    },
    replaceAll(list) {
      write(KEYS.templates, list);
      localStorage.setItem("eyeclinic_templates_dirty", "true");
    }
  };

  // ---------------------- Session ----------------------
  const Session = {
    login(user) {
      write(KEYS.session, {
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        pwdSnapshot: user.password,
        loginAt: new Date().toISOString()
      });
    },
    current() { return read(KEYS.session, null); },
    isValid() {
      const session = this.current();
      if (!session || !session.username) return false;
      const user = Users.findByUsername(session.username);
      if (!user) return false;
      // إذا كانت الجلسة تخزن اللقطة لكلمة المرور وتم تغييرها فجأة في users.json -> الجلسة غير صالحة
      if (session.pwdSnapshot !== undefined && session.pwdSnapshot !== user.password) {
        return false;
      }
      return true;
    },
    logout() { localStorage.removeItem(KEYS.session); }
  };

  const Clinic = {
    get() { return read(KEYS.clinic, {}); },
    save(changes) {
      const current = this.get();
      write(KEYS.clinic, { ...current, ...changes });
      localStorage.setItem("eyeclinic_clinic_dirty", "true");
    }
  };

  // ---------------------- Doctors ----------------------
  const Doctors = {
    all() { return read(KEYS.doctors, []); },
    get(id) { return this.all().find((d) => d.id === id); },
    add(doctor) {
      const list = this.all();
      doctor.id = uid("d");
      list.push(doctor);
      write(KEYS.doctors, list);
      localStorage.setItem("eyeclinic_doctors_dirty", "true");
      return doctor;
    },
    remove(id) {
      const list = this.all().filter((d) => d.id !== id);
      write(KEYS.doctors, list);
      localStorage.setItem("eyeclinic_doctors_dirty", "true");
    }
  };

  // ---------------------- Export JSON Files for GitHub ----------------------
  function downloadJsonFile(filename, data) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (filename === "users.json") {
      localStorage.removeItem("eyeclinic_users_dirty");
    } else if (filename === "clinic.json") {
      localStorage.removeItem("eyeclinic_clinic_dirty");
    } else if (filename === "templates.json") {
      localStorage.removeItem("eyeclinic_templates_dirty");
    } else if (filename === "doctors.json") {
      localStorage.removeItem("eyeclinic_doctors_dirty");
    }
  }

  function exportAllJsonFiles() {
    downloadJsonFile("doctors.json", Doctors.all());
    setTimeout(() => downloadJsonFile("templates.json", Templates.all()), 300);
    setTimeout(() => downloadJsonFile("clinic.json", Clinic.get()), 600);
    setTimeout(() => downloadJsonFile("users.json", Users.all()), 900);
  }

  // ---------------------- فحص المباشر للتغييرات من جيت هب بدون ريفرش ----------------------
  async function checkRemoteUsers() {
    if (window.location.protocol === "file:") return false;
    if (/admin\.html/i.test(location.pathname)) return false; // عدم مسح التعديلات أثناء التواجد في لوحة الإدارة
    if (localStorage.getItem("eyeclinic_users_dirty") === "true") return false;
    try {
      const r = await fetch("data/users.json?t=" + Date.now());
      if (!r.ok) return false;
      const users = await r.json();
      if (Array.isArray(users) && users.length > 0) {
        write(KEYS.users, users);
        if (Session.current() && !Session.isValid()) {
          Session.logout();
          if (!/index\.html/i.test(window.location.pathname) && window.location.pathname !== "/") {
            window.location.href = "index.html?reason=pwd_changed";
          }
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  // ---------------------- وظائف فحص ومزامنة البيانات وتتبع التوقيت ----------------------
  function getLastSyncTime() {
    return localStorage.getItem("eyeclinic_last_sync_time") || null;
  }

  function formatSyncTime(isoStr) {
    if (!isoStr) return "لم تتم المزامنة بعد";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return "غير معروف";
      return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch (_) {
      return "غير معروف";
    }
  }

  function formatSyncDate(isoStr) {
    if (!isoStr) return "لم تتم المزامنة بعد";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return "غير معروف";
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}/${mm}/${dd} — ` + formatSyncTime(isoStr);
    } catch (_) {
      return "غير معروف";
    }
  }

  async function syncNow() {
    await loadJsonFiles();
    return getLastSyncTime();
  }

  return {
    init: loadJsonFiles,
    DEFAULT_TEMPLATES,
    syncNow,
    getLastSyncTime,
    formatSyncTime,
    formatSyncDate,
    checkRemoteUsers,
    Users,
    Templates,
    Session,
    Clinic,
    Doctors,
    exportAllJsonFiles,
    downloadJsonFile,
    uid
  };
})();
