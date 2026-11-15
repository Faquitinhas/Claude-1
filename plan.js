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
if(!XM&&D[dvTab][2])dvTab=0;
$("dvtabs").innerHTML=D.map((p,i)=>{const c=onDay(selDay).filter(k=>ph(k)===i).length;
return `<button class="tab${p[2]?" xm":""}" role="tab" data-i="${i}" aria-selected="${i===dvTab}" style="--h:${HUES[i]}"${p[2]&&!XM?" hidden":""}>${p[2]?"★ ":""}${p[0]}${c?`<small class="dvn">${c}</small>`:""}</button>`}).join("");
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

// ---------- Asistente con IA: propone fechas, vos elegís qué agregar ----------
let iaTurns=[],iaBusy=false,iaProps=[]; // iaProps[i] = {items:[...], done:false}
const IA_SUG=["Quiero ver lo que me falta: una peli por noche a las 22","Los fines de semana puedo ver 3 pelis desde las 15","Quiero terminar la Fase 4 antes de fin de mes","Metele las series de a 2 episodios entre semana"];
const nrm=x=>String(x||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g," ").trim();
// busca un título aunque venga escrito un poco distinto
const iaFind=t=>{const q=nrm(t);if(!q)return null;let hit=ALL.find(n=>nrm(n)===q);if(hit)return hit;
hit=ALL.find(n=>nrm(n).startsWith(q)||q.startsWith(nrm(n)));if(hit)return hit;
return ALL.find(n=>W[n]&&nrm(en(n))===q)||ALL.find(n=>nrm(n).includes(q)&&q.length>=4)||null};
const WD={dom:0,lun:1,mar:2,mie:3,jue:4,vie:5,sab:6};
// Arma las tandas con las preferencias que entendió la IA: fechas exactas, sin superposiciones y respetando lo que ya está en el calendario
function iaBuild(sp){const out=[],note=[];const start=sp.desde&&sp.desde>=TODAY?sp.desde:dk(new Date(fk(TODAY).getTime()+864e5));
const lim=sp.hasta&&sp.hasta>=start?sp.hasta:null,days=lim?Math.round((fk(lim)-fk(start))/864e5)+1:60;
// lo que ya ocupa cada día
const busy={};const occ=(d,a,b)=>{(busy[d]=busy[d]||[]).push([a,b])};
for(const k of pkeys())if(plan[k].t){const a=tm(plan[k].t);occ(plan[k].d,a,a+dur(k))}
const left={};const remEp=n=>left[n]!==undefined?left[n]:(left[n]=Math.max(0,EP[n][0]-epDone(n)));
const minsOf=(n,e)=>EP[n]?e*EP[n][1]:(R[n]||120);
const fit=(d,t,len)=>{let moved=true;while(moved){moved=false;for(const[a,b]of busy[d]||[])if(t<b&&a<t+len){t=Math.ceil((b+15)/5)*5;moved=true}}return t};
const usedMovie=new Set(),place=(n,d,t,e,mx)=>{const len=minsOf(n,e);t=fit(d,t,len);if(t>=1440||t>(mx===undefined?1380:mx))return false; // no arrancar después de las 23 (salvo que lo pida)occ(d,t,t+len);
out.push({n,d,t:fm(t),e,ser:!!EP[n],fin:fm(t+len),cl:null,mv:!EP[n]&&plan[n]?plan[n]:null,seen:!!seen[n],on:!seen[n],added:false});
if(EP[n])left[n]=remEp(n)-e;else usedMovie.add(n);return t+len+15};
// 1) pedidos puntuales
for(const f of sp.fijos||[]){const n=iaFind(f.titulo);if(!n||isSoon(n)){if(f.titulo)note.push(`No encontré "${f.titulo}".`);continue}
let d=f.fecha&&f.fecha>=TODAY?f.fecha:null;
if(!d&&f.dia!==undefined&&WD[f.dia]!==undefined){const x=fk(start);while(x.getDay()!==WD[f.dia])x.setDate(x.getDate()+1);d=dk(x)}
if(!d)d=start;const wd=fk(d).getDay(),h=(sp.horarios||[]).find(h=>h.dias.some(x=>WD[x]===wd));
let e=0;if(EP[n]){if(remEp(n)<=0){note.push(`${n} ya está toda programada.`);continue}e=Math.min(remEp(n),f.episodios||sp.episodiosPorTanda||2)}
const t0=tm(f.hora||(h&&h.hora)||"21:00");if(place(n,d,t0,e,1435)===false)note.push(`No encontré lugar para ${n} ese día.`)}
// 2) lo que hay que ver, en orden de estreno
const fs=(sp.fases||[]).map(nrm).filter(Boolean),ts=(sp.titulos||[]).map(iaFind).filter(Boolean);
let queue=[];
if(ts.length)queue=ALL.filter(n=>ts.includes(n));
else D.forEach(p=>{const pf=nrm(p[0]);if(fs.length?!fs.some(x=>x===pf||pf.includes(x)||x.includes(pf)):(p[2]&&!sp.xmen))return;
p[1].forEach(m=>queue.push(m[0]))});
queue=queue.filter(n=>!QT[n]&&!isSoon(n)&&(sp.revistas||!seen[n])&&(EP[n]?sp.series!==false&&remEp(n)>0:!usedMovie.has(n)&&!keysOf(n).length));
const total=queue.length;let qi=0;
const next=()=>{while(qi<queue.length){const n=queue[qi];if(EP[n]&&remEp(n)<=0){qi++;continue}if(!EP[n]&&usedMovie.has(n)){qi++;continue}return n}return null};
for(let i=0;i<days&&out.length<40&&next();i++){const x=fk(start);x.setDate(x.getDate()+i);const d=dk(x),wd=x.getDay();
for(const h of (sp.horarios||[]).filter(h=>h.dias.some(y=>WD[y]===wd)).sort((a,b)=>a.hora.localeCompare(b.hora))){let t=tm(h.hora);
for(let c=0;c<h.cantidad&&out.length<40;c++){const n=next();if(!n)break;const e=EP[n]?Math.min(remEp(n),sp.episodiosPorTanda||2):0;
const r=place(n,d,t,e,Math.min(1435,Math.max(tm(h.hora)+(h.cantidad-1)*150,1380)));if(r===false)break;t=r;if(!EP[n]||remEp(n)<=0)qi++}}}
const pend=queue.filter(n=>EP[n]?remEp(n)>0:!usedMovie.has(n)).length;
if(total&&pend)note.push(lim?`Antes del ${fdate(lim)} no entra todo: quedan ${pend} ${pend===1?"título":"títulos"} sin lugar. Podés pedirme más días u horarios.`:out.length>=40?`Te propongo las primeras 40; cuando las agregues, pedime que siga.`:`En los próximos dos meses no entra todo: quedan ${pend} sin lugar. Cuando agregues estas, pedime que siga.`);
if(!total&&!(sp.fijos||[]).length)note.push("No encontré nada pendiente con ese filtro: puede que ya lo hayas visto o que ya esté en el calendario.");
out.sort((a,b)=>(a.d+a.t).localeCompare(b.d+b.t));
// marcar choques con lo que ya estaba (por si un pedido puntual cayó encima)
for(const p of out){const a=tm(p.t),b=a+minsOf(p.n,p.e);p.cl=pkeys().filter(k=>plan[k].d===p.d&&plan[k].t&&!(!p.ser&&k===p.n)).find(k=>{const s=tm(plan[k].t);return a<s+dur(k)&&s<b})||null}
return {items:out,note:note.join(" ")}}
// --- IA gratuita, llamada desde el navegador (cada persona usa su propia cuota gratis, sin cuenta ni clave) ---
const IA_PROV=[
 {name:"llm7",url:"https://api.llm7.io/v1/chat/completions",body:m=>({model:"default",messages:m,max_tokens:900}),ms:30e3},
 {name:"pollinations",url:"https://text.pollinations.ai/openai",body:m=>({model:"openai",messages:m,max_tokens:2500,referrer:"tracker-ucm"}),ms:30e3}];
