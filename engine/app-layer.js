/* =============================================================
   app-layer.js — طبقة الواجهة فوق SchemaEngine
   تُلصق بعد schema-engine.js داخل نفس وسم script
   ============================================================= */
var E = SchemaEngine;
var el = E.el, toArr = E.toArr, fmt = E.fmt, when = E.when, uid = E.uid;

var APP = { id: "schema-app", title: "تطبيق قابل للتوسّع", tag: "محرّك المخطط" };
var S = { schema: null };
var RECS = {}, CUR = null, ADM_TAB = null;
var EDIT_KEY = null, FORM = null, FILTER = "";
var ALL = {};   /* سجلات كل التبويبات — تُملأ للوحة القيادة فقط */
var INSTALL_EVT = null, SW_STATE = "لم يُسجَّل بعد", BIP = false;

window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); INSTALL_EVT = e; BIP = true; });
window.addEventListener("appinstalled", function () { BIP = true; SW_STATE = "تم التثبيت"; });

/* ---------------- حالة ورسائل ---------------- */
function setStatus(state, txt) {
  var d = document.getElementById("st-dot"), t = document.getElementById("st-txt");
  if (!d) return;
  d.className = "dot " + (state || "");
  t.textContent = txt;
}
var toastT = null;
function toast(msg, bad) {
  var t = document.getElementById("toast");
  t.textContent = msg; t.className = "toast show" + (bad ? " bad" : "");
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(function () { t.className = "toast"; }, 3400);
}
function who() { return localStorage.getItem(APP.id + "_user") || "مستخدم غير مسمّى"; }

/* ---------------- القائمة ---------------- */
function navItems() {
  var out = toArr(S.schema.tabs).map(function (t) { return { id: t.id, icon: t.icon || "▣", title: t.title }; });
  out.push({ id: "__admin", icon: "⚙", title: "إدارة التطبيق", sep: true });
  out.push({ id: "__hist", icon: "⏱", title: "سجل التغييرات" });
  out.push({ id: "__diag", icon: "⇩", title: "تشخيص التثبيت" });
  return out;
}
function buildNav() {
  var nav = document.getElementById("nav"), mn = document.getElementById("mnav");
  nav.innerHTML = ""; mn.innerHTML = "";
  navItems().forEach(function (s, i) {
    if (s.sep) nav.appendChild(el("div", { "class": "nav-sep" }));
    var b = el("button", { "data-id": s.id }, [
      el("span", { "class": "nav-icon" }, [s.icon]),
      el("span", {}, [s.title]),
      el("span", { "class": "nav-num" }, [("0" + (i + 1)).slice(-2)])
    ]);
    b.onclick = function () { select(s.id); };
    nav.appendChild(b);
    var m = el("button", { "data-id": s.id }, [s.icon + " " + s.title]);
    m.onclick = function () { select(s.id); };
    mn.appendChild(m);
  });
}
function markActive(id) {
  ["#nav button", "#mnav button"].forEach(function (sel) {
    var b = document.querySelectorAll(sel);
    for (var i = 0; i < b.length; i++) b[i].classList.toggle("active", b[i].getAttribute("data-id") === id);
  });
}
function findTab(id) { var f = null; toArr(S.schema.tabs).forEach(function (t) { if (t.id === id) f = t; }); return f; }

document.addEventListener("keydown", function (e) {
  if (e.key !== "/" ) return;
  var tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  var s = document.querySelector("input.search");
  if (s) { e.preventDefault(); s.focus(); }
});

function select(id) {
  /* الانتقال يمسح البحث، إلا إذا جاء من «افتح التبويب» فى صفحة الكيان
     فيُحمَل معه اسم الكيان كمرشّح */
  if (id !== CUR) { FILTER = PENDING_FILTER || ""; }
  PENDING_FILTER = null;
  CUR = id; markActive(id);
  var eb = document.getElementById("tb-eyebrow"), ti = document.getElementById("tb-title");
  if (id === "__admin") { eb.textContent = "بناء التطبيق من داخله"; ti.textContent = "إدارة التطبيق"; return renderAdmin(); }
  if (id === "__hist") { eb.textContent = "التأريخ والتراجع"; ti.textContent = "سجل التغييرات"; return renderHistory(); }
  if (id === "__diag") { eb.textContent = "فحص شروط PWA"; ti.textContent = "تشخيص التثبيت"; return renderDiag(); }
  var t = findTab(id);
  if (!t) { var f = toArr(S.schema.tabs)[0]; return select(f ? f.id : "__admin"); }
  eb.textContent = t.eyebrow || "قسم"; ti.textContent = t.title;
  renderTab(t);
}

/* ---------------- عرض التبويب ---------------- */
function kpiCard(icon, cls, lbl, big, unit, sub) {
  return el("div", { "class": "kpi-card " + (cls || "") }, [
    el("div", { "class": "kpi-icon" }, [icon || "◉"]),
    el("div", { "class": "kpi-body" }, [
      el("div", { "class": "lbl" }, [lbl]),
      el("div", { "class": "big" }, [big, unit ? el("span", { "class": "unit" }, [unit]) : null]),
      sub ? el("div", { "class": "sub" }, [sub]) : null
    ])
  ]);
}
function panel(eyebrow, title) {
  return el("div", { "class": "panel" }, [
    el("span", { "class": "eyebrow" }, [eyebrow]),
    el("h2", {}, [title])
  ]);
}

/* ---------------- عنصر الحساب الهيدروليكى ---------------- */
/* ---------------- عناصر لوحة القيادة ---------------- */
function tabHeadline(entry) {
  /* أول مؤشر رقمى معرَّف داخل التبويب نفسه — يُحسب بنفس تعريف صاحبه */
  var out = null;
  toArr(entry.tab.widgets).forEach(function (w) {
    if (out) return;
    if (w.type === "kpi") {
      try { out = { label: w.label, value: E.aggregate(w.agg || "count", w.field || "", entry.rows), unit: w.unit || "" }; }
      catch (e) { out = null; }
    } else if (w.type === "formula") {
      try { out = { label: w.label, value: E.evalExpr(w.expr, entry.rows), unit: w.unit || "" }; }
      catch (e) { out = null; }
    }
  });
  return out;
}
/* ---------------- صفحة الكيان الواحد (كل ما يخص مجرى فى شاشة) ---------------- */
var ENTITY_SEL = {};
var PENDING_FILTER = null;
var LOAD_TOKEN = 0;   /* يبطل نتيجة تحميل تبويب غادرناه */
function entityValues(w) {
  var src = ALL[w.entityTab];
  if (!src) return [];
  var seen = {}, out = [];
  src.rows.forEach(function (r) {
    var v = r[w.entityField];
    if (v === undefined || v === null || v === "") return;
    v = String(v);
    if (seen[v]) return;
    seen[v] = 1; out.push(v);
  });
  return out.sort();
}
function entitySections(w, val) {
  /* لكل تبويب مرتبط بالكيان: سجلاته المطابقة فقط */
  var secs = [];
  toArr(S.schema.tabs).forEach(function (t) {
    if (t.id === w.entityTab) return;
    var e = ALL[t.id];
    if (!e) return;
    var rows = E.entityRows(t, e.rows, w.entityTab, w.matchField || "canal", val);
    if (rows === null) return;             /* غير مرتبط */
    secs.push({ tab: t, rows: rows });
  });
  return secs;
}
/* ---------------- عنصر الاتجاه الزمنى ---------------- */
/* ---------------- قائمة الإنذارات عبر كل التبويبات ---------------- */
function alertsPanel(w) {
  var p = panel("إنذارات", w.label || "ما يحتاج تدخّلاً");
  var rowsOut = [], scanned = 0, ruled = 0;
  toArr(S.schema.tabs).forEach(function (t) {
    var rules = toArr(t.alerts);
    if (!rules.length) return;
    ruled++;
    var e = ALL[t.id];
    if (!e) return;
    e.rows.forEach(function (r) {
      scanned++;
      var fired = E.rowAlerts(t, r);
      if (!fired.length) return;
      var lab = "";
      toArr(t.fields).forEach(function (f) {
        if (!lab && (f.type === "text" || f.type === "ref")) lab = String(r[f.id] || "");
      });
      fired.forEach(function (a) { rowsOut.push({ tab: t, label: lab || "سجل", a: a }); });
    });
  });
  if (!ruled) {
    p.appendChild(el("div", { "class": "hint" }, [
      "لا قواعد إنذار معرَّفة بعد. تُضاف من: إدارة التطبيق ← فتح البناء ← قواعد الإنذار."
    ]));
    return p;
  }
  var danger = rowsOut.filter(function (x) { return x.a.level === "خطر"; }).length;
  var g = el("div", { "class": "grid g3" });
  g.appendChild(kpiCard("!", danger ? "" : "green", "إنذارات خطر", String(danger), "إنذار"));
  g.appendChild(kpiCard("⚑", "sand", "تنبيهات", String(rowsOut.length - danger), "تنبيه"));
  g.appendChild(kpiCard("#", "green", "سجلات مفحوصة", String(scanned), "سجل"));
  p.appendChild(g);
  if (!rowsOut.length) {
    p.appendChild(el("div", { "class": "empty" }, ["لا شىء يحتاج تدخّلاً — كل السجلات مطابقة للقواعد."]));
    return p;
  }
  rowsOut.sort(function (a, b) { return (a.a.level === "خطر" ? 0 : 1) - (b.a.level === "خطر" ? 0 : 1); });
  rowsOut.slice(0, w.limit || 25).forEach(function (x) {
    var go = el("button", { "class": "btn mini" }, ["افتح"]);
    go.onclick = function () { PENDING_FILTER = x.label; select(x.tab.id); };
    p.appendChild(el("div", { "class": "adm-row" }, [
      el("span", { "class": "pill " + (x.a.level === "خطر" ? "danger" : "sand") }, [x.a.level]),
      el("span", { "class": "t" }, [x.label]),
      el("span", { "class": "m" }, [x.tab.title + " · " + (x.a.msg || x.a.expr)]),
      el("span", { "class": "sp" }), go
    ]));
  });
  if (rowsOut.length > (w.limit || 25)) {
    p.appendChild(el("div", { "class": "hint" }, ["معروض " + (w.limit || 25) + " من " + rowsOut.length + "."]));
  }
  return p;
}

function trendPanel(w) {
  var p = panel("اتجاه", w.label || "تطوّر المؤشر");
  p.appendChild(el("div", { "class": "empty" }, ["جارٍ قراءة اللقطات…"]));
  E.loadTrend().then(function (snaps) {
    p.innerHTML = "";
    p.appendChild(el("span", { "class": "eyebrow" }, ["اتجاه"]));
    p.appendChild(el("h2", {}, [w.label || "تطوّر المؤشر"]));
    var all = E.trendSeries(snaps, w.mid);
    var days = w.days || 30;
    var ser = all.slice(-days);
    if (ser.length < 2) {
      p.appendChild(el("div", { "class": "empty" }, [
        ser.length === 1
          ? "لقطة واحدة فقط حتى الآن — الاتجاه يظهر بعد يوم ثانٍ من الاستخدام."
          : "لا لقطات لهذا المؤشر بعد. تُؤخذ لقطة تلقائياً عند أول فتح للتطبيق كل يوم."
      ]));
      return;
    }
    var last = ser[ser.length - 1], prev = ser[ser.length - 2];
    var weekIdx = Math.max(0, ser.length - 8);
    var weekAgo = ser[weekIdx];
    function delta(a, b) {
      if (!b || !isFinite(b.value)) return null;
      var d = a.value - b.value;
      var pc = b.value !== 0 ? (d / Math.abs(b.value)) * 100 : null;
      return { d: d, pc: pc, from: b.day };
    }
    var d1 = delta(last, prev), d7 = delta(last, weekAgo);
    var g = el("div", { "class": "grid g3" });
    g.appendChild(kpiCard("◉", "", last.name || "القيمة الحالية", fmt(last.value), last.unit, "لقطة " + last.day));
    function deltaCard(dd, title) {
      if (!dd) return kpiCard("—", "", title, "—", "", "لا لقطة مقارنة");
      var cls = dd.d > 0 ? "green" : (dd.d < 0 ? "sand" : "");
      var sign = dd.d > 0 ? "+" : "";
      return kpiCard(dd.d >= 0 ? "↑" : "↓", cls, title, sign + fmt(dd.d), last.unit,
        (dd.pc === null ? "" : sign + fmt(dd.pc) + "% ") + "منذ " + dd.from);
    }
    g.appendChild(deltaCard(d1, "التغيّر عن اللقطة السابقة"));
    g.appendChild(deltaCard(d7, "التغيّر عن أسبوع"));
    p.appendChild(g);
    p.appendChild(el("div", { "class": "chart-box" }, [E.svgChart(ser, "line")]));
    p.appendChild(el("div", { "class": "hint" }, [
      "المصدر: لقطات يومية محفوظة فى القاعدة — " + ser.length + " لقطة معروضة من " + all.length +
      ". اللقطة تُؤخذ آلياً عند أول فتح للتطبيق فى اليوم، فالأيام التى لم يُفتح فيها لا لقطة لها."
    ]));
  }).catch(function (e) {
    p.innerHTML = "";
    p.appendChild(el("div", { "class": "empty" }, ["تعذّر تحميل اللقطات: " + e.message]));
  });
  return p;
}

function entityPanel(w) {
  var p = panel("صفحة الكيان", w.label || "ملف المجرى");
  var src = ALL[w.entityTab];
  if (!src) {
    p.appendChild(el("div", { "class": "empty" }, ["التبويب المرجعى غير موجود (ربما حُذف)."]));
    return p;
  }
  var vals = entityValues(w);
  var sel = el("select");
  sel.appendChild(el("option", { value: "" }, ["— اختر من " + src.title + " —"]));
  vals.forEach(function (v) { sel.appendChild(el("option", { value: v }, [v])); });
  if (ENTITY_SEL[w.id]) sel.value = ENTITY_SEL[w.id];
  sel.onchange = function () { ENTITY_SEL[w.id] = sel.value; select(CUR); };
  p.appendChild(el("div", { "class": "frm" }, [el("div", { "class": "fld" }, [el("label", {}, [src.title]), sel])]));

  var val = ENTITY_SEL[w.id] || "";
  if (!val) {
    p.appendChild(el("div", { "class": "hint" }, [
      vals.length ? "اختر سجلاً لعرض كل ما يخصه من باقى التبويبات فى شاشة واحدة."
        : ("لا سجلات فى " + src.title + " بعد — أضف أولاً.")
    ]));
    return p;
  }

  /* بطاقة الكيان نفسه */
  var me = null;
  src.rows.forEach(function (r) { if (!me && String(r[w.entityField]) === val) me = r; });
  if (me) {
    var head = toArr(src.tab.fields).filter(function (f) { return f.id !== w.entityField; }).slice(0, 6);
    if (head.length) {
      var tb0 = el("table"), hr0 = el("tr"), br0 = el("tr");
      head.forEach(function (f) {
        hr0.appendChild(el("th", {}, [f.label + (f.unit ? " (" + f.unit + ")" : "")]));
        br0.appendChild(el("td", {}, [(me[f.id] === undefined || me[f.id] === "") ? "—" : String(me[f.id])]));
      });
      tb0.appendChild(el("thead", {}, [hr0]));
      tb0.appendChild(el("tbody", {}, [br0]));
      p.appendChild(el("div", { "class": "tbl-wrap" }, [tb0]));
    }
  }

  var secs = entitySections(w, val), total = 0, pts = [];
  secs.forEach(function (sc) { total += sc.rows.length; });
  p.appendChild(el("div", { "class": "ops" }, [
    el("span", {}, [el("b", {}, [String(total)]), " سجل مرتبط"]),
    el("span", {}, [el("b", {}, [String(secs.length)]), " تبويب"]),
    el("span", { "class": "sp" }),
    (function () {
      var rb = el("button", { "class": "btn mini" }, ["⎙ تقرير هذا السجل"]);
      rb.onclick = function () { reportForEntity(w, val, secs, me, src); };
      return rb;
    })()
  ]));

  if (!total) {
    p.appendChild(el("div", { "class": "empty" }, ["لا توجد سجلات مرتبطة بـ«" + val + "» فى التبويبات الأخرى بعد."]));
    return p;
  }

  secs.forEach(function (sc) {
    if (!sc.rows.length) return;
    var box = el("div", { "class": "sub-panel" });
    box.appendChild(el("h3", {}, [(sc.tab.icon || "▣") + " " + sc.tab.title + " — " + sc.rows.length + " سجل"]));

    /* مؤشرات التبويب محسوبة على سجلات هذا الكيان وحده، بتعريف التبويب نفسه */
    var cards = [];
    toArr(sc.tab.widgets).forEach(function (wg) {
      if (wg.type === "kpi") {
        try { cards.push([wg.label, fmt(E.aggregate(wg.agg || "count", wg.field || "", sc.rows)), wg.unit || ""]); } catch (e) { }
      } else if (wg.type === "formula") {
        try { cards.push([wg.label, fmt(E.evalExpr(wg.expr, sc.rows)), wg.unit || ""]); } catch (e) { }
      }
    });
    if (cards.length) {
      var g = el("div", { "class": "grid " + (cards.length >= 3 ? "g3" : "g2"), style: "margin-top:10px" });
      cards.forEach(function (c2) { g.appendChild(kpiCard("◈", "", c2[0], c2[1], c2[2])); });
      box.appendChild(g);
    }

    var flds = toArr(sc.tab.fields).slice(0, 5);
    var tb = el("table"), hr = el("tr");
    flds.forEach(function (f) { hr.appendChild(el("th", {}, [f.label])); });
    tb.appendChild(el("thead", {}, [hr]));
    var bd = el("tbody");
    sc.rows.slice(0, 8).forEach(function (r) {
      var tr = el("tr");
      flds.forEach(function (f) { tr.appendChild(el("td", {}, [(r[f.id] === undefined || r[f.id] === "") ? "—" : String(r[f.id])])); });
      bd.appendChild(tr);
    });
    sc.rows.forEach(function (r) {
      var la = parseFloat(r.lat), ln = parseFloat(r.lng);
      if (!isNaN(la) && !isNaN(ln)) pts.push({ la: la, ln: ln, n: sc.tab.title });
    });
    tb.appendChild(bd);
    box.appendChild(el("div", { "class": "tbl-wrap" }, [tb]));
    if (sc.rows.length > 8) box.appendChild(el("div", { "class": "hint" }, ["معروض ٨ من " + sc.rows.length + " — افتح التبويب للباقى."]));
    var go = el("button", { "class": "btn mini" }, ["افتح " + sc.tab.title]);
    go.onclick = function () { PENDING_FILTER = val; select(sc.tab.id); };
    box.appendChild(el("div", { "class": "actions" }, [go]));
    p.appendChild(box);
  });

  if (pts.length) {
    var mbox = el("div", { "class": "map-box", id: "emap-" + w.id });
    p.appendChild(el("div", { "class": "sub-panel" }, [el("h3", {}, ["مواقع كل ما يخص «" + val + "»"]), mbox]));
    E.ensureLeaflet(function (err) {
      if (err) { mbox.innerHTML = ""; mbox.appendChild(el("div", { "class": "empty" }, [err.message])); return; }
      var base = E.BASEMAPS.esri;
      var m = L.map(mbox.id, { scrollWheelZoom: false });
      L.tileLayer(base.url, { attribution: base.attr, maxZoom: base.max }).addTo(m);
      var g = [];
      var seen = {};
      pts.forEach(function (pt) {
        var k = pt.la + "," + pt.ln + "," + pt.n;
        if (seen[k]) return; seen[k] = 1;
        g.push(L.marker([pt.la, pt.ln]).addTo(m).bindPopup(pt.n));
      });
      if (g.length) m.fitBounds(L.featureGroup(g).getBounds().pad(0.3));
      setTimeout(function () { m.invalidateSize(); }, 250);
    });
  }
  return p;
}
function reportForEntity(w, val, secs, me, src) {
  var sections = [];
  if (me) {
    var body0 = el("div");
    body0.appendChild(repSection("بيانات " + src.title));
    body0.appendChild(repTable(["البيان", "القيمة"],
      toArr(src.tab.fields).map(function (f) {
        return [f.label + (f.unit ? " (" + f.unit + ")" : ""), (me[f.id] === undefined || me[f.id] === "") ? "ــــ" : me[f.id]];
      })));
    sections.push({ title: val, meta: "المصدر: " + src.title + " · تاريخ الاستخراج: " + stamp2(), body: body0 });
  }
  secs.forEach(function (sc) {
    if (!sc.rows.length) return;
    sections.push({
      title: sc.tab.title,
      meta: "سجلات مرتبطة بـ«" + val + "»: " + sc.rows.length + " · " + sourceLine(sc.tab, sc.rows),
      body: tabReportBody(sc.tab, sc.rows)
    });
  });
  if (!sections.length) { toast("لا بيانات لتقرير هذا السجل", true); return; }
  buildReport("ملف: " + val, sections);
}

