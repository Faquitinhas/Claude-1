// ---------- Cuenta: guarda el progreso en la nube y lo sincroniza entre dispositivos ----------
// Se carga después de app.js y plan.js. app.js avisa cada guardado local llamando a onSave(clave).
const SYNC_KEYS=["ucm-vistas","ucm-enviados-v2","ucm-fav-v2","ucm-quitadas","ucm-plan"];
let acct=ld("ucm-cuenta"),acOpen=false,acBusy=false,acMsg="",acStat="",acDel=false,applying=false,pushT=0,syncing=false;
const obj=x=>x&&typeof x==="object"&&!Array.isArray(x)?x:{};
const collect=()=>({seen,sent,fav:fav||"",qt:QT,plan});
const isEmpty=d=>!Object.keys(obj(d.seen)).length&&!Object.keys(obj(d.sent)).length&&!d.fav&&!Object.keys(obj(d.qt)).length&&!Object.keys(obj(d.plan)).length;
const saveAcct=()=>sv("ucm-cuenta",acct);
const canon=x=>x&&typeof x==="object"?Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canon(x[k])).join(","):JSON.stringify(x);
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
grid();stats();rmDraw();if(cur)draw()}
function stat(t){acStat=t;const e=$("acS");if(e)e.textContent=t}
function expired(){acct={};saveAcct();acMsg="Tu sesión venció. Volvé a iniciar sesión.";acOpen=true;accDraw()}
async function push(){
if(!acct.token)return;clearTimeout(pushT);
if(syncing){pushT=setTimeout(push,800);return}
syncing=true;stat("Guardando…");
try{acct.dirty=false;const r=await api({action:"save",token:acct.token,data:collect()});
acct.u=r.u;saveAcct();stat(acct.dirty?"Guardando…":"Progreso guardado en tu cuenta ✓")}
catch(e){acct.dirty=true;saveAcct();
if(e.status===401){syncing=false;expired();return}
stat(e.net?"Sin conexión: se guarda cuando vuelva.":"No se pudo guardar. Se reintenta solo.")}
syncing=false}
async function pull(){
if(!acct.token||syncing)return;
if(acct.dirty)return push();
syncing=true;
try{const r=await api({action:"get",token:acct.token});
if(acct.dirty){syncing=false;return push()} // cambió algo mientras esperábamos: gana lo local
if(r.u>(acct.u||0)){acct.u=r.u;saveAcct();applyData(r.data)}
stat("Progreso guardado en tu cuenta ✓")}
catch(e){if(e.status===401){syncing=false;expired();return}
stat(e.net?"Sin conexión: usando lo guardado en este dispositivo.":"No se pudo consultar tu cuenta.")}
syncing=false}
function onSave(k){
if(applying||!acct.token||!SYNC_KEYS.includes(k))return;
if(!acct.dirty){acct.dirty=true;saveAcct()}
stat("Guardando…");clearTimeout(pushT);pushT=setTimeout(push,1200)}