const IA_SYS=`Sos el asistente del calendario de "Tracker UCM" (maratón de Marvel). El usuario te cuenta cuándo puede ver. Vos NO calculás fechas: solo traducís el pedido a preferencias y la página arma el calendario.
Respondé SOLO un objeto JSON válido, sin texto alrededor ni markdown, con estas claves:
"mensaje" (texto breve en español rioplatense, con vos; contá qué vas a armar o hacé UNA pregunta corta),
"listo" (true si ya se puede armar; false solo si no dijo NINGÚN día ni horario),
"desde" (AAAA-MM-DD o null = mañana), "hasta" (AAAA-MM-DD o null),
"horarios" (lista de {"dias":[de "lun","mar","mie","jue","vie","sab","dom"],"hora":"HH:MM","cantidad":número de pelis o tandas seguidas}; entre semana = lun a vie; finde = sab y dom; a la noche = 21:00, a la tarde = 16:00),
"fases" (ej. ["Fase 4"], o [] = todas en orden), "titulos" (SOLO si quiere ver únicamente esos títulos; si no, []),
"series" (true salvo que pida solo películas), "episodiosPorTanda" (por defecto 2), "xmen" (true solo si lo pide), "revistas" (true solo si quiere volver a ver lo visto),
"fijos" (cosas para un día concreto: [{"titulo","dia" o "fecha","hora","episodios"}], o []).
No preguntes por cosas con valor por defecto. Si pide un cambio, devolvé las preferencias completas actualizadas.
Ejemplo. Pedido: "Entre semana a las 21 una peli, el sábado 3 desde las 15 y WandaVision de a 3 episodios el domingo"
{"mensaje":"Dale: una por noche de lunes a viernes a las 21, tres el sábado desde las 15 y WandaVision el domingo.","listo":true,"desde":null,"hasta":null,"horarios":[{"dias":["lun","mar","mie","jue","vie"],"hora":"21:00","cantidad":1},{"dias":["sab"],"hora":"15:00","cantidad":3}],"fases":[],"titulos":[],"series":true,"episodiosPorTanda":2,"xmen":false,"revistas":false,"fijos":[{"titulo":"WandaVision","dia":"dom","hora":"21:00","episodios":3}]}
Ejemplo. Pedido: "terminar la fase 4 antes de fin de mes, solo findes a la tarde"
{"mensaje":"Te armo la Fase 4 los sábados y domingos a la tarde, hasta fin de mes.","listo":true,"desde":null,"hasta":"FIN_MES","horarios":[{"dias":["sab","dom"],"hora":"16:00","cantidad":2}],"fases":["Fase 4"],"titulos":[],"series":true,"episodiosPorTanda":2,"xmen":false,"revistas":false,"fijos":[]}`;
const eom=()=>{const d=fk(TODAY);return dk(new Date(d.getFullYear(),d.getMonth()+1,0))};
const tomorrow=()=>{const d=fk(TODAY);d.setDate(d.getDate()+1);return dk(d)};
function iaJSON(t){t=String(t||"").replace(/```(?:json)?/gi,"");const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a<0||b<=a)return null;try{return JSON.parse(t.slice(a,b+1))}catch(e){return null}}
const DIAS_K=["lun","mar","mie","jue","vie","sab","dom"];
// deja solo valores con sentido
function iaClean(o){o=o&&typeof o==="object"?o:{};const ok=s=>typeof s==="string"&&/^\d{4}-\d\d-\d\d$/.test(s),okT=s=>typeof s==="string"&&/^([01]?\d|2[0-3]):[0-5]\d$/.test(s)?s.padStart(5,"0"):null;
const int=(v,a,b,d)=>{v=Math.round(+v);return Number.isFinite(v)?Math.min(b,Math.max(a,v)):d};
const ds=a=>(Array.isArray(a)?a:[a]).map(x=>nrm(x).slice(0,3)).filter(x=>DIAS_K.includes(x));
const horarios=(Array.isArray(o.horarios)?o.horarios:[]).slice(0,14).map(h=>({dias:[...new Set(ds(h&&h.dias))],hora:okT(h&&h.hora)||"21:00",cantidad:int(h&&h.cantidad,1,6,1)})).filter(h=>h.dias.length);
const fijos=(Array.isArray(o.fijos)?o.fijos:[]).slice(0,20).map(f=>({titulo:String(f&&f.titulo||"").slice(0,100),...(ok(f&&f.fecha)?{fecha:f.fecha}:{}),...(ds(f&&f.dia)[0]?{dia:ds(f.dia)[0]}:{}),...(okT(f&&f.hora)?{hora:okT(f.hora)}:{}),...(f&&f.episodios?{episodios:int(f.episodios,1,20,2)}:{})})).filter(f=>f.titulo);
return {mensaje:String(o.mensaje||"").slice(0,800).trim(),listo:horarios.length>0||(o.listo!==false&&fijos.length>0),desde:ok(o.desde)?o.desde:null,hasta:ok(o.hasta)?o.hasta:null,horarios,fijos,
fases:(Array.isArray(o.fases)?o.fases:[]).slice(0,12).map(x=>String(x).slice(0,20)),titulos:(Array.isArray(o.titulos)?o.titulos:[]).slice(0,60).map(x=>String(x).slice(0,100)),
series:o.series!==false,episodiosPorTanda:int(o.episodiosPorTanda,1,12,2),xmen:o.xmen===true,revistas:o.revistas===true}}
// Intérprete propio (sin IA): entiende las frases más comunes. Sirve de respaldo y para completar lo que la IA se olvide.
const NUM={un:1,una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6};
function iaLocal(text){const t=" "+nrm(text)+" ",sp={horarios:[],fijos:[],fases:[],titulos:[],series:true,episodiosPorTanda:2,xmen:false,revistas:false,desde:null,hasta:null};
const dayWords=c=>{const s=new Set();
if(/entre semana|dias de semana|de semana|lunes a viernes|dias habiles/.test(c))["lun","mar","mie","jue","vie"].forEach(d=>s.add(d));
if(/finde|fines? de semana/.test(c))["sab","dom"].forEach(d=>s.add(d));
if(/todos los dias|todas las noches|cada dia|todos los dias|diario/.test(c))DIAS_K.forEach(d=>s.add(d));
[["lun","lunes"],["mar","martes"],["mie","miercoles"],["jue","jueves"],["vie","viernes"],["sab","sabado"],["dom","domingo"]].forEach(([k,w])=>{if(new RegExp("\\b"+w+"s?\\b").test(c))s.add(k)});return [...s]};
const hourOf=c=>{let m=c.match(/a las (\d{1,2})(?:[ :.h](\d{2}))?/)||c.match(/\b(\d{1,2})(?:[:.](\d{2}))? ?(?:hs|h|horas)\b/)||c.match(/desde las (\d{1,2})(?:[ :.h](\d{2}))?/);
if(m){let h=+m[1];if(h<=11&&/noche|tarde/.test(c)&&h>=1)h+=12;if(h>23)return null;return String(h).padStart(2,"0")+":"+(m[2]||"00")}
if(/a la noche|de noche|por la noche/.test(c))return "21:00";if(/a la tarde|de tarde|por la tarde/.test(c))return "16:00";if(/a la manana|de manana|por la manana/.test(c))return "10:00";if(/mediodia/.test(c))return "13:00";return null};
const countOf=c=>{const m=c.match(/\b(\d|un|una|uno|dos|tres|cuatro|cinco|seis)\s+(?:pelis?|peliculas?|tandas?|cosas|por dia|capitulos? seguidos)/);return m?(NUM[m[1]]||+m[1]):null};
const titles=ALL.map(n=>[n,nrm(n)]).filter(([,k])=>k.length>=4&&k!=="x men").sort((a,b)=>b[1].length-a[1].length);
const titleIn=c=>titles.filter(([,k])=>(" "+c+" ").includes(" "+k+" ")).map(x=>x[0]);
// "solo quiero ver Thor y Loki": esos títulos son el filtro, no pedidos para un día
const so=t.match(/solo (?:quiero |quisiera )?(?:ver )?([^,.;]+)/);let only=so?titleIn(so[1]):[];if(only.length)sp.titulos=only;
// frases separadas por punto; dentro de cada una, pedazos separados por coma o "y"
let lastHour=null;
for(const seg of t.split(/[.;!?]| pero | tambien /)){let parts=seg.split(/,| y /).map(x=>x.trim()).filter(Boolean),groups=[];
for(const x of parts){const ds=dayWords(" "+x+" "),ti=titleIn(x).filter(n=>!only.includes(n)),h=hourOf(" "+x+" "),n=countOf(" "+x+" "),g=groups[groups.length-1];
// un pedazo sin días ni título completa al anterior ("los sábados, 3 pelis desde las 15")
if(!ds.length&&!ti.length&&g){g.h=g.h||h;g.n=g.n||n;g.e=g.e||x.match(/(\d+)\s*(?:episodios?|capitulos?|caps?)/);continue}
// "los viernes y sábados a la noche": días seguidos se juntan si el anterior no tenía hora ni cantidad propia
if(ds.length&&!ti.length&&g&&!g.ti.length&&g.ds.length&&!g.h&&!g.n){g.ds.push(...ds);g.h=h;g.n=n;continue}
groups.push({ds,ti,h,n,e:x.match(/(\d+)\s*(?:episodios?|capitulos?|caps?)/)})}
// un título sin día toma el día del pedazo siguiente o anterior ("WandaVision el domingo")
for(let i=0;i<groups.length;i++){const g=groups[i];if(g.ti.length&&!g.ds.length){const o=groups[i+1]&&!groups[i+1].ti.length?groups[i+1]:null;if(o&&o.ds.length){g.ds=o.ds;g.h=g.h||o.h;g.e=g.e||o.e;o.used=true}}}
for(const g of groups){if(g.used)continue;if(g.h)lastHour=g.h;
if(g.ti.length&&g.ds.length){for(const n of g.ti)sp.fijos.push({titulo:n,dia:g.ds[0],...(g.h?{hora:g.h}:{}),...(g.e?{episodios:+g.e[1]}:{})});continue}
if(g.ds.length)sp.horarios.push({dias:[...new Set(g.ds)],hora:g.h||"",cantidad:g.n||1})}}
// horarios sin hora: la última hora mencionada, o las 21
for(const h of sp.horarios)if(!h.hora)h.hora=lastHour||"21:00";
for(const m of t.matchAll(/fase (\d)/g))sp.fases.push("Fase "+m[1]);
if(/x ?men|mutantes/.test(t)){sp.xmen=true;if(/solo (la saga )?x ?men/.test(t))sp.fases.push("X-Men")}
if(/solo (pelis|peliculas)|sin series|nada de series/.test(t))sp.series=false;
const ep=t.match(/de a (\d+)\s*(?:episodios?|capitulos?|caps?)/)||t.match(/(\d+)\s*(?:episodios?|capitulos?|caps?) por (?:tanda|dia|vez)/);if(ep)sp.episodiosPorTanda=Math.min(12,+ep[1]);
if(/fin de mes|antes de que termine el mes/.test(t))sp.hasta=eom();
if(/esta semana/.test(t)){const d=fk(TODAY);d.setDate(d.getDate()+((7-d.getDay())%7));sp.hasta=dk(d)}
const hm_=t.match(/hasta el (\d{1,2})\b/);if(hm_){const d=fk(TODAY);let x=new Date(d.getFullYear(),d.getMonth(),+hm_[1]);if(x<d)x=new Date(d.getFullYear(),d.getMonth()+1,+hm_[1]);sp.hasta=dk(x)}
if(/\bdesde hoy|\bhoy\b/.test(t))sp.desde=TODAY;
if(/volver a ver|de nuevo|otra vez|revivir/.test(t))sp.revistas=true;
sp.listo=sp.horarios.length>0||sp.fijos.length>0;return sp}
// combina lo que entendió la IA con lo que entendió el intérprete propio
function iaMerge(ai,lo){if(!ai)return lo;const s={...ai};
if(!s.horarios.length&&lo.horarios.length)s.horarios=lo.horarios;
for(const f of lo.fijos)if(!s.fijos.some(x=>iaFind(x.titulo)===f.titulo))s.fijos.push(f);
// si la IA metió en "titulos" algo que en realidad era para un día puntual, no lo uso como filtro
s.titulos=s.titulos.filter(x=>!s.fijos.some(f=>iaFind(f.titulo)===iaFind(x)));
if(!s.fases.length&&lo.fases.length)s.fases=lo.fases;
if(!lo.series)s.series=false;if(lo.xmen)s.xmen=true;if(lo.revistas)s.revistas=true;
if(!s.hasta&&lo.hasta)s.hasta=lo.hasta;if(lo.episodiosPorTanda!==2&&s.episodiosPorTanda===2)s.episodiosPorTanda=lo.episodiosPorTanda;
s.listo=s.horarios.length>0||s.fijos.length>0;return s}
async function iaAsk(turns){const hoy=fk(TODAY),prox=[];for(let i=0;i<14;i++){const d=new Date(hoy);d.setDate(d.getDate()+i);prox.push(DIAS_K[(d.getDay()+6)%7]+" "+dk(d))}
const series=D.flatMap(p=>p[1].filter(m=>m[2]&&!QT[m[0]]).map(m=>m[0]));
const ctx=`Hoy: ${TODAY} (${DS[hoy.getDay()]}). Próximos días: ${prox.join(", ")}. Fases: ${D.map(p=>p[0]).join(", ")}. Series: ${series.join(", ")}.`;
const msgs=[{role:"system",content:IA_SYS.replace("FIN_MES",eom())+"\n\n"+ctx},...turns.slice(-8).map(t=>({role:t.role,content:String(t.text).slice(0,1500)}))];
for(const p of IA_PROV){try{const r=await fetch(p.url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(p.body(msgs)),signal:AbortSignal.timeout(p.ms)});
if(!r.ok)continue;const j=await r.json(),c=j&&j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content,o=iaJSON(c);if(o)return iaClean(o)}catch(e){}}
return null}
function iaOpen(){const o=$("ia");o.hidden=false;document.body.style.overflow="hidden";o.classList.remove("in");void o.offsetWidth;o.classList.add("in");iaDraw();setTimeout(()=>$("iaIn").focus(),60)}
function iaClose(){const o=$("ia");o.hidden=true;if($("dv").hidden&&$("ov").hidden&&$("mo").hidden)document.body.style.overflow="";$("iaOpen").focus()}
function iaItem(p,i,j){const q=pos[p.n]||wk[p.n],img=q&&OK[q]?`style="background-image:${h2(cu(q))}"`:"";
return `<li class="iai${p.added?" ok":""}" style="--h:${HUES[ph(p.n)]}"><label><input type="checkbox" data-pi="${i}" data-pj="${j}" ${p.on?"checked":""} ${p.added?"disabled":""}><i class="iap" ${img}></i><span class="iat"><b>${h2(p.n)}</b><small>${fdate(p.d)} · ${p.t} a ${p.fin}${p.ser?` · ${epTxt(p.e)}`:""}</small>${p.added?`<em class="iaok">✓ Agregada</em>`:p.cl?`<em class="iaw">Se superpone con ${h2(bn(p.cl))}${p.cl&&plan[p.cl]?" ("+plan[p.cl].t+")":""}</em>`:p.mv?`<em class="iaw">Ya estaba el ${fdate(p.mv.d)}: se mueve</em>`:p.seen?`<em class="iamu">Ya la viste</em>`:""}</span></label></li>`}
function iaDraw(){const log=$("iaLog");
let h=iaTurns.length?"":`<div class="iaw0"><div class="iabig" aria-hidden="true">✨</div><h3>Contame cómo querés verlas</h3><p>Decime qué días y a qué hora podés, o qué querés terminar primero. Te propongo un plan y <b>vos elegís qué agregar</b>: nada se guarda solo.</p><div class="iasg">${IA_SUG.map(s=>`<button type="button" data-sg="${h2(s)}">${h2(s)}</button>`).join("")}</div></div>`;
let pi=0;
for(const t of iaTurns){if(t.role==="user"){h+=`<div class="iam u"><p>${h2(t.text)}</p></div>`;continue}
if(t.err){h+=`<div class="iam a er"><p>${h2(t.text)}</p><button type="button" class="lnk" data-retry>Reintentar</button></div>`;continue}
h+=`<div class="iam a"><p>${h2(t.show||t.text).replace(/\n/g,"<br>")}</p>`;
if(t.pi!==undefined){const P=iaProps[t.pi],sel=P.items.filter(x=>x.on&&!x.added).length,left=P.items.filter(x=>!x.added).length;
h+=`<div class="iapr"><div class="iaph"><b>Propuesta · ${P.items.length} ${P.items.length===1?"tanda":"tandas"}</b>${left?`<span><button type="button" class="lnk" data-all="${t.pi}">Todas</button> · <button type="button" class="lnk" data-none="${t.pi}">Ninguna</button></span>`:""}</div>
<ul>${P.items.map((p,j)=>iaItem(p,t.pi,j)).join("")}</ul>
${left?`<button type="button" class="mbtn" data-add="${t.pi}" ${sel?"":"disabled"}>${sel?`Agregar ${sel===left&&sel>1?"las "+sel:sel===1?"la elegida":"las "+sel+" elegidas"} al calendario`:"Elegí qué agregar"}</button><p class="iahn">Podés destildar las que no quieras, o pedirme cambios abajo.</p>`:`<button type="button" class="mbtn sec" data-go="${h2(P.items[0].d)}">Ver en el calendario</button>`}</div>`}
h+=`</div>`;pi++}
if(iaBusy)h+=`<div class="iam a typ" aria-label="La IA está pensando"><i></i><i></i><i></i></div>`;
log.innerHTML=h;log.scrollTop=log.scrollHeight;$("iaGo").disabled=iaBusy;$("iaIn").disabled=iaBusy}
async function iaSend(text){text=String(text||"").trim();if(!text||iaBusy)return;
iaTurns=iaTurns.filter(t=>!t.err);iaTurns.push({role:"user",text});iaBusy=true;$("iaIn").value="";iaDraw();
const lo=iaLocal(text);let ai=null;
try{ai=await iaAsk(iaTurns.filter(t=>!t.err))}catch(e){ai=null}
// si la IA gratuita no responde, sigo con lo que entendió el intérprete propio
let r;if(ai)r={reply:ai.mensaje,spec:iaMerge(ai,lo)};
else if(lo.listo)r={reply:"La IA gratuita no respondió, pero te armé esto con lo que entendí de tu mensaje.",spec:lo};
else{iaBusy=false;iaTurns.push({role:"assistant",text:"La IA gratuita no respondió y no llegué a entender qué días podés. Probá de nuevo, o escribilo así: \"entre semana a las 21, los sábados 3 desde las 15\".",err:true});iaDraw();return}
iaBusy=false;const sp=r.spec||{},reply=String(r.reply||"").trim();if(!sp.listo&&!reply)r.reply="¿Qué días y a qué hora podés ver?";let items=[],note="";
if(sp.listo){const B=iaBuild(sp);items=B.items;note=B.note}
// en el historial queda lo que entendió la IA, para que pueda corregirlo si le pedís cambios
const t={role:"assistant",text:(reply||"Listo.")+"\nPreferencias: "+JSON.stringify(sp),show:(reply||"Te armé una propuesta.")+(note?"\n"+note:"")};
if(items.length){iaProps.push({items});t.pi=iaProps.length-1}
else if(sp.listo&&!note)t.show+="\nNo encontré lugar para nada con esos horarios. Probá con otros días u horas.";
iaTurns.push(t);iaDraw();
const last=$("iaLog").querySelector(".iam.a:last-of-type");if(last)last.animate([{opacity:0,transform:"translateY(10px)"},{opacity:1,transform:"none"}],{duration:280,easing:"ease-out"})}
function iaAdd(i){const P=iaProps[i],sel=P.items.filter(x=>x.on&&!x.added);if(!sel.length)return;
for(const p of sel){if(p.ser){const k=keysOf(p.n).length?newKey(p.n):p.n;plan[k]={d:p.d,t:p.t,e:p.e}}else plan[p.n]={d:p.d,t:p.t};p.added=true}
savePlan();iaDraw();toast(`Agregaste ${sel.length} ${sel.length===1?"tanda":"tandas"} al calendario`)}
$("iaOpen").onclick=iaOpen;$("iaX").onclick=iaClose;
$("iaF").addEventListener("submit",e=>{e.preventDefault();iaSend($("iaIn").value)});
$("iaIn").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();iaSend($("iaIn").value)}});
$("iaLog").addEventListener("change",e=>{const c=e.target;if(c.dataset.pi===undefined)return;iaProps[+c.dataset.pi].items[+c.dataset.pj].on=c.checked;
const y=$("iaLog").scrollTop;iaDraw();$("iaLog").scrollTop=y});
$("iaLog").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;
if(b.dataset.sg)return iaSend(b.dataset.sg);
if(b.hasAttribute("data-retry")){const u=[...iaTurns].reverse().find(t=>t.role==="user");iaTurns=iaTurns.filter(t=>!t.err);if(u){iaTurns.pop();iaSend(u.text)}return}
const y=$("iaLog").scrollTop;
if(b.dataset.all!==undefined){iaProps[+b.dataset.all].items.forEach(x=>x.on=true);iaDraw();$("iaLog").scrollTop=y;return}
if(b.dataset.none!==undefined){iaProps[+b.dataset.none].items.forEach(x=>x.on=false);iaDraw();$("iaLog").scrollTop=y;return}
if(b.dataset.add!==undefined){iaAdd(+b.dataset.add);$("iaLog").scrollTop=y;return}
if(b.dataset.go){iaClose();goDay(b.dataset.go)}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("ia").hidden&&$("mo").hidden){e.stopImmediatePropagation();iaClose()}},true);

// arranque
tabs();grid();stats();loadPosters();
try{if(localStorage.getItem("ucm-vista")==="cal")setView("cal")}catch(e){}