function overviewPanel(w, cur) {
  var p = panel("نظرة المدير", w.label || "حالة كل التبويبات");
  var list = toArr(S.schema.tabs).filter(function (t) { return t.id !== cur.id; });
  if (!list.length) {
    p.appendChild(el("div", { "class": "empty" }, ["لا توجد تبويبات أخرى بعد."]));
    return p;
  }
  var g = el("div", { "class": "grid " + (list.length >= 3 ? "g3" : "g2"), style: "margin-top:14px" });
  list.forEach(function (t) {
    var e = ALL[t.id] || { rows: [], offline: true, tab: t, title: t.title };
    var h = tabHeadline(e);
    var box = el("div", { "class": "ov-card" }, [
      el("div", { "class": "ov-head" }, [
        el("span", { "class": "nav-icon" }, [t.icon || "▣"]),
        el("span", { "class": "t" }, [t.title]),
        e.offline ? el("span", { "class": "pill danger" }, ["بلا شبكة"]) : null
      ]),
      el("div", { "class": "ov-big" }, [
        h ? fmt(h.value) : String(e.rows.length),
        el("span", { "class": "unit" }, [h ? (h.unit || "") : "سجل"])
      ]),
      el("div", { "class": "ov-sub" }, [h ? h.label : "عدد السجلات"]),
      el("div", { "class": "ov-foot" }, [
        String(e.rows.length) + " سجل · " + toArr(t.fields).length + " حقل · " + toArr(t.widgets).length + " عنصر"
      ])
    ]);
    box.onclick = function () { select(t.id); };
    g.appendChild(box);
  });
  p.appendChild(g);
  p.appendChild(el("div", { "class": "hint" }, ["الرقم الكبير = أول مؤشر معرَّف داخل التبويب نفسه، محسوباً بنفس تعريفه — لا تعريف مستقل هنا. اضغط أى بطاقة للانتقال."]));
  return p;
}
function xchartPanel(w) {
  var src = ALL[w.tabId];
  var p = panel("رسم مجمّع", w.label || "رسم");
  if (!src) { p.appendChild(el("div", { "class": "empty" }, ["التبويب المصدر غير موجود (ربما حُذف)."])); return p; }
  try {
    var series = E.groupBy(src.rows, w.labelField, w.valueField, w.agg || "sum");
    if (!series.length) p.appendChild(el("div", { "class": "empty" }, ["لا بيانات فى: " + src.title]));
    else p.appendChild(el("div", { "class": "chart-box" }, [E.svgChart(series, w.chartType || "bar")]));
  } catch (e) { p.appendChild(el("div", { "class": "empty" }, ["تعذّر الرسم: " + e.message])); }
  p.appendChild(el("div", { "class": "hint" }, ["المصدر: " + src.title + " · " + src.rows.length + " سجل"]));
  return p;
}
function activityPanel(w) {
  var p = panel("الحركة", w.label || "آخر ما جرى");
  p.appendChild(el("div", { "class": "empty" }, ["جارٍ التحميل…"]));
  E.db.get(E.cfg.root + "/data/audit").then(function (a) {
    p.innerHTML = "";
    p.appendChild(el("span", { "class": "eyebrow" }, ["الحركة"]));
    p.appendChild(el("h2", {}, [w.label || "آخر ما جرى"]));
    var list = toArr(a).sort(function (x, y) { return (y.at || 0) - (x.at || 0); }).slice(0, w.limit || 8);
    if (!list.length) { p.appendChild(el("div", { "class": "empty" }, ["لا حركات مسجّلة."])); return; }
    list.forEach(function (r) {
      p.appendChild(el("div", { "class": "adm-row" }, [
        el("span", { "class": "m" }, [when(r.at)]),
        el("span", { "class": "t" }, [r.action || "—"]),
        el("span", { "class": "sp" }),
        el("span", { "class": "pill green" }, [r.by || "—"])
      ]));
    });
  }).catch(function (e) {
    p.innerHTML = "";
    p.appendChild(el("div", { "class": "empty" }, ["تعذّر تحميل السجل: " + e.message]));
  });
  return p;
}

/* ---------------- عنصر تصميم المنشآت (حاسبة داخل التبويب) ---------------- */
var DES_IN = {};   /* قيم المدخلات لكل عنصر تصميم */
function designPanel(w, t) {
  var def = E.DESIGN[w.dcalc];
  var p = panel("تصميم", w.label || (def ? def.name : "تصميم"));
  if (typeof MWRIHyd === "undefined") {
    p.appendChild(el("div", { "class": "empty" }, ["ملف hydraulics.js غير محمّل — العنصر معطّل."]));
    return p;
  }
  if (!def) { p.appendChild(el("div", { "class": "empty" }, ["نوع تصميم غير معروف: " + w.dcalc])); return p; }

  DES_IN[w.id] = DES_IN[w.id] || {};
  var mem = DES_IN[w.id];
  var frm = el("div", { "class": "frm" }), inputs = {};
  def.inputs.forEach(function (pr) {
    var inp = el("input", { type: "number", step: "any", value: (mem[pr[0]] !== undefined ? mem[pr[0]] : "") });
    inputs[pr[0]] = inp;
    frm.appendChild(el("div", { "class": "fld" }, [
      el("label", {}, [pr[1] + (pr[2] ? " (" + pr[2] + ")" : "")]), inp,
      el("small", { "class": "rule" }, [pr[0]])
    ]));
  });
  p.appendChild(frm);
  var res = el("div");
  p.appendChild(res);

  function compute() {
    var v = {}, missing = [], bad = [];
    def.inputs.forEach(function (pr) {
      var x = parseFloat(inputs[pr[0]].value);
      var lim = pr[3] || {};
      inputs[pr[0]].classList.remove("bad");
      if (isNaN(x)) { missing.push(pr[1]); }
      else {
        /* قيود هندسية: لا صفر ولا سالب حيث لا معنى لهما، وأعداد صحيحة للفتحات والبحور */
        if (lim.min !== undefined && x < lim.min) bad.push(pr[1] + ": لا يقلّ عن " + lim.min);
        else if (lim.max !== undefined && x > lim.max) bad.push(pr[1] + ": لا يزيد عن " + lim.max);
        else if (lim.int && Math.round(x) !== x) bad.push(pr[1] + ": لازم عدد صحيح");
        if (bad.length && bad[bad.length - 1].indexOf(pr[1]) === 0) inputs[pr[0]].classList.add("bad");
      }
      v[pr[0]] = x; mem[pr[0]] = inputs[pr[0]].value;
    });
    res.innerHTML = "";
    if (missing.length) {
      res.appendChild(el("div", { "class": "errbox" }, ["• مدخلات ناقصة: " + missing.join(" · ")]));
      return null;
    }
    if (bad.length) {
      var eb = el("div", { "class": "errbox" });
      bad.forEach(function (m2) { eb.appendChild(el("div", {}, ["• " + m2])); });
      res.appendChild(eb);
      return null;
    }
    var out;
    try { out = def.run(v); }
    catch (e) { res.appendChild(el("div", { "class": "errbox" }, ["• تعذّر الحساب: " + e.message])); return null; }

    var bad2 = [];
    out.out.forEach(function (o) {
      if (typeof o[1] === "number" && !isFinite(o[1])) bad2.push(o[0]);
    });
    out.__bad = bad2;
    var tb = el("table"), hr = el("tr");
    ["البيان", "القيمة", "الوحدة"].forEach(function (h) { hr.appendChild(el("th", {}, [h])); });
    tb.appendChild(el("thead", {}, [hr]));
    var bd = el("tbody");
    out.out.forEach(function (o) {
      var isText = (o[1] === 0 && o[2] && isNaN(parseFloat(o[2])));
      bd.appendChild(el("tr", {}, [
        el("td", {}, [o[0]]),
        el("td", { style: "font-weight:700" }, [isText ? o[2] : fmt(o[1])]),
        el("td", {}, [isText ? "" : (o[2] || "")])
      ]));
    });
    tb.appendChild(bd);
    res.appendChild(el("div", { "class": "tbl-wrap" }, [tb]));

    if (bad2.length) {
      res.appendChild(el("div", { "class": "errbox" }, ["• قيم غير محسوبة (تحقّق من المدخلات): " + bad2.join(" · ")]));
    }
    var fl = el("div", { "class": "actions" });
    (out.flags || []).forEach(function (f) {
      fl.appendChild(el("span", { "class": "pill " + (f.level === "خطر" ? "danger" : "sand") }, [f.level + ": " + f.msg]));
    });
    if (!(out.flags || []).length) fl.appendChild(el("span", { "class": "pill green" }, ["الرقابة: سليم"]));
    res.appendChild(fl);
    res.appendChild(el("div", { "class": "hint" }, ["المنهجية: " + def.note]));
    return { v: v, out: out };
  }

  /* ---- تحويل ناتج التصميم إلى بند تنفيذى فى تبويب متابعة ---- */
  var xferBox = el("div", { "class": "sub-panel", style: "display:none" });
  function buildXfer(r) {
    xferBox.innerHTML = "";
    xferBox.style.display = "block";
    xferBox.appendChild(el("h3", {}, ["تحويل الناتج إلى بند تنفيذى"]));

    /* التبويبات الصالحة هدفاً: أى تبويب فيه حقل رقمى واحد على الأقل */
    var targets = toArr(S.schema.tabs).filter(function (tt) {
      if (tt.id === t.id) return false;
      var has = false;
      toArr(tt.fields).forEach(function (f) { if (f.type === "number") has = true; });
      return has;
    });
    if (!targets.length) {
      xferBox.appendChild(el("div", { "class": "hint" }, [
        "لا يوجد تبويب متابعة فيه حقل رقمى. ركّب قالب «سجل الأعمال الجارية» أو أضف حقلاً رقمياً فى تبويب الأعمال أولاً."
      ]));
      return;
    }
    var tSel = el("select");
    targets.forEach(function (tt) { tSel.appendChild(el("option", { value: tt.id }, [tt.title])); });

    /* القيم الرقمية القابلة للنقل من نتيجة الحساب */
    var nums = [];
    r.out.out.forEach(function (o, i) {
      var isText = (o[1] === 0 && o[2] && isNaN(parseFloat(o[2])));
      if (!isText && typeof o[1] === "number" && isFinite(o[1])) nums.push({ i: i, label: o[0], val: o[1], unit: o[2] || "" });
    });
    var vSel = el("select");
    nums.forEach(function (n2) { vSel.appendChild(el("option", { value: String(n2.i) }, [n2.label + " = " + fmt(n2.val) + (n2.unit ? " " + n2.unit : "")])); });

    var fSel = el("select"), labSel = el("select"), labVal = el("input", { type: "text", placeholder: "اسم المجرى أو البند" });
    function target() {
      var f = null;
      targets.forEach(function (tt) { if (tt.id === tSel.value) f = tt; });
      return f;
    }
    function rebuild() {
      var tt = target();
      fSel.innerHTML = ""; labSel.innerHTML = "";
      toArr(tt.fields).forEach(function (f) {
        if (f.type === "number") fSel.appendChild(el("option", { value: f.id }, [f.label + (f.unit ? " (" + f.unit + ")" : "")]));
        if (f.type === "text" || f.type === "ref" || f.type === "select") labSel.appendChild(el("option", { value: f.id }, [f.label]));
      });
      if (!labSel.childNodes.length) labSel.appendChild(el("option", { value: "" }, ["— بلا حقل وصفى —"]));
    }
    tSel.onchange = rebuild;
    rebuild();

    xferBox.appendChild(el("div", { "class": "frm" }, [
      el("div", { "class": "fld" }, [el("label", {}, ["تبويب المتابعة"]), tSel]),
      el("div", { "class": "fld" }, [el("label", {}, ["القيمة المنقولة"]), vSel]),
      el("div", { "class": "fld" }, [el("label", {}, ["الحقل المستقبِل"]), fSel]),
      el("div", { "class": "fld" }, [el("label", {}, ["الحقل الوصفى"]), labSel]),
      el("div", { "class": "fld" }, [el("label", {}, ["قيمته"]), labVal])
    ]));
    var mk = el("button", { "class": "btn solid" }, ["أنشئ البند"]);
    mk.onclick = function () {
      var tt = target();
      if (!fSel.value) { toast("اختر الحقل المستقبِل", true); return; }
      var pickNum = null;
      nums.forEach(function (n2) { if (String(n2.i) === String(vSel.value)) pickNum = n2; });
      if (!pickNum) { toast("اختر القيمة المنقولة", true); return; }
      var rec = {};
      rec[fSel.value] = pickNum.val;
      if (labSel.value && labVal.value) rec[labSel.value] = labVal.value;
      /* قيم بدء افتراضية إن كانت حقولها موجودة فى التبويب الهدف */
      toArr(tt.fields).forEach(function (f) {
        if (f.id === "pct") rec.pct = 0;
        if (f.id === "status" && String(f.options || "").indexOf("لم يبدأ") >= 0) rec.status = "لم يبدأ";
        if (f.id === "note") rec.note = "مصدره تصميم: " + def.name + " — " + pickNum.label + " = " + fmt(pickNum.val) + (pickNum.unit ? " " + pickNum.unit : "");
      });
      rec.by = who();
      rec.srcDesign = def.name;          /* أثر المصدر: البند يعرف من أين جاء */
      rec.srcValue = pickNum.label;
      var errs = validateRecord(tt, rec);
      if (errs.length) {
        xferBox.appendChild(el("div", { "class": "errbox" }, [
          "• التبويب الهدف يطلب حقولاً إلزامية غير متوفرة هنا: "
          + errs.map(function (e2) { return e2.msg; }).join(" · ")
          + " — أنشئ البند من تبويب المتابعة نفسه أو ارفع الإلزام عن هذه الحقول."
        ]));
        return;
      }
      E.db.post(E.cfg.root + "/data/records/" + tt.id, rec).then(function () {
        audit("بند تنفيذى من تصميم (" + def.name + ") إلى: " + tt.title);
        toast("اتعمل البند فى " + tt.title);
        var go = el("button", { "class": "btn mini" }, ["افتح " + tt.title]);
        go.onclick = function () { select(tt.id); };
        xferBox.appendChild(el("div", { "class": "actions" }, [go]));
      }).catch(function (e2) { toast("فشل الإنشاء: " + e2.message, true); });
    };
    xferBox.appendChild(el("div", { "class": "actions" }, [mk]));
    xferBox.appendChild(el("div", { "class": "hint" }, [
      "البند يُنشأ بنسبة تنفيذ صفر وموقف «لم يبدأ» إن وُجدا، ويحمل أثر مصدره (اسم الحساب والقيمة) — فتقارن لاحقاً المنفَّذ بالمصمَّم."
    ]));
  }

  var calc = el("button", { "class": "btn solid" }, ["احسب"]);
  calc.onclick = function () { compute(); };
  var save = el("button", { "class": "btn" }, ["احفظ النتيجة كسجل"]);
  save.onclick = function () {
    var r = compute();
    if (!r) { toast("صحّح المدخلات أولاً", true); return; }
    if (r.out.__bad && r.out.__bad.length) { toast("لا تُحفظ نتيجة فيها قيم غير محسوبة", true); return; }
    var rec = { dcalc: w.dcalc, dname: def.name, by: who() };
    def.inputs.forEach(function (pr) { rec["in_" + pr[0]] = r.v[pr[0]]; });
    r.out.out.forEach(function (o, i) {
      var isText = (o[1] === 0 && o[2] && isNaN(parseFloat(o[2])));
      rec["out_" + (i + 1)] = o[0] + ": " + (isText ? o[2] : fmt(o[1])) + (isText ? "" : (o[2] ? " " + o[2] : ""));
    });
    E.db.post(E.cfg.root + "/data/records/" + t.id, rec).then(function () {
      audit("حفظ نتيجة تصميم (" + def.name + ") فى: " + t.title);
      toast("اتحفظت النتيجة");
      renderTab(t);
    }).catch(function (e) { toast("فشل الحفظ: " + e.message, true); });
  };
  var xfer = el("button", { "class": "btn" }, ["حوّله بنداً تنفيذياً"]);
  xfer.onclick = function () {
    var r = compute();
    if (!r) { toast("صحّح المدخلات أولاً", true); return; }
    if (r.out.__bad && r.out.__bad.length) { toast("لا يُحوَّل بند من نتيجة فيها قيم غير محسوبة", true); return; }
    buildXfer(r);
  };
  p.appendChild(el("div", { "class": "actions" }, [calc, save, xfer]));
  p.appendChild(xferBox);
  p.appendChild(el("div", { "class": "hint" }, [
    "المخرَج مقاس هيدروليكى وكميات تقديرية — وليس تصميماً إنشائياً: حديد التسليح وسُمك البلاطات والأساسات خارج نطاق هذه الأداة."
  ]));
  return p;
}