async function enter(mode){
if(acBusy)return;const user=$("acU").value.trim(),pass=$("acP").value;
if(!user||!pass){acMsg="Completá usuario y contraseña.";accDraw();return}
acBusy=true;acMsg="";accDraw({user,pass});
try{
if(mode==="register"){const r=await api({action:"register",user,pass,data:collect()});
acct={user:r.user,token:r.token,u:r.u};saveAcct();acStat="Cuenta creada. Tu progreso ya está guardado ✓"}
else{const r=await api({action:"login",user,pass}),local=collect(),srv=obj(r.data);
acct={user:r.user,token:r.token,u:r.u};saveAcct();
if(isEmpty(local)||canon(local)===canon({seen:obj(srv.seen),sent:obj(srv.sent),fav:srv.fav||"",qt:obj(srv.qt),plan:obj(srv.plan)})){applyData(srv);acStat="Progreso cargado de tu cuenta ✓"}
else if(isEmpty(srv)){acStat="Guardando…";push()}
else if(confirm("Este dispositivo ya tiene progreso guardado.\n\nAceptar: sumarlo al de tu cuenta.\nCancelar: usar solo el de tu cuenta (se reemplaza el de este dispositivo).")){
applyData({seen:{...obj(srv.seen),...local.seen},sent:{...local.sent,...obj(srv.sent)},fav:srv.fav||local.fav,qt:{...obj(srv.qt),...local.qt},plan:{...local.plan,...obj(srv.plan)}});
acStat="Guardando…";push()}
else{applyData(srv);acStat="Progreso cargado de tu cuenta ✓"}}
acOpen=false;acBusy=false;accDraw()}
catch(e){acBusy=false;acMsg=e.message;accDraw({user,pass})}}
function logout(){clearTimeout(pushT);acct={};saveAcct();acDel=false;acOpen=false;acMsg="Cerraste sesión. El progreso sigue en este dispositivo.";accDraw()}
async function delAcct(){
if(acBusy)return;const pass=$("acDP").value;if(!pass){acMsg="Escribí tu contraseña para confirmar.";accDraw();return}
acBusy=true;acMsg="";accDraw();
try{await api({action:"delete",token:acct.token,pass});clearTimeout(pushT);acct={};saveAcct();acDel=false;acMsg="Cuenta eliminada. El progreso sigue en este dispositivo."}
catch(e){acMsg=e.message}
acBusy=false;accDraw()}

function accDraw(keep){const el=$("acc"),a=h2;
if(acct.token){el.innerHTML=`<div class="acb"><span>Cuenta</span><b>${a(acct.user)}</b><small id="acS" role="status">${a(acStat||"Progreso guardado en tu cuenta ✓")}</small>
<div class="acr"><button type="button" id="acX">Cerrar sesión</button><button type="button" id="acDl" aria-expanded="${acDel}">Eliminar cuenta</button></div>
${acDel?`<form id="acDF"><p class="nt">Se borra la cuenta y lo guardado en ella. Lo de este dispositivo no se toca.</p><input id="acDP" type="password" placeholder="Tu contraseña" autocomplete="current-password" aria-label="Contraseña"><button class="del" ${acBusy?"disabled":""}>${acBusy?"Eliminando…":"Eliminar definitivamente"}</button></form>`:""}
${acMsg?`<p class="nt" role="status">${a(acMsg)}</p>`:""}</div>`;return}
el.innerHTML=`<button type="button" class="nxt" id="acO" aria-expanded="${acOpen}"><span>Cuenta</span><b>Iniciar sesión o crear cuenta</b></button>
${acOpen?`<form class="acb" id="acF"><p class="nt">Con una cuenta tu progreso se guarda solo y lo ves igual en cualquier dispositivo.</p>
<label>Usuario<input id="acU" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="20" value="${a(keep&&keep.user||"")}"></label>
<label>Contraseña<input id="acP" type="password" autocomplete="current-password" maxlength="100" value="${a(keep&&keep.pass||"")}"></label>
<div class="acr"><button class="pri" id="acL" ${acBusy?"disabled":""}>${acBusy?"Un momento…":"Entrar"}</button><button type="button" id="acR" ${acBusy?"disabled":""}>Crear cuenta</button></div>
<p class="nt">No se pide email: si te olvidás la contraseña no hay forma de recuperarla.</p></form>`:""}
${acMsg?`<p class="nt" role="status">${a(acMsg)}</p>`:""}`}
$("acc").addEventListener("click",e=>{const id=e.target.closest("button")&&e.target.closest("button").id;
if(id==="acO"){acOpen=!acOpen;acMsg="";accDraw();if(acOpen)$("acU").focus()}
if(id==="acR")enter("register");
if(id==="acX")logout();
if(id==="acDl"){acDel=!acDel;acMsg="";accDraw();if(acDel)$("acDP").focus()}});
$("acc").addEventListener("submit",e=>{e.preventDefault();if(e.target.id==="acF")enter("login");if(e.target.id==="acDF")delAcct()});
document.addEventListener("visibilitychange",()=>{if(!document.hidden)pull()});
addEventListener("online",()=>{if(acct.dirty)push()});
accDraw();pull();
