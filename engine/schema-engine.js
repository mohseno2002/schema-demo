/* =============================================================
   SchemaEngine — محرّك التطبيقات المقادة بمخطط (م. محسن / MWRI)
   بلا backticks · بلا اعتماديات إلزامية · REST مباشر على RTDB
   يُلصق كما هو داخل وسم script فى index.html أحادى الملف
   ============================================================= */
var SchemaEngine = (function () {
  "use strict";

  var CFG = {
    base: "https://ismailia-64500-default-rtdb.europe-west1.firebasedatabase.app",
    appId: "schema-app",
    root: "",
    onStatus: null
  };

  /* ---------------- طبقة القاعدة ---------------- */
  function hintOf(msg) {
    if (msg.indexOf("Failed to fetch") >= 0) return "انقطاع شبكة أو حجب CORS";
    if (msg.indexOf("401") >= 0 || msg.indexOf("403") >= 0 || msg.indexOf("Permission") >= 0) return "صلاحيات القاعدة";
    if (msg.indexOf("400") >= 0) return "صيغة الطلب";
    if (msg.indexOf("404") >= 0) return "المسار غير موجود";
    return "";
  }
  function status(state, txt) { if (CFG.onStatus) CFG.onStatus(state, txt); }

  function req(path, method, body) {
    var opt = { method: method || "GET" };
    if (body !== undefined) {
      opt.headers = { "Content-Type": "application/json" };
      opt.body = JSON.stringify(body);
    }
    status("busy", "مزامنة…");
    return fetch(CFG.base + "/" + path + ".json", opt).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " " + r.statusText);
      return r.json();
    }).then(function (j) {
      status("ok", "متصل بقاعدة الوزارة");
      return j;
    }).catch(function (e) {
      var h = hintOf(String(e.message));
      status("err", "خطأ: " + e.message + (h ? " — " + h : ""));
      throw e;
    });
  }
  function stamp(o) { if (o && typeof o === "object") { o.updatedAt = Date.now(); o.src = CFG.appId; } return o; }

  var db = {
    get: function (p) { return req(p); },
    put: function (p, o) { return req(p, "PUT", stamp(o)); },
    patch: function (p, o) { return req(p, "PATCH", stamp(o)); },
    post: function (p, o) { return req(p, "POST", stamp(o)); },
    del: function (p) { return req(p, "DELETE"); }
  };

  /* ---------------- أدوات ---------------- */
  function el(tag, attrs, kids) {
    var e = document.createElement(tag); attrs = attrs || {};
    for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function toArr(x) {
    if (!x) return [];
    if (Object.prototype.toString.call(x) === "[object Array]") return x.filter(function (i) { return !!i; });
    return Object.keys(x).map(function (k) { return x[k]; }).filter(function (i) { return !!i; });
  }
  function uid(p) { return p + "-" + Date.now().toString(36) + Math.floor(Math.random() * 900 + 100).toString(36); }
  function fmt(n) {
    if (n === null || n === undefined || isNaN(n) || !isFinite(n)) return "—";
    return String(Math.round(n * 100) / 100);
  }
  function when(ms) {
    if (!ms) return "—";
    var d = new Date(ms); function p(x) { return (x < 10 ? "0" : "") + x; }
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  /* ---------------- محلّل التعبيرات (بديل آمن لـ eval) ---------------- */
  function tokenize(s) {
    var t = [], i = 0, W = /[A-Za-z0-9_\u0600-\u06FF]/;
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === " ") { i++; continue; }
      if ("+-*/(),".indexOf(c) >= 0) { t.push({ k: c }); i++; continue; }
      if ((c >= "0" && c <= "9") || c === ".") {
        var j = i; while (j < s.length && ((s.charAt(j) >= "0" && s.charAt(j) <= "9") || s.charAt(j) === ".")) j++;
        t.push({ k: "num", v: parseFloat(s.slice(i, j)) }); i = j; continue;
      }
      if (W.test(c)) {
        var m = i; while (m < s.length && W.test(s.charAt(m))) m++;
        t.push({ k: "id", v: s.slice(i, m) }); i = m; continue;
      }
      throw new Error("رمز غير مفهوم: " + c);
    }
    return t;
  }
  var AGGS = { sum: 1, avg: 1, count: 1, max: 1, min: 1 };
  function aggregate(fn, field, rows) {
    if (!AGGS[fn]) throw new Error("دالة غير معروفة: " + fn);
    var vals = [];
    rows.forEach(function (r) { var v = parseFloat(r[field]); if (!isNaN(v)) vals.push(v); });
    if (fn === "count") return field ? vals.length : rows.length;
    if (!vals.length) return 0;
    if (fn === "sum") return vals.reduce(function (a, b) { return a + b; }, 0);
    if (fn === "avg") return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    if (fn === "max") return Math.max.apply(null, vals);
    return Math.min.apply(null, vals);
  }
  function evalExpr(src, rows) {
    var t = tokenize(src), p = 0;
    function peek() { return t[p]; }
    function eat(k) { if (!t[p] || t[p].k !== k) throw new Error("متوقع " + k); return t[p++]; }
    function factor() {
      var tk = peek();
      if (!tk) throw new Error("تعبير ناقص");
      if (tk.k === "-") { p++; return -factor(); }
      if (tk.k === "num") { p++; return tk.v; }
      if (tk.k === "(") { p++; var v = expr(); eat(")"); return v; }
      if (tk.k === "id") {
        p++; var name = tk.v, arg = "";
        if (peek() && peek().k === "(") {
          p++;
          if (peek() && peek().k === "id") { arg = t[p].v; p++; }
          eat(")");
          return aggregate(name, arg, rows);
        }
        throw new Error("استخدم دالة مثل sum(الحقل)");
      }
      throw new Error("رمز غير متوقع");
    }
    function term() {
      var v = factor();
      while (peek() && (peek().k === "*" || peek().k === "/")) {
        var op = t[p++].k, r = factor();
        v = op === "*" ? v * r : (r === 0 ? NaN : v / r);
      }
      return v;
    }
    function expr() {
      var v = term();
      while (peek() && (peek().k === "+" || peek().k === "-")) {
        var op = t[p++].k, r = term();
        v = op === "+" ? v + r : v - r;
      }
      return v;
    }
    var out = expr();
    if (p < t.length) throw new Error("زوائد بعد نهاية التعبير");
    return out;
  }

  /* ---------------- مصادر البيانات ---------------- */
  /* CSV — محلّل يحترم علامات التنصيص والفواصل داخلها */
  function parseCSV(text) {
    var rows = [], row = [], cur = "", q = false, i = 0;
    while (i < text.length) {
      var c = text.charAt(i);
      if (q) {
        if (c === "\"") {
          if (text.charAt(i + 1) === "\"") { cur += "\""; i += 2; continue; }
          q = false; i++; continue;
        }
        cur += c; i++; continue;
      }
      if (c === "\"") { q = true; i++; continue; }
      if (c === ",") { row.push(cur); cur = ""; i++; continue; }
      if (c === "\n" || c === "\r") {
        if (c === "\r" && text.charAt(i + 1) === "\n") i++;
        row.push(cur); rows.push(row); row = []; cur = ""; i++; continue;
      }
      cur += c; i++;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.join("").trim() !== ""; });
  }

  /* تحويل أى رابط Google Sheet إلى رابط CSV قابل للقراءة عبر المتصفح */
  function sheetCsvUrl(url, sheetName) {
    var m = String(url).match(/\/spreadsheets\/d\/([A-Za-z0-9-_]+)/);
    if (!m) {
      if (String(url).indexOf("output=csv") >= 0 || String(url).indexOf("out:csv") >= 0) return url;
      throw new Error("الرابط ليس رابط Google Sheet");
    }
    var id = m[1];
    var u = "https://docs.google.com/spreadsheets/d/" + id + "/gviz/tq?tqx=out:csv";
    if (sheetName) u += "&sheet=" + encodeURIComponent(sheetName);
    return u;
  }

  function loadSheet(src) {
    var url;
    try { url = sheetCsvUrl(src.url, src.sheet); }
    catch (e) { return Promise.reject(e); }
    status("busy", "قراءة Google Sheet…");
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " — الجدول غير منشور على الويب؟");
      return r.text();
    }).then(function (txt) {
      var rows = parseCSV(txt);
      if (!rows.length) throw new Error("الجدول فارغ");
      var head = rows[0], out = [];
      for (var i = 1; i < rows.length; i++) {
        var o = {};
        for (var j = 0; j < head.length; j++) {
          var key = (src.map && src.map[head[j]]) || head[j];
          o[key] = rows[i][j];
        }
        out.push(o);
      }
      status("ok", "قُرئ الجدول — " + out.length + " صف");
      return { head: head, rows: out };
    }).catch(function (e) {
      status("err", "Google Sheet: " + e.message + (hintOf(String(e.message)) ? " — " + hintOf(String(e.message)) : ""));
      throw e;
    });
  }

  /* كاش محلى — للعرض وقت انقطاع الشبكة فقط، لا يُنشر منه أبداً */
  function cacheKey(tabId) { return CFG.appId + "_cache_rows_" + tabId; }
  function cacheRows(tabId, rows) {
    try { localStorage.setItem(cacheKey(tabId), JSON.stringify(rows)); } catch (e) { /* حصة ممتلئة */ }
  }
  function cachedRows(tabId) {
    try { return JSON.parse(localStorage.getItem(cacheKey(tabId)) || "null"); } catch (e) { return null; }
  }
  function loadRecords(tab) {
    var src = tab.source || { type: "firebase" };
    var p;
    if (src.type === "sheet") {
      p = loadSheet(src).then(function (r) {
        return r.rows.map(function (x, i) { x.__key = "s" + i; return x; });
      });
    } else {
      p = db.get(CFG.root + "/data/records/" + tab.id).then(function (o) {
        o = o || {};
        return Object.keys(o).map(function (k) { var r = o[k] || {}; r.__key = k; return r; });
      });
    }
    return p.then(function (rows) {
      cacheRows(tab.id, rows);
      return { rows: rows, offline: false };
    }).catch(function (e) {
      var c = cachedRows(tab.id);
      if (c) return { rows: c, offline: true, error: e.message };
      throw e;
    });
  }

  /* أى حقول فى تبويب تربطه بالكيان المختار:
     أولاً حقول المرجع الصريحة، ثم الحقول النصية المسمّاة بنفس مفتاح المطابقة
     (للتبويبات القديمة التى تسبق حقل المرجع). */
  function entityFields(tab, entityTabId, matchField) {
    var out = [];
    toArr(tab.fields).forEach(function (f) {
      if (f.type === "ref" && f.refTab === entityTabId) out.push(f.id);
      else if (matchField && f.id === matchField && (f.type === "text" || f.type === "select")) out.push(f.id);
    });
    return out;
  }
  function entityRows(tab, rows, entityTabId, matchField, value) {
    var keys = entityFields(tab, entityTabId, matchField);
    if (!keys.length) return null;          /* التبويب غير مرتبط بالكيان أصلاً */
    return rows.filter(function (r) {
      var hit = false;
      keys.forEach(function (k) { if (String(r[k]) === String(value)) hit = true; });
      return hit;
    });
  }

  /* تحميل سجلات كل التبويبات معاً — أساس لوحة القيادة العابرة للتبويبات.
     فشل تبويب واحد لا يُسقط اللوحة: يُعلَّم offline ويُكمَّل الباقى */
  function loadAllRecords(schema) {
    var tabs = toArr(schema && schema.tabs);
    return Promise.all(tabs.map(function (t) {
      return loadRecords(t).then(function (r) {
        return { id: t.id, title: t.title, icon: t.icon, rows: r.rows, offline: !!r.offline, tab: t };
      }).catch(function (e) {
        return { id: t.id, title: t.title, icon: t.icon, rows: [], offline: true, error: e.message, tab: t };
      });
    })).then(function (list) {
      var m = {};
      list.forEach(function (x) { m[x.id] = x; });
      return m;
    });
  }

  /* ---------------- مخرجات مكانية ---------------- */
  function buildKML(rows, cfg, title) {
    var x = "<?xml version=\u00221.0\u0022 encoding=\u0022UTF-8\u0022?>\n";
    x += "<kml xmlns=\u0022http://www.opengis.net/kml/2.2\u0022><Document><name>" + esc(title || "طبقة") + "</name>\n";
    rows.forEach(function (r) {
      var la = parseFloat(r[cfg.latField]), ln = parseFloat(r[cfg.lngField]);
      if (isNaN(la) || isNaN(ln)) return;
      x += "<Placemark><name>" + esc(String(r[cfg.labelField] || "نقطة")) + "</name>";
      x += "<Point><coordinates>" + ln + "," + la + ",0</coordinates></Point></Placemark>\n";
    });
    x += "</Document></kml>";
    return x;
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function downloadText(name, text, mime) {
    var b = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function earthUrl(lat, lng) {
    return "https://earth.google.com/web/@" + lat + "," + lng + ",0a,3000d,35y,0h,0t,0r";
  }

  /* ---------------- طبقات الخرائط المجانية بلا مفاتيح ---------------- */
  var BASEMAPS = {
    osm: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "OpenStreetMap", max: 19 },
    esri: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Esri World Imagery", max: 18 },
    topo: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", attr: "Esri Topo", max: 18 }
  };
  function gibsLayer(product, dateStr, matrix) {
    return "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" + product +
      "/default/" + dateStr + "/" + (matrix || "GoogleMapsCompatible_Level9") + "/{z}/{y}/{x}.jpg";
  }
  function ensureLeaflet(cb) {
    if (window.L) return cb(null);
    var css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    var s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = function () { cb(null); };
    s.onerror = function () { cb(new Error("تعذّر تحميل Leaflet — لا إنترنت؟")); };
    document.head.appendChild(s);
  }

  /* ---------------- رسم بيانى SVG بلا مكتبات ---------------- */
  function groupBy(rows, labelField, valueField, agg) {
    var keys = [], map = {};
    rows.forEach(function (r) {
      var k = String(r[labelField] === undefined ? "—" : r[labelField]);
      if (!map[k]) { map[k] = []; keys.push(k); }
      map[k].push(r);
    });
    return keys.map(function (k) {
      return { label: k, value: aggregate(agg || "sum", valueField, map[k]) };
    });
  }
  function svgChart(series, kind, w, h) {
    w = w || 640; h = h || 240;
    var pad = { t: 14, r: 12, b: 34, l: 46 };
    var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    var max = 0;
    series.forEach(function (d) { if (d.value > max) max = d.value; });
    if (max <= 0) max = 1;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("width", "100%");
    svg.setAttribute("style", "display:block;max-height:260px");
    function mk(tag, at) {
      var e = document.createElementNS(ns, tag);
      for (var k in at) e.setAttribute(k, at[k]);
      return e;
    }
    for (var g = 0; g <= 4; g++) {
      var y = pad.t + ih - (ih * g / 4);
      svg.appendChild(mk("line", { x1: pad.l, x2: w - pad.r, y1: y, y2: y, stroke: "#ded6c5", "stroke-width": 1 }));
      var tx = mk("text", { x: pad.l - 6, y: y + 4, "text-anchor": "end", "font-size": 9, fill: "#66736f" });
      tx.textContent = fmt(max * g / 4);
      svg.appendChild(tx);
    }
    var n = series.length || 1, step = iw / n;
    if (kind === "line") {
      var d = "";
      series.forEach(function (s, i) {
        var x = pad.l + step * i + step / 2, y = pad.t + ih - (s.value / max) * ih;
        d += (i === 0 ? "M" : "L") + x + " " + y + " ";
        svg.appendChild(mk("circle", { cx: x, cy: y, r: 3, fill: "#155b75" }));
      });
      svg.appendChild(mk("path", { d: d, fill: "none", stroke: "#247ba0", "stroke-width": 2 }));
    } else {
      series.forEach(function (s, i) {
        var bw = Math.max(6, step * 0.58);
        var x = pad.l + step * i + (step - bw) / 2;
        var bh = (s.value / max) * ih;
        svg.appendChild(mk("rect", { x: x, y: pad.t + ih - bh, width: bw, height: Math.max(1, bh), rx: 4, fill: "#247ba0" }));
      });
    }
    series.forEach(function (s, i) {
      var t = mk("text", {
        x: pad.l + step * i + step / 2, y: h - 12, "text-anchor": "middle",
        "font-size": 9, fill: "#66736f"
      });
      t.textContent = s.label.length > 10 ? s.label.slice(0, 9) + "…" : s.label;
      svg.appendChild(t);
    });
    return svg;
  }


  /* ---------------- العنصر الهيدروليكى: تعريف الحسابات ---------------- */
  /* لا معادلة هنا — كل حساب يستدعى MWRIHyd من hydraulics.js (مهارة mwri-hydraulics) */
  var HYDRO = {
    manning: {
      name: "مانينج — تصرف وسرعة",
      params: [["b", "عرض القاع (م)"], ["y", "عمق الماء (م)"], ["z", "ميل الجوانب z:1"], ["n", "معامل الخشونة"], ["S", "ميل القاع"]],
      run: function (v) {
        var sec = MWRIHyd.trapSection(v.b, v.y, v.z);
        var Q = MWRIHyd.manningQ(v.n, sec.A, sec.R, v.S);
        var V = MWRIHyd.manningV(v.n, sec.R, v.S);
        var Fr = MWRIHyd.froude(Q, sec.A, sec.T);
        var yc = MWRIHyd.criticalDepth(Q, v.b, v.z);
        return {
          out: [["التصرف Q", Q, "م³/ث"], ["السرعة V", V, "م/ث"], ["فرود Fr", Fr, ""],
                ["المساحة A", sec.A, "م²"], ["العمق الحرج yc", yc, "م"]],
          main: Q, mainUnit: "م³/ث",
          flags: MWRIHyd.sanityCheck({ V: V, Fr: Fr, n: v.n })
        };
      }
    },
    normalDepth: {
      name: "العمق الطبيعى",
      params: [["Q", "التصرف (م³/ث)"], ["b", "عرض القاع (م)"], ["z", "ميل الجوانب"], ["n", "الخشونة"], ["S", "ميل القاع"]],
      run: function (v) {
        var yn = MWRIHyd.normalDepth(v.Q, v.b, v.z, v.n, v.S);
        var yc = MWRIHyd.criticalDepth(v.Q, v.b, v.z);
        var sec = MWRIHyd.trapSection(v.b, yn, v.z);
        var V = v.Q / sec.A;
        return {
          out: [["العمق الطبيعى yn", yn, "م"], ["العمق الحرج yc", yc, "م"],
                ["السرعة V", V, "م/ث"], ["النظام", yn > yc ? 1 : 0, yn > yc ? "تحت حرج" : "فوق حرج"]],
          main: yn, mainUnit: "م",
          flags: MWRIHyd.sanityCheck({ V: V, n: v.n })
        };
      }
    },
    criticalDepth: {
      name: "العمق الحرج",
      params: [["Q", "التصرف (م³/ث)"], ["b", "عرض القاع (م)"], ["z", "ميل الجوانب"]],
      run: function (v) {
        var yc = MWRIHyd.criticalDepth(v.Q, v.b, v.z);
        return { out: [["العمق الحرج yc", yc, "م"]], main: yc, mainUnit: "م", flags: [] };
      }
    },
    gate: {
      name: "تصرف بوابة",
      params: [["b", "عرض البوابة (م)"], ["a", "فتحة البوابة (م)"], ["y1", "عمق الماء أمام البوابة فوق العتب (م)"], ["y3", "عمق الماء خلفها فوق العتب (م)"]],
      run: function (v) {
        var g = MWRIHyd.gateFlow({ b: v.b, a: v.a, y1: v.y1, y3: v.y3 });
        return {
          out: [["التصرف Q", g.Q, "م³/ث"], ["معامل Cd", g.Cd, ""], ["الحالة", 0, g.mode]],
          main: g.Q, mainUnit: "م³/ث", flags: []
        };
      }
    },
    weir: {
      name: "هدار حاد القمة",
      params: [["b", "طول الهدار (م)"], ["H", "الحمل فوق القمة (م)"], ["P", "ارتفاع القمة (م)"]],
      run: function (v) {
        var Q = MWRIHyd.sharpCrestedWeir(v.b, v.H, v.P);
        return { out: [["التصرف Q", Q, "م³/ث"]], main: Q, mainUnit: "م³/ث", flags: [] };
      }
    },
    jump: {
      name: "القفزة الهيدروليكية",
      params: [["y1", "العمق قبل القفزة (م)"], ["Q", "التصرف (م³/ث)"], ["b", "العرض (م)"]],
      run: function (v) {
        var j = MWRIHyd.hydraulicJump(v.y1, v.Q, v.b);
        return {
          out: [["فرود Fr1", j.Fr1, ""], ["العمق التالى y2", j.y2, "م"],
                ["فقد الطاقة", j.dE, "م"], ["طول الحوض", j.Lj || 0, "م"], ["النوع", 0, j.type || j.note]],
          main: j.y2, mainUnit: "م", flags: []
        };
      }
    }
  };

  /* اتزان مائى على مستوى التبويب كله (لا سجل بسجل) */
  function hydroBalance(rows, inField, outField, opts) {
    var ins = [], outs = [];
    rows.forEach(function (r) {
      var a = parseFloat(r[inField]); if (!isNaN(a)) ins.push({ Q: a });
      var b = parseFloat(r[outField]); if (!isNaN(b)) outs.push({ Q: b });
    });
    return MWRIHyd.waterBalance(ins, outs, opts || {});
  }

  /* قيمة معامل: إما من حقل السجل أو ثابت من المخطط */
  function hydroValue(map, key, row) {
    var m = (map || {})[key];
    if (!m) return NaN;
    if (m.f) { var v = parseFloat(row[m.f]); return isNaN(v) ? NaN : v; }
    return typeof m.c === "number" ? m.c : parseFloat(m.c);
  }


  /* ---------------- قوالب تبويبات جاهزة لأعمال المجارى المائية ---------------- */
  /* كل قالب بنية فقط — بلا سجلات ولا أرقام مفترضة.
     يُركَّب على أى مخطط قائم من شاشة الإدارة وينشر إصداراً قابلاً للتراجع. */
  function fPct(id, label) {
    return { id: id, label: label, type: "number", unit: "%", required: true, min: 0, max: 100 };
  }
  function fCanal() { return { id: "canal", label: "الترعة / المجرى", type: "text", required: true }; }
  function fKm(id, label) { return { id: id, label: label, type: "number", unit: "ك.م", min: 0, max: 2000 }; }
  function fLen(unit, max) {
    return { id: "len", label: "الطول المنفّذ", type: "number", unit: unit || "م", required: true, min: 0, max: max || 100000 };
  }
  function fContractor() { return { id: "contractor", label: "المقاول / جهة التنفيذ", type: "text" }; }
  function fDates() {
    return [
      { id: "start", label: "تاريخ البدء", type: "date" },
      { id: "due", label: "تاريخ الانتهاء المخطط", type: "date" }
    ];
  }
  function fStatus() {
    return { id: "status", label: "الموقف", type: "select", options: "لم يبدأ,جارٍ التنفيذ,متوقف,منتهٍ,تحت الاستلام", required: true };
  }
  function fGeo() {
    return [
      { id: "lat", label: "خط العرض", type: "number" },
      { id: "lng", label: "خط الطول", type: "number" }
    ];
  }
  function wTable(label) { return { id: uid("w"), type: "table", label: label || "السجلات" }; }
  function wMap(label, labelField) {
    return { id: uid("w"), type: "map", label: label || "مواقع الأعمال", latField: "lat", lngField: "lng",
      labelField: labelField || "canal", base: "esri" };
  }
  function wProgress() {
    return { id: uid("w"), type: "kpi", label: "متوسط نسبة التنفيذ", agg: "avg", field: "pct", unit: "%", icon: "◔", style: "sand" };
  }
  function wCount(label) {
    return { id: uid("w"), type: "kpi", label: label, agg: "count", field: "", unit: "بند", icon: "#", style: "green" };
  }
  function wSumLen(unit) {
    return { id: uid("w"), type: "kpi", label: "إجمالى الأطوال", agg: "sum", field: "len", unit: unit || "م", icon: "\u03A3" };
  }
  function wChartBy(field, label) {
    return { id: uid("w"), type: "chart", label: label, labelField: field, valueField: "len", agg: "sum", chartType: "bar" };
  }


  /* دوال بناء إضافية للمجالات الجديدة */
  function fSel(id, label, opts, req) {
    return { id: id, label: label, type: "select", options: opts, required: !!req };
  }
  function fTxt(id, label, req) { return { id: id, label: label, type: "text", required: !!req }; }
  function fNum(id, label, unit, min, max, req) {
    return { id: id, label: label, type: "number", unit: unit || "", min: min, max: max, required: !!req };
  }
  function fDate(id, label, req) { return { id: id, label: label, type: "date", required: !!req }; }
  function wKpi(label, agg, field, unit, icon, style) {
    return { id: uid("w"), type: "kpi", label: label, agg: agg, field: field || "", unit: unit || "", icon: icon || "\u25C8", style: style || "" };
  }
  function wChart(labelField, valueField, label, agg) {
    return { id: uid("w"), type: "chart", label: label, labelField: labelField, valueField: valueField, agg: agg || "sum", chartType: "bar" };
  }

  var TEMPLATES = [
    {
      id: "works", group: "متابعة أعمال", name: "سجل الأعمال الجارية (كل الأنواع)",
      desc: "سجل واحد لكل أعمال المجارى: تبطين · تكسية دبش · تغطية خرسانية · مواسير · كبارى · تطهير — مع نوع العمل كحقل تصنيف",
      build: function () {
        return {
          id: uid("tab"), icon: "\u2692", eyebrow: "متابعة تنفيذ", title: "الأعمال الجارية",
          source: { type: "firebase" },
          fields: [
            fCanal(),
            { id: "wtype", label: "نوع العمل", type: "select", required: true,
              options: "تبطين خرسانى,تكسية دبش,تغطية خرسانية,مواسير,كوبرى,تطهير,إحلال وتجديد,حماية جسور" },
            fKm("kmFrom", "من كيلو"), fKm("kmTo", "إلى كيلو"),
            fLen("م"),
            { id: "planned", label: "الكمية المخططة", type: "number", unit: "م", min: 0 },
            fPct("pct", "نسبة التنفيذ"),
            fStatus(), fContractor()
          ].concat(fDates()).concat([
            { id: "cost", label: "التكلفة التقديرية", type: "number", unit: "أ.ج", min: 0 },
            { id: "note", label: "ملاحظات", type: "text" }
          ]).concat(fGeo()),
          widgets: [
            wCount("عدد بنود الأعمال"), wSumLen("م"), wProgress(),
            { id: uid("w"), type: "kpi", label: "إجمالى المخطط", agg: "sum", field: "planned", unit: "م", icon: "\u25CB", style: "sand" },
            { id: uid("w"), type: "formula", label: "المنفَّذ من المخطط", expr: "sum(len)/sum(planned)*100", unit: "%", icon: "%" },
            { id: uid("w"), type: "kpi", label: "إجمالى التكلفة التقديرية", agg: "sum", field: "cost", unit: "أ.ج", icon: "\u00A4" },
            wChartBy("wtype", "الأطوال حسب نوع العمل"),
            wChartBy("canal", "الأطوال حسب المجرى"),
            wMap("مواقع الأعمال على المجارى"),
            wTable("بنود الأعمال")
          ]
        };
      }
    },
    {
      id: "lining", group: "متابعة أعمال", name: "تبطين وتكسية دبش",
      desc: "التبطين الخرسانى وتكسية الدبش بالقطاعات: من/إلى كيلو · نوع التبطين · السُمك · الطول · نسبة التنفيذ",
      build: function () {
        return {
          id: uid("tab"), icon: "\u25A6", eyebrow: "أعمال تبطين", title: "التبطين والتكسية",
          source: { type: "firebase" },
          fields: [
            fCanal(),
            { id: "ltype", label: "نوع التبطين", type: "select", required: true,
              options: "خرسانة مسلحة,خرسانة عادية,تكسية دبش,بلاطات مسبقة الصب,جيوتكستايل" },
            fKm("kmFrom", "من كيلو"), fKm("kmTo", "إلى كيلو"),
            fLen("م"),
            { id: "thk", label: "السُمك", type: "number", unit: "سم", min: 1, max: 100 },
            { id: "side", label: "الموضع", type: "select", options: "الجانبان,اليمين,اليسار,القاع والجانبان" },
            fPct("pct", "نسبة التنفيذ"), fStatus(), fContractor()
          ].concat(fDates()).concat(fGeo()),
          widgets: [
            wSumLen("م"), wCount("عدد القطاعات"), wProgress(),
            wChartBy("ltype", "الأطوال حسب نوع التبطين"),
            wChartBy("canal", "الأطوال حسب المجرى"),
            wMap("مواقع قطاعات التبطين"), wTable("قطاعات التبطين")
          ]
        };
      }
    },
    {
      id: "bridges", group: "متابعة أعمال", name: "الكبارى والمنشآت",
      desc: "إنشاء أو إحلال أو صيانة الكبارى والبدالات: نوع المنشأ · البحور · العرض · الموقف · نسبة التنفيذ",
      build: function () {
        return {
          id: uid("tab"), icon: "\u2354", eyebrow: "منشآت", title: "الكبارى والمنشآت",
          source: { type: "firebase" },
          fields: [
            fCanal(),
            { id: "name", label: "اسم المنشأ", type: "text", required: true },
            { id: "km", label: "الكيلومتر", type: "number", unit: "ك.م", min: 0, max: 2000 },
            { id: "stype", label: "نوع المنشأ", type: "select", required: true,
              options: "كوبرى خرسانى,كوبرى معدنى,بدال,هدار,سيفون,عبارة صندوقية,عبارة ماسورة" },
            { id: "work", label: "نوع العمل", type: "select", required: true, options: "إنشاء جديد,إحلال,تدعيم,صيانة,توسعة" },
            { id: "spans", label: "عدد البحور", type: "number", min: 1, max: 50 },
            { id: "width", label: "عرض الكوبرى", type: "number", unit: "م", min: 1, max: 100 },
            fPct("pct", "نسبة التنفيذ"), fStatus(), fContractor()
          ].concat(fDates()).concat([
            { id: "cost", label: "التكلفة التقديرية", type: "number", unit: "أ.ج", min: 0 }
          ]).concat(fGeo()),
          widgets: [
            wCount("عدد المنشآت"), wProgress(),
            { id: uid("w"), type: "kpi", label: "إجمالى التكلفة", agg: "sum", field: "cost", unit: "أ.ج", icon: "\u00A4" },
            { id: uid("w"), type: "chart", label: "المنشآت حسب النوع", labelField: "stype", valueField: "pct", agg: "count", chartType: "bar" },
            wMap("مواقع المنشآت"), wTable("سجل المنشآت")
          ]
        };
      }
    },
    {
      id: "covers", group: "متابعة أعمال", name: "التغطيات والمواسير",
      desc: "تغطية المجارى بالخرسانة أو تحويلها لمواسير: القطر · عدد الخطوط · الطول · الغرض",
      build: function () {
        return {
          id: uid("tab"), icon: "\u25AD", eyebrow: "تغطيات", title: "التغطيات والمواسير",
          source: { type: "firebase" },
          fields: [
            fCanal(),
            { id: "ctype", label: "نوع العمل", type: "select", required: true,
              options: "تغطية خرسانية,عبارة صندوقية,مواسير خرسانية,مواسير PVC/uPVC,مواسير GRP,مواسير حديد" },
            fKm("kmFrom", "من كيلو"), fKm("kmTo", "إلى كيلو"),
            fLen("م"),
            { id: "dia", label: "القطر / عرض الفتحة", type: "number", unit: "مم", min: 50, max: 5000 },
            { id: "lines", label: "عدد الخطوط", type: "number", min: 1, max: 20 },
            { id: "purpose", label: "الغرض", type: "select", options: "عبور طريق,حماية من التلوث,توفير حرم,ربط شبكات,أخرى" },
            fPct("pct", "نسبة التنفيذ"), fStatus(), fContractor()
          ].concat(fDates()).concat(fGeo()),
          widgets: [
            wSumLen("م"), wCount("عدد البنود"), wProgress(),
            wChartBy("ctype", "الأطوال حسب نوع التغطية"),
            wMap("مواقع التغطيات"), wTable("بنود التغطية")
          ]
        };
      }
    },
    {
      id: "cleaning", group: "متابعة أعمال", name: "أعمال التطهير",
      desc: "التطهير الميكانيكى واليدوى والعائم: القطاع · الكمية · الطول · التكلفة",
      build: function () {
        return {
          id: uid("tab"), icon: "\u224B", eyebrow: "سجل ميدانى", title: "أعمال التطهير",
          source: { type: "firebase" },
          fields: [
            fCanal(),
            { id: "ctype", label: "نوع التطهير", type: "select", required: true, options: "ميكانيكى,يدوى,عائم,مختلط" },
            fKm("kmFrom", "من كيلو"), fKm("kmTo", "إلى كيلو"),
            fLen("م"),
            { id: "qty", label: "الكمية المنزوعة", type: "number", unit: "م³", min: 0 },
            fPct("pct", "نسبة التنفيذ"), fStatus(), fContractor()
          ].concat(fDates()).concat(fGeo()),
          widgets: [
            wSumLen("م"),
            { id: uid("w"), type: "kpi", label: "إجمالى الكميات", agg: "sum", field: "qty", unit: "م³", icon: "\u2211", style: "green" },
            wProgress(),
            wChartBy("canal", "الأطوال المطهّرة حسب المجرى"),
            wMap("مواقع أعمال التطهير"), wTable("بنود التطهير")
          ]
        };
      }
    },
    {
      id: "design", group: "تصميم", name: "تصميم منشآت الرى",
      desc: "حاسبات تصميم: قطاع مجرى · مواسير · عبارة صندوقية وتغطية · فتحة بوابة · هدار · تبطين وتكسية · فتحة كوبرى — مع حفظ النتائج كسجلات",
      build: function () {
        return {
          id: uid("tab"), icon: "\u2699", eyebrow: "تصميم", title: "تصميم المنشآت",
          source: { type: "firebase" },
          fields: [
            fTxt("dname", "نوع الحساب"), fTxt("by", "أعدّه"),
            fTxt("out_1", "النتيجة ١"), fTxt("out_2", "النتيجة ٢"), fTxt("out_3", "النتيجة ٣")
          ],
          widgets: [
            { id: uid("w"), type: "design", dcalc: "canalSection", label: "تصميم قطاع مجرى" },
            { id: uid("w"), type: "design", dcalc: "culvertPipe", label: "تصميم مواسير / عبارة دائرية" },
            { id: uid("w"), type: "design", dcalc: "boxCulvert", label: "عبارة صندوقية / تغطية خرسانية" },
            { id: uid("w"), type: "design", dcalc: "gateSize", label: "فتحة بوابة لتصرف مستهدف" },
            { id: uid("w"), type: "design", dcalc: "weirSize", label: "طول هدار لحمل معين" },
            { id: uid("w"), type: "design", dcalc: "lining", label: "تبطين / تكسية — كميات وسرعة" },
            { id: uid("w"), type: "design", dcalc: "bridgeOpening", label: "الفتحة المائية لكوبرى" },
            wKpi("عدد التصميمات المحفوظة", "count", "", "تصميم", "#", "green"),
            wTable("سجل التصميمات المحفوظة")
          ]
        };
      }
    },
    {
      id: "canals", group: "رى وتشغيل", name: "سجل المجارى (مرجعى)",
      desc: "المصدر المرجعى لأسماء الترع والمصارف بأكوادها وزمامها وتصرفها المقنن — تربط عليه باقى التبويبات",
      build: function () {
        return {
          id: uid("tab"), icon: "\u2261", eyebrow: "مرجع", title: "سجل المجارى",
          source: { type: "firebase" },
          fields: [
            fTxt("code", "كود المجرى", true), fTxt("name", "اسم المجرى", true),
            fTxt("admin", "الإدارة"), fTxt("eng", "الهندسة"),
            fSel("ctype", "نوع المجرى", "ترعة,رياح,مصرف,مسقى,مجرى مغطى", true),
            fTxt("source", "الأخذ من"),
            fNum("lenKm", "الطول", "ك.م", 0, 2000), fNum("area", "الزمام", "فدان", 0),
            fNum("qDesign", "التصرف المقنن", "م³/ث", 0, 500),
            fSel("cstate", "حالة المجرى", "جيدة,متوسطة,متعبة,حرجة")
          ].concat(fGeo()),
          widgets: [
            wKpi("عدد المجارى", "count", "", "مجرى", "#", "green"),
            wKpi("إجمالى الأطوال", "sum", "lenKm", "ك.م", "\u03A3"),
            wKpi("إجمالى الزمام", "sum", "area", "فدان", "\u25A6", "sand"),
            wChart("eng", "lenKm", "الأطوال حسب الهندسة"),
            wChart("cstate", "lenKm", "الأطوال حسب حالة المجرى"),
            wMap("مواقع المجارى", "name"), wTable("سجل المجارى")
          ]
        };
      }
    },
    {
      id: "canal-page", group: "رى وتشغيل", name: "صفحة المجرى الواحد",
      desc: "تختار مجرى فتُجمع له كل سجلاته من كل التبويبات: أعماله وشكاواه وتعدياته وقياساته ومنشآته — بلا إدخال جديد",
      /* يحتاج تبويباً مرجعياً موجوداً: يبحث عنه فى المخطط الحالى بدل افتراض معرّف ثابت */
      build: function (ctx) {
        var tabs = toArr(ctx && ctx.tabs), pick = null;
        tabs.forEach(function (t) {
          if (pick) return;
          var hasName = false;
          toArr(t.fields).forEach(function (f) { if (f.id === "name" && f.type === "text") hasName = true; });
          if (hasName && (String(t.title).indexOf("المجار") >= 0 || String(t.eyebrow) === "مرجع")) pick = t;
        });
        if (!pick) {
          tabs.forEach(function (t) {
            if (pick) return;
            toArr(t.fields).forEach(function (f) { if (!pick && f.id === "name" && f.type === "text") pick = t; });
          });
        }
        if (!pick) return { error: "ركّب قالب «سجل المجارى» أولاً — صفحة المجرى تعتمد عليه كمصدر." };
        return {
          id: uid("tab"), icon: "\u25C9", eyebrow: "ملف مجرى", title: "صفحة المجرى",
          source: { type: "firebase" }, fields: [],
          widgets: [
            { id: uid("w"), type: "entity", label: "ملف المجرى", entityTab: pick.id, entityField: "name", matchField: "canal" }
          ]
        };
      }
    },
    {
      id: "rotation", group: "رى وتشغيل", name: "المناوبات والتوزيع",
      desc: "المقنن مقابل المنصرف الفعلى لكل مجرى فى كل مناوبة، مع عجز/وفرة محسوبة",
      build: function () {
        return {
          id: uid("tab"), icon: "\u21C4", eyebrow: "تشغيل", title: "المناوبات والتوزيع",
          source: { type: "firebase" },
          fields: [
            fCanal(), fDate("day", "التاريخ", true),
            fSel("shift", "المناوبة", "مناوبة أولى,مناوبة ثانية,تشغيل مستمر", true),
            fNum("qPlan", "التصرف المقنن", "م³/ث", 0, 500, true),
            fNum("qAct", "التصرف الفعلى", "م³/ث", 0, 500, true),
            fNum("hrs", "ساعات التشغيل", "ساعة", 0, 24),
            fTxt("note", "ملاحظات التشغيل")
          ],
          widgets: [
            wKpi("إجمالى المقنن", "sum", "qPlan", "م³/ث", "\u25CB"),
            wKpi("إجمالى الفعلى", "sum", "qAct", "م³/ث", "\u25CF", "green"),
            { id: uid("w"), type: "formula", label: "العجز/الوفرة", expr: "sum(qAct)-sum(qPlan)", unit: "م³/ث", icon: "\u0394", style: "sand" },
            { id: uid("w"), type: "formula", label: "نسبة تغطية المقنن", expr: "sum(qAct)/sum(qPlan)*100", unit: "%", icon: "%" },
            wChart("canal", "qAct", "التصرف الفعلى حسب المجرى"),
            wTable("سجل المناوبات")
          ]
        };
      }
    },
    {
      id: "complaints", group: "رى وتشغيل", name: "شكاوى المزارعين",
      desc: "تلقّى الشكاوى ومتابعة إغلاقها: النوع · المجرى · القرية · الموقف · تاريخ الإغلاق",
      build: function () {
        return {
          id: uid("tab"), icon: "\u260E", eyebrow: "خدمة جمهور", title: "شكاوى المزارعين",
          source: { type: "firebase" },
          fields: [
            fDate("day", "تاريخ الشكوى", true), fCanal(),
            fTxt("village", "القرية / الناحية"),
            fSel("ctype", "نوع الشكوى", "نقص مياه,تعدٍّ على المجرى,تلوث,حشائش,منشأ تالف,صرف على الترعة,أخرى", true),
            fSel("channel", "مصدر البلاغ", "حضورى,تليفون,تطبيق,شكوى رسمية,وسائل تواصل"),
            fSel("cstate", "الموقف", "واردة,جارٍ الفحص,تحت التنفيذ,مغلقة,محالة لجهة أخرى", true),
            fTxt("action", "الإجراء المتخذ"), fDate("closed", "تاريخ الإغلاق")
          ].concat(fGeo()),
          widgets: [
            wKpi("إجمالى الشكاوى", "count", "", "شكوى", "#"),
            wChart("ctype", "", "الشكاوى حسب النوع", "count"),
            wChart("canal", "", "الشكاوى حسب المجرى", "count"),
            wMap("مواقع الشكاوى"), wTable("سجل الشكاوى")
          ]
        };
      }
    },
    {
      id: "encroach", group: "رى وتشغيل", name: "التعديات وإزالتها",
      desc: "حصر التعديات على المجرى والحرم ومتابعة المحاضر والإزالة",
      build: function () {
        return {
          id: uid("tab"), icon: "\u26A0", eyebrow: "حماية المجرى", title: "التعديات",
          source: { type: "firebase" },
          fields: [
            fCanal(), fKm("km", "الكيلومتر"),
            fSel("etype", "نوع التعدى", "بناء,ردم,زراعة داخل الحرم,سور,مخلفات,وصلة صرف,أخرى", true),
            fNum("area", "المساحة", "م²", 0),
            fDate("found", "تاريخ الرصد", true),
            fTxt("record", "رقم المحضر"),
            fSel("estate", "الموقف", "مرصود,محرَّر محضر,صدر قرار إزالة,أُزيل,متنازع عليه", true),
            fDate("removed", "تاريخ الإزالة")
          ].concat(fGeo()),
          widgets: [
            wKpi("عدد التعديات", "count", "", "تعدٍّ", "#"),
            wKpi("إجمالى المساحات", "sum", "area", "م²", "\u25A6", "sand"),
            wChart("etype", "area", "المساحات حسب نوع التعدى"),
            wChart("estate", "", "التعديات حسب الموقف", "count"),
            wMap("مواقع التعديات"), wTable("سجل التعديات")
          ]
        };
      }
    },
    {
      id: "measure", group: "هيدروليك", name: "قياسات ومناسيب وتصرفات",
      desc: "قياس القطاع وحساب التصرف والسرعة وفرود بمانينج مع رقابة آلية على النتائج",
      build: function () {
        return {
          id: uid("tab"), icon: "\u25CE", eyebrow: "قياسات", title: "القياسات والتصرفات",
          source: { type: "firebase" },
          fields: [
            fCanal(), fTxt("point", "نقطة القياس", true), fKm("km", "الكيلومتر"),
            fDate("day", "تاريخ القياس", true),
            fNum("b", "عرض القاع", "م", 0.1, 500, true),
            fNum("y", "عمق الماء", "م", 0.01, 20, true),
            fNum("n", "معامل الخشونة", "", 0.012, 0.075, true),
            fNum("wl", "منسوب سطح الماء", "م", 0, 200)
          ].concat(fGeo()),
          widgets: [
            wKpi("عدد القياسات", "count", "", "قياس", "#", "green"),
            { id: uid("w"), type: "hydro", label: "مانينج — تصرف وسرعة ورقابة", calc: "manning", labelField: "point",
              map: { b: { f: "b" }, y: { f: "y" }, z: { c: 2 }, n: { f: "n" }, S: { c: 0.0001 } } },
            wChart("point", "y", "أعماق المياه حسب نقطة القياس"),
            wMap("نقاط القياس"), wTable("سجل القياسات")
          ]
        };
      }
    },
    {
      id: "gates", group: "هيدروليك", name: "البوابات والمنشآت التنظيمية",
      desc: "أوضاع الفتحات والمناسيب أمام وخلف، وحساب التصرف المارّ من كل بوابة",
      build: function () {
        return {
          id: uid("tab"), icon: "\u2337", eyebrow: "تشغيل منشآت", title: "البوابات",
          source: { type: "firebase" },
          fields: [
            fCanal(), fTxt("gate", "اسم البوابة", true), fKm("km", "الكيلومتر"),
            fDate("day", "تاريخ الرصد", true),
            fNum("b", "عرض البوابة", "م", 0.1, 100, true),
            fNum("a", "الفتحة", "م", 0.01, 10, true),
            fNum("y1", "المنسوب أمام", "م", 0, 60, true),
            fNum("y3", "المنسوب خلف", "م", 0, 60, true),
            fSel("gstate", "حالة البوابة", "تعمل,تعمل جزئياً,متوقفة,تحت الصيانة")
          ].concat(fGeo()),
          widgets: [
            wKpi("عدد البوابات المرصودة", "count", "", "بوابة", "#", "green"),
            { id: uid("w"), type: "hydro", label: "التصرف المارّ من البوابات", calc: "gate", labelField: "gate",
              map: { b: { f: "b" }, a: { f: "a" }, y1: { f: "y1" }, y3: { f: "y3" } } },
            wChart("gate", "a", "الفتحات حسب البوابة"),
            wMap("مواقع البوابات"), wTable("سجل البوابات")
          ]
        };
      }
    },
    {
      id: "balance", group: "هيدروليك", name: "الاتزان المائى للقطاع",
      desc: "الوارد مقابل المنصرف لكل نقطة، ونسبة الإقفال وحالتها بنواة MWRIHyd",
      build: function () {
        return {
          id: uid("tab"), icon: "\u2696", eyebrow: "اتزان", title: "الاتزان المائى",
          source: { type: "firebase" },
          fields: [
            fCanal(), fTxt("point", "النقطة", true), fDate("day", "التاريخ", true),
            fNum("qin", "الوارد", "م³/ث", 0, 500, true),
            fNum("qout", "المنصرف", "م³/ث", 0, 500, true),
            fTxt("note", "ملاحظات")
          ],
          widgets: [
            { id: uid("w"), type: "hydro", label: "الاتزان المائى", calc: "balance", inField: "qin", outField: "qout", tol: 5 },
            wChart("point", "qin", "الوارد حسب النقطة"),
            wTable("سجل الاتزان")
          ]
        };
      }
    },
    {
      id: "assets", group: "حصر", name: "حصر الأصول والمنشآت",
      desc: "حصر المنشآت المائية بحالتها الإنشائية وتاريخ آخر فحص واحتياجاتها",
      build: function () {
        return {
          id: uid("tab"), icon: "\u2354", eyebrow: "حصر", title: "حصر المنشآت",
          source: { type: "firebase" },
          fields: [
            fTxt("code", "كود المنشأ", true), fTxt("name", "اسم المنشأ", true),
            fCanal(), fKm("km", "الكيلومتر"),
            fSel("stype", "نوع المنشأ", "كوبرى,بدال,هدار,سيفون,عبارة صندوقية,عبارة ماسورة,بوابة,محطة رفع,مأخذ", true),
            fNum("year", "سنة الإنشاء", "", 1850, 2100),
            fSel("cond", "الحالة الإنشائية", "جيدة,مقبولة,متوسطة,سيئة,حرجة", true),
            fDate("lastCheck", "تاريخ آخر فحص"),
            fTxt("need", "الاحتياجات / التدخل المطلوب")
          ].concat(fGeo()),
          widgets: [
            wKpi("عدد المنشآت", "count", "", "منشأ", "#", "green"),
            wChart("stype", "", "المنشآت حسب النوع", "count"),
            wChart("cond", "", "المنشآت حسب الحالة الإنشائية", "count"),
            wMap("مواقع المنشآت", "name"), wTable("سجل المنشآت")
          ]
        };
      }
    },
    {
      id: "equip", group: "حصر", name: "حصر المعدات والمهمات",
      desc: "الكراكات واللوادر والسيارات: الحالة · الموقع · آخر صيانة · ساعات التشغيل",
      build: function () {
        return {
          id: uid("tab"), icon: "\u2699", eyebrow: "حصر", title: "المعدات والمهمات",
          source: { type: "firebase" },
          fields: [
            fTxt("code", "رقم المعدة", true), fTxt("name", "اسم المعدة", true),
            fSel("etype", "النوع", "كراكة,لودر,حفار,سيارة نقل,سيارة ركوب,مضخة,مولد,أخرى", true),
            fTxt("model", "الموديل"), fNum("year", "سنة الصنع", "", 1950, 2100),
            fSel("estate", "الحالة", "صالحة وتعمل,متوقفة للصيانة,معطلة,تحت العمرة,مستبعدة", true),
            fTxt("site", "موقع التواجد / الإدارة"),
            fNum("hrs", "ساعات التشغيل", "ساعة", 0),
            fDate("lastMaint", "تاريخ آخر صيانة")
          ],
          widgets: [
            wKpi("عدد المعدات", "count", "", "معدة", "#", "green"),
            wKpi("إجمالى ساعات التشغيل", "sum", "hrs", "ساعة", "\u03A3"),
            wChart("etype", "", "المعدات حسب النوع", "count"),
            wChart("estate", "", "المعدات حسب الحالة", "count"),
            wTable("سجل المعدات")
          ]
        };
      }
    },
    {
      id: "stores", group: "حصر", name: "حصر المخازن والأصناف",
      desc: "الأرصدة والحد الأدنى وحركة الصرف — مع مؤشر الأصناف تحت الحد",
      build: function () {
        return {
          id: uid("tab"), icon: "\u25A4", eyebrow: "مخازن", title: "المخازن والأصناف",
          source: { type: "firebase" },
          fields: [
            fTxt("code", "كود الصنف", true), fTxt("name", "اسم الصنف", true),
            fSel("unit", "وحدة القياس", "عدد,متر,متر مكعب,كيلوجرام,طن,لتر,لفة", true),
            fNum("qty", "الرصيد الحالى", "", 0, undefined, true),
            fNum("minQty", "الحد الأدنى", "", 0),
            fTxt("store", "المخزن"),
            fDate("lastMove", "تاريخ آخر حركة"),
            fTxt("note", "ملاحظات")
          ],
          widgets: [
            wKpi("عدد الأصناف", "count", "", "صنف", "#", "green"),
            wKpi("إجمالى الأرصدة", "sum", "qty", "", "\u03A3"),
            wChart("store", "qty", "الأرصدة حسب المخزن"),
            wTable("سجل الأصناف")
          ]
        };
      }
    },
    {
      id: "staff", group: "موارد بشرية", name: "بيانات العاملين",
      desc: "الهيكل الوظيفى: الوظيفة والدرجة وجهة العمل وحالة الخدمة — بلا بيانات شخصية حساسة",
      build: function () {
        return {
          id: uid("tab"), icon: "\u265F", eyebrow: "موارد بشرية", title: "بيانات العاملين",
          source: { type: "firebase" },
          fields: [
            fTxt("empNo", "الرقم الوظيفى", true), fTxt("name", "الاسم", true),
            fTxt("job", "الوظيفة"),
            fSel("grade", "الدرجة", "العالية,مدير عام,الأولى,الثانية,الثالثة,الرابعة,الخامسة,السادسة,حرفية"),
            fTxt("unit", "جهة العمل / الهندسة"),
            fSel("cat", "الفئة", "مهندسون,فنيون,إداريون,عمال,حراسة"),
            fDate("hired", "تاريخ التعيين"),
            fSel("estate", "حالة الخدمة", "بالخدمة,إعارة,ندب,إجازة بدون مرتب,معاش", true)
          ],
          widgets: [
            wKpi("عدد العاملين", "count", "", "موظف", "#", "green"),
            wChart("cat", "", "التوزيع حسب الفئة", "count"),
            wChart("unit", "", "التوزيع حسب جهة العمل", "count"),
            wTable("سجل العاملين")
          ]
        };
      }
    },
    {
      id: "leaves", group: "موارد بشرية", name: "الإجازات والحضور",
      desc: "رصد الإجازات والغياب بالربط بالرقم الوظيفى",
      build: function () {
        return {
          id: uid("tab"), icon: "\u2637", eyebrow: "موارد بشرية", title: "الإجازات والحضور",
          source: { type: "firebase" },
          fields: [
            fTxt("empNo", "الرقم الوظيفى", true), fTxt("name", "الاسم", true),
            fSel("ltype", "النوع", "اعتيادية,عارضة,مرضية,بدون مرتب,مأمورية,غياب", true),
            fDate("from", "من تاريخ", true), fDate("to", "إلى تاريخ"),
            fNum("days", "عدد الأيام", "يوم", 0, 365, true),
            fSel("lstate", "الموقف", "مطلوبة,معتمدة,مرفوضة,منفَّذة"),
            fTxt("note", "ملاحظات")
          ],
          widgets: [
            wKpi("إجمالى الأيام", "sum", "days", "يوم", "\u03A3"),
            wKpi("عدد الطلبات", "count", "", "طلب", "#", "green"),
            wChart("ltype", "days", "الأيام حسب نوع الإجازة"),
            wTable("سجل الإجازات")
          ]
        };
      }
    },
    {
      id: "training", group: "موارد بشرية", name: "التدريب والتأهيل",
      desc: "الدورات والجهات المنظّمة والساعات والنتيجة",
      build: function () {
        return {
          id: uid("tab"), icon: "\u2691", eyebrow: "تنمية قدرات", title: "التدريب والتأهيل",
          source: { type: "firebase" },
          fields: [
            fTxt("empNo", "الرقم الوظيفى", true), fTxt("name", "الاسم", true),
            fTxt("course", "اسم الدورة", true), fTxt("provider", "الجهة المنظّمة"),
            fDate("from", "من تاريخ"), fDate("to", "إلى تاريخ"),
            fNum("hrs", "عدد الساعات", "ساعة", 0, 2000),
            fSel("result", "النتيجة", "اجتاز,لم يجتز,جارٍ,منسحب")
          ],
          widgets: [
            wKpi("عدد المتدربين", "count", "", "متدرب", "#", "green"),
            wKpi("إجمالى الساعات", "sum", "hrs", "ساعة", "\u03A3"),
            wChart("course", "hrs", "الساعات حسب الدورة"),
            wTable("سجل التدريب")
          ]
        };
      }
    },
    {
      id: "tasks", group: "متابعة إدارية", name: "التكليفات والقرارات",
      desc: "متابعة تنفيذ التكليفات والقرارات بمواعيدها ونِسَب إنجازها",
      build: function () {
        return {
          id: uid("tab"), icon: "\u2611", eyebrow: "متابعة", title: "التكليفات والقرارات",
          source: { type: "firebase" },
          fields: [
            fTxt("subject", "الموضوع", true),
            fSel("src", "مصدر التكليف", "الوزير,رئيس المصلحة,الإدارة المركزية,اجتماع,مراسلة واردة,أخرى", true),
            fTxt("owner", "جهة التنفيذ / المسؤول"),
            fDate("issued", "تاريخ التكليف"), fDate("due", "تاريخ الاستحقاق"),
            fPct("pct", "نسبة الإنجاز"),
            fSel("tstate", "الموقف", "لم يبدأ,جارٍ,متأخر,منفَّذ,ملغى", true),
            fTxt("note", "ملاحظات")
          ],
          widgets: [
            wKpi("عدد التكليفات", "count", "", "تكليف", "#", "green"),
            wKpi("متوسط الإنجاز", "avg", "pct", "%", "\u25D4", "sand"),
            wChart("tstate", "", "التكليفات حسب الموقف", "count"),
            wChart("src", "", "التكليفات حسب المصدر", "count"),
            wTable("سجل التكليفات")
          ]
        };
      }
    },
    {
      id: "mail", group: "متابعة إدارية", name: "المراسلات الواردة والصادرة",
      desc: "قيد المراسلات بأرقامها وتواريخها وجهاتها وموقف الردّ",
      build: function () {
        return {
          id: uid("tab"), icon: "\u2709", eyebrow: "سكرتارية", title: "المراسلات",
          source: { type: "firebase" },
          fields: [
            fSel("dir", "النوع", "وارد,صادر", true),
            fTxt("no", "رقم القيد", true), fDate("day", "التاريخ", true),
            fTxt("party", "الجهة"), fTxt("subject", "الموضوع", true),
            fSel("mstate", "الموقف", "قيد الفحص,محال,تم الرد,محفوظ", true),
            fTxt("ref", "المرفقات / الإحالة")
          ],
          widgets: [
            wKpi("عدد المراسلات", "count", "", "مراسلة", "#", "green"),
            wChart("party", "", "المراسلات حسب الجهة", "count"),
            wChart("mstate", "", "المراسلات حسب الموقف", "count"),
            wTable("سجل المراسلات")
          ]
        };
      }
    }
  ];


  /* ---------------- معالج بناء التبويب (بلا ذكاء اصطناعى ولا مفاتيح) ---------------- */
  /* يحوّل إجابات خمسة أسئلة إلى تبويب كامل من نفس مكعّبات القوالب */
  var WIZ_Q = [
    { id: "kind", q: "التبويب ده هيتابع إيه؟", type: "choice",
      opts: [["works", "أعمال تنفيذ على المجارى"], ["assets", "منشآت وأصول"],
             ["measure", "قياسات ميدانية"], ["register", "سجل مرجعى (ترع/جهات)"],
             ["inventory", "حصر مخزنى أو معدات"], ["hr", "موارد بشرية"],
             ["admin", "متابعة إدارية (تكليفات/مراسلات)"]] },
    { id: "title", q: "اسم التبويب؟", type: "text", ph: "مثال: تبطين ترع مركز البدرشين" },
    { id: "geo", q: "فيه مواقع تتحطّ على الخريطة؟", type: "choice",
      opts: [["1", "نعم — أضف إحداثيات وخريطة"], ["0", "لا"]] },
    { id: "prog", q: "فيه متابعة تنفيذ (نسبة ومقاول وتواريخ)؟", type: "choice",
      opts: [["1", "نعم"], ["0", "لا"]],
      when: function (a) { return a.kind === "works" || a.kind === "assets" || a.kind === "admin"; } },
    { id: "qty", q: "فيه كميات أو أطوال منفّذة؟", type: "choice",
      opts: [["len", "أطوال بالمتر"], ["vol", "كميات بالمتر المكعب"], ["both", "الاتنين"], ["0", "لا"]],
      when: function (a) { return a.kind === "works"; } },
    { id: "hyd", q: "فيه حساب هيدروليكى؟", type: "choice",
      opts: [["0", "لا"], ["manning", "مانينج — تصرف وسرعة"], ["gate", "تصرف بوابة"], ["balance", "اتزان مائى"]],
      when: function (a) { return a.kind === "measure" || a.kind === "works"; } }
  ];
  function wizSteps(ans) {
    return WIZ_Q.filter(function (q) { return !q.when || q.when(ans); });
  }
  function wizardTab(a) {
    var F = [], W = [], title = (a.title || "تبويب جديد").trim();
    var isReg = a.kind === "register";

    if (a.kind === "inventory") {
      F.push(fTxt("code", "الكود", true));
      F.push(fTxt("name", "الاسم / الصنف", true));
      F.push(fSel("itype", "النوع", "معدة,صنف مخزنى,مهمة,قطعة غيار,أخرى", true));
      F.push(fSel("unit", "وحدة القياس", "عدد,متر,متر مكعب,كيلوجرام,طن,لتر"));
      F.push(fNum("qty", "الرصيد / الكمية", "", 0, undefined, true));
      F.push(fNum("minQty", "الحد الأدنى", "", 0));
      F.push(fSel("istate", "الحالة", "صالح,تحت الصيانة,معطل,مستبعد", true));
      F.push(fTxt("site", "الموقع / المخزن"));
      F.push(fDate("lastMove", "تاريخ آخر حركة"));
      W.push(wKpi("عدد البنود", "count", "", "بند", "#", "green"));
      W.push(wKpi("إجمالى الأرصدة", "sum", "qty", "", "\u03A3"));
      W.push(wChart("itype", "qty", "الأرصدة حسب النوع"));
      W.push(wChart("istate", "", "البنود حسب الحالة", "count"));
    } else if (a.kind === "hr") {
      F.push(fTxt("empNo", "الرقم الوظيفى", true));
      F.push(fTxt("name", "الاسم", true));
      F.push(fTxt("job", "الوظيفة"));
      F.push(fTxt("unit", "جهة العمل / الهندسة"));
      F.push(fSel("cat", "الفئة", "مهندسون,فنيون,إداريون,عمال,حراسة"));
      F.push(fDate("day", "التاريخ"));
      F.push(fSel("hstate", "الموقف", "بالخدمة,إجازة,ندب,إعارة,معاش", true));
      F.push(fTxt("note", "ملاحظات"));
      W.push(wKpi("عدد السجلات", "count", "", "سجل", "#", "green"));
      W.push(wChart("cat", "", "التوزيع حسب الفئة", "count"));
      W.push(wChart("unit", "", "التوزيع حسب جهة العمل", "count"));
    } else if (a.kind === "admin") {
      F.push(fTxt("subject", "الموضوع", true));
      F.push(fSel("src", "المصدر", "الوزير,رئيس المصلحة,الإدارة المركزية,اجتماع,مراسلة واردة,أخرى", true));
      F.push(fTxt("owner", "جهة التنفيذ / المسؤول"));
      F.push(fDate("issued", "تاريخ التكليف"));
      W.push(wKpi("عدد البنود", "count", "", "بند", "#", "green"));
      W.push(wChart("src", "", "التوزيع حسب المصدر", "count"));
    } else if (isReg) {
      F.push({ id: "code", label: "كود المجرى", type: "text", required: true });
      F.push({ id: "name", label: "اسم المجرى", type: "text", required: true });
      F.push({ id: "admin", label: "الإدارة", type: "text" });
      F.push({ id: "eng", label: "الهندسة", type: "text" });
      F.push({ id: "ctype", label: "نوع المجرى", type: "select", options: "ترعة,رياح,مصرف,مسقى,مجرى مغطى" });
      F.push({ id: "lenKm", label: "الطول", type: "number", unit: "ك.م", min: 0, max: 2000 });
      F.push({ id: "area", label: "الزمام", type: "number", unit: "فدان", min: 0 });
      F.push({ id: "qDesign", label: "التصرف المقنن", type: "number", unit: "م³/ث", min: 0, max: 500 });
      W.push({ id: uid("w"), type: "kpi", label: "عدد المجارى المسجّلة", agg: "count", field: "", unit: "مجرى", icon: "#", style: "green" });
      W.push({ id: uid("w"), type: "kpi", label: "إجمالى الأطوال", agg: "sum", field: "lenKm", unit: "ك.م", icon: "\u03A3" });
      W.push({ id: uid("w"), type: "kpi", label: "إجمالى الزمام", agg: "sum", field: "area", unit: "فدان", icon: "\u25A6", style: "sand" });
      W.push({ id: uid("w"), type: "chart", label: "الأطوال حسب الهندسة", labelField: "eng", valueField: "lenKm", agg: "sum", chartType: "bar" });
    } else {
      F.push(fCanal());
      if (a.kind === "assets") {
        F.push({ id: "name", label: "اسم المنشأ", type: "text", required: true });
        F.push({ id: "stype", label: "نوع المنشأ", type: "select", required: true,
          options: "كوبرى,بدال,هدار,سيفون,عبارة صندوقية,عبارة ماسورة,بوابة,محطة رفع" });
        F.push({ id: "km", label: "الكيلومتر", type: "number", unit: "ك.م", min: 0, max: 2000 });
      } else if (a.kind === "measure") {
        F.push({ id: "point", label: "نقطة القياس", type: "text", required: true });
        F.push({ id: "km", label: "الكيلومتر", type: "number", unit: "ك.م", min: 0, max: 2000 });
        F.push({ id: "day", label: "تاريخ القياس", type: "date", required: true });
      } else {
        F.push({ id: "wtype", label: "نوع العمل", type: "select", required: true,
          options: "تبطين خرسانى,تكسية دبش,تغطية خرسانية,مواسير,كوبرى,تطهير,إحلال وتجديد,حماية جسور" });
        F.push(fKm("kmFrom", "من كيلو"));
        F.push(fKm("kmTo", "إلى كيلو"));
      }
      if (a.qty === "len" || a.qty === "both") F.push(fLen("م"));
      if (a.qty === "vol" || a.qty === "both") F.push({ id: "qty", label: "الكمية المنفّذة", type: "number", unit: "م³", min: 0 });
      if (a.prog === "1") {
        F.push(fPct("pct", "نسبة التنفيذ"));
        F.push(fStatus());
        F.push(fContractor());
        fDates().forEach(function (d) { F.push(d); });
      }
    }

    /* حقول الحساب الهيدروليكى — تُضاف فقط بما يحتاجه الحساب المختار */
    var hy = a.hyd && a.hyd !== "0" ? a.hyd : "";
    if (hy === "manning") {
      F.push({ id: "b", label: "عرض القاع", type: "number", unit: "م", required: true, min: 0.1, max: 500 });
      F.push({ id: "y", label: "عمق الماء", type: "number", unit: "م", required: true, min: 0.01, max: 20 });
      F.push({ id: "n", label: "معامل الخشونة", type: "number", required: true, min: 0.012, max: 0.075 });
    } else if (hy === "gate") {
      F.push({ id: "b", label: "عرض البوابة", type: "number", unit: "م", required: true, min: 0.1, max: 100 });
      F.push({ id: "a", label: "فتحة البوابة", type: "number", unit: "م", required: true, min: 0.01, max: 10 });
      F.push({ id: "y1", label: "المنسوب أمام", type: "number", unit: "م", required: true, min: 0, max: 60 });
      F.push({ id: "y3", label: "المنسوب خلف", type: "number", unit: "م", required: true, min: 0, max: 60 });
    } else if (hy === "balance") {
      F.push({ id: "qin", label: "الوارد", type: "number", unit: "م³/ث", required: true, min: 0, max: 500 });
      F.push({ id: "qout", label: "المنصرف", type: "number", unit: "م³/ث", required: true, min: 0, max: 500 });
    }

    if (a.geo === "1") { fGeo().forEach(function (g) { F.push(g); }); }

    /* المؤشرات والرسوم */
    if (!isReg) {
      W.push(wCount("عدد البنود"));
      if (a.qty === "len" || a.qty === "both") W.push(wSumLen("م"));
      if (a.qty === "vol" || a.qty === "both") {
        W.push({ id: uid("w"), type: "kpi", label: "إجمالى الكميات", agg: "sum", field: "qty", unit: "م³", icon: "\u2211", style: "green" });
      }
      if (a.prog === "1") W.push(wProgress());
      var catField = a.kind === "assets" ? "stype" : (a.kind === "measure" ? "point" : "wtype");
      var valField = (a.qty === "len" || a.qty === "both") ? "len" : ((a.qty === "vol" || a.qty === "both") ? "qty" : "");
      if (valField) {
        W.push({ id: uid("w"), type: "chart", label: "التجميع حسب التصنيف", labelField: catField, valueField: valField, agg: "sum", chartType: "bar" });
      }
    }
    if (hy === "manning") {
      W.push({ id: uid("w"), type: "hydro", label: "مانينج — تصرف وسرعة ورقابة", calc: "manning",
        labelField: isReg ? "name" : (a.kind === "measure" ? "point" : "canal"),
        map: { b: { f: "b" }, y: { f: "y" }, z: { c: 2 }, n: { f: "n" }, S: { c: 0.0001 } } });
    } else if (hy === "gate") {
      W.push({ id: uid("w"), type: "hydro", label: "تصرف البوابات", calc: "gate",
        labelField: a.kind === "measure" ? "point" : "canal",
        map: { b: { f: "b" }, a: { f: "a" }, y1: { f: "y1" }, y3: { f: "y3" } } });
    } else if (hy === "balance") {
      W.push({ id: uid("w"), type: "hydro", label: "الاتزان المائى", calc: "balance", inField: "qin", outField: "qout", tol: 5 });
    }
    if (a.geo === "1") {
      W.push({ id: uid("w"), type: "map", label: "المواقع على الخريطة", latField: "lat", lngField: "lng",
        labelField: isReg ? "name" : (a.kind === "assets" ? "name" : (a.kind === "measure" ? "point" : "canal")), base: "esri" });
    }
    W.push(wTable("السجلات"));

    var icons = { works: "\u2692", assets: "\u2354", measure: "\u25CE", register: "\u2261",
                  inventory: "\u25A4", hr: "\u265F", admin: "\u2611" };
    var eyes = { works: "متابعة تنفيذ", assets: "منشآت", measure: "قياسات", register: "مرجع",
                 inventory: "حصر", hr: "موارد بشرية", admin: "متابعة إدارية" };
    return {
      id: uid("tab"), icon: icons[a.kind] || "\u25A3", eyebrow: eyes[a.kind] || "قسم",
      title: title, source: { type: "firebase" }, fields: F, widgets: W,
      notes: (hy === "manning" ? "ثابتان مبدئيان: ميل الجوانب z=2 وميل القاع S=0.0001 — عدّلهما من إعداد العنصر. " : "")
        + (a.kind === "hr" ? "بيانات العاملين شخصية: لا تُدخل رقماً قومياً ولا بيانات مرتبات ولا بيانات صحية — قاعدة التطبيق مفتوحة القراءة حالياً." : "")
    };
  }


  /* ---------------- التصميم الهيدروليكى للمنشآت ----------------
     كل رقم يخرج من MWRIHyd. ما لا تحسبه النواة لا يُخترع هنا:
     التصميم الإنشائى (حديد التسليح · سُمك البلاطة · الأساسات) خارج النطاق تماماً،
     والمخرَج هنا هو **المقاس الهيدروليكى والكميات** لا لوحة تنفيذية. */
  var DESIGN = {
    canalSection: {
      name: "تصميم قطاع مجرى (ترعة/مصرف)",
      note: "يحسب العمق الطبيعى للتصرف المطلوب ويتحقق من السرعة والحالة، ويقترح البؤبؤ (freeboard) بقاعدة ٣٠٪ من العمق بحد أدنى ٣٠ سم.",
      inputs: [["Q", "التصرف التصميمى", "م³/ث", { min: 0.0001 }], ["b", "عرض القاع", "م", { min: 0.01 }],
               ["z", "ميل الجوانب z:1", "", { min: 0 }], ["n", "معامل الخشونة", "", { min: 0.008, max: 0.2 }],
               ["S", "ميل القاع", "", { min: 0.000001, max: 0.5 }]],
      run: function (v) {
        var y = MWRIHyd.normalDepth(v.Q, v.b, v.z, v.n, v.S);
        var sec = MWRIHyd.trapSection(v.b, y, v.z);
        var V = v.Q / sec.A;
        var yc = MWRIHyd.criticalDepth(v.Q, v.b, v.z);
        var Fr = MWRIHyd.froude(v.Q, sec.A, sec.T);
        var fb = Math.max(0.3, 0.3 * y);
        var yTot = y + fb;
        var secTot = MWRIHyd.trapSection(v.b, yTot, v.z);
        return {
          out: [["العمق الطبيعى y", y, "م"], ["السرعة V", V, "م/ث"], ["فرود Fr", Fr, ""],
                ["العمق الحرج yc", yc, "م"], ["مساحة القطاع A", sec.A, "م²"],
                ["البؤبؤ المقترح", fb, "م"], ["العمق الكلى للجسر", yTot, "م"],
                ["عرض السطح عند الجسر", secTot.T, "م"],
                ["حجم الحفر لكل متر طولى", secTot.A, "م³/م"]],
          flags: MWRIHyd.sanityCheck({ V: V, Fr: Fr, n: v.n })
        };
      }
    },
    culvertPipe: {
      name: "تقدير أولى: مواسير / عبارة دائرية",
      note: "تقدير أولى بمانينج عند نسبة ملء ٠٫٨D. لا يشمل تحكّم المدخل أو المخرج، ولا فواقد الدخول والخروج، ولا الغمر — فلا يصلح وحده لاعتماد تنفيذى.",
      inputs: [["Q", "التصرف التصميمى", "م³/ث", { min: 0.0001 }], ["lines", "عدد الخطوط", "", { min: 1, int: true }],
               ["n", "معامل الخشونة", "", { min: 0.008, max: 0.2 }], ["S", "الميل الطولى", "", { min: 0.000001, max: 0.5 }]],
      run: function (v) {
        var q = v.Q / Math.max(1, v.lines);
        /* قطاع دائرى بنسبة ملء 0.8D: A و R بدلالة D بصيغة القطاع الدائرى الجزئى */
        var th = 2 * Math.acos(1 - 2 * 0.8);           /* الزاوية المركزية عند y/D=0.8 */
        var kA = (th - Math.sin(th)) / 8;               /* A = kA * D^2 */
        var kR = (1 - Math.sin(th) / th) / 4;           /* R = kR * D  */
        var f = function (D) {
          return MWRIHyd.manningQ(v.n, kA * D * D, kR * D, v.S) - q;
        };
        var D = MWRIHyd.bisect ? MWRIHyd.bisect(f, 0.05, 6) : NaN;
        if (isNaN(D)) {
          /* حلّ مباشر: Q = (1/n) kA D^2 (kR D)^(2/3) S^0.5  →  D = ( q n / (kA kR^(2/3) sqrt(S)) )^(3/8) */
          D = Math.pow((q * v.n) / (kA * Math.pow(kR, 2 / 3) * Math.sqrt(v.S)), 3 / 8);
        }
        var A = kA * D * D, V = q / A;
        var comm = [0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.5, 1.8, 2.0, 2.5, 3.0];
        var pick = comm[comm.length - 1];
        for (var i = 0; i < comm.length; i++) { if (comm[i] >= D) { pick = comm[i]; break; } }
        var Ap = kA * pick * pick, Vp = q / Ap;
        return {
          out: [["نصيب الخط الواحد", q, "م³/ث"], ["القطر النظرى", D, "م"],
                ["القطر التجارى المقترح", pick, "م"], ["السرعة عند القطر النظرى", V, "م/ث"],
                ["السرعة عند القطر التجارى", Vp, "م/ث"], ["نسبة الملء المفترضة", 0.8, "من القطر"]],
          flags: MWRIHyd.sanityCheck({ V: Vp, n: v.n })
        };
      }
    },
    boxCulvert: {
      name: "تقدير أولى: عبارة صندوقية / تغطية",
      note: "تقدير أولى: ارتفاع صافٍ بمانينج عند ملء ٠٫٨ وكميات خرسانة هندسية. لا يشمل تحكّم المدخل/المخرج ولا الفواقد ولا الغمر ولا أى حساب إنشائى.",
      inputs: [["Q", "التصرف التصميمى", "م³/ث", { min: 0.0001 }], ["b", "عرض الفتحة الصافى", "م", { min: 0.1 }],
               ["cells", "عدد الفتحات", "", { min: 1, int: true }], ["n", "معامل الخشونة", "", { min: 0.008, max: 0.2 }],
               ["S", "الميل الطولى", "", { min: 0.000001, max: 0.5 }],
               ["t", "سُمك الجدران والبلاطات", "م", { min: 0.05 }], ["L", "طول العبارة", "م", { min: 0.5 }]],
      run: function (v) {
        var q = v.Q / Math.max(1, v.cells);
        var f = function (h) {
          var y = 0.8 * h, A = v.b * y, P = v.b + 2 * y;
          return MWRIHyd.manningQ(v.n, A, A / P, v.S) - q;
        };
        var h = MWRIHyd.bisect ? MWRIHyd.bisect(f, 0.1, 8) : NaN;
        var y = 0.8 * h, A = v.b * y, V = q / A;
        var comm = Math.ceil(h * 20) / 20;              /* تقريب لأقرب ٥ سم */
        var outer = (v.b * v.cells + v.t * (v.cells + 1)) * (comm + 2 * v.t);
        var inner = v.b * comm * v.cells;
        var conc = (outer - inner) * v.L;
        return {
          out: [["نصيب الفتحة الواحدة", q, "م³/ث"], ["الارتفاع الصافى المطلوب", h, "م"],
                ["الارتفاع المقرَّب", comm, "م"], ["السرعة داخل العبارة", V, "م/ث"],
                ["العرض الكلى الخارجى", v.b * v.cells + v.t * (v.cells + 1), "م"],
                ["حجم الخرسانة التقديرى", conc, "م³"]],
          flags: MWRIHyd.sanityCheck({ V: V, n: v.n })
        };
      }
    },
    gateSize: {
      name: "تحديد فتحة بوابة لتصرف مستهدف",
      note: "حلّ عكسى لمعادلة البوابة بمعامل انكماش ٠٫٦١. المدخل عمق الماء فوق عتب البوابة لا منسوب مطلق. تصنيف الجريان الحر/المغمور فى النواة مبسّط — عايره بقياس فعلى قبل الاعتماد التشغيلى.",
      inputs: [["Q", "التصرف المستهدف", "م³/ث", { min: 0.0001 }], ["b", "عرض البوابة", "م", { min: 0.05 }],
               ["y1", "عمق الماء أمام البوابة فوق العتب", "م", { min: 0.01 }]],
      run: function (v) {
        var a = MWRIHyd.gateOpeningFor(v.Q, v.b, v.y1, 0.61);
        var chk = MWRIHyd.gateFlow({ b: v.b, a: a, y1: v.y1 });
        return {
          out: [["الفتحة المطلوبة a", a, "م"], ["نسبة الفتحة a/y1", a / v.y1, ""],
                ["التصرف المتحقق", chk.Q, "م³/ث"], ["معامل التصرف Cd", chk.Cd, ""], ["الحالة", 0, chk.mode]],
          flags: (a / v.y1 > 0.8) ? [{ level: "تنبيه", msg: "الفتحة تقارب المنسوب أمامها — البوابة خارج مدى التحكم العملى" }] : []
        };
      }
    },
    weirSize: {
      name: "تحديد طول هدار لحمل معين",
      note: "هدار حاد القمة بمعادلة Rehbock. للهدار عريض القمة استخدم النواة مباشرة بمعامل ٠٫٨٥.",
      inputs: [["Q", "التصرف التصميمى", "م³/ث", { min: 0.0001 }], ["H", "الحمل فوق القمة", "م", { min: 0.01 }],
               ["P", "ارتفاع القمة", "م", { min: 0.01 }]],
      run: function (v) {
        var q1 = MWRIHyd.sharpCrestedWeir(1, v.H, v.P);     /* التصرف لكل متر طول */
        var L = v.Q / q1;
        var Lb = MWRIHyd.broadCrestedWeir(1, v.H);
        return {
          out: [["التصرف لكل متر طول", q1, "م³/ث/م"], ["الطول المطلوب (حاد القمة)", L, "م"],
                ["الطول المكافئ (عريض القمة)", v.Q / Lb, "م"]],
          flags: (v.H / Math.max(v.P, 1e-6) > 0.5)
            ? [{ level: "تنبيه", msg: "نسبة H/P تتجاوز 0.5 — معادلة Rehbock تفقد دقتها" }] : []
        };
      }
    },
    lining: {
      name: "تبطين / تكسية دبش — الكميات وفحص السرعة",
      note: "يحسب المساحة المبلّلة والكميات من الهندسة. سُمك التكسية بقاعدة ميدانية شائعة (٢٠–٣٠ سم للسرعات حتى ٢ م/ث) وليست معياراً مقنّناً — راجعها مع الاشتراطات المعتمدة.",
      inputs: [["b", "عرض القاع", "م", { min: 0.01 }], ["y", "عمق الماء", "م", { min: 0.01 }], ["z", "ميل الجوانب z:1", "", { min: 0 }],
               ["L", "طول القطاع", "م", { min: 0.5 }], ["t", "سُمك التبطين", "م", { min: 0.01 }],
               ["n", "الخشونة بعد التبطين", "", { min: 0.008, max: 0.2 }], ["S", "ميل القاع", "", { min: 0.000001, max: 0.5 }]],
      run: function (v) {
        var sec = MWRIHyd.trapSection(v.b, v.y, v.z);
        var V = MWRIHyd.manningV(v.n, sec.R, v.S);
        var Q = MWRIHyd.manningQ(v.n, sec.A, sec.R, v.S);
        var wetted = sec.P * v.L;
        var vol = wetted * v.t;
        return {
          out: [["المحيط المبلّل", sec.P, "م"], ["المساحة المطلوب تبطينها", wetted, "م²"],
                ["حجم مواد التبطين", vol, "م³"], ["التصرف بعد التبطين", Q, "م³/ث"],
                ["السرعة بعد التبطين", V, "م/ث"]],
          flags: MWRIHyd.sanityCheck({ V: V, n: v.n })
        };
      }
    },
    bridgeOpening: {
      name: "تقدير أولى: الفتحة المائية لكوبرى",
      note: "تقدير أولى: مساحة مائية = Q/V موزّعة على البحور. لا يشمل الارتداد (afflux) ولا أثر الأعمدة ولا النحر ولا المخلفات ولا أى حساب إنشائى.",
      inputs: [["Q", "التصرف التصميمى", "م³/ث", { min: 0.0001 }], ["Vall", "السرعة المسموحة أسفل الكوبرى", "م/ث", { min: 0.05, max: 5 }],
               ["spans", "عدد البحور", "", { min: 1, int: true }], ["y", "عمق الماء التصميمى", "م", { min: 0.05 }],
               ["clr", "الارتفاع فوق سطح الماء", "م", { min: 0 }]],
      run: function (v) {
        var A = v.Q / v.Vall;
        var W = A / v.y;
        var span = W / Math.max(1, v.spans);
        var Vact = v.Q / (W * v.y);
        return {
          out: [["المساحة المائية المطلوبة", A, "م²"], ["عرض الفتحة الكلى", W, "م"],
                ["اتساع البحر الواحد", span, "م"], ["السرعة المتحققة", Vact, "م/ث"],
                ["منسوب أسفل الكمرة فوق القاع", v.y + v.clr, "م"]],
          flags: MWRIHyd.sanityCheck({ V: Vact })
        };
      }
    }
  };


  /* ---------------- بوابة الإدارة (كلمة سر تُضبط من داخل التطبيق) ----------------
     تُخزَّن كملح + بصمة PBKDF2-SHA256 بـ200000 دورة — لا تُخزَّن كلمة السر أبداً.
     المصارحة الواجبة: قواعد RTDB مفتوحة، فمن يعرف عنوان القاعدة يكتب فيها مباشرة
     بلا مرور على الواجهة. هذه البوابة **ردع وتنظيم صلاحيات**، لا حماية تشفيرية. */
  var GATE_ITER = 200000;

  function toB64(buf) {
    var b = new Uint8Array(buf), s2 = "";
    for (var i = 0; i < b.length; i++) s2 += String.fromCharCode(b[i]);
    return btoa(s2);
  }
  function fromB64(str) {
    var bin = atob(str), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function hasCrypto() {
    return typeof crypto !== "undefined" && crypto.subtle && typeof TextEncoder !== "undefined";
  }
  function derive(pw, saltBytes, iter) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(pw), { name: "PBKDF2" }, false, ["deriveBits"])
      .then(function (key) {
        return crypto.subtle.deriveBits(
          { name: "PBKDF2", salt: saltBytes, iterations: iter || GATE_ITER, hash: "SHA-256" }, key, 256);
      });
  }
  function sessionKey() { return CFG.appId + "_admin_session"; }
  function triesKey() { return CFG.appId + "_admin_tries"; }

  var gate = {
    /* إعدادات البوابة مشتركة فى القاعدة: تُضبط من جهاز وتسرى على الجميع */
    load: function () {
      return db.get(CFG.root + "/data/settings/admin").catch(function () { return null; });
    },
    isSet: function (cfg) { return !!(cfg && cfg.hash && cfg.salt); },
    setPassword: function (pw) {
      if (!hasCrypto()) return Promise.reject(new Error("المتصفح لا يدعم التشفير — افتح التطبيق عبر HTTPS"));
      if (!pw || pw.length < 6) return Promise.reject(new Error("كلمة السر لا تقل عن ٦ محارف"));
      var salt = crypto.getRandomValues(new Uint8Array(16));
      return derive(pw, salt, GATE_ITER).then(function (bits) {
        return db.put(CFG.root + "/data/settings/admin", {
          salt: toB64(salt), hash: toB64(bits), iter: GATE_ITER, setAt: Date.now()
        });
      });
    },
    clear: function () { return db.del(CFG.root + "/data/settings/admin"); },
    verify: function (pw, cfg) {
      if (!hasCrypto()) return Promise.reject(new Error("المتصفح لا يدعم التشفير"));
      if (!gate.isSet(cfg)) return Promise.resolve(false);
      return derive(pw, fromB64(cfg.salt), cfg.iter || GATE_ITER).then(function (bits) {
        var a = new Uint8Array(bits), b = fromB64(cfg.hash);
        if (a.length !== b.length) return false;
        var diff = 0;                       /* مقارنة ثابتة الزمن */
        for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
        return diff === 0;
      });
    },
    /* قفل مؤقت بعد ٥ محاولات خاطئة */
    lockedFor: function () {
      var t = 0;
      try { t = parseInt(localStorage.getItem(triesKey() + "_until") || "0", 10); } catch (e) { t = 0; }
      var left = t - Date.now();
      return left > 0 ? Math.ceil(left / 1000) : 0;
    },
    noteFail: function () {
      var n = 0;
      try { n = parseInt(localStorage.getItem(triesKey()) || "0", 10) + 1; localStorage.setItem(triesKey(), String(n)); } catch (e) { }
      if (n >= 5) {
        try { localStorage.setItem(triesKey() + "_until", String(Date.now() + 60000)); localStorage.setItem(triesKey(), "0"); } catch (e) { }
        return 60;
      }
      return 0;
    },
    resetFails: function () { try { localStorage.setItem(triesKey(), "0"); localStorage.setItem(triesKey() + "_until", "0"); } catch (e) { } },
    unlock: function (hours) {
      try { localStorage.setItem(sessionKey(), String(Date.now() + (hours || 12) * 3600000)); } catch (e) { }
    },
    lock: function () { try { localStorage.setItem(sessionKey(), "0"); } catch (e) { } },
    isUnlocked: function () {
      var t = 0;
      try { t = parseInt(localStorage.getItem(sessionKey()) || "0", 10); } catch (e) { t = 0; }
      return t > Date.now();
    },
    sessionLeft: function () {
      var t = 0;
      try { t = parseInt(localStorage.getItem(sessionKey()) || "0", 10); } catch (e) { t = 0; }
      var m = Math.floor((t - Date.now()) / 60000);
      return m > 0 ? m : 0;
    }
  };


  /* ---------------- لقطة المؤشرات اليومية (خط اتجاه بلا خادم) ----------------
     تُكتب لقطة واحدة يومياً عند أول فتح للتطبيق: أول جهاز يفتح يكتبها والباقى يجدها.
     لا مهام مجدولة ولا خادم — الثمن نداءُ قراءة واحد يومياً لكل جهاز. */
  function dayKey(d) {
    d = d || new Date();
    function p(x) { return (x < 10 ? "0" : "") + x; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function metricId(tabId, widgetId) { return tabId + "|" + widgetId; }
  function snapshotItems(schema, allMap) {
    var items = [];
    toArr(schema && schema.tabs).forEach(function (t) {
      var e = allMap[t.id];
      if (!e) return;
      items.push({
        mid: metricId(t.id, "__count"), tab: t.title,
        label: "عدد سجلات " + t.title, unit: "سجل", value: e.rows.length
      });
      toArr(t.widgets).forEach(function (w) {
        if (w.type === "kpi") {
          try {
            items.push({ mid: metricId(t.id, w.id), tab: t.title, label: w.label, unit: w.unit || "",
              value: aggregate(w.agg || "count", w.field || "", e.rows) });
          } catch (err) { /* مؤشر معطوب لا يُسقط اللقطة */ }
        } else if (w.type === "formula") {
          try {
            var v = evalExpr(w.expr, e.rows);
            if (isFinite(v)) items.push({ mid: metricId(t.id, w.id), tab: t.title, label: w.label, unit: w.unit || "", value: v });
          } catch (err) { }
        }
      });
    });
    return items;
  }
  function takeSnapshot(schema, by) {
    return loadAllRecords(schema).then(function (m) {
      var items = snapshotItems(schema, m);
      return db.put(CFG.root + "/data/trend/" + dayKey(), {
        at: Date.now(), by: by || "تلقائى", version: schema.version || 0, items: items
      }).then(function () { return items.length; });
    });
  }
  /* تُستدعى عند الإقلاع: تكتب فقط إن لم توجد لقطة اليوم */
  function ensureSnapshot(schema, by) {
    return db.get(CFG.root + "/data/trend/" + dayKey()).then(function (t) {
      if (t && t.items) return 0;
      return takeSnapshot(schema, by);
    });
  }
  function loadTrend() {
    return db.get(CFG.root + "/data/trend").then(function (o) {
      var out = [];
      Object.keys(o || {}).forEach(function (k) {
        var v = o[k];
        if (v && v.items) out.push({ day: k, at: v.at, items: toArr(v.items) });
      });
      out.sort(function (a, b) { return a.day < b.day ? -1 : (a.day > b.day ? 1 : 0); });
      return out;
    });
  }
  function trendSeries(snaps, mid) {
    var out = [];
    snaps.forEach(function (sn) {
      var hit = null;
      sn.items.forEach(function (it) { if (!hit && it.mid === mid) hit = it; });
      if (hit && isFinite(hit.value)) out.push({ label: sn.day.slice(5), value: hit.value, day: sn.day, unit: hit.unit, name: hit.label });
    });
    return out;
  }


  /* ---------------- قواعد الإنذار (تقييم صفّ بصفّ، بلا eval) ----------------
     محلّل مستقل عن evalExpr: هذا يعمل على قيم السجل الواحد ويعيد صواب/خطأ،
     وذاك يعمل على مجموعة السجلات ويعيد رقماً. لم يُدمجا حتى لا تنكسر المعادلات القائمة. */
  var RULE_FUNCS = { today: 1, empty: 1, filled: 1, days: 1 };
  function tokenizeRule(src) {
    var t = [], i = 0, W = /[A-Za-z0-9_\u0600-\u06FF]/;
    var two = ["<=", ">=", "==", "!=", "<>", "&&", "||"];
    while (i < src.length) {
      var c = src.charAt(i);
      if (c === " ") { i++; continue; }
      var pair = src.substr(i, 2);
      if (two.indexOf(pair) >= 0) { t.push({ k: "op", v: pair }); i += 2; continue; }
      if ("<>=".indexOf(c) >= 0) { t.push({ k: "op", v: c }); i++; continue; }
      if ("+-*/(),!".indexOf(c) >= 0) { t.push({ k: c }); i++; continue; }
      if ((c >= "0" && c <= "9") || c === ".") {
        var j = i;
        while (j < src.length && ((src.charAt(j) >= "0" && src.charAt(j) <= "9") || src.charAt(j) === ".")) j++;
        t.push({ k: "num", v: parseFloat(src.slice(i, j)) }); i = j; continue;
      }
      if (c === "\u0022" || c === "'") {
        var q = c, m2 = i + 1, str = "";
        while (m2 < src.length && src.charAt(m2) !== q) { str += src.charAt(m2); m2++; }
        if (m2 >= src.length) throw new Error("نص غير مغلق");
        t.push({ k: "str", v: str }); i = m2 + 1; continue;
      }
      if (W.test(c)) {
        var m = i;
        while (m < src.length && W.test(src.charAt(m))) m++;
        t.push({ k: "id", v: src.slice(i, m) }); i = m; continue;
      }
      throw new Error("رمز غير مفهوم: " + c);
    }
    return t;
  }
  function dayNum(v) {
    /* تاريخ نصى YYYY-MM-DD إلى عدد أيام — ليصحّ مقارنته بـtoday() */
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
    if (!m) return null;
    return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
  }
  function ruleIdents(src) {
    var out = [], t;
    try { t = tokenizeRule(src); } catch (e) { return out; }
    for (var i = 0; i < t.length; i++) {
      if (t[i].k !== "id") continue;
      var isCall = t[i + 1] && t[i + 1].k === "(";
      if (isCall) continue;
      if (t[i].v === "and" || t[i].v === "or" || t[i].v === "not") continue;
      if (out.indexOf(t[i].v) < 0) out.push(t[i].v);
    }
    return out;
  }
  function evalRule(src, row) {
    var t = tokenizeRule(src), p = 0;
    function peek() { return t[p]; }
    function isOp(v) { var x = peek(); return x && x.k === "op" && x.v === v; }
    function isWord(v) { var x = peek(); return x && x.k === "id" && x.v === v; }
    function eat(k) { if (!t[p] || t[p].k !== k) throw new Error("متوقع " + k); return t[p++]; }
    function fieldVal(name) {
      var v = row ? row[name] : undefined;
      if (v === undefined || v === null || v === "") return null;
      var d = dayNum(v);
      if (d !== null) return d;
      var n = parseFloat(v);
      if (!isNaN(n) && String(n) === String(v).trim()) return n;
      return String(v);
    }
    function primary() {
      var tk = peek();
      if (!tk) throw new Error("تعبير ناقص");
      if (tk.k === "num") { p++; return tk.v; }
      if (tk.k === "str") { p++; return tk.v; }
      if (tk.k === "(") { p++; var v = orExpr(); eat(")"); return v; }
      if (tk.k === "-") { p++; var u = primary(); return typeof u === "number" ? -u : NaN; }
      if (tk.k === "id") {
        p++;
        var name = tk.v;
        if (peek() && peek().k === "(") {
          p++;
          var arg = null;
          if (peek() && peek().k === "id") { arg = t[p].v; p++; }
          eat(")");
          if (!RULE_FUNCS[name]) throw new Error("دالة غير معروفة: " + name);
          /* يوم محلى لا UTC: قبل الإصلاح كان إنذار «متأخر عن today()» يتأخر
             حتى ٣ فجراً بتوقيت مصر لأن فهرس اليوم كان يُحسب بتوقيت جرينتش */
          if (name === "today") return Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
          if (name === "empty") return fieldVal(arg) === null;
          if (name === "filled") return fieldVal(arg) !== null;
          if (name === "days") { var dv = fieldVal(arg); return dv === null ? null : dv; }
        }
        return fieldVal(name);
      }
      throw new Error("رمز غير متوقع");
    }
    function unary() {
      if (peek() && (peek().k === "!" || isWord("not"))) { p++; return !truthy(unary()); }
      return primary();
    }
    function mul() {
      var v = unary();
      while (peek() && (peek().k === "*" || peek().k === "/")) {
        var op = t[p++].k, r = unary();
        v = op === "*" ? v * r : (r === 0 ? NaN : v / r);
      }
      return v;
    }
    function add() {
      var v = mul();
      while (peek() && (peek().k === "+" || peek().k === "-")) {
        var op = t[p++].k, r = mul();
        v = op === "+" ? v + r : v - r;
      }
      return v;
    }
    function cmp() {
      var a = add();
      var x = peek();
      if (!x || x.k !== "op" || x.v === "&&" || x.v === "||") return a;
      var op = t[p++].v, b = add();
      if (a === null || b === null) return false;      /* قيمة غائبة لا تُطلق إنذاراً */
      if (op === "=" || op === "==") return a === b;
      if (op === "!=" || op === "<>") return a !== b;
      if (typeof a !== "number" || typeof b !== "number") return false;
      if (op === "<") return a < b;
      if (op === "<=") return a <= b;
      if (op === ">") return a > b;
      if (op === ">=") return a >= b;
      throw new Error("مقارنة غير معروفة: " + op);
    }
    function truthy(v) { return v === true || (typeof v === "number" && v !== 0 && !isNaN(v)); }
    function andExpr() {
      var v = cmp();
      while (peek() && ((peek().k === "op" && peek().v === "&&") || isWord("and"))) {
        p++; var r = cmp(); v = truthy(v) && truthy(r);
      }
      return v;
    }
    function orExpr() {
      var v = andExpr();
      while (peek() && ((peek().k === "op" && peek().v === "||") || isWord("or"))) {
        p++; var r = andExpr(); v = truthy(v) || truthy(r);
      }
      return v;
    }
    var out = orExpr();
    if (p < t.length) throw new Error("زوائد بعد نهاية الشرط");
    return truthy(out);
  }
  /* إنذارات صفّ واحد حسب قواعد تبويبه */
  function rowAlerts(tab, row) {
    var fired = [];
    toArr(tab && tab.alerts).forEach(function (a) {
      try { if (evalRule(a.expr, row)) fired.push(a); } catch (e) { /* قاعدة معطوبة لا تُسقط الصف */ }
    });
    return fired;
  }

  /* ---------------- كتالوج العناصر ---------------- */
  var WIDGETS = {
    kpi: { name: "رقم مجمّع", needs: ["agg", "field"] },
    formula: { name: "معادلة", needs: ["expr"] },
    table: { name: "جدول", needs: [] },
    chart: { name: "رسم بيانى", needs: ["labelField", "valueField"] },
    map: { name: "خريطة", needs: ["latField", "lngField"] },
    hydro: { name: "حساب هيدروليكى", needs: ["calc"] },
    design: { name: "تصميم منشأ", needs: ["dcalc"] },
    overview: { name: "نظرة عامة على كل التبويبات", needs: [] },
    entity: { name: "صفحة كيان واحد (مجرى/منشأ)", needs: ["entityTab", "entityField"] },
    xkpi: { name: "رقم من تبويب آخر", needs: ["tabId", "agg"] },
    xchart: { name: "رسم من تبويب آخر", needs: ["tabId", "labelField", "valueField"] },
    activity: { name: "آخر الحركات", needs: [] },
    trend: { name: "اتجاه مؤشر عبر الزمن", needs: ["mid"] },
    alerts: { name: "قائمة الإنذارات (كل التبويبات)", needs: [] },
    note: { name: "ملاحظة نصية", needs: ["text"] }
  };

  /* ---------------- النشر والتأريخ ---------------- */
  function publish(state, action, who, done) {
    var old = state.schema;
    return db.get(CFG.root + "/data/schema").then(function (live) {
      if (live && old && live.version !== old.version) {
        throw new Error("تعارض: المخطط اتعدّل من مستخدم تانى — حدّث الأول");
      }
      if (!live) return null;
      /* اللقطة تُؤخذ من النسخة المنشورة فى القاعدة — لا من النسخة المعدَّلة محلياً،
         وإلا لأصبح «الرجوع» يعيد التعديل نفسه بدل أن يلغيه.
         قواعد القاعدة تجعل التأريخ يُكتب مرة واحدة فقط؛ فرفض الكتابة لأن اللقطة
         موجودة أصلاً ليس خطأ — التأريخ سليم، فنُكمل النشر. */
      return db.put(CFG.root + "/data/history/v" + (live.version || 0), {
        version: live.version || 0, at: live.at || 0, by: live.by || "", action: live.action || "", schema: live
      }).catch(function (e) {
        status("busy", "اللقطة محفوظة مسبقاً — يُكمَل النشر");
        return null;
      });
    }).then(function () {
      var next = JSON.parse(JSON.stringify(old));
      next.version = (old.version || 0) + 1;
      next.at = Date.now(); next.by = who; next.action = action;
      return db.put(CFG.root + "/data/schema", next).then(function () { state.schema = next; });
    }).then(function () {
      db.post(CFG.root + "/data/audit", { at: Date.now(), by: who, action: action }).catch(function () { });
      if (done) done(null, state.schema);
      return state.schema;
    }).catch(function (e) {
      if (done) done(e);
      throw e;
    });
  }

  /* ---------------- الواجهة العامة ---------------- */
  return {
    init: function (opt) {
      CFG.appId = opt.appId || CFG.appId;
      CFG.base = opt.base || CFG.base;
      CFG.root = opt.root || ("mwri/apps/" + CFG.appId);
      CFG.onStatus = opt.onStatus || null;
      return CFG;
    },
    cfg: CFG,
    db: db,
    el: el, toArr: toArr, uid: uid, fmt: fmt, when: when, esc: esc,
    evalExpr: evalExpr, aggregate: aggregate, tokenize: tokenize,
    parseCSV: parseCSV, sheetCsvUrl: sheetCsvUrl, loadSheet: loadSheet, loadRecords: loadRecords,
    loadAllRecords: loadAllRecords, entityFields: entityFields, entityRows: entityRows,
    evalRule: evalRule, ruleIdents: ruleIdents, rowAlerts: rowAlerts, RULE_FUNCS: RULE_FUNCS,
    dayKey: dayKey, metricId: metricId, snapshotItems: snapshotItems, takeSnapshot: takeSnapshot,
    ensureSnapshot: ensureSnapshot, loadTrend: loadTrend, trendSeries: trendSeries,
    cacheRows: cacheRows, cachedRows: cachedRows,
    groupBy: groupBy, svgChart: svgChart,
    BASEMAPS: BASEMAPS, gibsLayer: gibsLayer, ensureLeaflet: ensureLeaflet,
    buildKML: buildKML, downloadText: downloadText, earthUrl: earthUrl,
    WIDGETS: WIDGETS, publish: publish,
    HYDRO: HYDRO, DESIGN: DESIGN, gate: gate, hydroValue: hydroValue, hydroBalance: hydroBalance,
    TEMPLATES: TEMPLATES, WIZ_Q: WIZ_Q, wizSteps: wizSteps, wizardTab: wizardTab
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = SchemaEngine;