function hydroPanel(w, rows, t) {
  var p = panel("هيدروليكا", w.label || "حساب");
  if (typeof MWRIHyd === "undefined") {
    p.appendChild(el("div", { "class": "empty" }, ["ملف hydraulics.js غير محمّل — العنصر معطّل."]));
    return p;
  }

  /* اتزان مائى: إجمالى + تجميع اختيارى بمجموعة (ترعة) وفترة وبخر/رشح —
     الحساب كله من E.balanceCompute، نفس الدالة التى يستهلكها التقرير */
  if (w.calc === "balance") {
    var bc;
    try { bc = E.balanceCompute(rows, w); }
    catch (e) { p.appendChild(el("div", { "class": "empty" }, ["تعذّر الحساب: " + e.message])); return p; }
    var tot = bc.total, tol = typeof w.tol === "number" ? w.tol : 5;
    var okState = tot.computable && Math.abs(tot.closurePct) <= tol;
    var g = el("div", { "class": "grid g4" });
    g.appendChild(kpiCard("↓", "", "الوارد", fmt(tot.inflow), "م³/ث"));
    g.appendChild(kpiCard("↑", "sand", "المنصرف", fmt(tot.outflow), "م³/ث"));
    g.appendChild(kpiCard("Δ", okState ? "green" : "", "الفرق", fmt(tot.closure), "م³/ث"));
    g.appendChild(kpiCard("%", okState ? "green" : "sand", "نسبة الإقفال",
      tot.computable ? fmt(tot.closurePct) : "—", tot.computable ? "%" : "",
      tot.computable ? (okState ? "داخل السماح" : "خارج السماح") : tot.statusView));
    p.appendChild(g);
    if ((w.evapField || w.seepField) && (tot.evaporation > 0 || tot.seepage > 0)) {
      var g2b = el("div", { "class": "grid g2" });
      g2b.appendChild(kpiCard("☼", "sand", "البخر (من الحقول)", fmt(tot.evaporation), "م³/ث"));
      g2b.appendChild(kpiCard("↧", "sand", "الرشح (من الحقول)", fmt(tot.seepage), "م³/ث"));
      p.appendChild(g2b);
    }
    if (!tot.computable && (tot.outflow > 0 || tot.seepage > 0 || tot.evaporation > 0)) {
      p.appendChild(el("div", { "class": "errbox" }, [
        "• منصرف بلا وارد مسجَّل: النسبة غير قابلة للحساب، والحالة تحتاج مراجعة ميدانية — لا تُقرأ كإقفال مقبول."
      ]));
    }
    if (bc.groups) {
      var tbB = el("table"), hrB = el("tr");
      var colsB = ["المجموعة", "الوارد", "المنصرف"];
      if (w.evapField) colsB.push("البخر");
      if (w.seepField) colsB.push("الرشح");
      colsB.push("الفرق", "النسبة %", "الحالة");
      colsB.forEach(function (hh) { hrB.appendChild(el("th", {}, [hh])); });
      tbB.appendChild(el("thead", {}, [hrB]));
      var bdB = el("tbody");
      bc.groups.forEach(function (gr) {
        var ok2 = gr.computable && Math.abs(gr.closurePct) <= tol;
        var trB = el("tr");
        trB.appendChild(el("td", {}, [gr.label]));
        trB.appendChild(el("td", {}, [fmt(gr.inflow)]));
        trB.appendChild(el("td", {}, [fmt(gr.outflow)]));
        if (w.evapField) trB.appendChild(el("td", {}, [fmt(gr.evaporation)]));
        if (w.seepField) trB.appendChild(el("td", {}, [fmt(gr.seepage)]));
        trB.appendChild(el("td", {}, [fmt(gr.closure)]));
        trB.appendChild(el("td", {}, [gr.computable ? fmt(gr.closurePct) : "ــــ"]));
        var stB = el("td");
        stB.appendChild(el("span", { "class": "pill " + (gr.computable ? (ok2 ? "green" : "danger") : "sand") },
          [gr.computable ? (ok2 ? "داخل السماح" : gr.status) : gr.statusView]));
        trB.appendChild(stB);
        bdB.appendChild(trB);
      });
      tbB.appendChild(bdB);
      p.appendChild(el("div", { "class": "tbl-wrap" }, [tbB]));
    }
    p.appendChild(el("div", { "class": "hint" }, [
      (bc.period ? "الفترة: " + bc.period + " · " : "")
      + "مصدر الحساب: MWRIHyd.waterBalance — سماح " + tol + "%. الحالة تُحسب من نسبة الإقفال مقابل السماح"
      + (w.groupField ? "، لكل مجموعة على حدة ثم الإجمالى" : "")
      + ". " + ((w.evapField || w.seepField) ? "البخر والرشح من الحقول المُدخَلة." : "لا يشمل البخر والرشح ما لم تُدخَلا كحقول.")
    ]));
    return p;
  }

  var def = E.HYDRO[w.calc];
  if (!def) { p.appendChild(el("div", { "class": "empty" }, ["نوع حساب غير معروف: " + w.calc])); return p; }

  var tb = el("table"), hr = el("tr");
  if (w.labelField) hr.appendChild(el("th", {}, ["السجل"]));
  def.params.forEach(function (pr) { hr.appendChild(el("th", {}, [pr[0]])); });
  var head0 = null, okCount = 0, sumMain = 0, flagCount = 0;
  var bd = el("tbody");

  rows.forEach(function (r) {
    var v = {}, missing = false;
    def.params.forEach(function (pr) {
      var val = E.hydroValue(w.map, pr[0], r);
      v[pr[0]] = val;
      if (isNaN(val)) missing = true;
    });
    var res = null, err = "";
    if (!missing) {
      try { res = def.run(v); } catch (e) { err = e.message; }
    }
    if (!head0 && res) {
      head0 = res.out;
      res.out.forEach(function (o) { hr.appendChild(el("th", {}, [o[0] + (o[2] ? " (" + o[2] + ")" : "")])); });
      hr.appendChild(el("th", {}, ["الرقابة"]));
    }
    var tr = el("tr");
    if (w.labelField) tr.appendChild(el("td", {}, [String(r[w.labelField] === undefined ? "—" : r[w.labelField])]));
    def.params.forEach(function (pr) { tr.appendChild(el("td", {}, [isNaN(v[pr[0]]) ? "—" : fmt(v[pr[0]])])); });
    if (res) {
      okCount++; sumMain += (isFinite(res.main) ? res.main : 0);
      res.out.forEach(function (o) {
        tr.appendChild(el("td", {}, [o[1] === 0 && o[2] && isNaN(parseFloat(o[2])) ? o[2] : fmt(o[1])]));
      });
      var fc = el("td");
      if (res.flags && res.flags.length) {
        flagCount++;
        res.flags.forEach(function (f) {
          fc.appendChild(el("span", { "class": "pill " + (f.level === "خطر" ? "danger" : "sand"), title: f.msg }, [f.level]));
        });
      } else fc.appendChild(el("span", { "class": "pill green" }, ["سليم"]));
      tr.appendChild(fc);
    } else {
      var span = (head0 ? head0.length : 1) + 1;
      tr.appendChild(el("td", { colspan: String(span), "class": "m" }, [missing ? "مدخلات ناقصة" : ("خطأ: " + err)]));
    }
    bd.appendChild(tr);
  });

  tb.appendChild(el("thead", {}, [hr]));
  tb.appendChild(bd);

  var head = el("div", { "class": "grid g3" });
  head.appendChild(kpiCard("ƒ", "", "سجلات محسوبة", String(okCount), "من " + rows.length));
  head.appendChild(kpiCard("Σ", "green", "مجموع " + (def.params.length ? "الناتج الأساسى" : ""), fmt(sumMain), (rows.length ? (def.run ? "" : "") : "")));
  head.appendChild(kpiCard("!", flagCount ? "sand" : "green", "سجلات عليها إنذار", String(flagCount), "سجل"));
  p.appendChild(head);
  p.appendChild(el("div", { "class": "tbl-wrap" }, [tb]));
  p.appendChild(el("div", { "class": "hint" }, [
    "الحساب: " + def.name + " — منفَّذ بنواة MWRIHyd الموحّدة (لا معادلة محلية). " +
    "الرقابة تفحص السرعة (نحر > ٢ م/ث · ترسيب < ٠٫٣) والخشونة (٠٫٠١٢–٠٫٠٧٥) والقرب من الحرج. مرّر الفأرة على الشارة لنص الإنذار."
  ]));
  return p;
}

/* ---------------- مُصدِّر التقارير (طباعة/PDF) ---------------- */
/* الهيكل يتبع مهارة mwri-reports: رأس الإدارة · مصدر البيانات وتاريخه ·
   النتائج · الملاحظات · كتلة الاعتماد. لا يُختلق رقم — كل قيمة من السجلات. */
