/*!
 * MWRI Hydraulics Core - v1.0
 * النواة الحسابية الهيدروليكية الموحّدة لتطبيقات م. محسن
 * SI units only: m, m/s, m3/s, s.  g = 9.81 m/s2
 * قيد إلزامى: لا backticks ولا template literals فى هذا الملف إطلاقاً.
 * الاستخدام: <script src="hydraulics.js"></script> ثم MWRIHyd.normalDepth(...)
 */
(function (root) {
  "use strict";

  var G = 9.81;
  var EPS = 1e-9;

  function num(v, name) {
    if (typeof v !== "number" || !isFinite(v)) {
      throw new Error("MWRIHyd: قيمة غير صالحة للمتغير " + (name || "?"));
    }
    return v;
  }

  /* ==========================================================
   * 1) هندسة المقاطع
   * ========================================================== */

  /* مقطع شبه منحرف: b قاع، y عمق، z ميل الجوانب (أفقى:رأسى) */
  function trapArea(b, y, z) { return (b + z * y) * y; }
  function trapPerimeter(b, y, z) { return b + 2 * y * Math.sqrt(1 + z * z); }
  function trapTopWidth(b, y, z) { return b + 2 * z * y; }

  function trapSection(b, y, z) {
    num(b, "b"); num(y, "y"); num(z, "z");
    if (y <= 0) return { A: 0, P: b, T: b, R: 0, D: 0, y: y };
    var A = trapArea(b, y, z);
    var P = trapPerimeter(b, y, z);
    var T = trapTopWidth(b, y, z);
    return { A: A, P: P, T: T, R: A / P, D: A / T, y: y };
  }

  /* مقطع طبيعى غير منتظم من نقاط مرفوعة {x, z} — z منسوب القاع
     يرجع A و P و T عند منسوب سطح ماء wl */
  function irregularSection(points, wl) {
    if (!points || points.length < 2) throw new Error("MWRIHyd: نقاط المقطع أقل من نقطتين");
    var A = 0, P = 0, T = 0;
    for (var i = 0; i < points.length - 1; i++) {
      var x1 = points[i].x, z1 = points[i].z;
      var x2 = points[i + 1].x, z2 = points[i + 1].z;
      var d1 = wl - z1, d2 = wl - z2;
      if (d1 <= 0 && d2 <= 0) continue;
      var xa = x1, xb = x2, da = d1, db = d2;
      if (d1 < 0) { /* تقاطع سطح الماء على اليسار */
        xa = x1 + (x2 - x1) * (0 - d1) / (d2 - d1); da = 0;
      }
      if (d2 < 0) { /* تقاطع على اليمين */
        xb = x1 + (x2 - x1) * (0 - d1) / (d2 - d1); db = 0;
      }
      var w = xb - xa;
      if (w <= 0) continue;
      A += 0.5 * (da + db) * w;
      P += Math.sqrt(w * w + (da - db) * (da - db));
      T += w;
    }
    return { A: A, P: P, T: T, R: P > 0 ? A / P : 0, D: T > 0 ? A / T : 0, wl: wl };
  }

  /* ==========================================================
   * 2) مانينج والتصرف
   * ========================================================== */

  /* Q = (1/n) * A * R^(2/3) * S^(1/2)   — مانينج SI */
  function manningQ(n, A, R, S) {
    num(n, "n"); num(A, "A"); num(R, "R"); num(S, "S");
    if (n <= 0) throw new Error("MWRIHyd: معامل الخشونة n يجب أن يكون موجباً");
    if (S < 0) throw new Error("MWRIHyd: الميل S سالب — استخدم GVF للميول العكسية");
    return (1 / n) * A * Math.pow(R, 2 / 3) * Math.sqrt(S);
  }

  function manningV(n, R, S) {
    return (1 / n) * Math.pow(R, 2 / 3) * Math.sqrt(S);
  }

  /* الاستنتاج العكسى: معامل الخشونة من قياس حقلى */
  function manningN(Q, A, R, S) {
    if (Q <= 0) throw new Error("MWRIHyd: التصرف المقاس يجب أن يكون موجباً");
    return (A * Math.pow(R, 2 / 3) * Math.sqrt(S)) / Q;
  }

  /* التصرّفية K = (1/n) A R^(2/3) */
  function conveyance(n, A, R) { return (1 / n) * A * Math.pow(R, 2 / 3); }

  /* ==========================================================
   * 3) العمق الطبيعى والحرج (bisection — لا يفشل مثل نيوتن)
   * ========================================================== */

  function bisect(f, lo, hi, tol, maxIter) {
    tol = tol || 1e-7;
    maxIter = maxIter || 200;
    var flo = f(lo), fhi = f(hi);
    if (flo * fhi > 0) {
      /* توسيع المدى مرة واحدة قبل الاستسلام */
      var k = 0;
      while (flo * fhi > 0 && k < 40) { hi = hi * 2; fhi = f(hi); k++; }
      if (flo * fhi > 0) return NaN;
    }
    var mid = lo;
    for (var i = 0; i < maxIter; i++) {
      mid = 0.5 * (lo + hi);
      var fm = f(mid);
      if (Math.abs(fm) < EPS || (hi - lo) < tol) return mid;
      if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    return mid;
  }

  /* العمق الطبيعى yn لمقطع شبه منحرف */
  function normalDepth(Q, b, z, n, S) {
    num(Q, "Q");
    if (S <= 0) throw new Error("MWRIHyd: العمق الطبيعى غير معرّف لميل صفر أو عكسى");
    var f = function (y) {
      var s = trapSection(b, y, z);
      return manningQ(n, s.A, s.R, S) - Q;
    };
    return bisect(f, 1e-6, Math.max(10, Q));
  }

  /* العمق الحرج yc: Q^2 * T / (g * A^3) = 1 */
  function criticalDepth(Q, b, z) {
    var f = function (y) {
      var s = trapSection(b, y, z);
      return (Q * Q * s.T) / (G * s.A * s.A * s.A) - 1;
    };
    return bisect(f, 1e-6, Math.max(10, Q));
  }

  function froude(Q, A, T) {
    if (A <= 0 || T <= 0) return 0;
    return Q / (A * Math.sqrt(G * (A / T)));
  }

  /* الطاقة النوعية E = y + V^2/2g */
  function specificEnergy(Q, A, y) {
    var V = Q / A;
    return y + (V * V) / (2 * G);
  }

  /* ==========================================================
   * 4) السريان المتغيّر التدريجى GVF بطريقة رونج-كوتا الرابعة
   * dy/dx = (S0 - Sf) / (1 - Fr^2)
   * الاتجاه: للسريان تحت الحرج نتكامل عكس اتجاه السريان (من المصب للمنبع)
   * ========================================================== */

  function gvfSlope(y, Q, b, z, n, S0) {
    var s = trapSection(b, y, z);
    if (s.A <= 0) return 0;
    var Sf = Math.pow((Q * n) / (s.A * Math.pow(s.R, 2 / 3)), 2);
    var Fr2 = (Q * Q * s.T) / (G * s.A * s.A * s.A);
    var den = 1 - Fr2;
    if (Math.abs(den) < 1e-6) den = den < 0 ? -1e-6 : 1e-6; /* حماية عند الحرج */
    return (S0 - Sf) / den;
  }

  /* opts: {Q, b, z, n, S0, yStart, length, dx, direction}
     direction: "upstream" (افتراضى، تحت حرج) أو "downstream" (فوق حرج)
     يرجع مصفوفة نقاط {x, y, wl, V, Fr, Sf} — x تتزايد باتجاه التكامل */
  function gvfProfile(opts) {
    var Q = num(opts.Q, "Q"), b = opts.b, z = opts.z, n = opts.n, S0 = opts.S0;
    var y = num(opts.yStart, "yStart");
    var L = num(opts.length, "length");
    var dx = opts.dx || Math.max(1, L / 200);
    var dir = opts.direction === "downstream" ? 1 : -1; /* -1 = نتحرك للمنبع */
    var zBed = typeof opts.bedLevelStart === "number" ? opts.bedLevelStart : 0;
    var out = [];
    var x = 0;
    var steps = Math.ceil(L / dx);
    for (var i = 0; i <= steps; i++) {
      var s = trapSection(b, y, z);
      var V = s.A > 0 ? Q / s.A : 0;
      var Sf = Math.pow((Q * n) / (s.A * Math.pow(s.R, 2 / 3)), 2);
      out.push({
        x: x,
        y: y,
        bed: 0,
        wl: 0,
        V: V,
        Fr: froude(Q, s.A, s.T),
        Sf: Sf
      });
      if (i === steps) break;
      /* RK4 على المسافة h = dir*dx */
      var h = dir * dx;
      var k1 = gvfSlope(y, Q, b, z, n, S0);
      var k2 = gvfSlope(Math.max(1e-4, y + 0.5 * h * k1), Q, b, z, n, S0);
      var k3 = gvfSlope(Math.max(1e-4, y + 0.5 * h * k2), Q, b, z, n, S0);
      var k4 = gvfSlope(Math.max(1e-4, y + h * k3), Q, b, z, n, S0);
      y = y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      if (!isFinite(y) || y <= 1e-4) { y = 1e-4; }
      x += dx;
    }
    /* تصحيح عمود bed: يُحسب صراحةً بدل التعبير المركّب أعلاه */
    for (var j = 0; j < out.length; j++) {
      out[j].bed = zBed + (dir === -1 ? S0 * out[j].x : -S0 * out[j].x);
      out[j].wl = out[j].bed + out[j].y;
    }
    return out;
  }

  /* تصنيف منحنى الارتداد: M1/M2/M3/S1/S2/S3/C/H/A */
  function backwaterClass(y, yn, yc, S0) {
    var slopeType;
    if (S0 <= 0) slopeType = S0 === 0 ? "H" : "A";
    else if (Math.abs(yn - yc) / Math.max(yc, 1e-6) < 0.01) slopeType = "C";
    else slopeType = yn > yc ? "M" : "S";
    var hi = Math.max(yn, yc), lo = Math.min(yn, yc);
    var zone = y > hi ? 1 : (y > lo ? 2 : 3);
    return slopeType + zone;
  }

  /* ==========================================================
   * 5) البوابات
   * a = فتحة البوابة، y1 = العمق أمام البوابة، y3 = العمق خلفها
   * Cc = معامل الانكماش (0.61 افتراضياً لبوابة رأسية حادة)
   * ========================================================== */

  function gateFlow(opts) {
    var b = num(opts.b, "b"), a = num(opts.a, "a"), y1 = num(opts.y1, "y1");
    var y3 = typeof opts.y3 === "number" ? opts.y3 : 0;
    var Cc = typeof opts.Cc === "number" ? opts.Cc : 0.61;
    if (a <= 0) return { Q: 0, mode: "مغلقة", Cd: 0 };
    /* الفتحة عند المنسوب أو أعلاه: البوابة خارج المياه — سريان مجرى مفتوح،
       والصيغة خارج نطاق صلاحيتها. لا يُعرض صفر (خطِر تشغيلياً) بل خارج النطاق */
    if (y1 <= a) return { Q: NaN, Cd: NaN, mode: "خارج نطاق نموذج البوابة — الفتحة أعلى من المنسوب (سريان مجرى مفتوح)", outOfRange: true };
    var y2 = Cc * a; /* عمق vena contracta */
    /* حد الغمر: العمق المتعاقب لـ y2 */
    var submerged = y3 > y2 * 1.0 && y3 > 0;
    var Cd, Q, mode;
    if (!submerged) {
      /* سريان حر — صيغة الطاقة الدقيقة */
      Cd = Cc / Math.sqrt(1 + (Cc * a) / y1);
      Q = Cd * b * a * Math.sqrt(2 * G * y1);
      mode = "حر";
    } else {
      var dh = y1 - y3;
      if (dh <= 0) return { Q: 0, mode: "لا فرق منسوب", Cd: 0 };
      Cd = Cc / Math.sqrt(1 + (Cc * a) / y1);
      Q = Cd * b * a * Math.sqrt(2 * G * dh);
      mode = "مغمور";
    }
    return { Q: Q, Cd: Cd, y2: y2, mode: mode };
  }

  /* فتحة البوابة المطلوبة لتمرير تصرف مستهدف (سريان حر) */
  function gateOpeningFor(Qtarget, b, y1, Cc) {
    Cc = Cc || 0.61;
    var f = function (a) {
      return gateFlow({ b: b, a: a, y1: y1, Cc: Cc }).Q - Qtarget;
    };
    return bisect(f, 1e-4, Math.max(0.01, y1 * 0.99));
  }

  /* ==========================================================
   * 6) الهدارات
   * ========================================================== */

  /* هدار حاد الحافة مستطيل — ريبوك Rehbock: H الشحنة، P ارتفاع الهدار */
  function sharpCrestedWeir(b, H, P) {
    if (H <= 0) return 0;
    var Ce = 0.611 + 0.075 * (H / Math.max(P, 1e-6));
    var He = H + 0.0011;
    return (2 / 3) * Ce * b * Math.sqrt(2 * G) * Math.pow(He, 1.5);
  }

  /* هدار عريض القمة */
  function broadCrestedWeir(b, H, Cd) {
    if (H <= 0) return 0;
    Cd = typeof Cd === "number" ? Cd : 0.85;
    return Cd * b * Math.sqrt(G) * Math.pow((2 / 3) * H, 1.5);
  }

  /* هدار مثلث V-notch بزاوية theta بالدرجات (90 افتراضى) */
  function vNotchWeir(H, thetaDeg, Cd) {
    if (H <= 0) return 0;
    thetaDeg = thetaDeg || 90;
    Cd = typeof Cd === "number" ? Cd : 0.58;
    var t = (thetaDeg * Math.PI) / 180;
    return (8 / 15) * Cd * Math.sqrt(2 * G) * Math.tan(t / 2) * Math.pow(H, 2.5);
  }

  /* ==========================================================
   * 7) القفزة الهيدروليكية
   * ========================================================== */

  function hydraulicJump(y1, Q, b) {
    var A1 = b * y1;
    var V1 = Q / A1;
    var Fr1 = V1 / Math.sqrt(G * y1);
    if (Fr1 <= 1) return { Fr1: Fr1, y2: y1, dE: 0, note: "لا توجد قفزة (السريان تحت حرج)" };
    var y2 = 0.5 * y1 * (Math.sqrt(1 + 8 * Fr1 * Fr1) - 1);
    var dE = Math.pow(y2 - y1, 3) / (4 * y1 * y2);
    var type;
    if (Fr1 < 1.7) type = "متموجة";
    else if (Fr1 < 2.5) type = "ضعيفة";
    else if (Fr1 < 4.5) type = "متذبذبة";
    else if (Fr1 < 9) type = "ثابتة (مثالية للحوض)";
    else type = "قوية";
    return { Fr1: Fr1, y2: y2, dE: dE, Lj: 6 * y2, type: type };
  }

  /* ==========================================================
   * 8) منحنى التصريف Rating Curve:  Q = C (h - h0)^m
   * الملاءمة بالمربعات الصغرى على المقياس اللوغاريتمى مع بحث عن h0
   * data: [{h, Q}, ...]
   * ========================================================== */

  function fitRatingCurve(data, h0Range) {
    if (!data || data.length < 3) throw new Error("MWRIHyd: منحنى التصريف يحتاج 3 قياسات على الأقل");
    var hMin = Infinity;
    for (var i = 0; i < data.length; i++) { if (data[i].h < hMin) hMin = data[i].h; }
    var lo = h0Range ? h0Range[0] : hMin - 5;
    var hi = h0Range ? h0Range[1] : hMin - 0.001;
    var best = null;
    var steps = 400;
    for (var k = 0; k <= steps; k++) {
      var h0 = lo + ((hi - lo) * k) / steps;
      var sx = 0, sy = 0, sxx = 0, sxy = 0, nPts = 0;
      var ok = true;
      for (var j = 0; j < data.length; j++) {
        var dh = data[j].h - h0;
        if (dh <= 0 || data[j].Q <= 0) { ok = false; break; }
        var X = Math.log(dh), Y = Math.log(data[j].Q);
        sx += X; sy += Y; sxx += X * X; sxy += X * Y; nPts++;
      }
      if (!ok || nPts < 3) continue;
      var den = nPts * sxx - sx * sx;
      if (Math.abs(den) < EPS) continue;
      var m = (nPts * sxy - sx * sy) / den;
      var lnC = (sy - m * sx) / nPts;
      var C = Math.exp(lnC);
      /* R2 على القيم الحقيقية لا اللوغاريتمية */
      var ssRes = 0, ssTot = 0, mean = 0;
      for (var t = 0; t < data.length; t++) { mean += data[t].Q; }
      mean /= data.length;
      for (var t2 = 0; t2 < data.length; t2++) {
        var pred = C * Math.pow(data[t2].h - h0, m);
        ssRes += Math.pow(data[t2].Q - pred, 2);
        ssTot += Math.pow(data[t2].Q - mean, 2);
      }
      var R2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
      if (!best || R2 > best.R2) best = { C: C, m: m, h0: h0, R2: R2, rmse: Math.sqrt(ssRes / data.length) };
    }
    if (!best) throw new Error("MWRIHyd: تعذّرت ملاءمة منحنى التصريف — راجع البيانات");
    return best;
  }

  function ratingQ(fit, h) {
    if (h <= fit.h0) return 0;
    return fit.C * Math.pow(h - fit.h0, fit.m);
  }

  /* ==========================================================
   * 9) الاتزان المائى
   * inflows/outflows: مصفوفات {name, Q}
   * ========================================================== */

  function waterBalance(inflows, outflows, opts) {
    opts = opts || {};
    var sumIn = 0, sumOut = 0, i;
    for (i = 0; i < (inflows || []).length; i++) sumIn += inflows[i].Q || 0;
    for (i = 0; i < (outflows || []).length; i++) sumOut += outflows[i].Q || 0;
    var seepage = opts.seepage || 0;
    var evap = opts.evaporation || 0;
    var closure = sumIn - sumOut - seepage - evap;
    var tol = typeof opts.tolerancePct === "number" ? opts.tolerancePct : 5;
    /* وارد صفر: النسبة بلا معنى — لا تُحسب ولا توصف «مقبول» (كان يعيد ٠٪ ومقبول) */
    if (!(sumIn > 0)) {
      var anyOut = sumOut > 0 || seepage > 0 || evap > 0;
      return { inflow: sumIn, outflow: sumOut, seepage: seepage, evaporation: evap,
        closure: closure, closurePct: null, computable: false,
        status: anyOut ? "غير محسوبة — منصرف بلا وارد" : "لا بيانات", tolerancePct: tol };
    }
    var pct = (closure / sumIn) * 100;
    return {
      inflow: sumIn,
      outflow: sumOut,
      seepage: seepage,
      evaporation: evap,
      closure: closure,
      closurePct: pct,
      computable: true,
      status: Math.abs(pct) <= tol ? "مقبول" : (closure > 0 ? "فاقد غير مفسّر" : "عجز — راجع القياسات"),
      tolerancePct: tol
    };
  }

  /* ==========================================================
   * 10) تتبّع الموجة — Muskingum
   * inflow: مصفوفة تصرفات، dt بالثوانى، K بالثوانى، x بين 0 و0.5
   * ========================================================== */

  function muskingum(inflow, K, x, dt, Q0) {
    var den = 2 * K * (1 - x) + dt;
    var C0 = (dt - 2 * K * x) / den;
    var C1 = (dt + 2 * K * x) / den;
    var C2 = (2 * K * (1 - x) - dt) / den;
    var stable = (dt >= 2 * K * x && dt <= 2 * K * (1 - x));
    if (!stable) {
      /* C0 أو C2 سالب ← مخارج سالبة غير فيزيائية. تُمنع النتيجة ويُعاد الخطأ
         مع مدى dt الصالح — لا يُعرض رقم من معاملات غير مستقرة */
      return { outflow: null, C0: C0, C1: C1, C2: C2, stable: false,
        dtMin: 2 * K * x, dtMax: 2 * K * (1 - x),
        error: "معاملات Muskingum غير مستقرة: dt يجب أن يقع بين 2Kx=" + (2 * K * x) + " و2K(1-x)=" + (2 * K * (1 - x)) + " — النتائج غير فيزيائية ولا تُستخدم" };
    }
    var out = [typeof Q0 === "number" ? Q0 : inflow[0]];
    for (var i = 1; i < inflow.length; i++) {
      out.push(C0 * inflow[i] + C1 * inflow[i - 1] + C2 * out[i - 1]);
    }
    return { outflow: out, C0: C0, C1: C1, C2: C2, stable: true };
  }

  /* ==========================================================
   * 11) فحوص المعقولية — تُستدعى قبل عرض أى رقم للمستخدم
   * ========================================================== */

  function sanityCheck(res) {
    var flags = [];
    if (typeof res.V === "number") {
      if (res.V > 2.0) flags.push({ level: "خطر", msg: "سرعة " + res.V.toFixed(2) + " م/ث تتجاوز حد النحر لترعة ترابية (2.0)" });
      else if (res.V < 0.3 && res.V > 0) flags.push({ level: "تنبيه", msg: "سرعة " + res.V.toFixed(2) + " م/ث أقل من حد الترسيب (0.3)" });
    }
    if (typeof res.Fr === "number" && res.Fr > 0.9 && res.Fr < 1.1) {
      flags.push({ level: "تنبيه", msg: "السريان قرب الحرج (Fr=" + res.Fr.toFixed(2) + ") — النتائج غير مستقرة عددياً" });
    }
    if (typeof res.n === "number" && (res.n < 0.012 || res.n > 0.075)) {
      flags.push({ level: "خطر", msg: "معامل خشونة n=" + res.n.toFixed(3) + " خارج المدى الواقعى (0.012–0.075)" });
    }
    return flags;
  }

  /* جدول معاملات الخشونة المرجعية للترع المصرية */
  var N_TABLE = [
    { key: "مبطنة خرسانة ناعمة", n: 0.014 },
    { key: "مبطنة خرسانة عادية", n: 0.017 },
    { key: "ترابية نظيفة حديثة التطهير", n: 0.022 },
    { key: "ترابية بحشائش خفيفة", n: 0.030 },
    { key: "ترابية بحشائش متوسطة", n: 0.040 },
    { key: "ترابية بحشائش كثيفة", n: 0.060 },
    { key: "مجرى طبيعى غير منتظم", n: 0.035 }
  ];

  var API = {
    G: G,
    trapSection: trapSection,
    irregularSection: irregularSection,
    manningQ: manningQ,
    manningV: manningV,
    manningN: manningN,
    conveyance: conveyance,
    normalDepth: normalDepth,
    criticalDepth: criticalDepth,
    froude: froude,
    specificEnergy: specificEnergy,
    gvfProfile: gvfProfile,
    gvfSlope: gvfSlope,
    backwaterClass: backwaterClass,
    gateFlow: gateFlow,
    gateOpeningFor: gateOpeningFor,
    sharpCrestedWeir: sharpCrestedWeir,
    broadCrestedWeir: broadCrestedWeir,
    vNotchWeir: vNotchWeir,
    hydraulicJump: hydraulicJump,
    fitRatingCurve: fitRatingCurve,
    ratingQ: ratingQ,
    waterBalance: waterBalance,
    muskingum: muskingum,
    sanityCheck: sanityCheck,
    N_TABLE: N_TABLE,
    bisect: bisect,
    version: "1.0"
  };

  root.MWRIHyd = API;
  if (typeof module !== "undefined" && module.exports) { module.exports = API; }
})(typeof window !== "undefined" ? window : this);
