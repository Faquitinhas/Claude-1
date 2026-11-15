// ---------- Calendario: qué día y a qué hora ves cada peli ----------
// duración aproximada en minutos
const R={"Iron Man":126,"El Increíble Hulk":112,"Iron Man 2":124,"Thor":115,"Capitán América: El primer vengador":124,"Los Vengadores":143,"Iron Man 3":130,"Thor: El mundo oscuro":112,"Capitán América: El soldado de invierno":136,"Guardianes de la Galaxia":121,"Vengadores: La era de Ultrón":141,"Ant-Man":117,"Capitán América: Civil War":147,"Doctor Strange":115,"Guardianes de la Galaxia Vol. 2":136,"Spider-Man: Homecoming":133,"Thor: Ragnarok":130,"Black Panther":134,"Vengadores: Infinity War":149,"Ant-Man y la Avispa":118,"Capitana Marvel":123,"Vengadores: Endgame":181,"Spider-Man: Lejos de casa":129,"Viuda Negra":134,"Shang-Chi":132,"Eternals":156,"Spider-Man: No Way Home":148,"Doctor Strange en el multiverso de la locura":126,"Thor: Love and Thunder":119,"Black Panther: Wakanda Forever":161,"Ant-Man y la Avispa: Quantumanía":124,"Guardianes de la Galaxia Vol. 3":150,"The Marvels":105,"Deadpool & Wolverine":128,"Capitán América: Brave New World":118,"Thunderbolts*":127,"Los 4 Fantásticos: Primeros pasos":115,"Spider-Man: Brand New Day":150,
"X-Men":104,"X-Men 2":134,"X-Men: La batalla final":104,"X-Men orígenes: Wolverine":107,"X-Men: Primera generación":131,"Wolverine: Inmortal":126,"X-Men: Días del futuro pasado":132,"Deadpool":108,"X-Men: Apocalipsis":144,"Logan":137,"Deadpool 2":119,"X-Men: Fénix Oscura":114,"Los nuevos mutantes":94};
const AGENDA="https://claude.ai/artifact/7v8sFgoqcPfHJMb18y4t6j";
const MES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DS=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"],DC=["dom","lun","mar","mié","jue","vie","sáb"];
const pad=n=>String(n).padStart(2,"0");
const dk=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fk=k=>{const[y,m,d]=k.split("-").map(Number);return new Date(y,m-1,d)};
const TODAY=dk(new Date());
const tm=t=>{const[h,m]=t.split(":").map(Number);return h*60+m};
const fm=m=>{m=((m%1440)+1440)%1440;return pad(Math.floor(m/60))+":"+pad(m%60)};
const hm=x=>`${Math.floor(x/60)} h ${pad(x%60)} min`;
const ALL=D.flatMap(p=>p[1].map(m=>m[0]));
const bn=k=>String(k).split("#")[0]; // título de una clave del plan (las tandas extra de una serie son "Título#2", "Título#3"...)
const ph=n=>{n=bn(n);return D.findIndex(p=>p[1].some(m=>m[0]===n))};
// series: [episodios disponibles, minutos aproximados por episodio]
const EP={"WandaVision":[9,35],"The Falcon and the Winter Soldier":[6,50],"Loki":[12,50],"What If...?":[26,32],"Hawkeye":[6,50],"Moon Knight":[6,47],"Ms. Marvel":[6,45],"She-Hulk: Attorney at Law":[9,33],"I Am Groot":[10,4],"Daredevil":[39,55],"Secret Invasion":[6,50],"Echo":[5,45],"Agatha All Along":[9,40],"Daredevil: Born Again":[17,50],"Ironheart":[6,45],"Eyes of Wakanda":[4,30],"Marvel Zombies":[4,35],"VisionQuest":[8,45],"The Punisher: One Last Kill":[1,50]};
const defEp=n=>(n=bn(n),EP[n])?Math.min(EP[n][0],Math.max(1,Math.round(120/EP[n][1]))):1;
const epOf=n=>plan[n]&&plan[n].e||defEp(n);
const epTxt=e=>e+(e===1?" episodio":" episodios");
// duración en minutos; en las series depende de cuántos episodios ves ese día
const dur=(n,e)=>{const t=bn(n);return EP[t]?(e||epOf(n))*EP[t][1]:R[t]||120};
const durT=(n,e)=>{const t=bn(n);return EP[t]?`${epTxt(e||epOf(n))} · ${hm(dur(n,e))}`:R[t]?hm(R[t]):"unas 2 h"};
const h2=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
let plan=ld("ucm-plan"),view="pelis",selDay=TODAY,calM=new Date();
calM=new Date(calM.getFullYear(),calM.getMonth(),1);
for(const n of Object.keys(plan)){const p=plan[n];
if(!ALL.includes(bn(n))||(n!==bn(n)&&!(EP[bn(n)]&&/#\d+$/.test(n)))||!p||!/^\d{4}-\d\d-\d\d$/.test(p.d||""))delete plan[n];
else{if(!/^\d\d:\d\d$/.test(p.t||""))p.t="";if(p.e!==undefined&&!(EP[bn(n)]&&Number.isInteger(p.e)&&p.e>=1&&p.e<=EP[bn(n)][0]))delete p.e}}
const endT=n=>plan[n]&&plan[n].t?fm(tm(plan[n].t)+dur(n)):"";
const pkeys=()=>Object.keys(plan).filter(k=>ALL.includes(bn(k)));
const ord=k=>plan[k].d+(plan[k].t||"99:99");
const keysOf=n=>pkeys().filter(k=>bn(k)===n).sort((a,b)=>ord(a).localeCompare(ord(b)));
// qué episodios cubre cada tanda, en orden de fecha y hora
const epRange=k=>{const n=bn(k);let a=1;for(const x of keysOf(n)){const e=epOf(x);if(x===k)return[a,a+e-1];a+=e}return[1,epOf(k)]};
const epRT=k=>{const[a,b]=epRange(k);return a===b?`ep ${a}`:`ep ${a}–${b}`};
const newKey=n=>{if(!plan[n])return n;let i=2;while(plan[n+"#"+i])i++;return n+"#"+i};
const onDay=k=>pkeys().filter(n=>plan[n].d===k).sort((a,b)=>(plan[a].t||"99").localeCompare(plan[b].t||"99"));
const relOn=k=>Object.keys(REL).filter(n=>REL[n]===k);
const after=n=>Math.ceil((tm(plan[n].t)+dur(n)+15)/5)*5;
const nextTime=k=>{const l=onDay(k).filter(n=>plan[n].t);return l.length?fm(Math.min(after(l[l.length-1]),1435)):"21:00"}; // sin dar la vuelta a la medianoche
const fdate=k=>{const d=fk(k);return `${DC[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()].slice(0,3)}`};
const rdate=k=>{const n=Math.round((fk(k)-fk(TODAY))/864e5);return n===0?"hoy":n===1?"mañana":fdate(k)};

// usados desde app.js (tarjetas y hoja de detalles)
const epS=n=>EP[bn(n)]&&plan[n]&&EP[bn(n)][0]>1?` · ${epRT(n)}`:"";
const whenBadge=n=>{const ks=keysOf(n);if(!ks.length)return"";const k=ks.find(x=>plan[x].d>=TODAY)||ks[0],w=plan[k];return`<span class="when">${fdate(w.d)}${w.t?" · "+w.t:""}${ks.length>1?" +"+(ks.length-1):epS(k)}</span>`};
function whenBox(n){const pl=plan[n]||{};
return `<h4>Cuándo la ves</h4><div class="when-ed"><label>Día<input type="date" id="wd" value="${pl.d||""}"></label><label>Arranca a las<input type="time" id="wt" step="300" value="${pl.t||""}"${pl.d?"":" disabled"}></label>${pl.d?`<button class="btn" id="wx">Quitar fecha</button><button class="btn" id="wc">Ver en el calendario</button>`:""}</div><p class="nt">Dura ${durT(n)}${pl.t?` · terminás tipo ${endT(n)}`:pl.d?"":" · elegí un día para ponerle hora"}.</p>`}

function savePlan(){sv("ucm-plan",plan);grid();planUpd();if(cur&&vt==="info")draw()}
function setPlan(n,d,t,e){if(!d)delete plan[n];else{const o={d,t:t||""},pe=e||(plan[n]&&plan[n].e);if(EP[bn(n)]&&pe)o.e=pe;plan[n]=o}savePlan()}
function planUpd(){if(view==="cal")cal();nextPlan();const v=document.getElementById("dv");if(v&&!v.hidden)dvDraw()}
// Lo próximo que tenés agendado y todavía no viste
function nextPlan(){const b=$("pln");
const l=pkeys().filter(k=>!seen[bn(k)]&&plan[k].d>=TODAY).sort((a,c)=>ord(a).localeCompare(ord(c)));
if(!l.length){b.hidden=true;return}
const n=l[0],w=plan[n];b.hidden=false;b.dataset.k=w.d;
b.innerHTML=`<span>En tu calendario · ${rdate(w.d)}${w.t?" · "+w.t:""}</span><b>${h2(bn(n))}${epS(n)}</b>`}
$("pln").onclick=()=>goDay($("pln").dataset.k);
function goDay(k){selDay=k;calM=new Date(fk(k).getFullYear(),fk(k).getMonth(),1);setView("cal")}

$("sb").addEventListener("change",e=>{
if(!cur)return;
if(e.target.id==="wd"){const d=e.target.value;setPlan(cur,d,d?((plan[cur]&&plan[cur].t)||nextTime(d)):"")}
if(e.target.id==="wt"&&plan[cur]){plan[cur].t=e.target.value;savePlan()}});
$("sb").addEventListener("click",e=>{
if(!cur)return;
if(e.target.id==="wx"){for(const k of keysOf(cur))delete plan[k];savePlan()}
if(e.target.id==="wc"&&plan[cur]){const k=plan[cur].d;closeSheet();goDay(k)}});

// código para mandar el plan a Mi Agenda
function code(){
const items=pkeys().map(k=>[bn(k)+(keysOf(bn(k)).length>1?` (${epRT(k)})`:""),plan[k].d,plan[k].t||"",dur(k),Math.min(ph(k)+1,6)]);
const s=JSON.stringify({v:1,items});
return "UCM1."+btoa(unescape(encodeURIComponent(s))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function syncBox(){
const n=pkeys().length;
$("sn2").textContent=n?`Tenés ${n} ${n===1?"título":"títulos"} con fecha. Mandalos a tu agenda para verlos junto con el resto de tus cosas.`:"Todavía no pusiste fechas. Si mandás el plan vacío, se borran de la agenda las pelis que habías mandado antes.";
$("sl").href=AGENDA+"#ucm="+code();
$("scode").hidden=true}
$("sc").onclick=()=>{const c=code(),b=$("sc");
const show=()=>{const t=$("scode");t.value=c;t.hidden=false;t.focus();t.select();b.textContent="Copialo de acá abajo"};
try{navigator.clipboard.writeText(c).then(()=>{b.textContent="¡Copiado!";setTimeout(()=>b.textContent="Copiar código",2000)},show)}catch(e){show()}};

function cal(){
$("cm").textContent=MES[calM.getMonth()]+" "+calM.getFullYear();
const off=(calM.getDay()+6)%7,dim=new Date(calM.getFullYear(),calM.getMonth()+1,0).getDate();
let h="";for(let i=0;i<off;i++)h+=`<div class="cday blank" aria-hidden="true"></div>`;
for(let d=1;d<=dim;d++){const k=dk(new Date(calM.getFullYear(),calM.getMonth(),d)),l=onDay(k),rl=relOn(k);
h+=`<button class="cday${k===TODAY?" today":""}${k===selDay?" sel":""}${k<TODAY?" past":""}" data-k="${k}" aria-pressed="${k===selDay}" aria-label="${d} de ${MES[calM.getMonth()]}${l.length?`, ${l.length} ${l.length>1?"títulos":"título"}`:""}${rl.length?", estreno de "+h2(rl.join(" y ")):""}"><span class="dn">${d}</span>${l.length||rl.length?`<span class="chs">${rl.map(n=>`<span class="ch rel"><span>★ ${h2(n)}</span></span>`).join("")}${l.map(n=>`<span class="ch${seen[bn(n)]?" ok":""}" style="--h:${HUES[ph(n)]}">${plan[n].t?`<time>${plan[n].t}</time>`:""}<span>${h2(bn(n))}${epS(n)}</span></span>`).join("")}</span>`:""}</button>`}
const tail=(7-(off+dim)%7)%7;for(let i=0;i<tail;i++)h+=`<div class="cday blank" aria-hidden="true"></div>`;
$("cg").innerHTML=h;day();syncBox()}
function day(){if(!$("dayp"))return;
const d=fk(selDay),l=onDay(selDay),rl=relOn(selDay);
const tot=l.reduce((a,n)=>a+dur(n),0),last=l.length?l[l.length-1]:null,le=last?endT(last):"";
const opts=D.map(p=>{const o=p[1].filter(m=>vis(m)&&!plan[m[0]]).sort((a,b)=>!!seen[a[0]]-!!seen[b[0]]);
return o.length?`<optgroup label="${h2(p[0])}">${o.map(m=>`<option value="${h2(m[0])}">${h2(m[0])}${m[2]?" (serie)":""}${seen[m[0]]?" (ya vista)":""}</option>`).join("")}</optgroup>`:""}).join("");
$("dayp").innerHTML=`<div class="dph"><h3>${DS[d.getDay()]} ${d.getDate()} de ${MES[d.getMonth()]}</h3>${l.length?`<span>${hm(tot)} de pantalla${le?` · terminás tipo ${le}`:""}</span>`:""}</div>
${rl.map(n=>`<p class="cd">🗓 Estreno en cines: ${h2(n)}</p>`).join("")}
${l.length?`<ul class="fl">${l.map(n=>`<li style="--h:${HUES[ph(n)]}"><input type="time" step="300" value="${plan[n].t||""}" data-tn="${h2(n)}" aria-label="Hora de inicio de ${h2(n)}"><div><b>${h2(n)}</b><small>${h2(D[ph(n)][0])} · ${durT(n)}${plan[n].t?` · hasta las ${endT(n)}`:""}${seen[n]?" · ya la viste":""}</small></div><button class="rm" data-rm="${h2(n)}" aria-label="Quitar ${h2(n)} de este día">×</button></li>`).join("")}</ul>`:`<p class="nt">Nada programado este día.</p>`}
${opts?`<div class="add"><select id="as" aria-label="Título para agregar">${opts}</select><input type="time" id="at" step="300" value="${nextTime(selDay)}" aria-label="Hora de inicio"><button class="btn pri" id="ab">Agregar a este día</button></div>`:`<p class="nt">Ya tenés todo con fecha.</p>`}`}
$("cg").addEventListener("click",e=>{const b=e.target.closest(".cday[data-k]");if(!b)return;dvOpen(b.dataset.k)});
$("cp").onclick=()=>{calM=new Date(calM.getFullYear(),calM.getMonth()-1,1);cal()};
$("cn").onclick=()=>{calM=new Date(calM.getFullYear(),calM.getMonth()+1,1);cal()};
$("chy").onclick=()=>goDay(TODAY);
if($("dayp"))$("dayp").addEventListener("change",e=>{const n=e.target.dataset.tn;if(n&&plan[n]){plan[n].t=e.target.value;savePlan()}});
if($("dayp"))$("dayp").addEventListener("click",e=>{
const r=e.target.dataset.rm;if(r){setPlan(r,"");return}
if(e.target.id==="ab"){const n=$("as").value;if(n)setPlan(n,selDay,$("at").value)}});

// plan automático
const aw=new Set([0,1,2,3,4,5,6]);
$("aw").innerHTML=[1,2,3,4,5,6,0].map(v=>`<button type="button" data-w="${v}" aria-pressed="true" aria-label="${DS[v]}">${DC[v].slice(0,2)}</button>`).join("");
$("aw").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;const v=+b.dataset.w;
if(aw.has(v)){if(aw.size>1)aw.delete(v)}else aw.add(v);b.setAttribute("aria-pressed",aw.has(v))});
$("apd").value=TODAY;
$("ago").onclick=()=>{
const skip=$("askip").checked,xm=$("axm").checked,per=+$("an").value,t0=$("aT").value||"21:00",start=$("apd").value||TODAY;
// solo películas ya estrenadas, en orden; las series se agregan a mano
const todo=D.flatMap(p=>p[2]&&!xm?[]:p[1].filter(m=>!m[2]&&vis(m)&&!isSoon(m[0])).map(m=>m[0])).filter(n=>!plan[n]&&!(skip&&seen[n]));
if(!todo.length){$("amsg").textContent="No quedan pelis sin fecha para repartir.";return}
let d=fk(start),i=0,g=0,first="",lastK="";
while(i<todo.length&&g++<2000){const k=dk(d);
if(aw.has(d.getDay())&&!onDay(k).length){let t=tm(t0);for(let j=0;j<per&&i<todo.length&&t<1440;j++){const n=todo[i++];plan[n]={d:k,t:fm(t)};t=after(n);if(!first)first=k;lastK=k}}
d.setDate(d.getDate()+1)}
if(!first)return;
selDay=first;calM=new Date(fk(first).getFullYear(),fk(first).getMonth(),1);
savePlan();
$("amsg").textContent=`Listo: ${i} ${i===1?"peli":"pelis"} entre el ${fdate(first)} y el ${fdate(lastK)}. Podés mover cualquiera tocando su día.`};
$("aclr").onclick=()=>{if(confirm("¿Quitar la fecha de todas las películas?")){plan={};savePlan();$("amsg").textContent="Se borraron todas las fechas."}};

function setView(v){view=v;$("vPelis").hidden=v!=="pelis";$("vCal").hidden=v!=="cal";
$("vbP").setAttribute("aria-selected",v==="pelis");$("vbC").setAttribute("aria-selected",v==="cal");
try{localStorage.setItem("ucm-vista",v)}catch(e){}
if(v==="cal")cal()}
$("vbP").onclick=()=>setView("pelis");$("vbC").onclick=()=>setView("cal");

// ---------- Vista del día: todos los pósters para elegir qué ver ese día y a qué hora ----------
// Una película tiene una sola fecha. Una serie puede tener varias tandas (mismo día u otros días),
// cada una con su hora y su cantidad de episodios; los episodios se numeran en orden de fecha y hora.
let dvTab=-1,tpN=null,tpT="21:00",tpE=1,tpFrom=null,tpNew=false;
const isS=n=>!!EP[bn(n)]&&EP[bn(n)][0]>1;
const epDone=(n,skip)=>keysOf(n).filter(k=>k!==skip).reduce((a,k)=>a+epOf(k),0); // episodios ya programados
function dvOpen(k){selDay=k;if(view==="cal")cal();
if(dvTab<0){dvTab=0;for(let i=0;i<D.length;i++)if(D[i][1].some(m=>vis(m)&&!seen[m[0]]&&!isSoon(m[0]))){dvTab=i;break}}
const v=$("dv");v.hidden=false;document.body.style.overflow="hidden";v.scrollTop=0;
v.classList.remove("in");void v.offsetWidth;v.classList.add("in");dvDraw();setTimeout(()=>$("dvb").focus(),50)}
function dvClose(){const v=$("dv");v.classList.remove("in");v.classList.add("out");
setTimeout(()=>{v.hidden=true;v.classList.remove("out");if($("ov").hidden&&$("mo").hidden)document.body.style.overflow=""},220);
const c=document.querySelector(`.cday[data-k="${selDay}"]`);if(c)c.focus()}
function dvHead(){const d=fk(selDay),l=onDay(selDay),tot=l.reduce((a,n)=>a+dur(n),0),last=l.length?l[l.length-1]:null,le=last?endT(last):"";
$("dvt").textContent=`${DS[d.getDay()]} ${d.getDate()} de ${MES[d.getMonth()]}`;
$("dvs").innerHTML=l.length?`<b>${l.length}</b> ${l.length>1?"cosas":"cosa"} para ver · ${hm(tot)} de pantalla${le?` · terminás tipo <b>${le}</b>`:""}`:"Tocá un póster para elegir a qué hora lo ves.";
$("dvl").innerHTML=l.map(k=>`<button type="button" class="dvc" data-k="${h2(k)}" style="--h:${HUES[ph(k)]}"><time>${plan[k].t||"--:--"}</time>${h2(bn(k))}${epS(k)}</button>`).join("")}
function dvCard(m){const n=m[0],q=pos[n]||wk[n],p=q&&OK[q]?q:"",ks=keysOf(n),here=ks.filter(k=>plan[k].d===selDay);
const tot=EP[n]?EP[n][0]:0,dn=isS(n)?epDone(n):0;
const badge=here.length?here.map(k=>`<span class="dvt">${plan[k].t?"⏰ "+plan[k].t:"Sin hora"}${epS(k)}</span>`).join(""):ks.length?whenBadge(n):"";
const prog=isS(n)&&dn?`<span class="dvp">${Math.min(dn,tot)}/${tot} ep programados</span>`:"";
return `<div class="cell"><div class="card ${seen[n]?"done":""} ${p?"img":""} ${here.length?"pk":""}" role="button" tabindex="0" aria-label="${h2(n)}${here.length?", programada este día":""}${seen[n]?", vista":""}" data-n="${h2(n)}"${p?` style="background-image:${h2(cu(p))}"`:""}><span class="yr">${m[1]}${m[2]?" · Serie":""}</span><span class="nm">${h2(n)}</span><span class="stamp">vista</span><span class="tags">${badge}${prog}${isSoon(n)?'<span class="soon">Próximamente</span>':""}</span></div></div>`}
function dvDraw(){dvHead();
$("dvtabs").innerHTML=D.map((p,i)=>{const c=onDay(selDay).filter(k=>ph(k)===i).length;
return `<button class="tab${p[2]?" xm":""}" role="tab" data-i="${i}" aria-selected="${i===dvTab}" style="--h:${HUES[i]}">${p[2]?"★ ":""}${p[0]}${c?`<small class="dvn">${c}</small>`:""}</button>`}).join("");
const g=$("dvg"),l=D[dvTab][1].filter(vis);g.style.setProperty("--h",HUES[dvTab]);
g.innerHTML=l.map(dvCard).join("")||`<p class="empty">No hay nada para mostrar en esta fase.</p>`;
fitAll();l.forEach(m=>{const n=m[0],q=pos[n]||wk[n];if(q&&!OK[q])want(n,q)})}
const dvCardOf=n=>$("dvg").querySelector(`.card[data-n="${CSS.escape(bn(n))}"]`);
// tocar un póster: película -> su única fecha; serie -> una tanda nueva (o la que ya tenga, si es la primera vez)
function pickPoster(n,card){if(!isS(n))return tpOpen(n,card,false);
const ks=keysOf(n);if(!ks.length)return tpOpen(n,card,true);
tpOpen(newKey(n),card,true)}
$("dvb").onclick=dvClose;
$("dvtabs").addEventListener("click",e=>{const b=e.target.closest(".tab");if(!b)return;dvTab=+b.dataset.i;dvDraw();b.scrollIntoView({block:"nearest",inline:"nearest"})});
$("dvg").addEventListener("click",e=>{const c=e.target.closest(".card");if(c)pickPoster(c.dataset.n,c)});
$("dvg").addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.classList.contains("card")){e.preventDefault();pickPoster(e.target.dataset.n,e.target)}});
$("dvl").addEventListener("click",e=>{const b=e.target.closest(".dvc");if(!b)return;const k=b.dataset.k,i=ph(k);
if(i!==dvTab){dvTab=i;dvDraw()}tpOpen(k,dvCardOf(k),false)});

