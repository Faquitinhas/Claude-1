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
const ph=n=>D.findIndex(p=>p[1].some(m=>m[0]===n));
const dur=n=>R[n]||120; // series y títulos sin duración conocida: bloque de 2 h
const durT=n=>R[n]?hm(R[n]):isSer(n)?"bloque de 2 h (serie)":"unas 2 h";
const h2=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
let plan=ld("ucm-plan"),view="pelis",selDay=TODAY,calM=new Date();
calM=new Date(calM.getFullYear(),calM.getMonth(),1);
for(const n of Object.keys(plan)){const p=plan[n];
if(!ALL.includes(n)||!p||!/^\d{4}-\d\d-\d\d$/.test(p.d||""))delete plan[n];
else if(!/^\d\d:\d\d$/.test(p.t||""))p.t=""}
const endT=n=>plan[n]&&plan[n].t?fm(tm(plan[n].t)+dur(n)):"";
const onDay=k=>ALL.filter(n=>plan[n]&&plan[n].d===k).sort((a,b)=>(plan[a].t||"99").localeCompare(plan[b].t||"99"));
const relOn=k=>Object.keys(REL).filter(n=>REL[n]===k);
const after=n=>Math.ceil((tm(plan[n].t)+dur(n)+15)/5)*5;
const nextTime=k=>{const l=onDay(k).filter(n=>plan[n].t);return l.length?fm(after(l[l.length-1])):"21:00"};
const fdate=k=>{const d=fk(k);return `${DC[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()].slice(0,3)}`};
const rdate=k=>{const n=Math.round((fk(k)-fk(TODAY))/864e5);return n===0?"hoy":n===1?"mañana":fdate(k)};

// usados desde app.js (tarjetas y hoja de detalles)
const whenBadge=n=>{const w=plan[n];return w?`<span class="when">${fdate(w.d)}${w.t?" · "+w.t:""}</span>`:""};
function whenBox(n){const pl=plan[n]||{};
return `<h4>Cuándo la ves</h4><div class="when-ed"><label>Día<input type="date" id="wd" value="${pl.d||""}"></label><label>Arranca a las<input type="time" id="wt" step="300" value="${pl.t||""}"${pl.d?"":" disabled"}></label>${pl.d?`<button class="btn" id="wx">Quitar fecha</button><button class="btn" id="wc">Ver en el calendario</button>`:""}</div><p class="nt">Dura ${durT(n)}${pl.t?` · terminás tipo ${endT(n)}`:pl.d?"":" · elegí un día para ponerle hora"}.</p>`}

function savePlan(){sv("ucm-plan",plan);grid();planUpd();if(cur&&vt==="info")draw()}
function setPlan(n,d,t){if(!d)delete plan[n];else plan[n]={d,t:t||""};savePlan()}
function planUpd(){if(view==="cal")cal();nextPlan()}
// Lo próximo que tenés agendado y todavía no viste
function nextPlan(){const b=$("pln");
const l=ALL.filter(n=>plan[n]&&!seen[n]&&plan[n].d>=TODAY).sort((a,c)=>(plan[a].d+(plan[a].t||"99")).localeCompare(plan[c].d+(plan[c].t||"99")));
if(!l.length){b.hidden=true;return}
const n=l[0],w=plan[n];b.hidden=false;b.dataset.k=w.d;
b.innerHTML=`<span>En tu calendario · ${rdate(w.d)}${w.t?" · "+w.t:""}</span><b>${h2(n)}</b>`}
$("pln").onclick=()=>goDay($("pln").dataset.k);
function goDay(k){selDay=k;calM=new Date(fk(k).getFullYear(),fk(k).getMonth(),1);setView("cal")}

$("sb").addEventListener("change",e=>{
if(!cur)return;
if(e.target.id==="wd"){const d=e.target.value;setPlan(cur,d,d?((plan[cur]&&plan[cur].t)||nextTime(d)):"")}
if(e.target.id==="wt"&&plan[cur]){plan[cur].t=e.target.value;savePlan()}});
$("sb").addEventListener("click",e=>{
if(!cur)return;
if(e.target.id==="wx")setPlan(cur,"");
if(e.target.id==="wc"&&plan[cur]){const k=plan[cur].d;closeSheet();goDay(k)}});

