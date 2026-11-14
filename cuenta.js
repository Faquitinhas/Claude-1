// ---------- Cuenta: guarda el progreso en la nube y lo sincroniza entre dispositivos ----------
// Se carga después de app.js y plan.js. app.js avisa cada guardado local llamando a onSave(clave).
const SYNC_KEYS=["ucm-vistas","ucm-enviados-v2","ucm-fav-v2","ucm-quitadas","ucm-plan"];
let acct=ld("ucm-cuenta"),applying=false,pushT=0,syncing=false,sync={k:"ok",t:"Progreso guardado en tu cuenta"};
// estado de la ventana
let mOpen=false,mMode="login",mErr="",mBusy=false,mPw=false,mF={u:"",p:"",p2:""},mMerge=null,mBack=null;
const obj=x=>x&&typeof x==="object"&&!Array.isArray(x)?x:{};
const collect=()=>({seen,sent,fav:fav||"",qt:QT,plan});
const isEmpty=d=>!Object.keys(obj(d.seen)).length&&!Object.keys(obj(d.sent)).length&&!d.fav&&!Object.keys(obj(d.qt)).length&&!Object.keys(obj(d.plan)).length;
const saveAcct=()=>sv("ucm-cuenta",acct);
const canon=x=>x&&typeof x==="object"?Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canon(x[k])).join(","):JSON.stringify(x);
const cnt=x=>Object.keys(obj(x)).length;
async function api(body){
let r;try{r=await fetch("/api/cuenta",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"})}
catch(e){const x=new Error("Sin conexión. Probá de nuevo en un rato.");x.net=true;throw x}
let j=null;try{j=await r.json()}catch(e){}
if(!r.ok||!j||!j.ok){const x=new Error(j&&j.error||"No se pudo conectar con el servidor de cuentas.");x.status=r.status;throw x}
return j}

// Reemplaza el progreso de este dispositivo por el que viene de la cuenta
function applyData(d){d=obj(d);applying=true;
try{seen=obj(d.seen);sent=obj(d.sent);QT=obj(d.qt);fav=typeof d.fav==="string"&&d.fav?d.fav:null;
const p=obj(d.plan);plan={};for(const n of Object.keys(p)){const w=p[n];if(ALL.includes(n)&&w&&/^\d{4}-\d\d-\d\d$/.test(w.d||""))plan[n]={d:w.d,t:/^\d\d:\d\d$/.test(w.t||"")?w.t:""}}
sv("ucm-vistas",seen);sv("ucm-enviados-v2",sent);sv("ucm-quitadas",QT);sv("ucm-fav-v2",{n:fav});sv("ucm-plan",plan)}
finally{applying=false}
grid();stats();rmDraw();if(typeof planUpd==="function")planUpd();if(cur)draw()}

// ----- aviso flotante -----
let toastT=0;
function toast(t){const e=$("toast");e.textContent=t;e.classList.add("on");clearTimeout(toastT);toastT=setTimeout(()=>e.classList.remove("on"),3200)}

// ----- sincronización -----
function stat(k,t){sync={k,t};btnDraw();if(mOpen&&mMode==="account"){const e=$("mSync");if(e){e.className="sync "+k;e.lastChild.textContent=t}}}
function expired(){clearTimeout(pushT);acct={};saveAcct();btnDraw();mErr="Tu sesión venció. Volvé a iniciar sesión.";openM("login")}
async function push(){
if(!acct.token)return;clearTimeout(pushT);
if(syncing){pushT=setTimeout(push,800);return}
syncing=true;stat("busy","Guardando…");
try{acct.dirty=false;const r=await api({action:"save",token:acct.token,data:collect()});
acct.u=r.u;saveAcct();acct.dirty?stat("busy","Guardando…"):stat("ok","Progreso guardado en tu cuenta")}
catch(e){acct.dirty=true;saveAcct();
if(e.status===401){syncing=false;expired();return}
stat("off",e.net?"Sin conexión: se guarda cuando vuelva":"No se pudo guardar, se reintenta solo")}
syncing=false}
async function pull(){
if(!acct.token||syncing)return;
if(acct.dirty)return push();
syncing=true;
try{const r=await api({action:"get",token:acct.token});
if(acct.dirty){syncing=false;return push()} // cambió algo mientras esperábamos: gana lo local
if(r.u>(acct.u||0)){acct.u=r.u;saveAcct();applyData(r.data)}
stat("ok","Progreso guardado en tu cuenta")}
catch(e){if(e.status===401){syncing=false;expired();return}
stat("off",e.net?"Sin conexión: usando lo de este dispositivo":"No se pudo consultar tu cuenta")}
syncing=false}
function onSave(k){
if(applying||!acct.token||!SYNC_KEYS.includes(k))return;
if(!acct.dirty){acct.dirty=true;saveAcct()}
stat("busy","Guardando…");clearTimeout(pushT);pushT=setTimeout(push,1200)}

// ----- acciones -----
async function enter(){
if(mBusy)return;const reg=mMode==="register",user=mF.u.trim(),pass=mF.p;
if(!user||!pass){mErr="Completá usuario y contraseña.";mDraw();return}
if(reg&&pass!==mF.p2){mErr="Las contraseñas no coinciden.";mDraw();focusSel("#mP2");return}
mBusy=true;mErr="";mDraw();
try{
if(reg){const r=await api({action:"register",user,pass,data:collect()});
acct={user:r.user,token:r.token,u:r.u};saveAcct();stat("ok","Progreso guardado en tu cuenta");
done("¡Listo, "+r.user+"! Tu progreso ya se guarda en tu cuenta.")}
else{const r=await api({action:"login",user,pass}),local=collect(),srv=obj(r.data);
acct={user:r.user,token:r.token,u:r.u};saveAcct();stat("ok","Progreso guardado en tu cuenta");
if(isEmpty(local)||canon(local)===canon({seen:obj(srv.seen),sent:obj(srv.sent),fav:srv.fav||"",qt:obj(srv.qt),plan:obj(srv.plan)})){applyData(srv);done("Hola de nuevo, "+r.user+". Cargamos tu progreso.")}
else if(isEmpty(srv)){push();done("Hola, "+r.user+". Guardamos en tu cuenta lo que tenías acá.")}
else{mBusy=false;mMerge={local,srv};mMode="merge";mDraw()}}}
catch(e){mBusy=false;mErr=e.message;mDraw()}}
function done(msg){mBusy=false;mF={u:"",p:"",p2:""};btnDraw();closeM();toast(msg)}
function merge(sum){const {local,srv}=mMerge;mMerge=null;
if(sum){applyData({seen:{...obj(srv.seen),...local.seen},sent:{...local.sent,...obj(srv.sent)},fav:srv.fav||local.fav,qt:{...obj(srv.qt),...local.qt},plan:{...local.plan,...obj(srv.plan)}});push();done("Sumamos todo y lo guardamos en tu cuenta.")}
else{applyData(srv);done("Cargamos el progreso de tu cuenta.")}}
function logout(){clearTimeout(pushT);acct={};saveAcct();btnDraw();closeM();toast("Cerraste sesión. Tu progreso sigue en este dispositivo.")}
async function delAcct(){
if(mBusy)return;const pass=($("mDP")||{}).value||"";if(!pass){mErr="Escribí tu contraseña para confirmar.";mDraw(true);return}
mBusy=true;mErr="";mDraw(true);
try{await api({action:"delete",token:acct.token,pass});clearTimeout(pushT);acct={};saveAcct();btnDraw();mBusy=false;closeM();toast("Cuenta eliminada. Tu progreso sigue en este dispositivo.")}
catch(e){mBusy=false;mErr=e.message;mDraw(true)}}

// ----- dibujo -----
const IC={
user:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
eye:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
eyeOff:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
cloud:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a5 5 0 0 1-.6-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/><path d="M9.5 13.5l2 2 3.5-3.5"/></svg>',
merge:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v5a5 5 0 0 0 5 5h0a5 5 0 0 1 5 5v1M17 4v5a5 5 0 0 1-2 4"/><path d="M4 7l3-3 3 3M14 7l3-3 3 3"/></svg>',
swap:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg>'};
const ini=u=>h2((u||"?").replace(/[^a-z0-9]/gi,"").charAt(0)||"?");
function btnDraw(){const b=$("accBtn");
if(acct.token){b.className="accbtn in";b.setAttribute("aria-label","Tu cuenta: "+acct.user+". "+sync.t);
b.innerHTML=`<span class="av">${ini(acct.user)}</span><span class="an">${h2(acct.user)}</span><i class="dot ${sync.k}" title="${h2(sync.t)}"></i>`}
else{b.className="accbtn";b.removeAttribute("aria-label");b.innerHTML=`${IC.user}<span>Iniciar sesión</span>`}}
const spin='<i class="spin" aria-hidden="true"></i>';
function fld(id,label,type,val,ac,extra){
const pw=type==="password";
return `<label class="fld" for="${id}"><span>${label}</span><div class="${pw?"pw":""}"><input id="${id}" name="${id}" type="${pw&&mPw?"text":type}" value="${h2(val)}" autocomplete="${ac}" ${extra||""}>${pw?`<button type="button" class="eye" data-eye aria-label="${mPw?"Ocultar":"Mostrar"} contraseña" aria-pressed="${mPw}">${mPw?IC.eyeOff:IC.eye}</button>`:""}</div></label>`}
function mDraw(keepDel){const box=$("mbox"),reg=mMode==="register";let h="";
const err=mErr?`<p class="merr" role="alert">${h2(mErr)}</p>`:"";
if(mMode==="login"||reg){
h=`<button type="button" class="mx" data-close aria-label="Cerrar">×</button>
<div class="mhd"><div class="mic">${IC.cloud}</div><h2 id="moT">${reg?"Creá tu cuenta":"Iniciá sesión"}</h2><p>${reg?"Guardá tu maratón y seguilo desde cualquier dispositivo.":"Retomá tu maratón donde lo dejaste."}</p></div>
<div class="mtabs" role="tablist" aria-label="Tipo de acceso"><button type="button" role="tab" data-m="login" aria-selected="${!reg}">Iniciar sesión</button><button type="button" role="tab" data-m="register" aria-selected="${reg}">Crear cuenta</button></div>
<form id="mF" novalidate>
${fld("mU","Usuario","text",mF.u,"username",'autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="20" placeholder="tu_usuario"'+(reg?' aria-describedby="mUh"':""))}
${reg?`<small class="fh" id="mUh">3 a 20 caracteres: letras, números, punto, guion o guion bajo.</small>`:""}
${fld("mP","Contraseña","password",mF.p,reg?"new-password":"current-password",'maxlength="100" placeholder="'+(reg?"Mínimo 6 caracteres":"••••••••")+'"')}
${reg?fld("mP2","Repetí la contraseña","password",mF.p2,"new-password",'maxlength="100"'):""}
${err}
<button class="mbtn" ${mBusy?"disabled":""}>${mBusy?spin+(reg?"Creando tu cuenta…":"Entrando…"):reg?"Crear cuenta":"Entrar"}</button>
</form>
${reg?`<ul class="mben"><li>${IC.check}Tus vistas, puntajes y calendario en todos tus dispositivos</li><li>${IC.check}Se guarda solo, sin tocar nada</li><li>${IC.check}Sin email ni datos personales</li></ul><p class="mft">Anotá tu contraseña: como no pedimos email, no hay forma de recuperarla.</p>`
:`<p class="mft">¿Primera vez? <button type="button" class="lnk" data-m="register">Creá una cuenta en segundos</button></p>`}`}
else if(mMode==="merge"){const {local,srv}=mMerge;
h=`<div class="mhd"><div class="mic">${IC.merge}</div><h2 id="moT">Ya tenías progreso en este dispositivo</h2><p>Acá hay <b>${cnt(local.seen)}</b> ${cnt(local.seen)===1?"vista":"vistas"} y en tu cuenta <b>${cnt(srv.seen)}</b>. ¿Qué hacemos?</p></div>
<div class="mopts"><button type="button" class="mopt" id="mSum"><span class="oi">${IC.merge}</span><span><b>Sumar todo</b><small>Junta lo de este dispositivo con lo de tu cuenta. No se pierde nada.</small></span></button>
<button type="button" class="mopt" id="mUse"><span class="oi">${IC.swap}</span><span><b>Usar solo lo de mi cuenta</b><small>Lo que hay en este dispositivo se reemplaza.</small></span></button></div>`}
else{const d=collect(),open=keepDel===true&&!!$("mDZ")&&$("mDZ").open;
h=`<button type="button" class="mx" data-close aria-label="Cerrar">×</button>
<div class="mhd"><div class="av big">${ini(acct.user)}</div><h2 id="moT">${h2(acct.user)}</h2><p class="sync ${sync.k}" id="mSync" role="status"><i class="dot ${sync.k}"></i>${h2(sync.t)}</p></div>
<div class="mst"><div><b>${cnt(d.seen)}</b><span>vistas</span></div><div><b>${cnt(d.sent)}</b><span>puntajes</span></div><div><b>${cnt(d.plan)}</b><span>con fecha</span></div></div>
<p class="mft c">Todo lo que marques se guarda solo y aparece en cualquier dispositivo donde inicies sesión.</p>
<button type="button" class="mbtn sec" id="mOut">Cerrar sesión</button>
<details class="mdz" id="mDZ"${open?" open":""}><summary>Eliminar cuenta</summary>
<form id="mDF" novalidate><p>Se borra la cuenta y todo lo guardado en ella. Lo de este dispositivo no se toca.</p>
${fld("mDP","Tu contraseña","password","","current-password",'maxlength="100"')}
${err}<button class="mbtn danger" ${mBusy?"disabled":""}>${mBusy?spin+"Eliminando…":"Eliminar definitivamente"}</button></form></details>`}
box.innerHTML=h;box.setAttribute("aria-labelledby","moT")}
function focusSel(s){const e=$("mbox").querySelector(s);if(e)e.focus()}
function focusFirst(){const b=$("mbox");(mMode==="account"?b:b.querySelector("#mU")||b.querySelector(".mopt")||b).focus()}
function openM(mode){if(!mOpen)mBack=document.activeElement;mOpen=true;mMode=mode||(acct.token?"account":"login");
if(mMode!=="account"&&!mErr)mF.p=mF.p2="";
$("mo").hidden=false;document.body.style.overflow="hidden";mDraw();focusFirst()}
function closeM(){if(mMode==="merge"&&mMerge)return;mOpen=false;mErr="";mBusy=false;mPw=false;$("mo").hidden=true;
if(!cur)document.body.style.overflow="";if(mBack&&mBack.focus)mBack.focus();mBack=null}

// ----- eventos -----
$("accBtn").onclick=()=>openM();
document.querySelectorAll("[data-acc]").forEach(b=>b.onclick=()=>openM());
const mo=$("mo");
mo.addEventListener("mousedown",e=>{if(e.target===mo)closeM()});
mo.addEventListener("input",e=>{const id=e.target.id;if(id==="mU")mF.u=e.target.value;if(id==="mP")mF.p=e.target.value;if(id==="mP2")mF.p2=e.target.value;
if(mErr&&id!=="mDP"){mErr="";const x=$("mbox").querySelector(".merr");if(x)x.remove()}});
mo.addEventListener("click",e=>{const t=e.target.closest("button");if(!t)return;
if(t.hasAttribute("data-close"))return closeM();
if(t.dataset.m&&t.dataset.m!==mMode){mMode=t.dataset.m;mErr="";mDraw();focusSel("#mU");return}
if(t.hasAttribute("data-eye")){const id=t.parentNode.querySelector("input").id,pos=$(id).selectionStart;mPw=!mPw;mDraw(true);const i=$(id);i.focus();try{i.setSelectionRange(pos,pos)}catch(x){}return}
if(t.id==="mSum")return merge(true);
if(t.id==="mUse")return merge(false);
if(t.id==="mOut")return logout()});
mo.addEventListener("submit",e=>{e.preventDefault();if(e.target.id==="mF")enter();if(e.target.id==="mDF")delAcct()});
document.addEventListener("keydown",e=>{if(!mOpen)return;
if(e.key==="Escape"){e.stopImmediatePropagation();closeM();return}
if(e.key==="Tab"){const f=[...$("mbox").querySelectorAll("button:not([disabled]),input,summary")].filter(x=>x.offsetParent!==null);if(!f.length)return;
const a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}},true);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)pull()});
addEventListener("online",()=>{if(acct.dirty)push()});
btnDraw();pull();
