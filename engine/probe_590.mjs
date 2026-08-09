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

const now=new Date();
const D=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0");

const store={
 "mwri/apps/demo-build/data/schema":{version:300,at:1,by:"م",action:"س",tabs:[
  {id:"bal",icon:"⚖",title:"اتزان المجارى",eyebrow:"هيدروليك",source:{type:"firebase"},
   fields:[{id:"canal",label:"الترعة",type:"text"},{id:"dt",label:"التاريخ",type:"date"},
           {id:"qin",label:"الوارد",type:"number"},{id:"qout",label:"المنصرف",type:"number"},
           {id:"evap",label:"البخر",type:"number"},{id:"seep",label:"الرشح",type:"number"}],
   widgets:[{id:"hb",type:"hydro",calc:"balance",label:"اتزان مجمّع",inField:"qin",outField:"qout",tol:5,
             groupField:"canal",dateField:"dt",periodDays:30,evapField:"evap",seepField:"seep"},
            {id:"tb",type:"table",label:"السجلات"}]}]},
 "mwri/apps/demo-build/data/records/bal":{
  r1:{canal:"المنصورية",dt:D,qin:10,qout:8,evap:0.5,seep:0.5},
  r2:{canal:"المنصورية",dt:D,qin:10,qout:10.5},
  r3:{canal:"البدرشين",dt:D,qin:0,qout:5},
  r4:{canal:"المنصورية",dt:"2020-01-01",qin:100,qout:0}}};

let settingsDown=true, raceNext=false, sawIfMatch=0, deletes=0, etagN=7;
const etags={};
function tagOf(p){ if(!etags[p]) etags[p]="E"+(etagN++); return etags[p]; }
function rot(p){ etags[p]="E"+(etagN++); return etags[p]; }
const H=(p)=>({get:(h)=>String(h).toLowerCase()==="etag"?tagOf(p):null});

global.fetch=(u,o)=>{const path=u.split(".app/")[1].replace(".json","");const m=(o&&o.method)||"GET";
 if(m==="GET"){
   if(settingsDown&&path.indexOf("settings/admin")>=0) return Promise.reject(new TypeError("Failed to fetch"));
   return Promise.resolve({ok:true,status:200,headers:H(path),json:()=>Promise.resolve(store[path]??null)});
 }
 if(m==="DELETE"){deletes++; delete store[path]; rot(path); return Promise.resolve({ok:true,status:200,headers:H(path),json:()=>Promise.resolve(null)});}
 const b=o.body?JSON.parse(o.body):{};
 if(b.updatedAt===undefined||b.src===undefined) throw new Error("stub متشدد: كتابة بلا updatedAt/src على "+path);
 const im=o.headers&&(o.headers["if-match"]||o.headers["If-Match"]);
 if(m==="PUT"&&im){
   sawIfMatch++;
   if(raceNext){ rot(path); raceNext=false; }
   if(im!==tagOf(path)) return Promise.resolve({ok:false,status:412,headers:H(path),json:()=>Promise.resolve({error:"precondition"})});
 }
 if(m==="PUT"){ store[path]=b; rot(path); }
 if(m==="POST"){ store[path+"/p"+etagN]=b; }
 if(m==="PATCH"){ if(store[path]) Object.assign(store[path],b); else store[path]=b; rot(path); }
 return Promise.resolve({ok:true,status:200,headers:H(path),json:()=>Promise.resolve(b)});};