// código para mandar el plan a Mi Agenda
function code(){
const items=ALL.filter(n=>plan[n]).map(n=>[n,plan[n].d,plan[n].t||"",dur(n),Math.min(ph(n)+1,6)]);
const s=JSON.stringify({v:1,items});
return "UCM1."+btoa(unescape(encodeURIComponent(s))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function syncBox(){
const n=ALL.filter(x=>plan[x]).length;
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
h+=`<button class="cday${k===TODAY?" today":""}${k===selDay?" sel":""}${k<TODAY?" past":""}" data-k="${k}" aria-pressed="${k===selDay}" aria-label="${d} de ${MES[calM.getMonth()]}${l.length?`, ${l.length} ${l.length>1?"títulos":"título"}`:""}${rl.length?", estreno de "+h2(rl.join(" y ")):""}"><span class="dn">${d}</span>${l.length||rl.length?`<span class="chs">${rl.map(n=>`<span class="ch rel"><span>★ ${h2(n)}</span></span>`).join("")}${l.map(n=>`<span class="ch${seen[n]?" ok":""}" style="--h:${HUES[ph(n)]}">${plan[n].t?`<time>${plan[n].t}</time>`:""}<span>${h2(n)}</span></span>`).join("")}</span>`:""}</button>`}
const tail=(7-(off+dim)%7)%7;for(let i=0;i<tail;i++)h+=`<div class="cday blank" aria-hidden="true"></div>`;
$("cg").innerHTML=h;day();syncBox()}
function day(){
const d=fk(selDay),l=onDay(selDay),rl=relOn(selDay);
const tot=l.reduce((a,n)=>a+dur(n),0),last=l.length?l[l.length-1]:null,le=last?endT(last):"";
const opts=D.map(p=>{const o=p[1].filter(m=>vis(m)&&!plan[m[0]]).sort((a,b)=>!!seen[a[0]]-!!seen[b[0]]);
return o.length?`<optgroup label="${h2(p[0])}">${o.map(m=>`<option value="${h2(m[0])}">${h2(m[0])}${m[2]?" (serie)":""}${seen[m[0]]?" (ya vista)":""}</option>`).join("")}</optgroup>`:""}).join("");
$("dayp").innerHTML=`<div class="dph"><h3>${DS[d.getDay()]} ${d.getDate()} de ${MES[d.getMonth()]}</h3>${l.length?`<span>${hm(tot)} de pantalla${le?` · terminás tipo ${le}`:""}</span>`:""}</div>
${rl.map(n=>`<p class="cd">🗓 Estreno en cines: ${h2(n)}</p>`).join("")}
${l.length?`<ul class="fl">${l.map(n=>`<li style="--h:${HUES[ph(n)]}"><input type="time" step="300" value="${plan[n].t||""}" data-tn="${h2(n)}" aria-label="Hora de inicio de ${h2(n)}"><div><b>${h2(n)}</b><small>${h2(D[ph(n)][0])} · ${durT(n)}${plan[n].t?` · hasta las ${endT(n)}`:""}${seen[n]?" · ya la viste":""}</small></div><button class="rm" data-rm="${h2(n)}" aria-label="Quitar ${h2(n)} de este día">×</button></li>`).join("")}</ul>`:`<p class="nt">Nada programado este día.</p>`}
${opts?`<div class="add"><select id="as" aria-label="Título para agregar">${opts}</select><input type="time" id="at" step="300" value="${nextTime(selDay)}" aria-label="Hora de inicio"><button class="btn pri" id="ab">Agregar a este día</button></div>`:`<p class="nt">Ya tenés todo con fecha.</p>`}`}
$("cg").addEventListener("click",e=>{const b=e.target.closest(".cday[data-k]");if(!b)return;selDay=b.dataset.k;cal();$("dayp").scrollIntoView({behavior:"smooth",block:"nearest"})});
$("cp").onclick=()=>{calM=new Date(calM.getFullYear(),calM.getMonth()-1,1);cal()};
$("cn").onclick=()=>{calM=new Date(calM.getFullYear(),calM.getMonth()+1,1);cal()};
$("chy").onclick=()=>goDay(TODAY);
$("dayp").addEventListener("change",e=>{const n=e.target.dataset.tn;if(n&&plan[n]){plan[n].t=e.target.value;savePlan()}});
$("dayp").addEventListener("click",e=>{
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

// arranque
tabs();grid();stats();loadPosters();
try{if(localStorage.getItem("ucm-vista")==="cal")setView("cal")}catch(e){}