// ----- elegir la hora (y los episodios) -----
const QUICK=["18:00","19:00","20:00","21:00","22:00","23:00"];
function tpClash(n,t){const a=tm(t),b=a+dur(n,tpE);return onDay(selDay).filter(x=>x!==n&&plan[x].t).find(x=>{const s=tm(plan[x].t),e=s+dur(x);return a<e&&s<b})}
// qué episodios serían con la hora y cantidad elegidas (sin guardar todavía)
function tpRange(){const n=bn(tpN),me=selDay+tpT;let a=1;
for(const k of keysOf(n))if(k!==tpN&&ord(k)<=me)a+=epOf(k);return[a,a+tpE-1]}
function tpDraw(){const k=tpN,n=bn(k),w=plan[k],here=w&&w.d===selDay&&!tpNew,ser=isS(n),end=fm(tm(tpT)+dur(k,tpE)),cl=tpClash(k,tpT),[hh,mm]=tpT.split(":");
const nx=nextTime(selDay),tot=ser?EP[n][0]:0,others=ser?keysOf(n).filter(x=>x!==k):[],done=ser?epDone(n,k):0,[ra,rb]=ser?tpRange():[0,0];
$("tpi").innerHTML=`<p class="tpk">${h2(D[ph(n)][0])} · ${durT(k,tpE)}</p><h3 id="tpH">${h2(n)}</h3>
<p class="tpd">${DS[fk(selDay).getDay()]} ${fk(selDay).getDate()} de ${MES[fk(selDay).getMonth()]}${ser&&others.length?tpNew?" · tanda nueva":" · editando una tanda":""}</p>
${w&&!ser&&w.d!==selDay?`<p class="tpw">Ahora está el ${fdate(w.d)}${w.t?" a las "+w.t:""}. Si guardás, pasa a este día.</p>`:""}
${w&&ser&&!tpNew&&w.d!==selDay?`<p class="tpw">Esta tanda estaba el ${fdate(w.d)}${w.t?" a las "+w.t:""}. Si guardás, pasa a este día.</p>`:""}
${ser?`<div class="eps" role="group" aria-label="Episodios">
<div class="epg" aria-label="Llevás ${done} de ${tot} episodios programados"><div class="epb"><i style="width:${Math.min(100,done/tot*100)}%"></i><i class="nw" style="left:${Math.min(100,done/tot*100)}%;width:${Math.max(0,Math.min(100-done/tot*100,tpE/tot*100))}%"></i></div>
<p class="ept">Llevás <b>${done} de ${tot}</b> episodios programados${done+tpE>tot?" · <span class=\"epo\">te pasás del total</span>":done+tpE===tot?" · con esta tanda completás la serie":""}</p></div>
${others.length?`<p class="tdl">Tus tandas de ${h2(n)}</p><ul class="tds">${others.map(x=>`<li class="${plan[x].d===selDay?"hoy":""}"><button type="button" class="tde" data-sk="${h2(x)}" aria-label="Editar la tanda del ${fdate(plan[x].d)}"><span>${plan[x].d===selDay?"Este día":fdate(plan[x].d)}${plan[x].t?" · "+plan[x].t:""}</span><b>${epRT(x)}</b></button><button type="button" class="tdx" data-rk="${h2(x)}" aria-label="Quitar la tanda ${epRT(x)} del ${fdate(plan[x].d)}">Quitar</button></li>`).join("")}</ul>`:""}
<p class="epl">¿Cuántos episodios ves ${tpNew&&others.length?"en esta tanda":"esta vez"}?</p>
<div class="epr"><button type="button" data-ep="-1" aria-label="Un episodio menos" ${tpE<=1?"disabled":""}>−</button><output id="tpEp"><b>${tpE}</b><small>${ra===rb?"episodio "+ra:"episodios "+ra+" a "+rb}</small></output><button type="button" data-ep="1" aria-label="Un episodio más" ${tpE>=tot?"disabled":""}>+</button></div>
<div class="qk epq">${[...new Set([1,2,3,Math.max(1,tot-done)])].filter(x=>x<=tot).sort((a,b)=>a-b).map(x=>`<button type="button" data-es="${x}" aria-pressed="${x===tpE}">${x===tot-done&&x>3?"Los que faltan ("+x+")":epTxt(x)}</button>`).join("")}</div>
<p class="epm">Cada episodio dura unos ${EP[n][1]} min · esta tanda ${hm(dur(k,tpE))}</p></div>`:""}
<div class="clk" role="group" aria-label="Hora de inicio">
<div class="cu"><button type="button" data-st="60" aria-label="Una hora más">▲</button><output id="tpHh">${hh}</output><button type="button" data-st="-60" aria-label="Una hora menos">▼</button></div>
<span class="cc">:</span>
<div class="cu"><button type="button" data-st="5" aria-label="Cinco minutos más">▲</button><output id="tpMm">${mm}</output><button type="button" data-st="-5" aria-label="Cinco minutos menos">▼</button></div>
</div>
<p class="tpe">Termina tipo <b>${end}</b>${tm(tpT)+dur(k,tpE)>=1440?" (pasada la medianoche)":""}</p>
${cl?`<p class="tpx">Se superpone con <b>${h2(bn(cl))}${epS(cl)}</b> (${plan[cl].t} a ${endT(cl)}).</p>`:""}
<div class="qk">${[...new Set([nx,...QUICK])].map(t=>`<button type="button" data-q="${t}" aria-pressed="${t===tpT}">${t===nx&&onDay(selDay).some(x=>x!==k&&plan[x].t)?"Después de la anterior · ":""}${t}</button>`).join("")}</div>
<label class="tpm">Otra hora exacta <input type="time" id="tpIn" step="300" value="${tpT}"></label>
<button type="button" class="mbtn" id="tpOk">${tpNew?"Guardar":"Guardar cambio"} · ${tpT}${ser?" · "+(ra===rb?"ep "+ra:"ep "+ra+"–"+rb):""}</button>
${w&&!tpNew?`<button type="button" class="tprm" id="tpRm">${ser?"Quitar esta tanda":"Quitar de este día"}</button>`:""}`}
function tpOpen(k,card,isNew){tpN=k;tpFrom=card||null;const n=bn(k),w=plan[k];
tpNew=!!isNew||!w;
tpT=w&&!tpNew&&w.t?w.t:nextTime(selDay);
if(isS(n)){const left=EP[n][0]-epDone(n,k);tpE=w&&!tpNew?epOf(k):Math.max(1,Math.min(defEp(n),left>0?left:defEp(n)))}else tpE=1;
const o=$("tp"),b=$("tpb"),pp=$("tpp"),q=pos[n]||wk[n];
pp.style.backgroundImage=q&&OK[q]?cu(q):"";pp.classList.toggle("np",!(q&&OK[q]));pp.style.setProperty("--h",HUES[ph(n)]);pp.dataset.t=n;
tpDraw();o.hidden=false;b.scrollTop=0;
// animación: el póster vuela desde la tarjeta hasta la ventana
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
o.animate([{opacity:0},{opacity:1}],{duration:220,easing:"ease-out"});
if(card&&!reduce){const a=card.getBoundingClientRect(),z=pp.getBoundingClientRect();
const dx=a.left-z.left,dy=a.top-z.top,sx=a.width/z.width,sy=a.height/z.height;
card.style.visibility="hidden";
pp.animate([{transform:`translate(${dx}px,${dy}px) scale(${sx},${sy})`,borderRadius:"10px"},{transform:"none",borderRadius:"14px"}],{duration:520,easing:"cubic-bezier(.2,1.15,.3,1)"});
b.animate([{transform:"translateY(40px) scale(.96)",opacity:0},{transform:"none",opacity:1}],{duration:420,delay:90,easing:"cubic-bezier(.2,1.2,.35,1)",fill:"backwards"})}
setTimeout(()=>{const x=$("tpOk");if(x)x.focus({preventScroll:true})},60)}
let tpClosing=false;
function tpClose(saved){if(tpClosing)return;tpClosing=true;const o=$("tp"),pp=$("tpp"),k=tpN,card=tpFrom&&document.body.contains(tpFrom)?tpFrom:null;
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const fin=()=>{o.hidden=true;tpClosing=false;if(card)card.style.visibility="";tpN=null;
const c=dvCardOf(k);if(c){c.style.visibility="";if(saved)c.animate([{transform:"scale(1)"},{transform:"scale(1.07)"},{transform:"scale(1)"}],{duration:450,easing:"ease-out"});c.focus({preventScroll:true})}};
if(card&&!reduce){const a=card.getBoundingClientRect(),z=pp.getBoundingClientRect();
pp.animate([{transform:"none"},{transform:`translate(${a.left-z.left}px,${a.top-z.top}px) scale(${a.width/z.width},${a.height/z.height})`}],{duration:380,easing:"cubic-bezier(.5,0,.2,1)",fill:"forwards"}).onfinish=()=>{pp.getAnimations().forEach(x=>x.cancel());fin()};
$("tpb").animate([{opacity:1},{opacity:0,transform:"translateY(30px)"}],{duration:200,fill:"forwards"}).onfinish=e=>e.target.cancel();
o.animate([{opacity:1},{opacity:0}],{duration:380,fill:"forwards"}).onfinish=e=>e.target.cancel()}
else fin()}
function tpSet(t){tpT=t;tpDraw()}
function tpAfterSave(k,msg,saved){dvDraw();tpFrom=dvCardOf(k)||tpFrom;if(tpFrom)tpFrom.style.visibility="hidden";tpClose(saved);toast(msg)}
$("tp").addEventListener("click",e=>{if(e.target.id==="tp")return tpClose(false);
const b=e.target.closest("button");if(!b||tpClosing)return;
if(b.dataset.st){tpSet(fm(Math.round((tm(tpT)+ +b.dataset.st)/5)*5));const s=b.dataset.st,nb=$("tpi").querySelector(`[data-st="${s}"]`);if(nb)nb.focus();
const o=Math.abs(s)===60?$("tpHh"):$("tpMm");o.animate([{transform:`translateY(${s>0?8:-8}px)`,opacity:.3},{transform:"none",opacity:1}],{duration:200,easing:"ease-out"});return}
if(b.dataset.q){tpSet(b.dataset.q);return}
if(b.dataset.ep||b.dataset.es){const mx=EP[bn(tpN)][0];tpE=Math.min(mx,Math.max(1,b.dataset.es?+b.dataset.es:tpE+ +b.dataset.ep));tpDraw();
const o=$("tpEp");if(o)o.animate([{transform:"scale(1.2)"},{transform:"none"}],{duration:220,easing:"ease-out"});const f=$("tpi").querySelector(b.dataset.ep?`[data-ep="${b.dataset.ep}"]`:`[data-es="${b.dataset.es}"]`);if(f&&!f.disabled)f.focus();return}
if(b.dataset.sk){const k=b.dataset.sk,d=plan[k].d;if(d!==selDay){selDay=d;dvDraw()}tpN=k;tpNew=false;tpT=plan[k].t||nextTime(d);tpE=epOf(k);tpDraw();
$("tpb").animate([{opacity:.4,transform:"scale(.98)"},{opacity:1,transform:"none"}],{duration:220,easing:"ease-out"});return}
if(b.dataset.rk){const k=b.dataset.rk,n=bn(k),r=epRT(k),d=plan[k].d;
const li=b.closest("li");const go=()=>{setPlan(k,"");dvDraw();tpDraw();toast(`Quitaste ${n} (${r}) del ${fdate(d)}`)};
if(li&&!matchMedia("(prefers-reduced-motion: reduce)").matches)li.animate([{opacity:1,transform:"none"},{opacity:0,transform:"translateX(40px)"}],{duration:220,easing:"ease-in"}).onfinish=go;else go();return}
if(b.id==="tpX")return tpClose(false);
if(b.id==="tpOk"){const k=tpN,n=bn(k),t=tpT,ser=isS(n);setPlan(k,selDay,t,EP[n]?tpE:0);
tpAfterSave(k,`Listo: ${n}${ser?" ("+epRT(k)+")":""} · ${rdate(selDay)} a las ${t}`,true);return}
if(b.id==="tpRm"){const k=tpN,n=bn(k),ser=isS(n),r=ser?epRT(k):"";setPlan(k,"");
tpAfterSave(k,ser?`Quitaste la tanda de ${n} (${r})`:`Quitaste ${n} de este día`,false)}});
$("tp").addEventListener("change",e=>{if(e.target.id==="tpIn"&&/^\d\d:\d\d$/.test(e.target.value))tpSet(e.target.value)});
document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;
if(!$("tp").hidden){e.stopImmediatePropagation();tpClose(false)}else if(!$("dv").hidden&&$("mo").hidden){e.stopImmediatePropagation();dvClose()}},true);

// arranque
tabs();grid();stats();loadPosters();
try{if(localStorage.getItem("ucm-vista")==="cal")setView("cal")}catch(e){}
