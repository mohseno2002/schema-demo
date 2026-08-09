import { parseHTML } from "linkedom";
import fs from "fs";
import { webcrypto } from "crypto";
const html=fs.readFileSync("/tmp/bt/index.html","utf8");
const {window,document}=parseHTML(html);
global.window=window; global.document=document;
window.Element.prototype.scrollIntoView=function(){};
Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
global.btoa=s=>Buffer.from(s,"binary").toString("base64");
global.atob=s=>Buffer.from(s,"base64").toString("binary");
global.TextEncoder=TextEncoder;
global.location={protocol:"https:",hostname:"mohseno2002.github.io",href:"https://x/"};
Object.defineProperty(globalThis,"navigator",{value:{userAgent:"p",serviceWorker:{register:()=>Promise.resolve({scope:"/"})}},configurable:true});
global.localStorage={_d:{},getItem(k){return this._d[k]??null;},setItem(k,v){this._d[k]=String(v);}};
global.matchMedia=()=>({matches:false}); global.confirm=()=>true; global.print=()=>{}; window.print=global.print;
global.Blob=class{}; global.URL={createObjectURL:()=>"b",revokeObjectURL(){}};
Object.defineProperty(window.HTMLSelectElement.prototype,"value",{
 get(){const o=this.querySelector("option[selected]")||this.querySelector("option");return o?(o.getAttribute("value")??""):"";},
 set(v){[...this.querySelectorAll("option")].forEach(o=>o.removeAttribute("selected"));
  const t=[...this.querySelectorAll("option")].find(o=>o.getAttribute("value")===v); if(t)t.setAttribute("selected","selected");},configurable:true});

/* اليوم المحلى بمنطقة زمنية متطرفة UTC+14 — العدّاد القديم (UTC) يفشل هنا معظم اليوم */
const now=new Date();
const localDay=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0");

const store={
 "mwri/apps/demo-build/data/schema":{version:200,at:1,by:"م",action:"س",tabs:[
  {id:"canals",icon:"≡",title:"سجل المجارى",eyebrow:"مرجع",source:{type:"firebase"},
   fields:[{id:"name",label:"اسم المجرى",type:"text",required:true}],
   widgets:[{id:"tt",type:"table",label:"المجارى"}]},
  {id:"works",icon:"⚒",title:"الأعمال",eyebrow:"تنفيذ",source:{type:"firebase"},
   fields:[{id:"canal",label:"الترعة",type:"ref",refTab:"canals",refField:"name",required:true},
           {id:"len",label:"الطول, المنفّذ",type:"number",unit:"م"},
           {id:"due",label:"الاستحقاق",type:"date"}],
   alerts:[{id:"a1",expr:"due = today()",msg:"يستحق اليوم",level:"تنبيه"}],
   widgets:[{id:"k",type:"kpi",label:"الأطوال",agg:"sum",field:"len",unit:"م"},{id:"tb",type:"table",label:"س"}]},
  {id:"bal",icon:"⚖",title:"الاتزان",eyebrow:"هيدروليك",source:{type:"firebase"},
   fields:[{id:"point",label:"النقطة",type:"text"},{id:"qin",label:"الوارد",type:"number"},{id:"qout",label:"المنصرف",type:"number"}],
   widgets:[{id:"h",type:"hydro",calc:"balance",label:"الاتزان",inField:"qin",outField:"qout",tol:5},{id:"tb2",type:"table",label:"س"}]}]},
 "mwri/apps/demo-build/data/records/canals":{c1:{name:"ترعة المنصورية"}},
 "mwri/apps/demo-build/data/records/works":{w1:{canal:"ترعة قديمة",canal_key:"cOLD",len:120,due:localDay}},
 "mwri/apps/demo-build/data/records/bal":{r1:{point:"ن١",qin:0,qout:5}}};

let gateDelay=700, patched=null, posted=[];
global.fetch=(u,o)=>{const path=u.split(".app/")[1].replace(".json","");const m=(o&&o.method)||"GET";
 if(m==="GET"){
   const d=(path.indexOf("settings/admin")>=0)?gateDelay:0;
   return new Promise(r=>setTimeout(()=>r({ok:true,status:200,json:()=>Promise.resolve(store[path]??null)}),d));
 }
 const b=o.body?JSON.parse(o.body):{};
 if(b.updatedAt===undefined||b.src===undefined) throw new Error("stub متشدد: كتابة بلا updatedAt/src على "+path);
 if(m==="PATCH"&&path.indexOf("records/works/")>=0) patched=b;
 if(m==="POST") posted.push({path,b});
 if(m==="PUT"){store[path]=b;}
 if(m==="PATCH"&&store[path]) Object.assign(store[path],b);
 return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve(b)});};