(0,eval)([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join("\n;\n"));

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const C=()=>document.getElementById("content");

/* ═══ ١) تشديد الصلاحيات: فشل قراءة الإعدادات = فشل مغلق مع إعادة محاولة ═══ */
await sleep(250);
console.log("١) بعد إقلاع بفشل قراءة الإعدادات — isAdmin:", globalThis.isAdmin(), "(المتوقع false)");
globalThis.select("bal"); await sleep(300);
const delBtn=[...C().querySelectorAll("button")].find(b=>b.textContent==="حذف");
if(delBtn&&delBtn.onclick) delBtn.onclick();
await sleep(60);
const t0=document.getElementById("toast").textContent;
console.log("٢) نقر حذف سجل → رسالة:", t0.includes("تعذّر التحقق من الصلاحيات"), "| لم يُرسل DELETE:", deletes===0);
globalThis.select("__admin"); await sleep(100);
const admTxt=C().textContent;
console.log("٣) شاشة الإدارة: «إعادة المحاولة» ظاهرة:", admTxt.includes("إعادة المحاولة"), "| بلا أدوات بنية:", !admTxt.includes("تبويب جديد"));
settingsDown=false;
const retry=[...C().querySelectorAll("button")].find(b=>b.textContent==="إعادة المحاولة");
if(retry&&retry.onclick) retry.onclick();
await sleep(150);
console.log("٤) بعد الشفاء وإعادة المحاولة — الأدوات ظهرت:", C().textContent.includes("تبويب جديد"), "| isAdmin:", globalThis.isAdmin());

/* ═══ ٢) الاتزان المجمّع: أرقام محسوبة يدوياً ═══ */
globalThis.select("bal"); await sleep(300);
const bt=C().textContent;
console.log("٥) الفترة استبعدت القديم:", bt.includes("3 من 4 سجل"));
console.log("٦) المنصورية 2.5% داخل السماح:", bt.includes("2.5")&&bt.includes("داخل السماح"),
  "| البدرشين غير محسوبة + ــــ:", bt.includes("غير محسوبة — منصرف بلا وارد")&&bt.includes("ــــ"));
console.log("٧) الإجمالى -22.5% (عجز):", bt.includes("-22.5"), "| بخر/رشح ظاهران:", bt.includes("البخر (من الحقول)"));
const repBtn=[...C().querySelectorAll("button")].find(b=>b.textContent.includes("تقرير هذا التبويب"));
if(repBtn&&repBtn.onclick) repBtn.onclick();
await sleep(300);
const rp=document.getElementById("report-root").textContent;
console.log("٨) التقرير: صف لكل مجموعة + الإجمالى بنفس الأرقام:",
  rp.includes("المنصورية")&&rp.includes("الإجمالى")&&rp.includes("-22.5")&&rp.includes("غير محسوبة — منصرف بلا وارد"),
  "| الفترة مذكورة:", rp.includes("آخر 30 يوم"));

/* ═══ ٣) النشر الذرّى بالـETag: ناشر ثانٍ لا يُدهَس ═══ */
const v0=store["mwri/apps/demo-build/data/schema"].version;
let casErr="";
raceNext=true;
await globalThis.E.publish(globalThis.S,"تجربة سباق","مسبار").catch(e=>{casErr=e.message;});
const v1=store["mwri/apps/demo-build/data/schema"].version;
console.log("٩) سباق نشر متزامن → 412 برسالة تعارض:", casErr.includes("تعارض"), "| الإصدار لم يُدهس:", v1===v0, "| if-match وصل فعلاً:", sawIfMatch>=1);
await globalThis.E.publish(globalThis.S,"نشر سليم","مسبار").catch(e=>{casErr="X"+e.message;});
const v2=store["mwri/apps/demo-build/data/schema"].version;
console.log("١٠) نشر بلا سباق نجح والإصدار تقدّم:", v2===v0+1, "| مسار CAS مستخدم لا الاحتياطى:", sawIfMatch>=2);

/* ═══ ٤) الرسم: سالب + محور صفر + ترقيق تسميات ═══ */
const neg=globalThis.E.svgChart([{label:"أ",value:-5},{label:"ب",value:10}],"bar");
const zline=[...neg.querySelectorAll("line")].some(l=>l.getAttribute("stroke")==="#8b8577");
const negLbl=[...neg.querySelectorAll("text")].some(t=>t.textContent==="-5");
console.log("١١) قيم سالبة: محور صفر مرسوم:", zline, "| تدريج يظهر -5:", negLbl, "| عمودان:", neg.querySelectorAll("rect").length===2);
const many=globalThis.E.svgChart(Array.from({length:40},(_,i)=>({label:"بند"+i,value:i+1})),"bar");
const cats=[...many.querySelectorAll("text")].filter(t=>t.getAttribute("y")==="228").length;
console.log("١٢) ترقيق التسميات: 40 تصنيفاً →", cats, "تسمية (المتوقع ≤ 14):", cats>=3&&cats<=14);

/* ═══ ٥) عقود النواة داخل التطبيق ═══ */
const gf=globalThis.MWRIHyd.gateFlow({b:2,a:1.5,y1:1.0});
const mu=globalThis.MWRIHyd.muskingum([0,100,0],10,0.4,2,0);
console.log("١٣) بوابة y1≤a → خارج النطاق لا صفر:", gf.outOfRange===true&&Number.isNaN(gf.Q),
  "| Muskingum غير مستقر → null+خطأ:", mu.outflow===null&&typeof mu.error==="string");