var ORG = {
  ministry: "وزارة الموارد المائية والرى",
  dept: "الإدارة المركزية للموارد المائية والرى لمحافظتى القاهرة والجيزة",
  approver: "مهندس / محسن عبد الرشيد الشامى",
  approverRole: "رئيس الإدارة المركزية للموارد المائية والرى للقاهرة والجيزة"
};
function stamp2() {
  var d = new Date();
  function p(x) { return (x < 10 ? "0" : "") + x; }
  return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + " - " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function repSection(title) {
  return el("div", { "class": "rep-sec" }, [el("h3", {}, [title])]);
}
function repTable(headers, rows) {
  var t = el("table", { "class": "rep-tbl" }), hr = el("tr");
  headers.forEach(function (h) { hr.appendChild(el("th", {}, [h])); });
  t.appendChild(el("thead", {}, [hr]));
  var bd = el("tbody");
  rows.forEach(function (r) {
    var tr = el("tr");
    r.forEach(function (c) { tr.appendChild(el("td", {}, [String(c)])); });
    bd.appendChild(tr);
  });
  t.appendChild(bd);
  return t;
}
function sourceLine(t, rows) {
  var src = (t.source && t.source.type === "sheet") ? "جدول Google Sheet مرتبط" : "قاعدة بيانات الإدارة (Firebase RTDB)";
  return "مصدر البيانات: " + src + " · عدد السجلات: " + rows.length + " · تاريخ الاستخراج: " + stamp2();
}
function tabReportBody(t, rows) {
  var box = el("div");
  var fields = toArr(t.fields), widgets = toArr(t.widgets);

  /* المؤشرات */
  var kpis = [];
  widgets.forEach(function (w) {
    if (w.type === "kpi") {
      try { kpis.push([w.label, fmt(E.aggregate(w.agg || "count", w.field || "", rows)), w.unit || "—"]); } catch (e) { }
    } else if (w.type === "formula") {
      try { kpis.push([w.label, fmt(E.evalExpr(w.expr, rows)), w.unit || "—"]); } catch (e) { kpis.push([w.label, "تعذّر", w.unit || "—"]); }
    } else if (w.type === "xkpi") {
      var sx = ALL[w.tabId];
      if (sx) { try { kpis.push([w.label, fmt(E.aggregate(w.agg || "count", w.field || "", sx.rows)), w.unit || "—"]); } catch (e) { } }
    }
  });
  if (kpis.length) {
    box.appendChild(repSection("المؤشرات"));
    box.appendChild(repTable(["البيان", "القيمة", "الوحدة"], kpis));
  }

  /* الرسوم — SVG يُطبع كما هو */
  widgets.forEach(function (w) {
    if (w.type !== "chart" && w.type !== "xchart") return;
    var src = w.type === "xchart" ? (ALL[w.tabId] || { rows: [] }).rows : rows;
    try {
      var series = E.groupBy(src, w.labelField, w.valueField, w.agg || "sum");
      if (!series.length) return;
      box.appendChild(repSection(w.label || "رسم بيانى"));
      box.appendChild(el("div", { "class": "rep-chart" }, [E.svgChart(series, w.chartType || "bar", 700, 250)]));
    } catch (e) { }
  });

  /* الحسابات الهيدروليكية */
  widgets.forEach(function (w) {
    if (w.type !== "hydro" || typeof MWRIHyd === "undefined") return;
    if (w.calc === "balance") {
      try {
        /* نفس دالة الشاشة E.balanceCompute — لا يفترق رقم التقرير عن رقم الشاشة */
        var bcR = E.balanceCompute(rows, w);
        var tolR = typeof w.tol === "number" ? w.tol : 5;
        box.appendChild(repSection(w.label || "الاتزان المائى"));
        var hdR = ["البيان", "الوارد (م³/ث)", "المنصرف (م³/ث)"];
        if (w.evapField) hdR.push("البخر");
        if (w.seepField) hdR.push("الرشح");
        hdR.push("الفرق (م³/ث)", "نسبة الإقفال %", "الحالة");
        var linesR = [];
        function bLine(nm, b2) {
          var row = [nm, fmt(b2.inflow), fmt(b2.outflow)];
          if (w.evapField) row.push(fmt(b2.evaporation));
          if (w.seepField) row.push(fmt(b2.seepage));
          row.push(fmt(b2.closure), b2.computable ? fmt(b2.closurePct) : "ــــ",
            b2.computable ? b2.status : b2.statusView);
          return row;
        }
        (bcR.groups || []).forEach(function (gr) { linesR.push(bLine(gr.label, gr)); });
        linesR.push(bLine(bcR.groups ? "الإجمالى" : "الكل", bcR.total));
        box.appendChild(repTable(hdR, linesR));
        box.appendChild(el("p", { "class": "rep-note" }, ["المنهجية: MWRIHyd.waterBalance — سماح " + tolR + "%"
          + (bcR.period ? " · الفترة: " + bcR.period : "")
          + ((w.evapField || w.seepField) ? " · البخر والرشح من الحقول المُدخَلة." : " · لا يشمل البخر والرشح ما لم يُدخَلا كحقول.")
          + (!bcR.total.computable && (bcR.total.outflow > 0 || bcR.total.seepage > 0 || bcR.total.evaporation > 0) ? " تنبيه: الوارد المسجَّل صفر — النسبة غير قابلة للحساب والحالة تحتاج مراجعة ميدانية." : "")]));
      } catch (e) { }
      return;
    }
    var def = E.HYDRO[w.calc];
    if (!def) return;
    var head = null, body = [], notes = [];
    rows.forEach(function (r) {
      var v = {}, missing = false;
      def.params.forEach(function (pr) {
        var val = E.hydroValue(w.map, pr[0], r);
        v[pr[0]] = val; if (isNaN(val)) missing = true;
      });
      if (missing) { notes.push(String(r[w.labelField] || "سجل") + ": مدخلات ناقصة — لم يُحسب"); return; }
      var res; try { res = def.run(v); } catch (e) { notes.push(String(r[w.labelField] || "سجل") + ": " + e.message); return; }
      if (!head) {
        head = [w.labelField ? "السجل" : "#"].concat(def.params.map(function (pr) { return pr[0]; }))
          .concat(res.out.map(function (o) { return o[0] + (o[2] ? " (" + o[2] + ")" : ""); })).concat(["الرقابة"]);
      }
      var line = [w.labelField ? String(r[w.labelField] || "—") : "—"];
      def.params.forEach(function (pr) { line.push(fmt(v[pr[0]])); });
      res.out.forEach(function (o) { line.push(o[1] === 0 && o[2] && isNaN(parseFloat(o[2])) ? o[2] : fmt(o[1])); });
      var fl = (res.flags || []).map(function (f) { return f.level + ": " + f.msg; });
      line.push(fl.length ? fl.join(" · ") : "سليم");
      body.push(line);
    });
    if (head) {
      box.appendChild(repSection(w.label || def.name));
      box.appendChild(repTable(head, body));
      box.appendChild(el("p", { "class": "rep-note" }, ["المنهجية: " + def.name + " — النواة الحسابية الموحّدة MWRIHyd. حدود الرقابة: سرعة النحر 2.0 م/ث · الترسيب 0.3 م/ث · معامل الخشونة 0.012–0.075."]));
    }
    if (notes.length) {
      box.appendChild(el("p", { "class": "rep-note" }, ["ملاحظات: " + notes.join(" · ")]));
    }
  });

  /* الإنذارات المُطلَقة */
  if (toArr(t.alerts).length && rows.length) {
    var fires = [];
    rows.forEach(function (r) {
      var lab = "";
      fields.forEach(function (f) { if (!lab && (f.type === "text" || f.type === "ref")) lab = String(r[f.id] || ""); });
      E.rowAlerts(t, r).forEach(function (a) { fires.push([lab || "سجل", a.level, a.msg, a.expr]); });
    });
    box.appendChild(repSection("الإنذارات المُطلَقة"));
    if (fires.length) box.appendChild(repTable(["السجل", "المستوى", "البيان", "الشرط"], fires));
    else box.appendChild(el("p", { "class": "rep-note" }, ["لا إنذارات — كل السجلات مطابقة للقواعد المعرَّفة."]));
  }

  /* جداول البيانات */
  if (fields.length && rows.length) {
    var hasTable = false;
    widgets.forEach(function (w) { if (w.type === "table") hasTable = true; });
    if (hasTable) {
      box.appendChild(repSection("بيانات السجلات"));
      box.appendChild(repTable(
        fields.map(function (f) { return f.label + (f.unit ? " (" + f.unit + ")" : ""); }),
        rows.map(function (r) { return fields.map(function (f) { return (r[f.id] === undefined || r[f.id] === "") ? "ــــ" : r[f.id]; }); })
      ));
    }
  }
  if (!rows.length) box.appendChild(el("p", { "class": "rep-note" }, ["لا توجد سجلات مسجّلة فى هذا التبويب حتى تاريخ الاستخراج."]));
  return box;
}
function buildReport(title, sections) {
  var root = document.getElementById("report-root");
  root.innerHTML = "";
  root.appendChild(el("div", { "class": "rep-head" }, [
    el("div", { "class": "rep-org" }, [ORG.ministry]),
    el("div", { "class": "rep-dept" }, [ORG.dept]),
    el("h1", {}, [title]),
    el("div", { "class": "rep-meta" }, ["تاريخ الاستخراج: " + stamp2() + " · إصدار المخطط: " + (S.schema.version || 1) + " · التطبيق: " + APP.title])
  ]));
  sections.forEach(function (sec) {
    root.appendChild(el("div", { "class": "rep-block" }, [
      el("h2", {}, [sec.title]),
      sec.meta ? el("p", { "class": "rep-src" }, [sec.meta]) : null,
      sec.body
    ]));
  });
  root.appendChild(el("div", { "class": "rep-sign" }, [
    el("table", { "class": "rep-tbl" }, [
      el("tbody", {}, [
        el("tr", {}, [el("th", {}, ["أعدّ التقرير"]), el("th", {}, ["يُعتمد،،"])]),
        el("tr", {}, [
          el("td", {}, [(who() === "مستخدم غير مسمّى" ? "ــــ" : who()) + " — التوقيع: ــــ"]),
          el("td", {}, [ORG.approver + " — " + ORG.approverRole])
        ])
      ])
    ])
  ]));
  root.appendChild(el("div", { "class": "rep-foot" }, ["تقرير مُستخرَج آلياً من " + APP.title + " — الأرقام كما هى مسجّلة فى قاعدة البيانات وقت الاستخراج."]));
  document.body.classList.add("printing");
  setTimeout(function () {
    window.print();
    setTimeout(function () { document.body.classList.remove("printing"); }, 400);
  }, 120);
}
function reportForTab(t, rows) {
  buildReport("تقرير: " + t.title, [{ title: t.title, meta: sourceLine(t, rows), body: tabReportBody(t, rows) }]);
}
function reportForAll() {
  E.loadAllRecords(S.schema).then(function (m) {
    ALL = m;
    var secs = [];
    toArr(S.schema.tabs).forEach(function (t) {
      var e = m[t.id] || { rows: [] };
      secs.push({ title: t.title, meta: sourceLine(t, e.rows), body: tabReportBody(t, e.rows) });
    });
    buildReport("التقرير الشامل — " + APP.title, secs);
  }).catch(function (e) { toast("تعذّر تجميع التقرير: " + e.message, true); });
}

function isCross(w) {
  return w.type === "overview" || w.type === "xkpi" || w.type === "xchart" || w.type === "entity" || w.type === "alerts";
}
function renderTab(t) {
  var c = document.getElementById("content"); c.innerHTML = "";
  c.appendChild(el("div", { "class": "empty" }, ["جارٍ تحميل البيانات…"]));
  LOAD_TOKEN++;
  var myToken = LOAD_TOKEN;
  var cross = false;
  toArr(t.widgets).forEach(function (w) { if (isCross(w)) cross = true; });
  if (cross) {
    /* لوحة قيادة: تُحمَّل سجلات كل التبويبات مرة واحدة قبل الرسم */
    E.loadAllRecords(S.schema).then(function (m) {
      if (myToken !== LOAD_TOKEN) return;      /* غادر المستخدم هذا التبويب */
      ALL = m;
      var own = m[t.id];
      drawTab(t, own ? own.rows : [], own ? own.offline : false);
    }).catch(function (e) {
      if (myToken !== LOAD_TOKEN) return;
      c.innerHTML = "";
      var p = panel("تعذّر التحميل", "لوحة القيادة لم تُحمَّل");
      p.appendChild(el("div", { "class": "hint" }, ["نص الخطأ: " + e.message]));
      c.appendChild(p);
    });
    return;
  }
  E.loadRecords(t).then(function (res) {
    if (myToken !== LOAD_TOKEN) return;
    RECS[t.id] = res.rows;
    drawTab(t, res.rows, res.offline);
  }).catch(function (e) {
    if (myToken !== LOAD_TOKEN) return;
    c.innerHTML = "";
    var p = panel("تعذّر التحميل", "مصدر البيانات لم يستجب");
    p.appendChild(el("div", { "class": "hint" }, ["نص الخطأ: " + e.message + " — الإدخال موقوف لحد رجوع الاتصال، جرّب زر «تحديث»."]));
    c.appendChild(p);
  });
}

function drawTab(t, rows, offline) {
  var c = document.getElementById("content"); c.innerHTML = "";
  var fields = toArr(t.fields), widgets = toArr(t.widgets);
  EDIT_KEY = null; FORM = null;

  if (offline) {
    c.appendChild(el("div", { "class": "banner warn" }, [
      el("span", { "class": "pill danger" }, ["بلا شبكة"]),
      el("span", {}, ["معروض من آخر نسخة محفوظة على الجهاز — الإدخال والتعديل موقوفان لحد رجوع الشبكة"])
    ]));
  }

  /* شريط تشغيل: أرقام التبويب فى سطر */
  var repBtn = el("button", { "class": "btn mini" }, ["⎙ تقرير هذا التبويب"]);
  repBtn.onclick = function () { reportForTab(t, rows); };
  var repAll = el("button", { "class": "btn mini" }, ["⎙ تقرير شامل"]);
  repAll.onclick = function () { reportForAll(); };
  c.appendChild(el("div", { "class": "ops" }, [
    el("span", {}, [el("b", {}, [String(rows.length)]), " سجل"]),
    el("span", {}, [el("b", {}, [String(fields.length)]), " حقل"]),
    el("span", {}, [el("b", {}, [String(widgets.length)]), " عنصر"]),
    el("span", { "class": "sp" }),
    el("span", { "class": "m" }, ["إصدار المخطط " + (S.schema.version || 1)]),
    repBtn, repAll
  ]));

  if (t.source && t.source.type === "sheet") {
    c.appendChild(el("div", { "class": "banner" }, [
      el("span", { "class": "pill lake" }, ["Google Sheet"]),
      el("span", {}, ["المصدر جدول خارجى — " + rows.length + " صف · القراءة فقط"])
    ]));
  }

  var cards = [];
  widgets.forEach(function (w) {
    if (w.type === "kpi") {
      var v; try { v = E.aggregate(w.agg || "count", w.field || "", rows); } catch (e) { v = NaN; }
      cards.push(kpiCard(w.icon, w.style, w.label, fmt(v), w.unit, (w.agg || "count") + (w.field ? " (" + w.field + ")" : "")));
    } else if (w.type === "xkpi") {
      var src = ALL[w.tabId], xv;
      if (!src) xv = NaN;
      else { try { xv = E.aggregate(w.agg || "count", w.field || "", src.rows); } catch (e) { xv = NaN; } }
      var card = kpiCard(w.icon || "◈", w.style || "", w.label, fmt(xv), w.unit,
        (src ? src.title : "تبويب محذوف") + " · " + (w.agg || "count") + (w.field ? " (" + w.field + ")" : ""));
      if (src) {
        card.style.cursor = "pointer";
        card.onclick = function () { select(w.tabId); };
      }
      cards.push(card);
    } else if (w.type === "formula") {
      var val, sub = w.expr;
      try { val = fmt(E.evalExpr(w.expr, rows)); } catch (e) { val = "خطأ"; sub = e.message; }
      cards.push(kpiCard(w.icon || "ƒ", w.style || "sand", w.label, val, w.unit, sub));
    }
  });
  if (cards.length) {
    var g = el("div", { "class": "grid " + (cards.length >= 4 ? "g4" : (cards.length === 3 ? "g3" : "g2")) });
    cards.forEach(function (x) { g.appendChild(x); });
    c.appendChild(g);
  }

  widgets.forEach(function (w) {
    if (w.type === "note") {
      var p = panel("ملاحظة", w.label || "ملاحظة");
      p.appendChild(el("div", { "class": "hint" }, [w.text || ""]));
      c.appendChild(p); return;
    }
    if (w.type === "chart") {
      var p2 = panel("رسم بيانى", w.label || "رسم");
      try {
        var series = E.groupBy(rows, w.labelField, w.valueField, w.agg || "sum");
        if (!series.length) p2.appendChild(el("div", { "class": "empty" }, ["لا توجد بيانات للرسم."]));
        else p2.appendChild(el("div", { "class": "chart-box" }, [E.svgChart(series, w.chartType || "bar")]));
      } catch (e) { p2.appendChild(el("div", { "class": "empty" }, ["تعذّر الرسم: " + e.message])); }
      c.appendChild(p2); return;
    }
    if (w.type === "map") { c.appendChild(mapPanel(w, rows, t)); return; }
    if (w.type === "hydro") { c.appendChild(hydroPanel(w, rows, t)); return; }
    if (w.type === "design") { c.appendChild(designPanel(w, t)); return; }
    if (w.type === "overview") { c.appendChild(overviewPanel(w, t)); return; }
    if (w.type === "entity") { c.appendChild(entityPanel(w)); return; }
    if (w.type === "xchart") { c.appendChild(xchartPanel(w)); return; }
    if (w.type === "activity") { c.appendChild(activityPanel(w)); return; }
    if (w.type === "trend") { c.appendChild(trendPanel(w)); return; }
    if (w.type === "alerts") { c.appendChild(alertsPanel(w)); return; }
    if (w.type === "table") {
      var p3 = panel("جدول", w.label || "السجلات");
      var sBox = el("input", { type: "text", placeholder: "بحث فى السجلات… (اضغط / للانتقال هنا)", "class": "search" });
      sBox.value = FILTER;
      var counter = el("div", { "class": "hint" }, [""]);
      p3.appendChild(el("div", { "class": "fld", style: "margin-top:12px" }, [sBox]));
      p3.appendChild(counter);
      function matched() {
        var q = FILTER.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(function (r) {
          var hit = false;
          fields.forEach(function (f) {
            if (String(r[f.id] === undefined ? "" : r[f.id]).toLowerCase().indexOf(q) >= 0) hit = true;
          });
          return hit;
        });
      }
      var rowsView = matched();
      if (!rows.length) p3.appendChild(el("div", { "class": "empty" }, ["لا توجد سجلات بعد."]));
      else {
        var tb = el("table"), hr = el("tr");
        fields.forEach(function (f) { hr.appendChild(el("th", {}, [f.label + (f.unit ? " (" + f.unit + ")" : "")])); });
        var hasAlerts = toArr(t.alerts).length > 0;
        if (hasAlerts) hr.appendChild(el("th", {}, ["الإنذار"]));
        var editable = !(t.source && t.source.type === "sheet") && !offline;
        if (editable) hr.appendChild(el("th", {}, [""]));
        tb.appendChild(el("thead", {}, [hr]));
        var bd = el("tbody");
        var noHit = el("div", { "class": "empty", style: "display:none" }, ["لا نتائج مطابقة للبحث."]);
        function fillBody() {
          rowsView = matched();
          bd.innerHTML = "";
          counter.textContent = FILTER.trim() ? ("مطابق: " + rowsView.length + " من " + rows.length) : "";
          noHit.style.display = rowsView.length ? "none" : "block";
          buildRows();
        }
        /* البحث يحدّث جسم الجدول فقط — لا يعيد بناء التبويب،
           فلا يفقد مربع البحث تركيزه ولا تُعاد الخرائط والرسوم */
        sBox.oninput = function () { FILTER = sBox.value; fillBody(); };
        function buildRows() {
        rowsView.forEach(function (r) {
          var tr = el("tr");
          fields.forEach(function (f) { tr.appendChild(el("td", {}, [r[f.id] === undefined || r[f.id] === "" ? "—" : String(r[f.id])])); });
          if (hasAlerts) {
            var fired = E.rowAlerts(t, r);
            var ac = el("td");
            if (fired.length) {
              tr.className = "row-alert";
              fired.forEach(function (a) {
                ac.appendChild(el("span", { "class": "pill " + (a.level === "خطر" ? "danger" : "sand"), title: a.expr }, [a.msg || a.level]));
              });
            } else ac.appendChild(el("span", { "class": "pill green" }, ["سليم"]));
            tr.appendChild(ac);
          }
          if (editable) {
            var ed = el("button", { "class": "btn mini" }, ["تعديل"]);
            ed.onclick = function () { startEdit(t, r); };
            var del = el("button", { "class": "btn mini warn" + (isAdmin() ? "" : " off") }, ["حذف"]);
            del.onclick = function () {
              if (!isAdmin()) { denyMsg(); return; }
              if (!window.confirm("حذف هذا السجل نهائياً؟")) return;
              E.db.del(E.cfg.root + "/data/records/" + t.id + "/" + r.__key).then(function () {
                audit("حذف سجل من: " + t.title); renderTab(t); toast("اتحذف السجل");
              }).catch(function (e) { toast("فشل الحذف: " + e.message, true); });
            };
            tr.appendChild(el("td", {}, [ed, del]));
          }
          bd.appendChild(tr);
        });
        }
        buildRows();
        tb.appendChild(bd);
        p3.appendChild(el("div", { "class": "tbl-wrap" }, [tb]));
        p3.appendChild(noHit);
        if (FILTER.trim()) counter.textContent = "مطابق: " + rowsView.length + " من " + rows.length;
        var exp = el("button", { "class": "btn mini" }, ["تصدير CSV"]);
        exp.onclick = function () {
          var out = fields.map(function (f) { return "\u0022" + String(f.label).replace(/"/g, "\u0022\u0022") + "\u0022"; }).join(",") + "\n";
          rowsView.forEach(function (r) {
            out += fields.map(function (f) { return "\u0022" + String(r[f.id] === undefined ? "" : r[f.id]).replace(/"/g, "\u0022\u0022") + "\u0022"; }).join(",") + "\n";
          });
          /* BOM ليفتح إكسل العربية بالترميز الصحيح */
          E.downloadText(t.title + ".csv", "\uFEFF" + out, "text/csv;charset=utf-8");
        };
        p3.appendChild(el("div", { "class": "actions" }, [exp]));
      }
      c.appendChild(p3); return;
    }
  });

  drawForm(t, c, offline);
}

/* ---------------- التحقق من البيانات ---------------- */
function fieldRules(t, f) {
  var r = { required: !!f.required, min: f.min, max: f.max, geo: "" };
  /* نطاق الإحداثيات يُشتقّ من المخطط نفسه: أى حقل مستخدَم كخط عرض/طول
     يُقيَّد تلقائياً، حتى لو نسى المستخدم ضبط حدّيه */
  toArr(t.widgets).forEach(function (w) {
    if (w.type !== "map") return;
    if (w.latField === f.id) { r.min = -90; r.max = 90; r.geo = "خط عرض"; }
    if (w.lngField === f.id) { r.min = -180; r.max = 180; r.geo = "خط طول"; }
  });
  return r;
}
function ruleText(t, f) {
  var r = fieldRules(t, f), bits = [];
  if (r.required) bits.push("إلزامى");
  if (r.min !== undefined && r.min !== "" && r.min !== null) bits.push("أدنى " + r.min);
  if (r.max !== undefined && r.max !== "" && r.max !== null) bits.push("أقصى " + r.max);
  if (r.geo) bits.push(r.geo);
  return bits.join(" · ");
}
function validateRecord(t, rec) {
  var errs = [];
  toArr(t.fields).forEach(function (f) {
    var r = fieldRules(t, f), v = rec[f.id];
    var empty = (v === null || v === undefined || v === "");
    if (r.required && empty) { errs.push({ id: f.id, msg: f.label + ": حقل إلزامى" }); return; }
    if (empty) return;
    if (f.type === "number") {
      var n = parseFloat(v);
      if (isNaN(n)) { errs.push({ id: f.id, msg: f.label + ": القيمة ليست رقماً" }); return; }
      if (r.min !== undefined && r.min !== "" && r.min !== null && n < parseFloat(r.min)) {
        errs.push({ id: f.id, msg: f.label + ": " + n + " أقل من الحد الأدنى " + r.min + (r.geo ? " (" + r.geo + ")" : "") });
      }
      if (r.max !== undefined && r.max !== "" && r.max !== null && n > parseFloat(r.max)) {
        errs.push({ id: f.id, msg: f.label + ": " + n + " أكبر من الحد الأقصى " + r.max + (r.geo ? " (" + r.geo + ")" : "") });
      }
    }
  });
  return errs;
}

function startEdit(t, r) {
  if (!FORM) { toast("نموذج الإدخال غير متاح", true); return; }
  EDIT_KEY = r.__key;
  toArr(t.fields).forEach(function (f) {
    var v = r[f.id];
    var val = (v === undefined || v === null) ? "" : String(v);
    var inp = FORM.inputs[f.id];
    if (inp.getAttribute && inp.getAttribute("data-loading")) inp.setAttribute("data-want", val);
    else {
      inp.value = val;
      /* قيمة محفوظة لم تعد ضمن الخيارات (اتشالت من القائمة أو من التبويب المصدر):
         تُضاف كخيار بدل أن تضيع بصمت ويُكتب مكانها أول خيار عند الحفظ */
      if (inp.tagName === "SELECT" && val !== "" && inp.value !== val) {
        inp.appendChild(el("option", { value: val }, [val + " (قيمة محفوظة)"]));
        inp.value = val;
      }
    }
  });
  FORM.title.textContent = "تعديل سجل قائم";
  FORM.save.textContent = "حفظ التعديل";
  FORM.cancel.style.display = "inline-flex";
  if (FORM.box.scrollIntoView) FORM.box.scrollIntoView({ behavior: "smooth", block: "center" });
  toast("وضع التعديل — عدّل ثم احفظ");
}
function cancelEdit(t) {
  EDIT_KEY = null;
  if (!FORM) return;
  toArr(t.fields).forEach(function (f) { FORM.inputs[f.id].value = ""; });
  FORM.title.textContent = "إضافة سجل جديد";
  FORM.save.textContent = "حفظ السجل";
  FORM.cancel.style.display = "none";
}

function drawForm(t, c, offline) {
  var fields = toArr(t.fields);
  if (!fields.length) return;
  if (t.source && t.source.type === "sheet") return;
  if (offline) return;
  var fp = panel("إدخال", "إضافة سجل جديد");
  var frm = el("div", { "class": "frm" }), inputs = {};
  REF_ROWS = {};
  fields.forEach(function (f) {
    var inp;
    if (f.type === "ref") {
      /* مرجع لتبويب آخر: اختيار من قائمة بدل الكتابة الحرة —
         تُخزَّن القيمة المعروضة (فتظل الجداول والرسوم والتقارير تعمل كما هى)
         ومعها مفتاح السجل المصدر فى حقل مخفى للربط لاحقاً */
      var target = findTab(f.refTab);
      if (!target) {
        inp = el("input", { type: "text", placeholder: "التبويب المصدر محذوف — أدخل يدوياً" });
      } else {
        inp = el("select");
        inp.appendChild(el("option", { value: "" }, ["— اختر من " + target.title + " —"]));
        inp.setAttribute("data-loading", "1");
        (function (fld, tgt, sel) {
          E.loadRecords(tgt).then(function (res) {
            REF_ROWS[fld.id] = res.rows;
            var seen = {}, added = 0;
            res.rows.forEach(function (r) {
              var v = r[fld.refField];
              if (v === undefined || v === null || v === "") return;
              v = String(v);
              if (seen[v]) return;
              seen[v] = r.__key; added++;
              sel.appendChild(el("option", { value: v }, [v]));
            });
            sel.removeAttribute("data-loading");
            var want = sel.getAttribute("data-want");
            if (want) {
              sel.value = want;
              if (sel.value !== want) {
                sel.appendChild(el("option", { value: want }, [want + " (قيمة محفوظة)"]));
                sel.value = want;
              }
              sel.removeAttribute("data-want");
            }
            if (!added) {
              sel.appendChild(el("option", { value: "" }, ["(لا سجلات فى " + tgt.title + " بعد)"]));
            }
          }).catch(function (e) {
            sel.removeAttribute("data-loading");
            sel.appendChild(el("option", { value: "" }, ["تعذّر التحميل: " + e.message]));
          });
        })(f, target, inp);
      }
    } else if (f.type === "select") {
      inp = el("select");
      String(f.options || "").split(",").forEach(function (o) { o = o.trim(); if (o) inp.appendChild(el("option", { value: o }, [o])); });
    } else {
      inp = el("input", { type: (f.type === "number" ? "number" : (f.type === "date" ? "date" : "text")), step: "any" });
    }
    inputs[f.id] = inp;
    var rt = ruleText(t, f);
    frm.appendChild(el("div", { "class": "fld" }, [
      el("label", {}, [f.label + (f.unit ? " (" + f.unit + ")" : "") + (fieldRules(t, f).required ? " *" : "")]),
      inp,
      rt ? el("small", { "class": "rule" }, [rt]) : null
    ]));
  });
  fp.appendChild(frm);
  var errBox = el("div", { "class": "errbox", style: "display:none" });
  fp.appendChild(errBox);
  var save = el("button", { "class": "btn solid" }, ["حفظ السجل"]);
  var cancel = el("button", { "class": "btn", style: "display:none" }, ["إلغاء التعديل"]);
  cancel.onclick = function () { cancelEdit(t); };
  save.onclick = function () {
    var rec = {};
    fields.forEach(function (f) {
      var v = inputs[f.id].value;
      rec[f.id] = f.type === "number" ? (v === "" ? null : parseFloat(v)) : v;
      if (f.type === "ref" && v) {
        var hit = null;
        (REF_ROWS[f.id] || []).forEach(function (r) {
          if (!hit && String(r[f.refField]) === String(v)) hit = r;
        });
        if (hit) rec[f.id + "_key"] = hit.__key;
      }
    });
    rec.by = who();
    var errs = validateRecord(t, rec);
    fields.forEach(function (f) { inputs[f.id].classList.remove("bad"); });
    errBox.innerHTML = "";
    if (errs.length) {
      errs.forEach(function (e) {
        if (inputs[e.id]) inputs[e.id].classList.add("bad");
        errBox.appendChild(el("div", {}, ["• " + e.msg]));
      });
      errBox.style.display = "block";
      toast("التحقق منع الحفظ — " + errs.length + " مخالفة", true);
      return;
    }
    errBox.style.display = "none";
    var base = E.cfg.root + "/data/records/" + t.id;
    /* PATCH وقت التعديل: لا يدهس حقلاً أضافه غيرك للسجل نفسه */
    var op = EDIT_KEY ? E.db.patch(base + "/" + EDIT_KEY, rec) : E.db.post(base, rec);
    var wasEdit = !!EDIT_KEY;
    op.then(function () {
      audit((wasEdit ? "تعديل سجل فى: " : "سجل جديد فى: ") + t.title);
      EDIT_KEY = null;
      renderTab(t);
      toast(wasEdit ? "اتحفظ التعديل" : "اتحفظ السجل");
    }).catch(function (e) { toast("فشل الحفظ: " + e.message, true); });
  };
  FORM = { inputs: inputs, save: save, cancel: cancel, box: fp, title: fp.querySelector("h2") };
  fp.appendChild(el("div", { "class": "actions" }, [save, cancel]));
  c.appendChild(fp);
}

/* ---------------- الخريطة ---------------- */
function mapPanel(w, rows, tab) {
  var p = panel("خريطة", w.label || "الموقع");
  var box = el("div", { "class": "map-box", id: "map-" + w.id });
  p.appendChild(box);
  var pts = [];
  rows.forEach(function (r) {
    var la = parseFloat(r[w.latField]), ln = parseFloat(r[w.lngField]);
    if (!isNaN(la) && !isNaN(ln)) pts.push({ la: la, ln: ln, n: String(r[w.labelField] || "نقطة") });
  });
  var acts = el("div", { "class": "actions" });
  var kml = el("button", { "class": "btn mini" }, ["تصدير KML لجوجل إيرث"]);
  kml.onclick = function () {
    if (!pts.length) { toast("لا توجد إحداثيات صالحة", true); return; }
    E.downloadText((w.label || "layer") + ".kml", E.buildKML(rows, w, w.label), "application/vnd.google-earth.kml+xml");
    toast("نزّل الملف وافتحه بجوجل إيرث");
  };
  acts.appendChild(kml);
  if (pts.length) {
    var ge = el("a", { "class": "btn mini", target: "_blank", rel: "noopener", href: E.earthUrl(pts[0].la, pts[0].ln) }, ["افتح الموقع فى جوجل إيرث"]);
    acts.appendChild(ge);
  }
  p.appendChild(acts);
  p.appendChild(el("div", { "class": "hint" }, ["نقاط صالحة: " + pts.length + " من " + rows.length + " سجل"]));

  E.ensureLeaflet(function (err) {
    if (err) { box.innerHTML = ""; box.appendChild(el("div", { "class": "empty" }, [err.message])); return; }
    var base = E.BASEMAPS[w.base || "esri"] || E.BASEMAPS.esri;
    var m = L.map(box.id, { scrollWheelZoom: false });
    L.tileLayer(base.url, { attribution: base.attr, maxZoom: base.max }).addTo(m);
    if (w.gibsProduct && w.gibsDate) {
      L.tileLayer(E.gibsLayer(w.gibsProduct, w.gibsDate), { opacity: 0.75, attribution: "NASA GIBS" }).addTo(m);
    }
    if (pts.length) {
      var g = [];
      pts.forEach(function (pt) { g.push(L.marker([pt.la, pt.ln]).addTo(m).bindPopup(pt.n)); });
      m.fitBounds(L.featureGroup(g).getBounds().pad(0.25));
    } else {
      m.setView([w.lat || 30.0444, w.lng || 31.2357], w.zoom || 10);
    }
    setTimeout(function () { m.invalidateSize(); }, 250);
  });
  return p;
}

/* ---------------- الإدارة ---------------- */
function audit(action) {
  E.db.post(E.cfg.root + "/data/audit", { at: Date.now(), by: who(), action: action }).catch(function () { });
}
function pub(action) {
  E.publish(S, action, who(), function (err, sch) {
    if (err) { toast(err.message, true); return; }
    document.getElementById("st-ver").textContent = "إصدار المخطط " + sch.version;
    buildNav(); select(CUR); toast("تم النشر — إصدار " + sch.version);
  }).catch(function () { /* عولج فى الـcallback — يمنع unhandled rejection */ });
}
/* ---------------- أدوات المخطط: تركيب لوحة القيادة والتصدير والاستيراد ---------------- */
function hasDashboard() {
  var found = false;
  toArr(S.schema.tabs).forEach(function (t) {
    toArr(t.widgets).forEach(function (w) { if (isCross(w)) found = true; });
  });
  return found;
}
function autoDashboard() {
  /* تُبنى من التبويبات الموجودة فعلاً — تعمل على أى تطبيق قائم بمخطط سابق،
     لأن بذرة الملف لا تُطبَّق إلا على قاعدة فارغة */
  var src = toArr(S.schema.tabs);
  if (!src.length) { toast("أنشئ تبويباً واحداً على الأقل أولاً", true); return; }
  var widgets = [];
  src.forEach(function (t) {
    var k = null;
    toArr(t.widgets).forEach(function (w) { if (!k && (w.type === "kpi" || w.type === "formula")) k = w; });
    if (k && k.type === "kpi") {
      widgets.push({
        id: uid("w"), type: "xkpi", label: k.label + " — " + t.title, tabId: t.id,
        agg: k.agg || "count", field: k.field || "", unit: k.unit || "", icon: k.icon || "◈"
      });
    } else {
      widgets.push({
        id: uid("w"), type: "xkpi", label: "عدد سجلات " + t.title, tabId: t.id,
        agg: "count", field: "", unit: "سجل", icon: "#", style: "green"
      });
    }
  });
  widgets.push({ id: uid("w"), type: "overview", label: "حالة كل التبويبات" });
  /* أول تبويب فيه حقل نصى وحقل رقمى يصلح لرسم مجمّع */
  var chartDone = false;
  src.forEach(function (t) {
    if (chartDone) return;
    var txt = null, num = null;
    toArr(t.fields).forEach(function (f) {
      if (!txt && f.type === "text") txt = f.id;
      if (!num && f.type === "number") num = f.id;
    });
    if (txt && num) {
      widgets.push({
        id: uid("w"), type: "xchart", label: "تجميع " + t.title, tabId: t.id,
        labelField: txt, valueField: num, agg: "sum", chartType: "bar"
      });
      chartDone = true;
    }
  });
  widgets.push({ id: uid("w"), type: "activity", label: "آخر الحركات على التطبيق", limit: 8 });
  var tab = {
    id: uid("tab"), icon: "◱", eyebrow: "نظرة المدير", title: "لوحة القيادة",
    source: { type: "firebase" }, fields: [], widgets: widgets
  };
  S.schema.tabs = [tab].concat(src);
  CUR = tab.id;
  pub("تركيب لوحة القيادة تلقائياً");
}
function exportSchema() {
  E.downloadText(APP.id + "-schema-v" + (S.schema.version || 0) + ".json",
    JSON.stringify(S.schema, null, 2), "application/json;charset=utf-8");
  toast("نزّل ملف المخطط");
}
function importSchema(file, done) {
  var fr = new FileReader();
  fr.onload = function () {
    var obj = null;
    try { obj = JSON.parse(fr.result); } catch (e) { toast("الملف ليس JSON سليماً", true); return; }
    if (!obj || !obj.tabs || !toArr(obj.tabs).length) { toast("الملف لا يحوى تبويبات", true); return; }
    if (!window.confirm("استبدال بنية التطبيق الحالية بـ" + toArr(obj.tabs).length + " تبويب من الملف؟\n\nالسجلات لا تُمسّ، والنسخة الحالية تُحفظ فى سجل التغييرات ويمكن الرجوع إليها.")) return;
    S.schema.tabs = toArr(obj.tabs);
    pub("استيراد مخطط من ملف");
    if (done) done();
  };
  fr.onerror = function () { toast("تعذّرت قراءة الملف", true); };
  fr.readAsText(file);
}

/* ---------------- واجهة معالج بناء التبويب ---------------- */
var WIZ = null;   /* {step, ans, preview} */
var TPL_GROUP = "";   /* مرشّح مجال القوالب */
var ADMIN_CFG = null; /* إعدادات بوابة الإدارة من القاعدة */
var ADMIN_LOADED = false;
var REF_ROWS = {};    /* سجلات التبويبات المرجعية للنموذج الحالى */
/* المسؤول = لا حماية مفعّلة، أو مفعّلة وجلسته مفتوحة.
   يُستدعى قبل كل إجراء مقيَّد (الرجوع لنسخة · حذف السجلات). */
/* حتى تكتمل قراءة إعدادات الصلاحيات لا يُعتبر أحد مسؤولاً — الفشل مغلقاً لا مفتوحاً */
var ADMIN_READY = false;
var ADMIN_ERR = false, ADMIN_ERR_MSG = ""; /* فشلت قراءة الإعدادات — يفشل الحارس مغلقاً */
function isAdmin() {
  if (!ADMIN_READY || ADMIN_ERR) return false;
  return !E.gate.isSet(ADMIN_CFG) || E.gate.isUnlocked();
}
function ensureAdminCfg(cb) {
  if (ADMIN_READY || ADMIN_LOADED) { cb(); return; }
  ADMIN_LOADED = true;
  E.gate.load().then(function (cfg) { ADMIN_CFG = cfg; ADMIN_READY = true; cb(); })
    .catch(function () { ADMIN_CFG = null; ADMIN_READY = true; ADMIN_ERR = true; cb(); });
}
function denyMsg() {
  if (ADMIN_ERR) { toast("تعذّر التحقق من الصلاحيات (فشلت قراءة الإعدادات) — افتح شاشة الإدارة واضغط «إعادة المحاولة»", true); return; }
  toast("الإجراء ده مقصور على المسؤول — افتح شاشة الإدارة بكلمة السر", true);
}
function wizardPanel() {
  var p = panel("معالج", "بناء تبويب بالأسئلة");
  if (!WIZ) {
    p.appendChild(el("div", { "class": "hint" }, [
      "خمسة أسئلة بأزرار، ويولّد لك التبويب كاملاً بحقوله وحدود تحققها ومؤشراته ورسومه — تعاينه قبل التركيب. يعمل بلا إنترنت خارجى وبلا مفاتيح."
    ]));
    var go = el("button", { "class": "btn solid" }, ["ابدأ المعالج"]);
    go.onclick = function () { WIZ = { step: 0, ans: {}, preview: null }; renderAdmin(); };
    p.appendChild(el("div", { "class": "actions" }, [go]));
    return p;
  }

  var steps = E.wizSteps(WIZ.ans);
  /* المعاينة */
  if (WIZ.preview) {
    var t = WIZ.preview;
    p.appendChild(el("div", { "class": "wiz-bar" }, [el("span", {}, ["المعاينة قبل التركيب"])]));
    p.appendChild(el("div", { "class": "adm-row" }, [
      el("span", { "class": "nav-icon" }, [t.icon]),
      el("span", { "class": "t" }, [t.title]),
      el("span", { "class": "m" }, [toArr(t.fields).length + " حقل · " + toArr(t.widgets).length + " عنصر"])
    ]));
    var fl = el("div", { "class": "sub-panel" }, [el("h3", {}, ["الحقول"])]);
    toArr(t.fields).forEach(function (f) {
      var bits = [];
      if (f.required) bits.push("إلزامى");
      if (f.min !== undefined && f.min !== "") bits.push("أدنى " + f.min);
      if (f.max !== undefined && f.max !== "") bits.push("أقصى " + f.max);
      fl.appendChild(el("div", { "class": "adm-row" }, [
        el("span", { "class": "pill lake" }, [f.type]),
        el("span", { "class": "t" }, [f.label]),
        el("span", { "class": "m" }, [f.id + (f.unit ? " · " + f.unit : "") + (bits.length ? " · " + bits.join(" · ") : "")])
      ]));
    });
    p.appendChild(fl);
    var wl = el("div", { "class": "sub-panel" }, [el("h3", {}, ["العناصر"])]);
    toArr(t.widgets).forEach(function (w) {
      wl.appendChild(el("div", { "class": "adm-row" }, [
        el("span", { "class": "pill sand" }, [(E.WIDGETS[w.type] || { name: w.type }).name]),
        el("span", { "class": "t" }, [w.label || "—"])
      ]));
    });
    p.appendChild(wl);
    if (t.notes) p.appendChild(el("div", { "class": "hint" }, ["ملاحظة: " + t.notes]));
    var ok = el("button", { "class": "btn solid" }, ["تركيب التبويب وانشر"]);
    ok.onclick = function () {
      var tab = WIZ.preview;
      delete tab.notes;
      S.schema.tabs = toArr(S.schema.tabs).concat([tab]);
      ADM_TAB = tab.id; WIZ = null;
      pub("تبويب من المعالج: " + tab.title);
    };
    var back = el("button", { "class": "btn" }, ["رجوع للأسئلة"]);
    back.onclick = function () { WIZ.preview = null; WIZ.step = 0; renderAdmin(); };
    var cancel = el("button", { "class": "btn warn" }, ["إلغاء"]);
    cancel.onclick = function () { WIZ = null; renderAdmin(); };
    p.appendChild(el("div", { "class": "actions" }, [ok, back, cancel]));
    return p;
  }

  /* السؤال الحالى */
  var q = steps[WIZ.step];
  if (!q) {
    WIZ.preview = E.wizardTab(WIZ.ans);
    return wizardPanel();
  }
  /* عدد الأسئلة يتحدّد بعد إجابة السؤال الأول (نوع التبويب) — فلا يُعرض قبلها */
  p.appendChild(el("div", { "class": "wiz-bar" }, [
    el("span", {}, [WIZ.ans.kind ? ("سؤال " + (WIZ.step + 1) + " من " + steps.length) : "السؤال الأول"]),
    el("span", { "class": "sp" }),
    el("span", { "class": "m" }, [Object.keys(WIZ.ans).length + " إجابة"])
  ]));
  p.appendChild(el("h2", { "class": "wiz-q" }, [q.q]));

  if (q.type === "text") {
    var inp = el("input", { type: "text", placeholder: q.ph || "", value: WIZ.ans[q.id] || "" });
    var nx = el("button", { "class": "btn solid" }, ["التالى"]);
    nx.onclick = function () {
      if (!inp.value.trim()) { toast("اكتب إجابة أولاً", true); return; }
      WIZ.ans[q.id] = inp.value.trim(); WIZ.step++; renderAdmin();
    };
    p.appendChild(el("div", { "class": "frm" }, [el("div", { "class": "fld" }, [inp])]));
    p.appendChild(el("div", { "class": "actions" }, [nx]));
  } else {
    var wrap = el("div", { "class": "wiz-opts" });
    q.opts.forEach(function (o) {
      var b = el("button", { "class": "wiz-opt" + (WIZ.ans[q.id] === o[0] ? " on" : "") }, [o[1]]);
      b.onclick = function () { WIZ.ans[q.id] = o[0]; WIZ.step++; renderAdmin(); };
      wrap.appendChild(b);
    });
    p.appendChild(wrap);
  }
  var acts = [];
  if (WIZ.step > 0) {
    var bk = el("button", { "class": "btn" }, ["السابق"]);
    bk.onclick = function () { WIZ.step--; renderAdmin(); };
    acts.push(bk);
  }
  var cn = el("button", { "class": "btn warn" }, ["إلغاء المعالج"]);
  cn.onclick = function () { WIZ = null; renderAdmin(); };
  acts.push(cn);
  p.appendChild(el("div", { "class": "actions" }, acts));
  return p;
}

/* ---------------- بوابة الإدارة: شاشة القفل والفتح ---------------- */
function lockPanel() {
  var p = panel("محمية", "شاشة الإدارة مقفولة");
  p.appendChild(el("div", { "class": "hint" }, [
    "إضافة التبويبات وحذفها وتعديل الحقول والعناصر تحتاج كلمة سر المسؤول. "
    + "الاطّلاع وإدخال السجلات وتعديلها يظلّان متاحين للجميع."
  ]));
  var wait = E.gate.lockedFor();
  if (wait) {
    p.appendChild(el("div", { "class": "errbox" }, ["• محاولات خاطئة متتالية — أعد المحاولة بعد " + wait + " ثانية"]));
    return p;
  }
  var inp = el("input", { type: "password", placeholder: "كلمة السر" });
  var msg = el("div", { "class": "errbox", style: "display:none" });
  var go = el("button", { "class": "btn solid" }, ["فتح"]);
  function tryOpen() {
    if (!inp.value) { toast("اكتب كلمة السر", true); return; }
    go.textContent = "جارٍ التحقق…";
    E.gate.verify(inp.value, ADMIN_CFG).then(function (ok) {
      go.textContent = "فتح";
      if (ok) {
        E.gate.resetFails(); E.gate.unlock(12);
        toast("اتفتحت شاشة الإدارة — الجلسة ١٢ ساعة");
        renderAdmin();
        return;
      }
      var w = E.gate.noteFail();
      msg.innerHTML = "";
      msg.appendChild(el("div", {}, [w ? ("• كلمة سر خاطئة — قُفل الإدخال " + w + " ثانية") : "• كلمة سر خاطئة"]));
      msg.style.display = "block";
      inp.value = "";
      if (w) renderAdmin();
    }).catch(function (e) {
      go.textContent = "فتح";
      msg.innerHTML = ""; msg.appendChild(el("div", {}, ["• " + e.message])); msg.style.display = "block";
    });
  }
  go.onclick = tryOpen;
  inp.onkeydown = function (e) { if (e.key === "Enter") tryOpen(); };
  p.appendChild(el("div", { "class": "frm" }, [el("div", { "class": "fld" }, [el("label", {}, ["كلمة السر"]), inp])]));
  p.appendChild(msg);
  p.appendChild(el("div", { "class": "actions" }, [go]));
  return p;
}

function gateAdminPanel() {
  var isSet = E.gate.isSet(ADMIN_CFG);
  var p = panel("الصلاحيات", isSet ? "حماية شاشة الإدارة مفعّلة" : "حماية شاشة الإدارة غير مفعّلة");
  if (isSet) {
    p.appendChild(el("div", { "class": "hint" }, [
      "مفعّلة منذ " + when(ADMIN_CFG.setAt) + " · الجلسة الحالية تنتهى بعد " + E.gate.sessionLeft() + " دقيقة."
    ]));
  } else {
    p.appendChild(el("div", { "class": "hint" }, [
      "أى مستخدم يقدر حالياً يضيف تبويباً أو يحذفه. عيّن كلمة سر ليصير ذلك مقصوراً عليك."
    ]));
  }
  var p1 = el("input", { type: "password", placeholder: isSet ? "كلمة السر الجديدة" : "كلمة السر" });
  var p2 = el("input", { type: "password", placeholder: "تأكيد كلمة السر" });
  var cur = el("input", { type: "password", placeholder: "كلمة السر الحالية" });
  var flds = [];
  if (isSet) flds.push(el("div", { "class": "fld" }, [el("label", {}, ["كلمة السر الحالية"]), cur]));
  flds.push(el("div", { "class": "fld" }, [el("label", {}, [isSet ? "الجديدة" : "كلمة السر"]), p1]));
  flds.push(el("div", { "class": "fld" }, [el("label", {}, ["التأكيد"]), p2]));
  p.appendChild(el("div", { "class": "frm" }, flds));

  function withCurrent(next) {
    if (!isSet) return next();
    E.gate.verify(cur.value, ADMIN_CFG).then(function (ok) {
      if (!ok) { toast("كلمة السر الحالية غير صحيحة", true); return; }
      next();
    }).catch(function (e) { toast(e.message, true); });
  }
  var setBtn = el("button", { "class": "btn solid" }, [isSet ? "تغيير كلمة السر" : "تفعيل الحماية"]);
  setBtn.onclick = function () {
    if (p1.value !== p2.value) { toast("التأكيد لا يطابق", true); return; }
    withCurrent(function () {
      setBtn.textContent = "جارٍ الحفظ…";
      E.gate.setPassword(p1.value).then(function () {
        E.gate.unlock(12);
        toast(isSet ? "اتغيّرت كلمة السر" : "اتفعّلت الحماية — الإضافة والحذف بقت مقصورة عليك");
        audit(isSet ? "تغيير كلمة سر الإدارة" : "تفعيل حماية شاشة الإدارة");
        return E.gate.load().then(function (c) { ADMIN_CFG = c; renderAdmin(); }).catch(function (e2) { toast("اتحفظت الحماية — لكن تعذّرت إعادة قراءة الإعدادات: " + e2.message, true); });
      }).catch(function (e) { setBtn.textContent = isSet ? "تغيير كلمة السر" : "تفعيل الحماية"; toast(e.message, true); });
    });
  };
  var acts = [setBtn];
  if (isSet) {
    var lockBtn = el("button", { "class": "btn" }, ["اقفل الآن"]);
    lockBtn.onclick = function () { E.gate.lock(); toast("اتقفلت الشاشة"); renderAdmin(); };
    var offBtn = el("button", { "class": "btn warn" }, ["إلغاء الحماية"]);
    offBtn.onclick = function () {
      withCurrent(function () {
        if (!window.confirm("إلغاء الحماية يعيد فتح إضافة التبويبات وحذفها لأى مستخدم. متأكد؟")) return;
        E.gate.clear().then(function () {
          ADMIN_CFG = null; audit("إلغاء حماية شاشة الإدارة");
          toast("اتلغت الحماية"); renderAdmin();
        }).catch(function (e) { toast(e.message, true); });
      });
    };
    acts.push(lockBtn, offBtn);
  }
  p.appendChild(el("div", { "class": "actions" }, acts));
  p.appendChild(el("div", { "class": "hint" }, [
    "تُخزَّن بصمة PBKDF2-SHA256 (٢٠٠٠٠٠ دورة) لا كلمة السر نفسها، وتُضبط مرة وتسرى على كل الأجهزة. "
    + "وبصراحة: قواعد القاعدة مفتوحة، فمن يعرف عنوانها يكتب فيها مباشرة بلا مرور على هذه الشاشة — "
    + "البوابة تنظّم الصلاحيات وتردع، ولا تُغنى عن إغلاق القواعد."
  ]));
  return p;
}

function renderAdmin() {
  var c = document.getElementById("content"); c.innerHTML = "";

  /* الفشل مغلقاً: قبل اكتمال قراءة الإعدادات لا تُعرض أدوات البنية —
     كانت الشاشة تنفتح كاملة لثانية لو فُتحت قبل وصول الإعدادات من القاعدة */
  if (!ADMIN_READY) {
    c.appendChild(el("div", { "class": "empty" }, ["جارٍ قراءة إعدادات الصلاحيات…"]));
    if (!ADMIN_LOADED) {
      ADMIN_LOADED = true;
      E.gate.load().then(function (cfg) { ADMIN_CFG = cfg; ADMIN_READY = true; ADMIN_ERR = false; renderAdmin(); })
        .catch(function (e) { ADMIN_CFG = null; ADMIN_READY = true; ADMIN_ERR = true; ADMIN_ERR_MSG = e && e.message ? e.message : "تعذّر الاتصال"; renderAdmin(); });
    }
    return;
  }
  /* تعذّرت قراءة الإعدادات: الفشل مغلقاً — لا أدوات بنية بلا تحقق، مع زر إعادة محاولة */
  if (ADMIN_ERR) {
    var epE = panel("تعذّر التحقق من الصلاحيات", "إعدادات البوابة لم تُقرأ");
    epE.appendChild(el("div", { "class": "hint" }, ["نص الخطأ: " + (ADMIN_ERR_MSG || "غير معروف") + " — أدوات البنية والرجوع لنسخة وحذف السجلات موقوفة لحين التحقق."]));
    var rbE = el("button", { "class": "btn solid" }, ["إعادة المحاولة"]);
    rbE.onclick = function () { ADMIN_LOADED = false; ADMIN_READY = false; ADMIN_ERR = false; renderAdmin(); };
    epE.appendChild(el("div", { "class": "actions" }, [rbE]));
    c.appendChild(epE);
    return;
  }
  /* البوابة مفعّلة والجلسة مقفولة: لا تُعرض أدوات البنية إطلاقاً */
  if (E.gate.isSet(ADMIN_CFG) && !E.gate.isUnlocked()) {
    c.appendChild(lockPanel());
    return;
  }
  c.appendChild(gateAdminPanel());

  var nameInp = el("input", { type: "text", value: who() === "مستخدم غير مسمّى" ? "" : who(), placeholder: "اكتب اسمك" });
  var nb = el("button", { "class": "btn" }, ["حفظ الاسم"]);
  nb.onclick = function () { localStorage.setItem(APP.id + "_user", nameInp.value || "مستخدم غير مسمّى"); toast("اتسجّل الاسم"); };
  var idp = panel("الهوية", "مين بيعدّل؟");
  idp.appendChild(el("div", { "class": "hint" }, ["الاسم بيتسجّل مع كل تعديل فى سجل التغييرات."]));
  idp.appendChild(el("div", { "class": "frm" }, [el("div", { "class": "fld" }, [el("label", {}, ["اسمك"]), nameInp])]));
  idp.appendChild(el("div", { "class": "actions" }, [nb]));
  c.appendChild(idp);

  var tools = panel("أدوات", "لوحة القيادة والنسخ");
  var dashBtn = el("button", { "class": "btn solid" }, [hasDashboard() ? "إعادة تركيب لوحة القيادة" : "تركيب لوحة القيادة تلقائياً"]);
  dashBtn.onclick = function () {
    if (hasDashboard() && !window.confirm("يوجد بالفعل تبويب فيه عناصر لوحة قيادة. إضافة لوحة جديدة فى المقدمة؟")) return;
    autoDashboard();
  };
  var expBtn = el("button", { "class": "btn" }, ["تصدير المخطط JSON"]);
  expBtn.onclick = exportSchema;
  var impInput = el("input", { type: "file", accept: ".json,application/json", style: "display:none" });
  impInput.onchange = function () { if (impInput.files && impInput.files[0]) importSchema(impInput.files[0]); };
  var impBtn = el("button", { "class": "btn" }, ["استيراد مخطط من ملف"]);
  impBtn.onclick = function () { impInput.click(); };
  tools.appendChild(el("div", { "class": "hint" }, [
    "بذرة التطبيق لا تُطبَّق إلا على قاعدة فارغة — التطبيق القائم يحتفظ بمخططه المنشور. "
    + "لتركيب لوحة قيادة على تطبيق موجود استخدم الزر الأول: يبنيها من تبويباتك الحالية وينشرها كإصدار جديد قابل للتراجع."
  ]));
  var snapBtn = el("button", { "class": "btn" }, ["خُد لقطة مؤشرات الآن"]);
  snapBtn.onclick = function () {
    snapBtn.textContent = "جارٍ أخذ اللقطة…";
    E.takeSnapshot(S.schema, who()).then(function (n) {
      snapBtn.textContent = "خُد لقطة مؤشرات الآن";
      toast("اتسجّلت لقطة بـ" + n + " مؤشر");
      audit("لقطة مؤشرات يدوية");
    }).catch(function (e) {
      snapBtn.textContent = "خُد لقطة مؤشرات الآن";
      toast("فشلت اللقطة: " + e.message, true);
    });
  };
  tools.appendChild(el("div", { "class": "actions" }, [dashBtn, expBtn, impBtn, snapBtn, impInput]));
  c.appendChild(tools);

  c.appendChild(wizardPanel());

  /* قوالب جاهزة — تُركَّب على المخطط القائم */
  var tplPanel = panel("قوالب جاهزة", "تبويبات أعمال المجارى المائية");
  tplPanel.appendChild(el("div", { "class": "hint" }, [
    "قوالب لكل المجالات: رى وتشغيل · هيدروليك · متابعة أعمال · حصر · موارد بشرية · متابعة إدارية. كل قالب بنية جاهزة بحقولها وحدود تحققها ومؤشراتها ورسومها — بلا أى بيانات. يُضاف كتبويب وينشر إصداراً قابلاً للتراجع، ثم عدّله كما تشاء."
  ]));
  /* القوالب مجمّعة بالمجال، مع مرشّح سريع */
  var groups = [], byGroup = {};
  E.toArr(E.TEMPLATES).forEach(function (tpl) {
    var g = tpl.group || "أخرى";
    if (!byGroup[g]) { byGroup[g] = []; groups.push(g); }
    byGroup[g].push(tpl);
  });
  var chips = el("div", { "class": "chips" });
  var listBox = el("div");
  function drawTpl() {
    listBox.innerHTML = "";
    groups.forEach(function (g) {
      if (TPL_GROUP && TPL_GROUP !== g) return;
      listBox.appendChild(el("div", { "class": "grp-title" }, [g + " (" + byGroup[g].length + ")"]));
      byGroup[g].forEach(function (tpl) {
        var b = el("button", { "class": "btn mini solid" }, ["تركيب"]);
        b.onclick = function () {
          var t = tpl.build({ tabs: toArr(S.schema.tabs) });
          if (!t || t.error) { toast(t && t.error ? t.error : "تعذّر بناء القالب", true); return; }
          S.schema.tabs = toArr(S.schema.tabs).concat([t]);
          ADM_TAB = t.id;
          pub("تركيب قالب: " + tpl.name);
        };
        listBox.appendChild(el("div", { "class": "adm-row" }, [
          el("span", { "class": "pill lake" }, [g]),
          el("span", { "class": "t" }, [tpl.name]),
          el("span", { "class": "m", style: "max-width:100%" }, [tpl.desc]),
          el("span", { "class": "sp" }), b
        ]));
      });
    });
  }
  ["الكل"].concat(groups).forEach(function (g) {
    var val = g === "الكل" ? "" : g;
    var ch = el("button", { "class": "chip" + (TPL_GROUP === val ? " on" : "") }, [g]);
    ch.onclick = function () { TPL_GROUP = val; renderAdmin(); };
    chips.appendChild(ch);
  });
  tplPanel.appendChild(chips);
  tplPanel.appendChild(listBox);
  drawTpl();
  c.appendChild(tplPanel);

  var tp = panel("البنية", "التبويبات الحالية");
  toArr(S.schema.tabs).forEach(function (t) {
    var open = el("button", { "class": "btn mini" }, [ADM_TAB === t.id ? "إغلاق" : "فتح البناء"]);
    open.onclick = function () { ADM_TAB = (ADM_TAB === t.id ? null : t.id); renderAdmin(); };
    var del = el("button", { "class": "btn mini warn" }, ["حذف"]);
    del.onclick = function () {
      var n = (RECS[t.id] || []).length;
      var msg = "حذف تبويب «" + t.title + "» نهائياً؟\n\n";
      msg += "سيختفى عند كل المستخدمين: " + toArr(t.fields).length + " حقل و" + toArr(t.widgets).length + " عنصر.\n";
      msg += n ? ("سجلاته (" + n + " سجل على الأقل) تبقى فى القاعدة لكن بلا واجهة تعرضها.\n") : "";
      msg += "\nيمكن التراجع من «سجل التغييرات».";
      if (!window.confirm(msg)) return;
      S.schema.tabs = toArr(S.schema.tabs).filter(function (x) { return x.id !== t.id; });
      ADM_TAB = null; CUR = "__admin"; pub("حذف تبويب: " + t.title);
    };
    tp.appendChild(el("div", { "class": "adm-row" }, [
      el("span", { "class": "nav-icon" }, [t.icon || "▣"]),
      el("span", { "class": "t" }, [t.title]),
      el("span", { "class": "m" }, [toArr(t.fields).length + " حقل · " + toArr(t.widgets).length + " عنصر · " + ((t.source && t.source.type === "sheet") ? "Google Sheet" : "قاعدة الوزارة")]),
      el("span", { "class": "sp" }), open, del
    ]));
    if (ADM_TAB === t.id) tp.appendChild(tabEditor(t));
  });

  var nt = el("input", { type: "text", placeholder: "مثال: متابعة البوابات" });
  var ni = el("input", { type: "text", placeholder: "رمز مثل ⚑", maxlength: "2" });
  var ne = el("input", { type: "text", placeholder: "سطر صغير فوق العنوان" });
  var add = el("button", { "class": "btn solid" }, ["أضف تبويباً وانشر"]);
  add.onclick = function () {
    if (!nt.value.trim()) { toast("اكتب اسم التبويب", true); return; }
    var t = { id: uid("tab"), icon: ni.value || "▣", eyebrow: ne.value || "قسم", title: nt.value.trim(), fields: [], widgets: [], source: { type: "firebase" } };
    S.schema.tabs = toArr(S.schema.tabs).concat([t]); ADM_TAB = t.id;
    pub("تبويب جديد: " + t.title);
  };
  tp.appendChild(el("div", { "class": "sub-panel" }, [
    el("h3", {}, ["تبويب جديد"]),
    el("div", { "class": "frm" }, [
      el("div", { "class": "fld" }, [el("label", {}, ["العنوان"]), nt]),
      el("div", { "class": "fld" }, [el("label", {}, ["الأيقونة"]), ni]),
      el("div", { "class": "fld" }, [el("label", {}, ["السطر العلوى"]), ne])
    ]),
    el("div", { "class": "actions" }, [add])
  ]));
  c.appendChild(tp);
}

function tabEditor(t) {
  var box = el("div", { "class": "sub-panel" });
  box.appendChild(el("h3", {}, ["بناء تبويب: " + t.title]));

  /* --- مصدر البيانات --- */
  var srcSel = el("select");
  [["firebase", "قاعدة الوزارة (إدخال من التطبيق)"], ["sheet", "Google Sheet (قراءة فقط)"]].forEach(function (o) {
    var op = el("option", { value: o[0] }, [o[1]]);
    if ((t.source && t.source.type) === o[0]) op.setAttribute("selected", "selected");
    srcSel.appendChild(op);
  });
  var shUrl = el("input", { type: "text", placeholder: "الصق رابط الجدول", value: (t.source && t.source.url) || "" });
  var shName = el("input", { type: "text", placeholder: "اسم الورقة (اختيارى)", value: (t.source && t.source.sheet) || "" });
  var readBtn = el("button", { "class": "btn" }, ["اقرأ الأعمدة"]);
  var colBox = el("div", { "class": "hint" }, ["اضغط «اقرأ الأعمدة» بعد لصق الرابط — الأعمدة هتتحوّل لحقول تلقائياً."]);
  readBtn.onclick = function () {
    E.loadSheet({ url: shUrl.value, sheet: shName.value }).then(function (r) {
      colBox.textContent = "الأعمدة: " + r.head.join(" · ") + "  —  صفوف: " + r.rows.length;
      var mkBtn = el("button", { "class": "btn mini solid" }, ["حوّل الأعمدة لحقول وانشر"]);
      mkBtn.onclick = function () {
        t.source = { type: "sheet", url: shUrl.value, sheet: shName.value };
        t.fields = r.head.map(function (h, i) {
          var key = h.trim().replace(/[^A-Za-z0-9_]/g, "") || ("c" + i);
          var numeric = r.rows.length && !isNaN(parseFloat(r.rows[0][h]));
          return { id: h, label: h, type: numeric ? "number" : "text", unit: "" };
        });
        pub("ربط تبويب " + t.title + " بجوجل شيت");
      };
      colBox.appendChild(el("div", { "class": "actions" }, [mkBtn]));
    }).catch(function (e) { colBox.textContent = "فشل: " + e.message; });
  };
  var saveSrc = el("button", { "class": "btn" }, ["حفظ المصدر وانشر"]);
  saveSrc.onclick = function () {
    t.source = srcSel.value === "sheet"
      ? { type: "sheet", url: shUrl.value, sheet: shName.value }
      : { type: "firebase" };
    pub("تغيير مصدر بيانات " + t.title);
  };
  box.appendChild(el("div", { "class": "frm" }, [
    el("div", { "class": "fld" }, [el("label", {}, ["مصدر البيانات"]), srcSel]),
    el("div", { "class": "fld" }, [el("label", {}, ["رابط Google Sheet"]), shUrl]),
    el("div", { "class": "fld" }, [el("label", {}, ["اسم الورقة"]), shName])
  ]));
  box.appendChild(el("div", { "class": "actions" }, [readBtn, saveSrc]));
  box.appendChild(colBox);
  box.appendChild(el("div", { "class": "hint" }, ["الجدول لازم يكون منشوراً: ملف ← مشاركة ← نشر على الويب. غير كده هيرجع خطأ صلاحيات."]));

  /* --- الحقول --- */
  toArr(t.fields).forEach(function (f) {
    var d = el("button", { "class": "btn mini warn" }, ["حذف"]);
    d.onclick = function () {
      /* الحقل قد تعتمد عليه عناصر أخرى — تُذكر بالاسم قبل الحذف */
      var dep = [];
      toArr(t.widgets).forEach(function (w) {
        var used = (w.field === f.id) || (w.labelField === f.id) || (w.valueField === f.id) ||
          (w.latField === f.id) || (w.lngField === f.id) ||
          (w.type === "formula" && String(w.expr || "").indexOf(f.id) >= 0);
        if (used) dep.push((E.WIDGETS[w.type] || { name: w.type }).name + ": " + (w.label || "—"));
      });
      var msg = "حذف حقل «" + f.label + "»؟\n\n";
      msg += dep.length
        ? ("عناصر ستتعطّل أو تفرغ:\n- " + dep.join("\n- ") + "\n")
        : "لا يوجد عنصر يعتمد عليه.\n";
      msg += "\nالقيم المسجّلة فى هذا الحقل تبقى فى السجلات لكن تختفى من الجداول.";
      if (!window.confirm(msg)) return;
      t.fields = toArr(t.fields).filter(function (x) { return x.id !== f.id; });
      pub("حذف حقل (" + f.label + ") من " + t.title);
    };
    box.appendChild(el("div", { "class": "adm-row" }, [
      el("span", { "class": "pill lake" }, ["حقل"]),
      el("span", { "class": "t" }, [f.label]),
      el("span", { "class": "m" }, [f.id + " · " + (f.type === "ref"
        ? ("مرجع → " + ((findTab(f.refTab) || { title: "تبويب محذوف" }).title) + "." + f.refField)
        : f.type) + (f.unit ? " · " + f.unit : "") + (ruleText(t, f) ? " · " + ruleText(t, f) : "")]),
      el("span", { "class": "sp" }), d
    ]));
  });
  var fl = el("input", { type: "text", placeholder: "مثال: التصرف" });
  var fk = el("input", { type: "text", placeholder: "مفتاح إنجليزى مثل q", maxlength: "18" });
  var ft = el("select");
  [["text", "نص"], ["number", "رقم"], ["date", "تاريخ"], ["select", "قائمة"], ["ref", "مرجع لتبويب آخر"]].forEach(function (o) { ft.appendChild(el("option", { value: o[0] }, [o[1]])); });
  /* إعداد المرجع: التبويب المصدر + الحقل الذى يظهر للمستخدم */
  var fref = el("select");
  toArr(S.schema.tabs).forEach(function (o) {
    if (o.id !== t.id) fref.appendChild(el("option", { value: o.id }, [o.title]));
  });
  if (!fref.childNodes.length) fref.appendChild(el("option", { value: "" }, ["— لا تبويبات أخرى —"]));
  var frefF = el("select");
  function buildRefFields() {
    frefF.innerHTML = "";
    var tgt = null;
    toArr(S.schema.tabs).forEach(function (o) { if (o.id === fref.value) tgt = o; });
    toArr(tgt ? tgt.fields : []).forEach(function (f2) {
      if (f2.type === "number") return;
      frefF.appendChild(el("option", { value: f2.id }, [f2.label]));
    });
    if (!frefF.childNodes.length) frefF.appendChild(el("option", { value: "" }, ["— لا حقول نصية —"]));
  }
  fref.onchange = buildRefFields;
  buildRefFields();
  var fu = el("input", { type: "text", placeholder: "م³/ث" });
  var fo = el("input", { type: "text", placeholder: "للقائمة: قيمة، قيمة" });
  var freq = el("select");
  [["", "اختيارى"], ["1", "إلزامى"]].forEach(function (o) { freq.appendChild(el("option", { value: o[0] }, [o[1]])); });
  var fmin = el("input", { type: "number", step: "any", placeholder: "بلا حد" });
  var fmax = el("input", { type: "number", step: "any", placeholder: "بلا حد" });
  var fadd = el("button", { "class": "btn" }, ["أضف حقلاً وانشر"]);
  fadd.onclick = function () {
    var key = (fk.value || "").trim().replace(/[^A-Za-z0-9_]/g, "");
    if (!fl.value.trim() || !key) { toast("العنوان والمفتاح مطلوبان", true); return; }
    var dup = false;
    toArr(t.fields).forEach(function (x) { if (x.id === key) dup = true; });
    if (dup) { toast("المفتاح مستخدم بالفعل فى هذا التبويب", true); return; }
    if (fmin.value !== "" && fmax.value !== "" && parseFloat(fmin.value) > parseFloat(fmax.value)) {
      toast("الحد الأدنى أكبر من الأقصى", true); return;
    }
    var nf = {
      id: key, label: fl.value.trim(), type: ft.value, unit: fu.value, options: fo.value,
      required: freq.value === "1",
      min: fmin.value === "" ? "" : parseFloat(fmin.value),
      max: fmax.value === "" ? "" : parseFloat(fmax.value)
    };
    if (ft.value === "ref") {
      if (!fref.value || !frefF.value) { toast("اختر التبويب المصدر وحقل العرض", true); return; }
      nf.refTab = fref.value; nf.refField = frefF.value;
    }
    t.fields = toArr(t.fields).concat([nf]);
    pub("حقل جديد (" + fl.value.trim() + ") فى " + t.title);
  };
  box.appendChild(el("div", { "class": "frm" }, [
    el("div", { "class": "fld" }, [el("label", {}, ["عنوان الحقل"]), fl]),
    el("div", { "class": "fld" }, [el("label", {}, ["المفتاح"]), fk]),
    el("div", { "class": "fld" }, [el("label", {}, ["النوع"]), ft]),
    el("div", { "class": "fld" }, [el("label", {}, ["الوحدة"]), fu]),
    el("div", { "class": "fld" }, [el("label", {}, ["خيارات القائمة"]), fo]),
    el("div", { "class": "fld" }, [el("label", {}, ["التبويب المصدر (للمرجع)"]), fref]),
    el("div", { "class": "fld" }, [el("label", {}, ["حقل العرض (للمرجع)"]), frefF]),
    el("div", { "class": "fld" }, [el("label", {}, ["الإلزام"]), freq]),
    el("div", { "class": "fld" }, [el("label", {}, ["أدنى قيمة (للأرقام)"]), fmin]),
    el("div", { "class": "fld" }, [el("label", {}, ["أقصى قيمة (للأرقام)"]), fmax])
  ]));
  box.appendChild(el("div", { "class": "hint" }, [
    "حقول خط العرض والطول تُقيَّد تلقائياً بـ٩٠± و١٨٠± بمجرد استخدامها فى عنصر خريطة. "
    + "وحقل «مرجع لتبويب آخر» يستبدل الكتابة الحرة باختيار من سجلات تبويب مصدر — فتتوحّد الأسماء وتصحّ المجاميع والرسوم."
  ]));
  box.appendChild(el("div", { "class": "actions" }, [fadd]));

  /* --- قواعد الإنذار --- */
  box.appendChild(el("div", { "class": "hint", style: "margin-top:16px;font-weight:700;color:var(--lake)" }, ["قواعد الإنذار"]));
  toArr(t.alerts).forEach(function (a) {
    var d = el("button", { "class": "btn mini warn" }, ["حذف"]);
    d.onclick = function () {
      t.alerts = toArr(t.alerts).filter(function (x) { return x.id !== a.id; });
      pub("حذف قاعدة إنذار من " + t.title);
    };
    box.appendChild(el("div", { "class": "adm-row" }, [
      el("span", { "class": "pill " + (a.level === "خطر" ? "danger" : "sand") }, [a.level]),
      el("span", { "class": "t" }, [a.msg]),
      el("span", { "class": "m", style: "direction:ltr" }, [a.expr]),
      el("span", { "class": "sp" }), d
    ]));
  });
  var ax = el("input", { type: "text", placeholder: "pct < 50", style: "direction:ltr;text-align:left" });
  var am = el("input", { type: "text", placeholder: "التنفيذ متأخر" });
  var al2 = el("select");
  [["تنبيه", "تنبيه"], ["خطر", "خطر"]].forEach(function (o) { al2.appendChild(el("option", { value: o[0] }, [o[1]])); });
  var aadd = el("button", { "class": "btn" }, ["أضف قاعدة وانشر"]);
  aadd.onclick = function () {
    var ex = (ax.value || "").trim();
    if (!ex || !am.value.trim()) { toast("اكتب الشرط ونص الإنذار", true); return; }
    /* فحص الشرط: صيغة سليمة + كل حقل مذكور موجود فعلاً */
    var sample = {};
    toArr(t.fields).forEach(function (f) { sample[f.id] = f.type === "number" ? 1 : "س"; });
    try { E.evalRule(ex, sample); }
    catch (e) { toast("الشرط غير صحيح: " + e.message, true); return; }
    var known = toArr(t.fields).map(function (f) { return f.id; });
    var bad = E.ruleIdents(ex).filter(function (idn) { return known.indexOf(idn) < 0; });
    if (bad.length) { toast("حقول غير موجودة فى التبويب: " + bad.join(" · "), true); return; }
    t.alerts = toArr(t.alerts).concat([{ id: uid("a"), expr: ex, msg: am.value.trim(), level: al2.value }]);
    pub("قاعدة إنذار جديدة فى " + t.title);
  };
  box.appendChild(el("div", { "class": "frm" }, [
    el("div", { "class": "fld" }, [el("label", {}, ["الشرط"]), ax]),
    el("div", { "class": "fld" }, [el("label", {}, ["نص الإنذار"]), am]),
    el("div", { "class": "fld" }, [el("label", {}, ["المستوى"]), al2])
  ]));
  box.appendChild(el("div", { "class": "hint" }, [
    "الشرط يقبل: مفاتيح حقول هذا التبويب · أرقام ونصوص بين علامتى تنصيص · < <= > >= = != · and / or / not · أقواس · "
    + "ودوال today() و empty(حقل) و filled(حقل). أمثلة: ",
    el("span", { "class": "code" }, ["pct < 50"]), " · ",
    el("span", { "class": "code" }, ["due < today() and pct < 100"]), " · ",
    el("span", { "class": "code" }, ["len < planned"]),
    " — والقيمة الغائبة لا تُطلق إنذاراً."
  ]));
  box.appendChild(el("div", { "class": "actions" }, [aadd]));

  /* --- العناصر --- */
  toArr(t.widgets).forEach(function (w) {
    var d = el("button", { "class": "btn mini warn" }, ["حذف"]);
    d.onclick = function () {
      if (!window.confirm("حذف عنصر «" + (w.label || w.type) + "»؟ لا يمسّ السجلات، ويمكن التراجع من سجل التغييرات.")) return;
      t.widgets = toArr(t.widgets).filter(function (x) { return x.id !== w.id; });
      pub("حذف عنصر (" + (w.label || w.type) + ") من " + t.title);
    };
    var meta = w.type === "formula" ? w.expr
      : (w.type === "trend" ? ("مؤشر: " + (w.mid || ""))
        : (w.type === "design" ? ((E.DESIGN[w.dcalc] || { name: w.dcalc }).name)
        : (w.type === "entity" ? ("كيان من: " + ((findTab(w.entityTab) || { title: w.entityTab }).title))
        : (w.type === "xkpi" || w.type === "xchart" ? ("من: " + ((ALL[w.tabId] || {}).title || w.tabId))
        : (w.type === "hydro" ? (w.calc === "balance" ? ("اتزان: " + w.inField + " ↔ " + w.outField) : ((E.HYDRO[w.calc] || { name: w.calc }).name))
        : (w.type === "chart" ? (w.labelField + " → " + w.valueField)
        : (w.type === "map" ? (w.latField + "/" + w.lngField) : ((w.agg || "") + " " + (w.field || "")))))))));
    box.appendChild(el("div", { "class": "adm-row" }, [
      el("span", { "class": "pill sand" }, [(E.WIDGETS[w.type] || { name: w.type }).name]),
      el("span", { "class": "t" }, [w.label || "—"]),
      el("span", { "class": "m" }, [meta || ""]),
      el("span", { "class": "sp" }), d
    ]));
  });

  var wt = el("select");
  Object.keys(E.WIDGETS).forEach(function (k) { wt.appendChild(el("option", { value: k }, [E.WIDGETS[k].name])); });
  var wl = el("input", { type: "text", placeholder: "عنوان العنصر" });
  var wa = el("select");
  [["sum", "مجموع"], ["avg", "متوسط"], ["count", "عدد"], ["max", "أكبر"], ["min", "أصغر"]].forEach(function (o) { wa.appendChild(el("option", { value: o[0] }, [o[1]])); });
  function fieldSelect(withEmpty) {
    var s = el("select");
    if (withEmpty) s.appendChild(el("option", { value: "" }, ["— بدون —"]));
    toArr(t.fields).forEach(function (f) { s.appendChild(el("option", { value: f.id }, [f.label])); });
    return s;
  }
  var wf = fieldSelect(true), wlab = fieldSelect(false), wval = fieldSelect(false);
  var wlat = fieldSelect(false), wlng = fieldSelect(false), wnm = fieldSelect(true);
  var wct = el("select");
  [["bar", "أعمدة"], ["line", "خط"]].forEach(function (o) { wct.appendChild(el("option", { value: o[0] }, [o[1]])); });
  var wbase = el("select");
  [["esri", "صور أقمار (Esri)"], ["osm", "خريطة شوارع"], ["topo", "طبوغرافى"]].forEach(function (o) { wbase.appendChild(el("option", { value: o[0] }, [o[1]])); });
  var we = el("input", { type: "text", placeholder: "sum(len)/25000*100" });
  var wtx = el("input", { type: "text", placeholder: "نص الملاحظة" });
  var wu = el("input", { type: "text", placeholder: "الوحدة" });
  var wi = el("input", { type: "text", placeholder: "Σ", maxlength: "2" });

  /* إعداد العناصر العابرة للتبويبات (لوحة القيادة) */
  var wxtab = el("select");
  toArr(S.schema.tabs).forEach(function (o) {
    if (o.id !== t.id) wxtab.appendChild(el("option", { value: o.id }, [o.title]));
  });
  var xBox = el("div", { "class": "sub-panel", style: "display:none" });
  var xIn = {};
  function otherTab() {
    var f = null;
    toArr(S.schema.tabs).forEach(function (o) { if (o.id === wxtab.value) f = o; });
    return f;
  }
  function tabFieldSelect(numericOnly) {
    var sel = el("select"), ot = otherTab();
    toArr(ot ? ot.fields : []).forEach(function (f) {
      if (numericOnly && f.type !== "number") return;
      sel.appendChild(el("option", { value: f.id }, [f.label]));
    });
    if (!sel.childNodes.length) sel.appendChild(el("option", { value: "" }, ["— لا حقول مناسبة —"]));
    return sel;
  }
  function buildXBox() {
    xBox.innerHTML = "";
    xIn = {};
    var ot = otherTab();
    if (!ot) { xBox.appendChild(el("div", { "class": "hint" }, ["أنشئ تبويباً آخر أولاً."])); return; }
    xBox.appendChild(el("h3", {}, ["المصدر: " + ot.title]));
    if (wt.value === "xkpi") {
      xIn.field = tabFieldSelect(true);
      xBox.appendChild(el("div", { "class": "frm" }, [
        el("div", { "class": "fld" }, [el("label", {}, ["الحقل (للعدّ اتركه)"]), xIn.field])
      ]));
      xBox.appendChild(el("div", { "class": "hint" }, ["طريقة التجميع تُؤخذ من حقل «التجميع» بالأعلى."]));
    } else if (wt.value === "entity") {
      xIn.efield = tabFieldSelect(false);
      xIn.match = el("input", { type: "text", value: "canal", placeholder: "canal" });
      xBox.appendChild(el("div", { "class": "frm" }, [
        el("div", { "class": "fld" }, [el("label", {}, ["حقل العرض (اسم الكيان)"]), xIn.efield]),
        el("div", { "class": "fld" }, [el("label", {}, ["مفتاح المطابقة للتبويبات القديمة"]), xIn.match])
      ]));
      xBox.appendChild(el("div", { "class": "hint" }, [
        "الربط يتم تلقائياً عبر حقول «مرجع» التى تشير لهذا التبويب. ومفتاح المطابقة احتياطى للتبويبات التى ما زالت تستخدم حقلاً نصياً بنفس الاسم."
      ]));
    } else if (wt.value === "xchart") {
      xIn.lab = tabFieldSelect(false);
      xIn.val = tabFieldSelect(true);
      xBox.appendChild(el("div", { "class": "frm" }, [
        el("div", { "class": "fld" }, [el("label", {}, ["حقل التصنيف"]), xIn.lab]),
        el("div", { "class": "fld" }, [el("label", {}, ["حقل القيمة"]), xIn.val])
      ]));
    }
  }
  wxtab.onchange = buildXBox;

  /* إعداد الحساب الهيدروليكى: نوع الحساب + ربط كل معامل بحقل أو قيمة ثابتة */
  var wcalc = el("select");
  Object.keys(E.HYDRO).forEach(function (k) { wcalc.appendChild(el("option", { value: k }, [E.HYDRO[k].name])); });
  wcalc.appendChild(el("option", { value: "balance" }, ["اتزان مائى (وارد/منصرف)"]));
  var hydBox = el("div", { "class": "sub-panel", style: "display:none" });
  var hydMapInputs = {};
  function buildHydMap() {
    hydBox.innerHTML = "";
    hydMapInputs = {};
    if (wcalc.value === "balance") {
      hydBox.appendChild(el("h3", {}, ["حقول الاتزان"]));
      var fin = fieldSelect(false), fout = fieldSelect(false), ftol = el("input", { type: "number", step: "any", value: "5" });
      hydMapInputs.__in = fin; hydMapInputs.__out = fout; hydMapInputs.__tol = ftol;
      /* 5.90: تجميع اختيارى بمجموعة وفترة زمنية وبخر/رشح من الحقول */
      function selBy(pred, emptyLabel) {
        var s2 = el("select");
        s2.appendChild(el("option", { value: "" }, [emptyLabel]));
        toArr(t.fields).forEach(function (f2) { if (pred(f2)) s2.appendChild(el("option", { value: f2.id }, [f2.label])); });
        return s2;
      }
      var fgrp = selBy(function (f2) { return f2.type === "text" || f2.type === "select" || f2.type === "ref"; }, "— بلا تجميع —");
      var fdate = selBy(function (f2) { return f2.type === "date"; }, "— كل الفترات —");
      var fdays = el("input", { type: "number", step: "1", placeholder: "كل السجلات" });
      var fev = selBy(function (f2) { return f2.type === "number"; }, "— بدون —");
      var fsp = selBy(function (f2) { return f2.type === "number"; }, "— بدون —");
      hydMapInputs.__grp = fgrp; hydMapInputs.__date = fdate; hydMapInputs.__days = fdays; hydMapInputs.__evap = fev; hydMapInputs.__seep = fsp;
      hydBox.appendChild(el("div", { "class": "frm" }, [
        el("div", { "class": "fld" }, [el("label", {}, ["حقل الوارد"]), fin]),
        el("div", { "class": "fld" }, [el("label", {}, ["حقل المنصرف"]), fout]),
        el("div", { "class": "fld" }, [el("label", {}, ["سماح الإقفال %"]), ftol]),
        el("div", { "class": "fld" }, [el("label", {}, ["التجميع بمجموعة (ترعة مثلاً)"]), fgrp]),
        el("div", { "class": "fld" }, [el("label", {}, ["حقل التاريخ للفترة"]), fdate]),
        el("div", { "class": "fld" }, [el("label", {}, ["المدة بالأيام (مع حقل التاريخ)"]), fdays]),
        el("div", { "class": "fld" }, [el("label", {}, ["حقل البخر (اختيارى)"]), fev]),
        el("div", { "class": "fld" }, [el("label", {}, ["حقل الرشح (اختيارى)"]), fsp])
      ]));
      hydBox.appendChild(el("div", { "class": "hint" }, ["بالتجميع يظهر جدول اتزان لكل مجموعة + الإجمالى، وبالفترة تُحسب آخر س يوم فقط — والحساب نفسه فى الشاشة والتقرير."]));
      return;
    }
    var def = E.HYDRO[wcalc.value];
    hydBox.appendChild(el("h3", {}, ["معاملات: " + def.name]));
    hydBox.appendChild(el("div", { "class": "hint" }, ["كل معامل: إمّا حقل من السجل (يتغيّر لكل صف) أو قيمة ثابتة للمجرى كله."]));
    var frm2 = el("div", { "class": "frm" });
    def.params.forEach(function (pr) {
      var sel = el("select");
      sel.appendChild(el("option", { value: "__const" }, ["قيمة ثابتة"]));
      toArr(t.fields).forEach(function (f) {
        if (f.type === "number") sel.appendChild(el("option", { value: f.id }, ["حقل: " + f.label]));
      });
      var cv = el("input", { type: "number", step: "any", placeholder: "القيمة" });
      hydMapInputs[pr[0]] = { sel: sel, cv: cv };
      frm2.appendChild(el("div", { "class": "fld" }, [
        el("label", {}, [pr[0] + " — " + pr[1]]), sel, cv
      ]));
    });
    hydBox.appendChild(frm2);
  }
  wcalc.onchange = buildHydMap;
  buildHydMap();
  wt.onchange = function () {
    hydBox.style.display = wt.value === "hydro" ? "block" : "none";
    var isX = (wt.value === "xkpi" || wt.value === "xchart" || wt.value === "entity");
    xBox.style.display = isX ? "block" : "none";
    if (isX) buildXBox();
  };

  /* إعداد عنصر التصميم */
  var wdes = el("select");
  Object.keys(E.DESIGN).forEach(function (k) { wdes.appendChild(el("option", { value: k }, [E.DESIGN[k].name])); });

  /* إعداد عنصر الاتجاه: قائمة بكل المؤشرات المعرَّفة فى كل التبويبات */
  var wmid = el("select");
  toArr(S.schema.tabs).forEach(function (tt) {
    wmid.appendChild(el("option", { value: E.metricId(tt.id, "__count") }, ["عدد سجلات " + tt.title]));
    toArr(tt.widgets).forEach(function (wg) {
      if (wg.type === "kpi" || wg.type === "formula") {
        wmid.appendChild(el("option", { value: E.metricId(tt.id, wg.id) }, [tt.title + " — " + (wg.label || wg.type)]));
      }
    });
  });
  if (!wmid.childNodes.length) wmid.appendChild(el("option", { value: "" }, ["— لا مؤشرات بعد —"]));

  var wadd = el("button", { "class": "btn" }, ["أضف عنصراً وانشر"]);
  wadd.onclick = function () {
    if (!wl.value.trim()) { toast("اكتب عنوان العنصر", true); return; }
    var w = { id: uid("w"), type: wt.value, label: wl.value.trim(), unit: wu.value, icon: wi.value };
    if (w.type === "kpi") { w.agg = wa.value; w.field = wf.value; }
    if (w.type === "formula") {
      w.expr = we.value.trim();
      try { E.evalExpr(w.expr, []); } catch (e) { toast("المعادلة غير صحيحة: " + e.message, true); return; }
      /* كقواعد الإنذار: معادلة بحقل غير موجود كانت تُحفظ وتعطى صفراً للأبد */
      var knownF = toArr(t.fields).map(function (f) { return f.id; });
      var toksF = E.tokenize(w.expr), badF = [];
      for (var i2 = 0; i2 < toksF.length; i2++) {
        if (toksF[i2].k === "id" && toksF[i2 + 1] && toksF[i2 + 1].k === "(") {
          var argF = toksF[i2 + 2];
          if (argF && argF.k === "id" && knownF.indexOf(argF.v) < 0 && badF.indexOf(argF.v) < 0) badF.push(argF.v);
        }
      }
      if (badF.length) { toast("حقول غير موجودة فى المعادلة: " + badF.join(" · "), true); return; }
    }
    if (w.type === "chart") { w.labelField = wlab.value; w.valueField = wval.value; w.chartType = wct.value; w.agg = wa.value; }
    if (w.type === "map") { w.latField = wlat.value; w.lngField = wlng.value; w.labelField = wnm.value; w.base = wbase.value; }
    if (w.type === "note") { w.text = wtx.value; }
    if (w.type === "xkpi") {
      if (!wxtab.value) { toast("اختر التبويب المصدر", true); return; }
      w.tabId = wxtab.value; w.agg = wa.value; w.field = xIn.field ? xIn.field.value : "";
    }
    if (w.type === "xchart") {
      if (!wxtab.value) { toast("اختر التبويب المصدر", true); return; }
      w.tabId = wxtab.value; w.chartType = wct.value; w.agg = wa.value;
      w.labelField = xIn.lab ? xIn.lab.value : "";
      w.valueField = xIn.val ? xIn.val.value : "";
      if (!w.labelField || !w.valueField) { toast("التبويب المصدر لا يحوى حقولاً مناسبة", true); return; }
    }
    if (w.type === "entity") {
      if (!wxtab.value) { toast("اختر التبويب المرجعى", true); return; }
      w.entityTab = wxtab.value;
      w.entityField = xIn.efield ? xIn.efield.value : "";
      w.matchField = (xIn.match && xIn.match.value) || "canal";
      if (!w.entityField) { toast("التبويب المرجعى بلا حقول عرض", true); return; }
    }
    if (w.type === "trend") {
      if (!wmid.value) { toast("لا توجد مؤشرات لاختيارها", true); return; }
      w.mid = wmid.value; w.days = 30;
      if (!w.label) w.label = "اتجاه: " + wmid.options[wmid.selectedIndex >= 0 ? wmid.selectedIndex : 0].textContent;
    }
    if (w.type === "activity") { w.limit = 8; }
    if (w.type === "design") {
      w.dcalc = wdes.value;
      if (!w.dcalc) { toast("اختر نوع التصميم", true); return; }
      if (!w.label) w.label = E.DESIGN[w.dcalc].name;
    }
    if (w.type === "hydro") {
      w.calc = wcalc.value;
      w.labelField = wnm.value;
      if (w.calc === "balance") {
        w.inField = hydMapInputs.__in.value;
        w.outField = hydMapInputs.__out.value;
        w.tol = parseFloat(hydMapInputs.__tol.value) || 5;
        if (!w.inField || !w.outField) { toast("اختر حقلَى الوارد والمنصرف", true); return; }
        /* 5.90: خصائص التجميع والفترة والبخر/الرشح — اختيارية كلها */
        if (hydMapInputs.__grp && hydMapInputs.__grp.value) w.groupField = hydMapInputs.__grp.value;
        if (hydMapInputs.__date && hydMapInputs.__date.value) {
          w.dateField = hydMapInputs.__date.value;
          var pdB = parseInt(hydMapInputs.__days && hydMapInputs.__days.value, 10);
          if (pdB > 0) w.periodDays = pdB;
        }
        if (hydMapInputs.__evap && hydMapInputs.__evap.value) w.evapField = hydMapInputs.__evap.value;
        if (hydMapInputs.__seep && hydMapInputs.__seep.value) w.seepField = hydMapInputs.__seep.value;
      } else {
        var def2 = E.HYDRO[w.calc], bad = "";
        w.map = {};
        def2.params.forEach(function (pr) {
          var g = hydMapInputs[pr[0]];
          if (g.sel.value === "__const") {
            if (g.cv.value === "") { bad = bad || pr[0]; return; }
            w.map[pr[0]] = { c: parseFloat(g.cv.value) };
          } else {
            w.map[pr[0]] = { f: g.sel.value };
          }
        });
        if (bad) { toast("املأ قيمة المعامل " + bad + " أو اربطه بحقل", true); return; }
      }
    }
    if ((w.type === "chart" || w.type === "map") && !toArr(t.fields).length) { toast("أضف حقولاً أولاً", true); return; }
    t.widgets = toArr(t.widgets).concat([w]);
    pub("عنصر جديد (" + w.label + ") فى " + t.title);
  };
  box.appendChild(el("div", { "class": "frm" }, [
    el("div", { "class": "fld" }, [el("label", {}, ["نوع العنصر"]), wt]),
    el("div", { "class": "fld" }, [el("label", {}, ["العنوان"]), wl]),
    el("div", { "class": "fld" }, [el("label", {}, ["التجميع (رقم/رسم)"]), wa]),
    el("div", { "class": "fld" }, [el("label", {}, ["الحقل (رقم)"]), wf]),
    el("div", { "class": "fld" }, [el("label", {}, ["حقل التصنيف (رسم)"]), wlab]),
    el("div", { "class": "fld" }, [el("label", {}, ["حقل القيمة (رسم)"]), wval]),
    el("div", { "class": "fld" }, [el("label", {}, ["شكل الرسم"]), wct]),
    el("div", { "class": "fld" }, [el("label", {}, ["خط العرض (خريطة)"]), wlat]),
    el("div", { "class": "fld" }, [el("label", {}, ["خط الطول (خريطة)"]), wlng]),
    el("div", { "class": "fld" }, [el("label", {}, ["اسم النقطة (خريطة)"]), wnm]),
    el("div", { "class": "fld" }, [el("label", {}, ["الطبقة الأساسية"]), wbase]),
    el("div", { "class": "fld" }, [el("label", {}, ["المعادلة"]), we]),
    el("div", { "class": "fld" }, [el("label", {}, ["نص الملاحظة"]), wtx]),
    el("div", { "class": "fld" }, [el("label", {}, ["الوحدة"]), wu]),
    el("div", { "class": "fld" }, [el("label", {}, ["الأيقونة"]), wi]),
    el("div", { "class": "fld" }, [el("label", {}, ["نوع الحساب (هيدروليكا)"]), wcalc]),
    el("div", { "class": "fld" }, [el("label", {}, ["نوع التصميم"]), wdes]),
    el("div", { "class": "fld" }, [el("label", {}, ["المؤشر (للاتجاه)"]), wmid]),
    el("div", { "class": "fld" }, [el("label", {}, ["التبويب المصدر (لوحة القيادة)"]), wxtab])
  ]));
  box.appendChild(xBox);
  box.appendChild(hydBox);
  box.appendChild(el("div", { "class": "hint" }, ["املأ الحقول الخاصة بالنوع المختار فقط. المعادلة تقبل sum / avg / count / max / min والعمليات الأربع والأقواس."]));
  box.appendChild(el("div", { "class": "actions" }, [wadd]));
  return box;
}

/* ---------------- التأريخ ---------------- */
function renderHistory() {
  var c = document.getElementById("content"); c.innerHTML = "";
  var p = panel("التأريخ", "نسخ المخطط السابقة");
  p.appendChild(el("div", { "class": "hint" }, ["الرجوع بينشر النسخة القديمة كإصدار جديد — فمفيش فقدان للتأريخ."]));
  if (!isAdmin()) {
    p.appendChild(el("div", { "class": "banner" }, [
      el("span", { "class": "pill lake" }, ["اطّلاع"]),
      el("span", {}, ["الرجوع لنسخة سابقة مقصور على المسؤول — الجدول هنا للاطّلاع."])
    ]));
  }
  c.appendChild(p);
  E.db.get(E.cfg.root + "/data/history").then(function (h) {
    var list = toArr(h).sort(function (a, b) { return (b.version || 0) - (a.version || 0); }).slice(0, 12);
    if (!list.length) { p.appendChild(el("div", { "class": "empty" }, ["لا توجد نسخ سابقة بعد."])); return; }
    list.forEach(function (v) {
      var b = el("button", { "class": "btn mini" + (isAdmin() ? "" : " off") }, ["رجوع لهذه النسخة"]);
      b.onclick = function () {
        if (!isAdmin()) { denyMsg(); return; }
        if (!v.schema) { toast("النسخة فارغة", true); return; }
        E.db.get(E.cfg.root + "/data/schema").then(function (live) {
          S.schema = JSON.parse(JSON.stringify(v.schema));
          S.schema.version = live ? live.version : S.schema.version;
          pub("رجوع لإصدار " + v.version);
        });
      };
      p.appendChild(el("div", { "class": "adm-row" }, [
        el("span", { "class": "pill lake" }, ["v" + v.version]),
        el("span", { "class": "t" }, [v.action || "—"]),
        el("span", { "class": "m" }, [when(v.at) + " · " + (v.by || "—")]),
        el("span", { "class": "sp" }), b
      ]));
    });
  }).catch(function (e) { p.appendChild(el("div", { "class": "empty" }, ["تعذّر التحميل: " + e.message])); });

  var ap = panel("التدقيق", "مين غيّر إيه");
  c.appendChild(ap);
  E.db.get(E.cfg.root + "/data/audit").then(function (a) {
    var list = toArr(a).sort(function (x, y) { return (y.at || 0) - (x.at || 0); }).slice(0, 20);
    if (!list.length) { ap.appendChild(el("div", { "class": "empty" }, ["لا توجد حركات بعد."])); return; }
    list.forEach(function (r) {
      ap.appendChild(el("div", { "class": "adm-row" }, [
        el("span", { "class": "m" }, [when(r.at)]),
        el("span", { "class": "t" }, [r.action || "—"]),
        el("span", { "class": "sp" }),
        el("span", { "class": "pill green" }, [r.by || "—"])
      ]));
    });
  }).catch(function (e) { ap.appendChild(el("div", { "class": "empty" }, ["تعذّر التحميل: " + e.message])); });
}

/* ---------------- تشخيص التثبيت ---------------- */
function diagRow(state, title, detail) {
  var cls = state === "ok" ? "green" : (state === "bad" ? "danger" : "sand");
  var lbl = state === "ok" ? "سليم" : (state === "bad" ? "مشكلة" : "للعلم");
  return el("div", { "class": "adm-row" }, [
    el("span", { "class": "pill " + cls }, [lbl]),
    el("span", { "class": "t" }, [title]),
    el("span", { "class": "m", style: "word-break:break-all;max-width:100%" }, [detail]),
    el("span", { "class": "sp" })
  ]);
}
function renderDiag() {
  var c = document.getElementById("content"); c.innerHTML = "";
  var p = panel("تشخيص", "ليه زر التثبيت مش ظاهر؟");
  p.appendChild(el("div", { "class": "hint" }, ["كل سطر أحمر هو السبب. صوّر الشاشة كاملة لو فضلت المشكلة."]));
  c.appendChild(p);
  var secure = (location.protocol === "https:") || (location.hostname === "localhost");
  p.appendChild(diagRow(secure ? "ok" : "bad", "١ · اتصال آمن HTTPS", location.protocol + "//" + location.hostname));
  p.appendChild(diagRow(location.hostname.indexOf("github.io") >= 0 ? "ok" : "bad", "٢ · مفتوح من GitHub Pages", location.href));
  fetch("manifest.json").then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status + " — غير مرفوع؟");
    return r.json();
  }).then(function (m) {
    var icons = m.icons || [], has192 = false;
    icons.forEach(function (ic) { if (String(ic.sizes).indexOf("192") >= 0) has192 = true; });
    p.appendChild(diagRow("ok", "٣ · المانيفست", "محمّل · " + icons.length + " أيقونة · display=" + (m.display || "—")));
    p.appendChild(diagRow(has192 ? "ok" : "bad", "٤ · أيقونة 192×192", has192 ? "معرّفة" : "ناقصة — كروم يرفض التثبيت بدونها"));
    icons.forEach(function (ic) {
      fetch(ic.src).then(function (r) {
        p.appendChild(diagRow(r.ok ? "ok" : "bad", "٥ · ملف الأيقونة " + ic.sizes, r.ok ? "موجود" : "HTTP " + r.status));
      }).catch(function (e) { p.appendChild(diagRow("bad", "٥ · ملف الأيقونة " + ic.sizes, e.message)); });
    });
  }).catch(function (e) { p.appendChild(diagRow("bad", "٣ · المانيفست", e.message)); });
  fetch("sw.js").then(function (r) {
    p.appendChild(diagRow(r.ok ? "ok" : "bad", "٦ · ملف sw.js", r.ok ? "موجود" : "HTTP " + r.status));
  }).catch(function (e) { p.appendChild(diagRow("bad", "٦ · ملف sw.js", e.message)); });
  p.appendChild(diagRow(SW_STATE.indexOf("مسجّل") >= 0 ? "ok" : "bad", "٧ · تسجيل عامل الخدمة", SW_STATE));
  var stand = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  p.appendChild(diagRow(stand ? "ok" : "wait", "٨ · وضع التشغيل", stand ? "مثبّت بالفعل" : "داخل المتصفح"));
  p.appendChild(diagRow(BIP ? "ok" : "wait", "٩ · حدث التثبيت", BIP ? "اتلقط" : "لم يُطلق: مثبّت بالفعل، أو متصفح لا يدعمه، أو شرط ناقص فوق"));
  p.appendChild(diagRow("wait", "١٠ · المتصفح", navigator.userAgent.slice(0, 140)));
  var ib = el("button", { "class": "btn solid" }, ["ثبّت الآن"]);
  ib.onclick = function () { if (!INSTALL_EVT) { toast("الحدث لسه ماتلقطش", true); return; } INSTALL_EVT.prompt(); };
  var rb = el("button", { "class": "btn" }, ["إعادة الفحص"]);
  rb.onclick = function () { renderDiag(); };
  p.appendChild(el("div", { "class": "actions" }, [ib, rb]));
}

/* ---------------- الإقلاع ---------------- */
function boot(seed) {
  E.init({ appId: APP.id, onStatus: setStatus });
  E.db.get(E.cfg.root + "/data/schema").then(function (s) {
    if (s && s.tabs) {
      S.schema = s;
      try { localStorage.setItem(APP.id + "_cache_schema", JSON.stringify(s)); } catch (e) { /* حصة ممتلئة */ }
      return null;
    }
    S.schema = JSON.parse(JSON.stringify(seed));
    return E.db.put(E.cfg.root + "/data/schema", S.schema);
  }).then(function () {
    E.db.patch("mwri/registry/" + APP.id, {
      app: APP.id, name: APP.title, type: "schema", version: "1.0", lastSeen: Date.now()
    }).catch(function () { });
    document.getElementById("st-ver").textContent = "إصدار المخطط " + (S.schema.version || 1);
    buildNav();
    /* تُقرأ إعدادات الصلاحيات مبكراً حتى تسرى القيود على كل الشاشات لا على الإدارة وحدها */
    ADMIN_LOADED = true;
    E.gate.load().then(function (cfg) { ADMIN_CFG = cfg; ADMIN_READY = true; ADMIN_ERR = false; select(CUR); })
      .catch(function (e) { ADMIN_CFG = null; ADMIN_READY = true; ADMIN_ERR = true; ADMIN_ERR_MSG = e && e.message ? e.message : "تعذّر الاتصال"; select(CUR); });
    /* لقطة اليوم إن لم تُؤخذ — صامتة تماماً، لا تُعطّل الإقلاع ولا تُظهر خطأ */
    E.ensureSnapshot(S.schema, who()).catch(function () { });
    var f = toArr(S.schema.tabs)[0];
    select(f ? f.id : "__admin");
  }).catch(function (e) {
    /* سقوط آمن: آخر مخطط محفوظ — للعرض فقط. النشر يظل ممنوعاً بلا شبكة
       لأن publish يقرأ الإصدار الحى أولاً ويفشل، فلا يُدهس عمل أحد. */
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(APP.id + "_cache_schema") || "null"); } catch (x) { cached = null; }
    if (cached && cached.tabs) {
      S.schema = cached;
      buildNav();
      setStatus("err", "وضع محلى — آخر مخطط محفوظ (" + e.message + ")");
      var f2 = toArr(S.schema.tabs)[0];
      select(f2 ? f2.id : "__admin");
      toast("تعذّر الاتصال — فُتحت آخر نسخة محفوظة على الجهاز", true);
      return;
    }
    S.schema = S.schema || { version: 0, tabs: [] };
    buildNav();
    var c = document.getElementById("content"); c.innerHTML = "";
    var p = panel("تعذّر التحميل", "المخطط لم يُقرأ");
    p.appendChild(el("div", { "class": "hint" }, ["نص الخطأ: " + e.message]));
    c.appendChild(p);
  });
}