(0,eval)([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join("\n;\n"));

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const C=()=>document.getElementById("content");

/* ١) شاشة الإدارة تفشل مغلقة أثناء تحميل الإعدادات */
await sleep(200);
globalThis.select("__admin");
await sleep(50);
const loadingTxt=C().textContent;
console.log("١) الإدارة أثناء تحميل الإعدادات — تعرض «جارٍ قراءة»:", loadingTxt.includes("جارٍ قراءة إعدادات الصلاحيات"),
  "| بلا أدوات بنية:", !loadingTxt.includes("تبويب جديد"));
await sleep(900);
globalThis.select("__admin"); await sleep(80);
console.log("٢) بعد اكتمال التحميل — الأدوات ظهرت:", C().textContent.includes("تبويب جديد"));

/* ٢) إنذار today() بمنطقة UTC+14 — سجل استحقاقه اليوم المحلى يجب أن يطلق «يستحق اليوم» */
globalThis.select("works"); await sleep(400);
const alertCell=C().textContent.includes("يستحق اليوم");
console.log("٣) إنذار due = today() انطلق لليوم المحلى (TZ=UTC+14):", alertCell);

/* ٣) حقل المرجع فى التعديل: القيمة المحفوظة لم تعد فى المصدر — لا تضيع */
const editBtn=[...C().querySelectorAll("button")].find(b=>b.textContent==="تعديل");
editBtn.dispatchEvent(new window.Event("click"));  /* onclick */
if(editBtn.onclick) editBtn.onclick();
await sleep(300);
const refSel=[...C().querySelectorAll("select")].find(s=>[...s.querySelectorAll("option")].some(o=>o.textContent.includes("قيمة محفوظة")));
console.log("٤) خيار «(قيمة محفوظة)» أُضيف:", !!refSel, "| القيمة المعروضة:", refSel?refSel.value:"—");
const saveBtn=[...C().querySelectorAll("button")].find(b=>b.textContent==="حفظ التعديل");
if(saveBtn&&saveBtn.onclick) saveBtn.onclick();
await sleep(200);
console.log("٥) PATCH حافظ على القيمة:", patched?patched.canal:"لم يُرسل", "(المتوقع: ترعة قديمة)");

/* ٤) رؤوس CSV محاطة بتنصيص — عنوان فيه فاصلة لا يكسر الأعمدة */
let csv=""; globalThis.E.downloadText=(n,t)=>{csv=t;};
const expBtn=[...C().querySelectorAll("button")].find(b=>b.textContent==="تصدير CSV");
if(expBtn&&expBtn.onclick) expBtn.onclick();
const head=csv.split("\n")[0]||"";
console.log("٦) رأس CSV:", JSON.stringify(head.slice(1,60)), "| محاط بتنصيص:", head.indexOf("\uFEFF\u0022")===0, "| الفاصلة داخل التنصيص:", head.includes("\u0022الطول, المنفّذ\u0022"));

/* ٥) التقرير المطبوع: اتزان بوارد صفر → «غير محسوبة» لا «مقبول» */
globalThis.select("bal"); await sleep(400);
const repBtn=[...C().querySelectorAll("button")].find(b=>b.textContent.includes("تقرير هذا التبويب"));
if(repBtn&&repBtn.onclick) repBtn.onclick();
await sleep(400);
const rep=document.getElementById("report-root").textContent;
console.log("٧) التقرير يكتب «غير محسوبة — منصرف بلا وارد»:", rep.includes("غير محسوبة — منصرف بلا وارد"),
  "| خانة النسبة «ــــ»:", rep.includes("ــــ"),
  "| تنبيه المراجعة الميدانية:", rep.includes("الوارد المسجَّل صفر"));

/* ٦) معادلة بحقل غير موجود تُرفض من محرّر العناصر */
globalThis.E.gateNOOP=1;
globalThis.select("__admin"); await sleep(150);
const openBtns=[...C().querySelectorAll("button")].filter(b=>b.textContent==="فتح البناء");
if(openBtns[1]&&openBtns[1].onclick) openBtns[1].onclick();  /* تبويب الأعمال */
await sleep(150);
let lastToast=""; const t0=document.getElementById("toast");
const obs=()=>{lastToast=t0.textContent;};
const wtSel=[...C().querySelectorAll("select")].find(s=>[...s.querySelectorAll("option")].some(o=>o.getAttribute("value")==="formula"));
wtSel.value="formula";
const frm=wtSel.closest(".frm");
const wlInp=[...frm.querySelectorAll(".fld")].find(f=>f.textContent.includes("العنوان")).querySelector("input");
const weInp=[...frm.querySelectorAll(".fld")].find(f=>f.textContent.includes("المعادلة")).querySelector("input");
wlInp.value="نسبة"; weInp.value="sum(xyz)/100";
const before=(store["mwri/apps/demo-build/data/schema"].tabs.find(t=>t.id==="works").widgets||[]).length;
const addW=[...C().querySelectorAll("button")].find(b=>b.textContent==="أضف عنصراً وانشر");
if(addW&&addW.onclick) addW.onclick();
await sleep(150); obs();
const after=(store["mwri/apps/demo-build/data/schema"].tabs.find(t=>t.id==="works").widgets||[]).length;
console.log("٨) معادلة بحقل وهمى رُفضت:", lastToast.includes("حقول غير موجودة فى المعادلة"), "| لم يُنشر عنصر:", before===after);
weInp.value="sum(len)/100";
if(addW&&addW.onclick) addW.onclick();
await sleep(250);
const after2=(store["mwri/apps/demo-build/data/schema"].tabs.find(t=>t.id==="works").widgets||[]).length;
console.log("٩) المعادلة السليمة sum(len) قُبلت ونُشرت:", after2===before+1);

/* ٧) فشل تحميل كلى: لا نموذج إدخال */
store.__killreads=1;
const okGet=global.fetch;
global.fetch=(u,o)=>{const m=(o&&o.method)||"GET";
 if(m==="GET"&&u.indexOf("records/")>=0) return Promise.reject(new TypeError("Failed to fetch"));
 return okGet(u,o);};
global.localStorage._d={};   /* امسح الكاش المحلى حتى يكون الفشل كلياً */
globalThis.select("canals"); await sleep(300);
const failTxt=C().textContent;
console.log("١٠) عند فشل كلى — لا نموذج «إضافة سجل جديد»:", !failTxt.includes("إضافة سجل جديد"),
  "| رسالة الإيقاف ظهرت:", failTxt.includes("الإدخال موقوف"));
