const D=[
["Fase 1",[["Iron Man",2008],["El Increíble Hulk",2008],["Iron Man 2",2010],["Thor",2011],["Capitán América: El primer vengador",2011],["Los Vengadores",2012]]],
["Fase 2",[["Iron Man 3",2013],["Thor: El mundo oscuro",2013],["Capitán América: El soldado de invierno",2014],["Guardianes de la Galaxia",2014],["Vengadores: La era de Ultrón",2015],["Ant-Man",2015]]],
["Fase 3",[["Capitán América: Civil War",2016],["Doctor Strange",2016],["Guardianes de la Galaxia Vol. 2",2017],["Spider-Man: Homecoming",2017],["Thor: Ragnarok",2017],["Black Panther",2018],["Vengadores: Infinity War",2018],["Ant-Man y la Avispa",2018],["Capitana Marvel",2019],["Vengadores: Endgame",2019],["Spider-Man: Lejos de casa",2019]]],
["Fase 4",[["Viuda Negra",2021],["Shang-Chi",2021],["Eternals",2021],["Spider-Man: No Way Home",2021],["Doctor Strange en el multiverso de la locura",2022],["Thor: Love and Thunder",2022],["Black Panther: Wakanda Forever",2022],["WandaVision",2021,1],["The Falcon and the Winter Soldier",2021,1],["Loki",2021,1],["What If...?",2021,1],["Hawkeye",2021,1],["Moon Knight",2022,1],["Ms. Marvel",2022,1],["She-Hulk: Attorney at Law",2022,1],["I Am Groot",2022,1]]],
["Fase 5",[["Ant-Man y la Avispa: Quantumanía",2023],["Guardianes de la Galaxia Vol. 3",2023],["The Marvels",2023],["Deadpool & Wolverine",2024],["Capitán América: Brave New World",2025],["Thunderbolts*",2025],["Daredevil",2015,1],["Secret Invasion",2023,1],["Echo",2024,1],["Agatha All Along",2024,1],["Daredevil: Born Again",2025,1],["Ironheart",2025,1]]],
["Fase 6",[["Los 4 Fantásticos: Primeros pasos",2025],["Spider-Man: Brand New Day",2026],["Avengers: Doomsday",2026],["Avengers: Secret Wars",2027],["Eyes of Wakanda",2025,1],["Marvel Zombies",2025,1],["VisionQuest",2026,1],["The Punisher: One Last Kill",2026,1]]],
["X-Men",[["X-Men",2000],["X-Men 2",2003],["X-Men: La batalla final",2006],["X-Men orígenes: Wolverine",2009],["X-Men: Primera generación",2011],["Wolverine: Inmortal",2013],["X-Men: Días del futuro pasado",2014],["Deadpool",2016],["X-Men: Apocalipsis",2016],["Logan",2017],["Deadpool 2",2018],["X-Men: Fénix Oscura",2019],["Los nuevos mutantes",2020]],1]
];
const XT=D.findIndex(p=>p[2]); // índice del apartado extra (X-Men)
const REL={"Avengers: Doomsday":"2026-12-18","Avengers: Secret Wars":"2027-12-17"};
const relD=n=>REL[n]?new Date(REL[n]+"T00:00:00"):null;
const isSoon=n=>{const d=relD(n);return!!d&&d>new Date()};
const fmtD=d=>d.toLocaleDateString("es-AR",{day:"numeric",month:"long",year:"numeric"});
const HUES=[350,28,48,160,215,275,195];
let seen={},pos={},tab=0,QT={},SS=true,flt="all",qq="";
const ld=k=>{try{return JSON.parse(localStorage.getItem(k))||{}}catch(e){return{}}};
const sv=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}};
seen=ld("ucm-vistas");pos=ld("ucm-posters");QT=ld("ucm-quitadas");try{SS=localStorage.getItem("ucm-series")!=="0";const t=+localStorage.getItem("ucm-tab");if(t>=0&&t<D.length)tab=t}catch(e){}
let fav=ld("ucm-fav-v2").n||null,fbusy=false;
const MON={
"Iron Man":["186","584,9"],
"El Increíble Hulk":["137,5","265,6"],
"Iron Man 2":["170","621,2"],
"Thor":["150","449,3"],
"Capitán América: El primer vengador":["140","370,6"],
"Los Vengadores":["225","1.515,1"],
"Iron Man 3":["200","1.214,6"],
"Thor: El mundo oscuro":["150","644,6"],
"Capitán América: El soldado de invierno":["170","714,4"],
"Guardianes de la Galaxia":["170","770,9"],
"Vengadores: La era de Ultrón":["365","1.395,3"],
"Ant-Man":["130","518,9"],
"Capitán América: Civil War":["250","1.151,9"],
"Doctor Strange":["165","676,3"],
"Guardianes de la Galaxia Vol. 2":["200","869,1"],
"Spider-Man: Homecoming":["175","883,8"],
"Thor: Ragnarok":["180","850,5"],
"Black Panther":["200","1.334,2"],
"Vengadores: Infinity War":["300","2.048,2"],
"Ant-Man y la Avispa":["130","623,1"],
"Capitana Marvel":["175","1.129,6"],
"Vengadores: Endgame":["400","2.925,6"],
"Spider-Man: Lejos de casa":["160","1.137,1"],
"Viuda Negra":["200","379,8"],
"Shang-Chi":["150","432,2"],
"Eternals":["200","402,1"],
"Spider-Man: No Way Home":["200","1.921,2"],
"Doctor Strange en el multiverso de la locura":["200","955,8"],
"Thor: Love and Thunder":["250","760,9"],
"Black Panther: Wakanda Forever":["250","859,2"],
"Ant-Man y la Avispa: Quantumanía":["200","476,1"],
"Guardianes de la Galaxia Vol. 3":["250","845,6"],
"The Marvels":["270","206,1"],
"Deadpool & Wolverine":["200","1.338,1"],
"Capitán América: Brave New World":["180","415,1"],
"Thunderbolts*":["180","382,4"],
"Los 4 Fantásticos: Primeros pasos":["200","521,9"],
"Spider-Man: Brand New Day":["225","2.506,2"],
"X-Men":["75","296,3"],
"X-Men 2":["110","407,7"],
"X-Men: La batalla final":["210","460,4"],
"X-Men orígenes: Wolverine":["150","373,1"],
"X-Men: Primera generación":["160","353,6"],
"Wolverine: Inmortal":["120","414,8"],
"X-Men: Días del futuro pasado":["200","747,9"],
"Deadpool":["58","782,6"],
"X-Men: Apocalipsis":["178","543,9"],
"Logan":["97","619"],
"Deadpool 2":["110","785,9"],
"X-Men: Fénix Oscura":["200","252,4"],
"Los nuevos mutantes":["67","49,2"]};
const monBox=n=>{const m=MON[n];return m?`<div class="mon"><div><span>Presupuesto</span><b>${m[0]} M$</b></div><div><span>Recaudación</span><b>${m[1]} M$</b></div></div>`:""};
const CR={
"Iron Man":["Jon Favreau","Robert Downey Jr., Gwyneth Paltrow, Jeff Bridges, Terrence Howard",0],
"El Increíble Hulk":["Louis Leterrier","Edward Norton, Liv Tyler, Tim Roth",0],
"Iron Man 2":["Jon Favreau","Robert Downey Jr., Gwyneth Paltrow, Don Cheadle, Scarlett Johansson",0],
"Thor":["Kenneth Branagh","Chris Hemsworth, Natalie Portman, Tom Hiddleston, Anthony Hopkins",0],
"Capitán América: El primer vengador":["Joe Johnston","Chris Evans, Hayley Atwell, Hugo Weaving, Sebastian Stan",0],
"Los Vengadores":["Joss Whedon","Robert Downey Jr., Chris Evans, Mark Ruffalo, Chris Hemsworth, Scarlett Johansson",0],
"Iron Man 3":["Shane Black","Robert Downey Jr., Gwyneth Paltrow, Don Cheadle, Guy Pearce, Ben Kingsley",0],
"Thor: El mundo oscuro":["Alan Taylor","Chris Hemsworth, Natalie Portman, Tom Hiddleston, Christopher Eccleston",0],
"Capitán América: El soldado de invierno":["Anthony y Joe Russo","Chris Evans, Scarlett Johansson, Sebastian Stan, Anthony Mackie, Robert Redford",0],
"Guardianes de la Galaxia":["James Gunn","Chris Pratt, Zoe Saldaña, Dave Bautista, Vin Diesel, Bradley Cooper",0],
"Vengadores: La era de Ultrón":["Joss Whedon","Robert Downey Jr., Chris Evans, Chris Hemsworth, Mark Ruffalo",0],
"Ant-Man":["Peyton Reed","Paul Rudd, Evangeline Lilly, Michael Douglas, Corey Stoll",0],
"Capitán América: Civil War":["Anthony y Joe Russo","Chris Evans, Robert Downey Jr., Chadwick Boseman, Tom Holland",0],
"Doctor Strange":["Scott Derrickson","Benedict Cumberbatch, Chiwetel Ejiofor, Rachel McAdams, Tilda Swinton",0],
"Guardianes de la Galaxia Vol. 2":["James Gunn","Chris Pratt, Zoe Saldaña, Dave Bautista, Kurt Russell",0],
"Spider-Man: Homecoming":["Jon Watts","Tom Holland, Michael Keaton, Zendaya, Robert Downey Jr.",0],
"Thor: Ragnarok":["Taika Waititi","Chris Hemsworth, Tom Hiddleston, Tessa Thompson, Cate Blanchett, Mark Ruffalo",0],
"Black Panther":["Ryan Coogler","Chadwick Boseman, Michael B. Jordan, Lupita Nyong'o, Danai Gurira",0],
"Vengadores: Infinity War":["Anthony y Joe Russo","Robert Downey Jr., Chris Hemsworth, Mark Ruffalo, Chris Evans, Josh Brolin",0],
"Ant-Man y la Avispa":["Peyton Reed","Paul Rudd, Evangeline Lilly, Michael Peña, Walton Goggins",0],
"Capitana Marvel":["Anna Boden y Ryan Fleck","Brie Larson, Samuel L. Jackson, Ben Mendelsohn, Jude Law",0],
"Vengadores: Endgame":["Anthony y Joe Russo","Robert Downey Jr., Chris Evans, Mark Ruffalo, Chris Hemsworth, Scarlett Johansson",0],
"Spider-Man: Lejos de casa":["Jon Watts","Tom Holland, Zendaya, Jake Gyllenhaal, Samuel L. Jackson",0],
"Viuda Negra":["Cate Shortland","Scarlett Johansson, Florence Pugh, David Harbour, Rachel Weisz",0],
"Shang-Chi":["Destin Daniel Cretton","Simu Liu, Awkwafina, Tony Leung, Meng'er Zhang",0],
"Eternals":["Chloé Zhao","Gemma Chan, Richard Madden, Angelina Jolie, Kumail Nanjiani",0],
"Spider-Man: No Way Home":["Jon Watts","Tom Holland, Zendaya, Benedict Cumberbatch, Jacob Batalon",0],
"Doctor Strange en el multiverso de la locura":["Sam Raimi","Benedict Cumberbatch, Elizabeth Olsen, Chiwetel Ejiofor, Xochitl Gomez",0],
"Thor: Love and Thunder":["Taika Waititi","Chris Hemsworth, Natalie Portman, Christian Bale, Tessa Thompson",0],
"Black Panther: Wakanda Forever":["Ryan Coogler","Letitia Wright, Angela Bassett, Tenoch Huerta, Lupita Nyong'o",0],
"Ant-Man y la Avispa: Quantumanía":["Peyton Reed","Paul Rudd, Evangeline Lilly, Jonathan Majors, Kathryn Newton",0],
"Guardianes de la Galaxia Vol. 3":["James Gunn","Chris Pratt, Zoe Saldaña, Dave Bautista, Karen Gillan",0],
"The Marvels":["Nia DaCosta","Brie Larson, Teyonah Parris, Iman Vellani, Samuel L. Jackson",0],
"Deadpool & Wolverine":["Shawn Levy","Ryan Reynolds, Hugh Jackman, Emma Corrin, Matthew Macfadyen",0],
"Capitán América: Brave New World":["Julius Onah","Anthony Mackie, Harrison Ford, Danny Ramirez, Shira Haas",0],
"Thunderbolts*":["Jake Schreier","Florence Pugh, Sebastian Stan, Wyatt Russell, David Harbour, Julia Louis-Dreyfus",0],
"Los 4 Fantásticos: Primeros pasos":["Matt Shakman","Pedro Pascal, Vanessa Kirby, Joseph Quinn, Ebon Moss-Bachrach",0],
"Spider-Man: Brand New Day":["Destin Daniel Cretton","Tom Holland, Zendaya, Sadie Sink, Jacob Batalon, Jon Bernthal",0],
"Avengers: Doomsday":["Anthony y Joe Russo","Robert Downey Jr., Chris Hemsworth, Anthony Mackie, Sebastian Stan",0],
"Avengers: Secret Wars":["Anthony y Joe Russo","Elenco por confirmar",0],
"X-Men":["Bryan Singer","Hugh Jackman, Patrick Stewart, Ian McKellen, Famke Janssen, Anna Paquin",0],
"X-Men 2":["Bryan Singer","Hugh Jackman, Patrick Stewart, Ian McKellen, Halle Berry, Brian Cox",0],
"X-Men: La batalla final":["Brett Ratner","Hugh Jackman, Halle Berry, Ian McKellen, Famke Janssen, Kelsey Grammer",0],
"X-Men orígenes: Wolverine":["Gavin Hood","Hugh Jackman, Liev Schreiber, Danny Huston, Ryan Reynolds",0],
"X-Men: Primera generación":["Matthew Vaughn","James McAvoy, Michael Fassbender, Jennifer Lawrence, Kevin Bacon",0],
"Wolverine: Inmortal":["James Mangold","Hugh Jackman, Tao Okamoto, Rila Fukushima, Hiroyuki Sanada",0],
"X-Men: Días del futuro pasado":["Bryan Singer","Hugh Jackman, James McAvoy, Michael Fassbender, Jennifer Lawrence, Patrick Stewart",0],
"Deadpool":["Tim Miller","Ryan Reynolds, Morena Baccarin, Ed Skrein, T. J. Miller",0],
"X-Men: Apocalipsis":["Bryan Singer","James McAvoy, Michael Fassbender, Jennifer Lawrence, Oscar Isaac, Sophie Turner",0],
"Logan":["James Mangold","Hugh Jackman, Patrick Stewart, Dafne Keen, Boyd Holbrook",0],
"Deadpool 2":["David Leitch","Ryan Reynolds, Josh Brolin, Zazie Beetz, Julian Dennison",0],
"X-Men: Fénix Oscura":["Simon Kinberg","Sophie Turner, James McAvoy, Michael Fassbender, Jennifer Lawrence, Jessica Chastain",0],
"Los nuevos mutantes":["Josh Boone","Maisie Williams, Anya Taylor-Joy, Charlie Heaton, Blu Hunt",0],
"WandaVision":["Jac Schaeffer","Elizabeth Olsen, Paul Bettany, Teyonah Parris, Kathryn Hahn",1],
"The Falcon and the Winter Soldier":["Malcolm Spellman","Anthony Mackie, Sebastian Stan, Daniel Brühl, Wyatt Russell",1],
"Loki":["Michael Waldron","Tom Hiddleston, Owen Wilson, Sophia Di Martino, Gugu Mbatha-Raw",1],
"What If...?":["A. C. Bradley","Jeffrey Wright, Hayley Atwell, Chadwick Boseman, Josh Brolin",1],
"Hawkeye":["Jonathan Igla","Jeremy Renner, Hailee Steinfeld, Vera Farmiga, Alaqua Cox",1],
"Moon Knight":["Jeremy Slater","Oscar Isaac, May Calamawy, Ethan Hawke",1],
"Ms. Marvel":["Bisha K. Ali","Iman Vellani, Matt Lintz, Zenobia Shroff, Saagar Shaikh",1],
"She-Hulk: Attorney at Law":["Jessica Gao","Tatiana Maslany, Mark Ruffalo, Tim Roth, Jameela Jamil",1],
"I Am Groot":["Kirsten Lepore","Vin Diesel",1],
"Daredevil":["Drew Goddard","Charlie Cox, Deborah Ann Woll, Elden Henson, Vincent D'Onofrio",1],
"Secret Invasion":["Kyle Bradstreet","Samuel L. Jackson, Ben Mendelsohn, Olivia Colman, Emilia Clarke",1],
"Echo":["Marion Dayre","Alaqua Cox, Chaske Spencer, Vincent D'Onofrio, Zahn McClarnon",1],

"Agatha All Along":["Jac Schaeffer","Kathryn Hahn, Aubrey Plaza, Patti LuPone, Sasheer Zamata",1],

"Daredevil: Born Again":["Dario Scardapane (showrunner)","Charlie Cox, Vincent D'Onofrio, Deborah Ann Woll, Wilson Bethel",1],
"Ironheart":["Chinaka Hodge","Dominique Thorne, Anthony Ramos, Alden Ehrenreich, Lyric Ross",1],
"Eyes of Wakanda":["Todd Harris","Winston Duke, Cress Williams, Zeke Alton",1],
"Marvel Zombies":["Bryan Andrews","Elizabeth Olsen, Paul Rudd, Simu Liu",1],
"VisionQuest":["Terry Matalas","Paul Bettany, James Spader, Ruaridh Mollica, Todd Stashwick",1],
"The Punisher: One Last Kill":["Reinaldo Marcus Green","Jon Bernthal, Jason R. Moore, Deborah Ann Woll",1]};
const crewBox=n=>{const m=CR[n];return m?`<div class="crew"><p><span>${m[2]?"Creación":"Dirección"}</span>${m[0]}</p><p><span>Elenco</span>${m[1]}</p></div>`:""};
const isSer=n=>D.some(p=>p[1].some(m=>m[0]===n&&m[2]));
const LOGO={
"Netflix":"https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/netflix.svg",
"Disney+":"https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/disney-plus.svg"};
const logoOf=n=>{const pl=plat(n);if(!LOGO[pl])return`<span class="pl"><b class="ptx">${pl}</b></span>`;return`<span class="pl"><img src="${LOGO[pl]}" alt="${pl}" title="${pl}" onerror="this.outerHTML='<b class=ptx>'+this.alt+'</b>'"></span>`};
const PL={"Daredevil":"Netflix","Spider-Man: Homecoming":"Varía según el país","Spider-Man: Lejos de casa":"Varía según el país","Spider-Man: No Way Home":"Varía según el país","Spider-Man: Brand New Day":"Varía según el país"},plat=n=>PL[n]||"Disney+";
const vis=m=>!QT[m[0]]&&(SS||!m[2]);
const W={"Iron Man":"Iron_Man_(2008_film)","El Increíble Hulk":"The_Incredible_Hulk_(film)","Iron Man 2":"Iron_Man_2","Thor":"Thor_(film)","Capitán América: El primer vengador":"Captain_America:_The_First_Avenger","Los Vengadores":"The_Avengers_(2012_film)","Iron Man 3":"Iron_Man_3","Thor: El mundo oscuro":"Thor:_The_Dark_World","Capitán América: El soldado de invierno":"Captain_America:_The_Winter_Soldier","Guardianes de la Galaxia":"Guardians_of_the_Galaxy_(film)","Vengadores: La era de Ultrón":"Avengers:_Age_of_Ultron","Ant-Man":"Ant-Man_(film)","Capitán América: Civil War":"Captain_America:_Civil_War","Doctor Strange":"Doctor_Strange_(2016_film)","Guardianes de la Galaxia Vol. 2":"Guardians_of_the_Galaxy_Vol._2","Spider-Man: Homecoming":"Spider-Man:_Homecoming","Thor: Ragnarok":"Thor:_Ragnarok","Black Panther":"Black_Panther_(film)","Vengadores: Infinity War":"Avengers:_Infinity_War","Ant-Man y la Avispa":"Ant-Man_and_the_Wasp","Capitana Marvel":"Captain_Marvel_(film)","Vengadores: Endgame":"Avengers:_Endgame","Spider-Man: Lejos de casa":"Spider-Man:_Far_From_Home","Viuda Negra":"Black_Widow_(2021_film)","Shang-Chi":"Shang-Chi_and_the_Legend_of_the_Ten_Rings","Eternals":"Eternals_(film)","Spider-Man: No Way Home":"Spider-Man:_No_Way_Home","Doctor Strange en el multiverso de la locura":"Doctor_Strange_in_the_Multiverse_of_Madness","Thor: Love and Thunder":"Thor:_Love_and_Thunder","Black Panther: Wakanda Forever":"Black_Panther:_Wakanda_Forever","Ant-Man y la Avispa: Quantumanía":"Ant-Man_and_the_Wasp:_Quantumania","Guardianes de la Galaxia Vol. 3":"Guardians_of_the_Galaxy_Vol._3","The Marvels":"The_Marvels","Deadpool & Wolverine":"Deadpool_&_Wolverine","Capitán América: Brave New World":"Captain_America:_Brave_New_World","Thunderbolts*":"Thunderbolts*","Los 4 Fantásticos: Primeros pasos":"The_Fantastic_Four:_First_Steps","Spider-Man: Brand New Day":"Spider-Man:_Brand_New_Day","Avengers: Doomsday":"Avengers:_Doomsday","Avengers: Secret Wars":"Avengers:_Secret_Wars","X-Men":"X-Men_(film)","X-Men 2":"X2_(film)","X-Men: La batalla final":"X-Men:_The_Last_Stand","X-Men orígenes: Wolverine":"X-Men_Origins:_Wolverine","X-Men: Primera generación":"X-Men:_First_Class","Wolverine: Inmortal":"The_Wolverine_(film)","X-Men: Días del futuro pasado":"X-Men:_Days_of_Future_Past","Deadpool":"Deadpool_(film)","X-Men: Apocalipsis":"X-Men:_Apocalypse","Logan":"Logan_(film)","Deadpool 2":"Deadpool_2","X-Men: Fénix Oscura":"Dark_Phoenix_(film)","Los nuevos mutantes":"The_New_Mutants_(film)","WandaVision":"WandaVision","The Falcon and the Winter Soldier":"The_Falcon_and_the_Winter_Soldier","Loki":"Loki_(TV_series)","What If...?":"What_If...?_(TV_series)","Hawkeye":"Hawkeye_(miniseries)","Moon Knight":"Moon_Knight_(miniseries)","Ms. Marvel":"Ms._Marvel_(miniseries)","She-Hulk: Attorney at Law":"She-Hulk:_Attorney_at_Law","I Am Groot":"I_Am_Groot","Secret Invasion":"Secret_Invasion_(miniseries)","Echo":"Echo_(miniseries)","Agatha All Along":"Agatha_All_Along","Daredevil: Born Again":"Daredevil:_Born_Again","Daredevil":"Daredevil_(TV_series)","Ironheart":"Ironheart_(miniseries)","Eyes of Wakanda":"Eyes_of_Wakanda","Marvel Zombies":"Marvel_Zombies_(miniseries)","VisionQuest":"VisionQuest","The Punisher: One Last Kill":"The_Punisher:_One_Last_Kill"};
let wk=ld("ucm-wiki2");
function setImg(n,u){document.querySelectorAll(".card").forEach(c=>{if(c.dataset.n===n&&!pos[n]){c.style.backgroundImage=`url(${u})`;c.classList.add("img");fitCard(c,u)}})}
const DIM={};
function fitCard(c,u){if(!u)return;const ap=()=>{const d=DIM[u];if(!d)return;const r=d[0]/d[1];if(Math.abs(r-2/3)>.08){c.classList.add("fit");c.style.setProperty("--bg","url("+u+")")}else c.classList.remove("fit")};
if(DIM[u]){ap();return}const im=new Image();im.onload=()=>{DIM[u]=[im.naturalWidth,im.naturalHeight];ap()};im.src=u}
function fitAll(){document.querySelectorAll(".card.img").forEach(c=>fitCard(c,pos[c.dataset.n]||wk[c.dataset.n]))}
const TMDB_KEY=""; // opcional: pegá acá tu API key gratuita de themoviedb.org para banners reales
const BN=ld("ucm-banners");
async function loadBanner(n){if(!TMDB_KEY||BN[n]!==undefined)return;
try{const ser=(D.flatMap(x=>x[1]).find(m=>m[0]===n)||[])[2],t=en(n).replace(/\*$/,"");
const r=await fetch("https://api.themoviedb.org/3/search/"+(ser?"tv":"movie")+"?api_key="+TMDB_KEY+"&query="+encodeURIComponent(t));
const j=await r.json(),b=(j.results||[]).find(x=>x.backdrop_path);BN[n]=b?"https://image.tmdb.org/t/p/w780"+b.backdrop_path:"";sv("ucm-banners",BN)}catch(e){return}
if(cur===n&&vt==="info")draw()}
function loadPosters(){
const st=$("st"),all=Object.keys(W),need=all.filter(n=>!wk[n]);
const show=()=>st.textContent="Pósters cargados: "+all.filter(n=>wk[n]).length+" de "+all.length;
show();if(!need.length)return;
const T=n=>W[n].replace(/_/g," ");
const run=ch=>fetch("https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=900&pilicense=any&titles="+encodeURIComponent(ch.map(T).join("|"))).then(r=>r.json()).then(j=>{
const q=j.query||{},nm={},rd={},byT={};
(q.normalized||[]).forEach(x=>nm[x.from]=x.to);(q.redirects||[]).forEach(x=>rd[x.from]=x.to);
Object.values(q.pages||{}).forEach(p=>{if(p.thumbnail)byT[p.title]=p.thumbnail.source});
ch.forEach(n=>{let t=T(n);t=nm[t]||t;t=rd[t]||t;const u=byT[t];if(u){wk[n]=u;setImg(n,u)}})});
const ch=[];for(let i=0;i<need.length;i+=40)ch.push(need.slice(i,i+40));
Promise.all(ch.map(run)).then(()=>{sv("ucm-wiki2",wk);show()}).catch(e=>{st.textContent="No se pudo conectar con Wikipedia ("+e.message+")"})}

const $=id=>document.getElementById(id),esc=s=>s.replace(/"/g,"&quot;");
$("seg").innerHTML=D.map((p,i)=>p[2]?"":`<div style="flex:${p[1].length}"><i id="s${i}" style="background:hsl(${HUES[i]} 75% 58%)"></i></div>`).join("");
function stats(){
codeUpd();
let total=0,done=0;
let xl=0,xd=0;
D.forEach(([,ms,ex],i)=>{const l=ms.filter(vis),d=l.filter(m=>seen[m[0]]).length;
$("t"+i).textContent=d+"/"+l.length;
if(ex){xl+=l.length;xd+=d;return}
total+=l.length;done+=d;
const sg=$("s"+i);sg.style.width=(l.length?d/l.length*100:0)+"%";sg.parentNode.style.flex=l.length;sg.parentNode.style.display=l.length?"":"none";
});
const pc=total?done/total:0;
$("pc").textContent=Math.round(pc*100);$("rg").style.strokeDashoffset=314.2*(1-pc);
$("sub").textContent=total&&done===total?"Las viste todas. Maratón completo.":`Llevas ${done} de ${total}. Te faltan ${total-done}.`;
$("xst").innerHTML=XT<0?"":`Extra X-Men: <b>${xd} de ${xl}</b>${xl&&xd===xl?" · ¡completo!":""}`;
nextUp();
}
// Siguiente película sin ver, en orden (primero el UCM, después X-Men)
function nextUp(){const b=$("nxt");let hit=null;
for(let i=0;i<D.length&&!hit;i++)for(const m of D[i][1])if(vis(m)&&!seen[m[0]]&&!isSoon(m[0])){hit=[i,m];break}
if(!hit){b.hidden=true;return}
b.hidden=false;b.dataset.i=hit[0];b.dataset.n=hit[1][0];
b.innerHTML=`<span>Siguiente para ver · ${D[hit[0]][0]}</span><b>${hit[1][0]}</b>`}
function tabs(){
$("tabs").innerHTML=D.map((p,i)=>`<button class="tab${p[2]?" xm":""}" role="tab" data-i="${i}" aria-selected="${i===tab}" style="--h:${HUES[i]}">${p[2]?"★ ":""}${p[0]}<small id="t${i}"></small></button>`).join("");
}
function grid(){
const g=$("grid");g.style.setProperty("--h",HUES[tab]);$("flt").style.setProperty("--h",HUES[tab]);
const x=$("xin");x.style.setProperty("--h",HUES[tab]);
x.innerHTML=D[tab][2]?`<div class="xin"><small>Apartado extra</small><b>La saga X-Men</b><p>Las películas de mutantes de 20th Century Fox, en orden de estreno. No son parte del UCM, así que no cuentan para tu porcentaje, pero conectan con él a través de Deadpool &amp; Wolverine.</p></div>`:"";
const qn=qq.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const all=D[tab][1].filter(vis),list=all.filter(m=>(flt==="all"||(flt==="seen")===!!seen[m[0]])&&(!qn||m[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").includes(qn)));
g.innerHTML=list.map(m=>{const n=m[0],p=pos[n]||wk[n];
return `<div class="cell"><div class="card ${seen[n]?"done":""} ${p?"img":""}" role="checkbox" aria-checked="${!!seen[n]}" aria-label="${esc(n)}" tabindex="0" data-n="${esc(n)}"${p?` style="background-image:url(${p})"`:""}><span class="yr">${m[1]}${m[2]?" · Serie":""}</span><span class="nm">${n}</span><span class="stamp">vista</span>${isSoon(n)?'<span class="soon">Próximamente</span>':""}${fav===n?'<span class="fvs" aria-label="Favorita"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.5 6.4 4.5c2.1 0 3.9 1.2 5.6 3.2 1.7-2 3.5-3.2 5.6-3.2 3.7 0 5.5 3.9 4 7.3C19.5 16.4 12 21 12 21z"/></svg></span>':""}</div><button class="inf" data-n="${esc(n)}" aria-label="Detalles">i</button></div>`}).join("")||`<p class="empty">${all.length?(qn?"Ninguna coincide con la búsqueda.":flt==="seen"?"Todavía no marcaste ninguna de esta fase.":"¡Las viste todas en esta fase!"):"No hay nada para mostrar en esta fase."}</p>`;
fitAll();
}
function toggle(c){const n=c.dataset.n;seen[n]=!seen[n];if(!seen[n])delete seen[n];sv("ucm-vistas",seen);c.classList.toggle("done",!!seen[n]);c.setAttribute("aria-checked",!!seen[n]);stats();if(flt!=="all")setTimeout(grid,450)}
$("grid").addEventListener("click",e=>{const c=e.target.closest(".card");if(c)toggle(c)});
$("grid").addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.classList.contains("card")){e.preventDefault();toggle(e.target)}});
function goTab(i){tab=i;try{localStorage.setItem("ucm-tab",i)}catch(e){}
document.querySelectorAll(".tab").forEach(x=>x.setAttribute("aria-selected",+x.dataset.i===i));grid()}
$("tabs").addEventListener("click",e=>{const b=e.target.closest(".tab");if(!b)return;goTab(+b.dataset.i);b.scrollIntoView({block:"nearest",inline:"nearest"})});
$("flt").addEventListener("click",e=>{const b=e.target.closest("button[data-f]");if(!b)return;flt=b.dataset.f;
$("flt").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b));grid()});
$("q").addEventListener("input",e=>{qq=e.target.value.trim();grid()});
$("nxt").onclick=()=>{const b=$("nxt"),n=b.dataset.n;
if(flt==="seen"||qq){flt="all";qq="";$("q").value="";$("flt").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x.dataset.f==="all"))}
goTab(+b.dataset.i);const c=cardOf(n);if(!c)return;const cell=c.parentNode;
cell.scrollIntoView({behavior:"smooth",block:"center"});cell.classList.remove("hl");void cell.offsetWidth;cell.classList.add("hl")};
$("reset").onclick=()=>{if(confirm("¿Borrar tu progreso? Los pósters se quedan.")){seen={};sv("ucm-vistas",seen);grid();stats()}};
const S={"Iron Man": "Tony Stark, un millonario fabricante de armas, escapa del cautiverio con una armadura que él mismo construye y decide usar su ingenio de otra forma. Aquí empieza todo.", "El Increíble Hulk": "Bruce Banner huye del ejército mientras busca una cura para la furia que lo convierte en Hulk.", "Iron Man 2": "Con su identidad ya pública, Tony Stark enfrenta la presión del gobierno por su armadura y a un rival con tecnología parecida a la suya.", "Thor": "El arrogante dios del trueno es desterrado a la Tierra sin sus poderes y debe aprender a ser digno, mientras en Asgard su hermano Loki mueve sus propias piezas.", "Capitán América: El primer vengador": "Steve Rogers, un joven frágil, se convierte en supersoldado durante la Segunda Guerra Mundial y se enfrenta a Hydra.", "Los Vengadores": "Nick Fury reúne a Iron Man, Hulk, Thor, el Capitán América y otros héroes para frenar la invasión que prepara Loki.", "Iron Man 3": "Con su mundo sacudido por lo ocurrido en Nueva York, Tony Stark enfrenta a un nuevo enemigo, el Mandarín, y debe arreglárselas sin su equipo habitual.", "Thor: El mundo oscuro": "Thor debe detener a los elfos oscuros, que buscan una fuerza ancestral para hundir los mundos en la oscuridad.", "Capitán América: El soldado de invierno": "Steve Rogers se adapta al mundo actual cuando una conspiración dentro de S.H.I.E.L.D. y un misterioso asesino lo ponen en la mira.", "Guardianes de la Galaxia": "Un grupo de marginados espaciales (Star-Lord, Gamora, Drax, Rocket y Groot) se une para evitar que un poderoso orbe caiga en manos equivocadas.", "Vengadores: La era de Ultrón": "Tony Stark y Bruce Banner crean una inteligencia artificial para proteger la Tierra, pero Ultrón tiene otra idea de cómo hacerlo.", "Ant-Man": "Scott Lang, un ladrón recién salido de prisión, recibe un traje capaz de encogerlo y debe aprender a usarlo para una misión que lo supera.", "Capitán América: Civil War": "Tras un incidente con víctimas civiles, el gobierno quiere regular a los héroes y los Vengadores terminan divididos en dos bandos.", "Doctor Strange": "Un cirujano brillante y orgulloso busca recuperarse de una lesión y termina descubriendo las artes místicas.", "Guardianes de la Galaxia Vol. 2": "Los Guardianes intentan mantenerse unidos mientras Peter Quill descubre más sobre su origen.", "Spider-Man: Homecoming": "Peter Parker, todavía en el instituto, intenta demostrar que merece ser un héroe bajo la mirada de Tony Stark.", "Thor: Ragnarok": "Atrapado en un planeta lejano y obligado a combatir como gladiador, Thor debe volver a Asgard antes de que Hela lo destruya.", "Black Panther": "T'Challa regresa a Wakanda para asumir el trono y enfrenta un desafío que pone en riesgo a su nación.", "Vengadores: Infinity War": "Los Vengadores y sus aliados luchan por impedir que Thanos reúna las Gemas del Infinito.", "Ant-Man y la Avispa": "Scott Lang, bajo arresto domiciliario, ayuda a Hope y Hank Pym en una misión hacia el reino cuántico mientras lo persiguen.", "Capitana Marvel": "En los años 90, la piloto Carol Danvers descubre su pasado y sus poderes en medio de una guerra entre kree y skrulls.", "Vengadores: Endgame": "Tras la devastación de Thanos, los Vengadores que quedan intentan una última jugada para recuperar lo perdido.", "Spider-Man: Lejos de casa": "Peter Parker viaja por Europa con su clase, pero Nick Fury lo recluta para enfrentar nuevas amenazas.", "Viuda Negra": "Natasha Romanoff, prófuga, debe enfrentar los secretos de su pasado y a la organización que la formó.", "Shang-Chi": "Shang-Chi lleva una vida tranquila hasta que lo alcanza la organización de su padre, los Diez Anillos.", "Eternals": "Una raza de seres inmortales que vivió oculta durante siglos se reúne para proteger a la humanidad de una amenaza antigua.", "Spider-Man: No Way Home": "Con su identidad revelada, Peter Parker pide ayuda a Doctor Strange y un hechizo abre la puerta a visitantes inesperados.", "Doctor Strange en el multiverso de la locura": "Doctor Strange protege a una joven capaz de viajar entre universos y enfrenta los peligros del multiverso.", "Thor: Love and Thunder": "Thor busca encontrarse a sí mismo cuando un asesino de dioses, Gorr, empieza a cazar divinidades.", "Black Panther: Wakanda Forever": "Wakanda, de duelo por la pérdida de su rey, debe protegerse de nuevos rivales mientras busca su camino.", "Ant-Man y la Avispa: Quantumanía": "Scott Lang, Hope y su familia quedan atrapados en el reino cuántico y se topan con Kang el Conquistador.", "Guardianes de la Galaxia Vol. 3": "Los Guardianes se juegan todo para proteger a Rocket, cuyo pasado vuelve a perseguirlo.", "The Marvels": "Carol Danvers, Monica Rambeau y Kamala Khan descubren que sus poderes están conectados y deben aprender a trabajar juntas.", "Deadpool & Wolverine": "Wade Wilson, retirado, se une a un Wolverine poco entusiasta para frenar una amenaza que pone en riesgo su universo.", "Capitán América: Brave New World": "Sam Wilson, ya como Capitán América, se ve envuelto en una intriga internacional que sacude al gobierno de Estados Unidos.", "Thunderbolts*": "Un grupo de antihéroes y exvillanos es reclutado para una misión peligrosa que no es lo que parece.", "Los 4 Fantásticos: Primeros pasos": "Una familia de exploradores con poderes, en un mundo retrofuturista, enfrenta al devorador de mundos Galactus.", "Spider-Man: Brand New Day": "Cuatro años después de No Way Home, Peter Parker combate el crimen a tiempo completo en una Nueva York que ya no lo recuerda. La presión le provoca un cambio que quizá no pueda controlar, justo cuando aparece una amenaza que nadie puede ver.", "Avengers: Doomsday": "Héroes de tres mundos distintos quedan en curso de colisión y deben unirse para enfrentar una amenaza catastrófica, con Doctor Doom como gran villano. Dirigen los hermanos Russo. Se estrena el 18 de diciembre de 2026.", "Avengers: Secret Wars": "El gran cierre de la Saga del Multiverso: tras Doomsday, héroes de distintas realidades se juegan el destino de todo el multiverso. Dirigen los hermanos Russo. Se estrena el 17 de diciembre de 2027.", "X-Men": "Wolverine y Rogue llegan a la escuela del Profesor X justo cuando Magneto planea un ataque que podría poner a la humanidad en contra de los mutantes.", "X-Men 2": "El coronel William Stryker ataca la escuela de Xavier y obliga a los X-Men a aliarse con Magneto, mientras Wolverine descubre pistas sobre su pasado.", "X-Men: La batalla final": "Aparece una cura para la mutación y estalla la guerra entre quienes la aceptan y la Hermandad de Magneto, mientras Jean Grey regresa convertida en el Fénix.", "X-Men orígenes: Wolverine": "La historia de Logan antes de los X-Men: su rivalidad con su hermano Victor y su paso por el programa Arma X, donde recibe el adamantium.", "X-Men: Primera generación": "En los años 60, un joven Charles Xavier y Erik Lehnsherr forman el primer equipo de mutantes en plena crisis de los misiles en Cuba, antes de convertirse en enemigos.", "Wolverine: Inmortal": "Logan viaja a Japón para despedirse de un viejo conocido y queda atrapado en una lucha de poder en la que, por primera vez, se vuelve vulnerable.", "X-Men: Días del futuro pasado": "En un futuro devastado por los Centinelas, Wolverine es enviado a 1973 para unir a los jóvenes Charles y Erik y cambiar la historia.", "Deadpool": "Wade Wilson, un exmercenario, se somete a un experimento que lo deja desfigurado y casi indestructible, y sale a cazar al responsable con mucho humor y cero filtro.", "X-Men: Apocalipsis": "En los años 80 despierta En Sabah Nur, el primer mutante, que recluta a sus Cuatro Jinetes para rehacer el mundo a su imagen.", "Logan": "En 2029, un Logan envejecido cuida a un Charles enfermo cerca de la frontera mexicana hasta que aparece Laura, una niña con sus mismos poderes.", "Deadpool 2": "Deadpool forma la X-Force para proteger a un joven mutante de Cable, un soldado que viaja desde el futuro.", "X-Men: Fénix Oscura": "Durante una misión en el espacio, Jean Grey absorbe una fuerza cósmica que la vuelve más poderosa e inestable que nunca.", "Los nuevos mutantes": "Cinco jóvenes mutantes retenidos en un hospital aislado descubren que el lugar esconde algo más que un programa de rehabilitación.", "WandaVision": "Wanda Maximoff y Visión viven una vida de comedia televisiva en el pueblo de Westview, pero algo no encaja: la realidad parece moldeada por fuerzas que ninguno de los dos entiende.", "The Falcon and the Winter Soldier": "Sam Wilson y Bucky Barnes, tras la partida de Steve Rogers, deben trabajar juntos para enfrentar a un grupo extremista y decidir qué hacer con el legado del Capitán América.", "Loki": "Tras escapar con el Teseracto, Loki es capturado por la Autoridad de Variación Temporal y obligado a ayudar a reparar la línea temporal.", "What If...?": "El Vigilante muestra realidades alternativas del MCU en las que un solo cambio altera la historia de héroes conocidos.", "Hawkeye": "Clint Barton intenta volver a casa para Navidad, pero su pasado lo alcanza y debe aliarse con Kate Bishop, una joven arquera que lo admira.", "Moon Knight": "Steven Grant, un empleado de museo con lagunas de memoria, descubre que comparte cuerpo con Marc Spector, un mercenario ligado al dios egipcio Khonshu.", "Ms. Marvel": "Kamala Khan, una adolescente de Nueva Jersey fanática de los Vengadores, descubre que tiene poderes y debe aprender a ser una heroína.", "She-Hulk: Attorney at Law": "La abogada Jennifer Walters obtiene poderes de Hulk tras una transfusión de su primo Bruce y debe equilibrar su carrera con su vida como heroína.", "I Am Groot": "Una serie de cortos animados en la que el pequeño Groot se mete en travesuras por la galaxia.", "Secret Invasion": "Nick Fury descubre que los skrulls infiltrados en la Tierra preparan una invasión silenciosa y debe detenerlos con ayuda de viejos aliados.",   "Echo": "Maya Lopez, exsicaria del Kingpin, vuelve a su ciudad natal para enfrentar su pasado y reencontrarse con su comunidad.",  "Agatha All Along": "Agatha Harkness, sin sus poderes, recorre el Camino de las Brujas junto a un grupo improvisado de aliados.",   "Daredevil": "Matt Murdock, un abogado ciego de Hell's Kitchen, usa de noche sus sentidos agudizados para combatir el crimen como Daredevil, mientras Wilson Fisk, el Kingpin, extiende su control sobre la ciudad.", "Daredevil: Born Again": "Matt Murdock y Wilson Fisk, ahora alcalde de Nueva York, vuelven a enfrentarse mientras el vigilante intenta proteger la ciudad.", "Ironheart": "Riri Williams, una genio del MIT, regresa a Chicago y construye su propia armadura mientras se cruza con un misterioso criminal.", "Eyes of Wakanda": "Serie animada que sigue a guerreros wakandianos a lo largo de la historia en misiones para recuperar artefactos de vibranio.", "Marvel Zombies": "Animación de terror en la que un grupo de sobrevivientes debe cruzar un mundo arrasado por una plaga zombi.",   "VisionQuest": "Serie centrada en Visión, ambientada tras los hechos de WandaVision.", "The Punisher: One Last Kill": "Especial televisivo de Marvel con Frank Castle, el Castigador, interpretado por Jon Bernthal."};
const en=n=>W[n].replace(/_\(.*\)$/,"").replace(/_/g," ");
const yrOf=n=>{for(const p of D)for(const m of p[1])if(m[0]===n)return m[1]};
const cardOf=n=>[...document.querySelectorAll(".card")].find(c=>c.dataset.n===n);
const NS="ucm-facas-tracker-v3",AB="https://abacus.jasoncameron.dev/";
// Reinicio de puntuaciones (una sola vez por dispositivo): borra los puntajes enviados y vuelve a registrar la favorita en el contador nuevo
try{if(localStorage.getItem("ucm-reset-v3")!=="1"){localStorage.removeItem("ucm-enviados-v2");localStorage.setItem("ucm-reset-v3","1");if(fav)setTimeout(()=>hitFav(fav,"fav").catch(()=>{}),0)}}catch(e){}
let vt="info",TR=ld("ucm-trailers"),cur=null,sent=ld("ucm-enviados-v2"),pick={},hist={},busy=false,msg="";
const slug=n=>(en(n)+" "+yrOf(n)).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
const key=(n,v)=>slug(n)+"-"+v;
async function loadHist(n){
const h=hist[n];if(h&&((h.loading&&Date.now()-h.t0<15000)||(h.ok&&Date.now()-h.t<6e4)))return;
const t0=Date.now();hist[n]={loading:true,t0};
const g1=k=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),8000);return fetch(AB+"get/"+NS+"/"+k,{cache:"no-store",signal:c.signal}).then(r=>r.status===404?0:r.ok?r.json().then(j=>+j.value||0):Promise.reject(new Error("HTTP "+r.status))).finally(()=>clearTimeout(t))};
const g=async k=>{let e;for(let a=0;a<3;a++){try{return await g1(k)}catch(x){e=x;await new Promise(r=>setTimeout(r,500*(a+1)))}}throw e};
try{
const ks=[];for(let i=1;i<=10;i++)ks.push(key(n,i));for(let i=1;i<=10;i++)ks.push(key(n,i)+"-x");ks.push(key(n,"fav"),key(n,"fav-x"));
const r=[];for(let i=0;i<ks.length;i+=5)r.push(...await Promise.all(ks.slice(i,i+5).map(g)));
const c=r.slice(0,10).map((x,i)=>Math.max(0,x-r[10+i]));
hist[n]={ok:true,t:Date.now(),c,f:Math.max(0,r[20]-r[21])};
}catch(e){hist[n]={err:true,why:String(e&&e.name==="AbortError"?"tiempo agotado":e&&e.message||e)}}
if(cur===n&&vt==="info")draw()}
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&cur&&vt==="info"){const h=hist[cur];if(!h||h.err||h.loading){delete hist[cur];draw();loadHist(cur)}}});
addEventListener("online",()=>{if(cur&&vt==="info"){delete hist[cur];draw();loadHist(cur)}});
const T={ // IDs fijos de YouTube (tienen prioridad sobre la búsqueda automática)
"Iron Man":"8ugaeA-nMTc",
"Daredevil":"XC7GPdBV9WQ",
"El Increíble Hulk":"xbqNb2PFKKA",
"Iron Man 2":"BoohRoVA9WQ",
"Thor":"JOddp-nlNvQ",
"Capitán América: El primer vengador":"JerVrbLldXw",
"Los Vengadores":"eOrNdBpGMv8",
"Iron Man 3":"oYSD2VQagc4",
"Thor: El mundo oscuro":"npvJ9FTgZbM",
"Capitán América: El soldado de invierno":"tbayiPxkUMM",
"Guardianes de la Galaxia":"d96cjJhvlMA",
"Vengadores: La era de Ultrón":"tmeOjFno6Do",
"Ant-Man":"pWdKf3MneyI",
"Capitán América: Civil War":"dKrVegVI0Us",
"Doctor Strange":"Lt-U_t2pUHI",
"Guardianes de la Galaxia Vol. 2":"wUn05hdkhjM",
"Thor: Ragnarok":"ue80QwXMRHg",
"Black Panther":"xjDjIWPwcPU",
"Vengadores: Infinity War":"6ZfuNTqbHE8",
"Ant-Man y la Avispa":"8_rTIAOohas",
"Capitana Marvel":"Z1BCujX3pw8",
"Vengadores: Endgame":"TcMBFSGVi1c",
"Viuda Negra":"ybji16u608U",
"Shang-Chi":"8YjFbMbfXaQ",
"Eternals":"x_me3xsvDgk",
"Doctor Strange en el multiverso de la locura":"aWzlQ2N6qqg",
"Thor: Love and Thunder":"Go8nTmfrQd8",
"Black Panther: Wakanda Forever":"_Z3QKkl1WyM",
"Ant-Man y la Avispa: Quantumanía":"ZlNFpri-Y40",
"Guardianes de la Galaxia Vol. 3":"u3V5KDHRQvk",
"The Marvels":"wS_qbDztgVY",
"Deadpool & Wolverine":"73_1biulkYk",
"Capitán América: Brave New World":"1pHDWnXmK7Y",
"Thunderbolts*":"hUUszE29jS0",
"Los 4 Fantásticos: Primeros pasos":"pAsmrKyMqaA",
"Spider-Man: Homecoming":"rk-dF1lIbIg",
"Spider-Man: Lejos de casa":"Nt9L1jCKGnE",
"Spider-Man: No Way Home":"JfVOs4VSpmA",
"Spider-Man: Brand New Day":"tLeBDumanoc",
"Avengers: Doomsday":"irVNGjRFZGk",
"The Falcon and the Winter Soldier":"IWBsDaFWyTE",
"Loki":"nW948Va-l10",
"What If...?":"x9D0uUKJ5KI",
"Hawkeye":"5VYb3B1ETlk",
"Moon Knight":"x7Krla_UxRg",
"Ms. Marvel":"m9EX0f6V11Y",
"She-Hulk: Attorney at Law":"u7JsKhI2An0",
"Secret Invasion":"Tp_YZNqNBhw",
"I Am Groot":"D7eFpRf4tac",


"Echo":"AFUKnherhuw",
"Agatha All Along":"R9pXbNz6Vbw",
"Daredevil: Born Again":"7xALolZzhSM",
"Ironheart":"WpW36ldAqnM",


"VisionQuest":"oSVTAUKyrL8",
"The Punisher: One Last Kill":"oSeqs_xeqv4",


"Eyes of Wakanda":"ODHh6oe4MlE",
"Marvel Zombies":"twHYF506-9Y"
};
const PI=["https://pipedapi.kavin.rocks","https://pipedapi.adminforge.de","https://api.piped.yt"];
async function findTr(n){
if(T[n]||TR[n])return T[n]||TR[n];
const q=en(n)+" "+yrOf(n)+" official trailer";
for(const b of PI){try{const r=await fetch(b+"/search?filter=videos&q="+encodeURIComponent(q));if(!r.ok)continue;const it=(await r.json()).items||[];
const v=it.find(x=>/trailer|tráiler/i.test(x.title||""))||it[0],id=v&&(v.url||"").match(/v=([\w-]{11})/);
if(id){TR[n]=id[1];sv("ucm-trailers",TR);return id[1]}}catch(e){}}
return null}
const bnr=n=>{const b=BN[n];return b?`<div class="bnr" style="background-image:url(${b})" role="img" aria-label="Banner de ${esc(n)}"></div>`:""};
const head=(n,y)=>{const b=BN[n],pz=pos[n]||wk[n];const isF=fav===n;return `<button class="bk" id="bk" aria-label="Volver">←</button><button id="fvb" class="fvt${isF?" on":""}" aria-pressed="${isF}" aria-label="${isF?"Quitar de favorita":"Marcar como favorita"}" ${fbusy?"disabled":""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.5 6.4 4.5c2.1 0 3.9 1.2 5.6 3.2 1.7-2 3.5-3.2 5.6-3.2 3.7 0 5.5 3.9 4 7.3C19.5 16.4 12 21 12 21z"/></svg><span>Favorita</span></button>${bnr(n)}<div class="hd${b?"":" nb"}">${pz?`<i class="pth" style="background-image:url(${pz})"></i>`:""}<div><h3>${n}${logoOf(n)}</h3><p class="my">${y}${isSer(n)?" · Serie":""}</p></div></div><div class="stabs"><button data-v="info" class="${vt==="info"?"on":""}">Info</button><button data-v="tr" class="${vt==="tr"?"on":""}">▶ Tráiler</button></div>`};
function drawTr(fail){
const n=cur,id=T[n]||TR[n];let b;
$("sh").style.setProperty("--h",HUES[tab]);
if(id)b=`<div class="vid"><iframe src="https://www.youtube-nocookie.com/embed/${id}?hl=es&rel=0" title="Tráiler de ${esc(n)}" allow="accelerometer;encrypted-media;gyroscope;picture-in-picture;fullscreen" allowfullscreen></iframe></div>`;
else if(fail)b=`<p class="nt">No pude cargar el tráiler acá.</p><div class="ac"><a href="https://www.youtube.com/results?search_query=${encodeURIComponent(en(n)+" "+yrOf(n)+" tráiler oficial")}" target="_blank" rel="noopener">Buscar en YouTube</a></div>`;
else{b=`<p class="nt">Buscando tráiler…</p>`;findTr(n).then(i=>{if(cur===n&&vt==="tr")drawTr(!i)})}
$("sb").innerHTML=head(n,yrOf(n))+b}
let editing={};
const PEND=ld("ucm-pend");
async function flushPend(){let ch=false;for(const n of Object.keys(PEND)){const rest=[];for(const o of PEND[n]){try{const r=await fetch(AB+"hit/"+NS+"/"+key(n,o)+"-x",{cache:"no-store"});if(!r.ok)throw 0}catch(e){rest.push(o)}}if(rest.length)PEND[n]=rest;else delete PEND[n];ch=true}if(ch)sv("ucm-pend",PEND)}
function draw(){
if(vt==="tr")return drawTr();
const n=cur,y=yrOf(n),t=en(n),done=sent[n],ed2=!!editing[n],lock=done&&!ed2,sel=ed2?(pick[n]||done):(done||pick[n]||0),h=hist[n];
const tr="https://www.youtube.com/results?search_query="+encodeURIComponent(t+" "+y+" tráiler oficial");
const btns=Array.from({length:10},(_,i)=>`<button class="pt${sel===i+1?" on":""}" data-p="${i+1}" ${lock?"disabled":""} aria-label="${i+1} de 10">${i+1}</button>`).join("");
let com;
if(!h||h.loading)com=`<p class="nt">Cargando promedio…</p>`;
else if(h.err)com=`<p class="nt">No pude cargar el promedio ahora${h.why?` (${h.why})`:""}.</p><div class="ac"><button id="rh">Reintentar</button></div>`;
else{const c=h.c.reduce((a,b)=>a+b,0),av=c?(h.c.reduce((a,v,i)=>a+v*(i+1),0)/c).toFixed(1):"—";
com=`<div class="sc"><span>Promedio de todos<b>${av}</b></span><span>Tu voto<b>${done||"—"}</b></span></div><p class="nt">${c?`${c} ${c===1?"persona puntuó":"personas puntuaron"} esta película en esta página.`:"Todavía nadie envió su puntaje. El tuyo será el primero."}</p>`}
const ed=admin&&h&&h.ok?`<h4>Admin: ajustar votos de todos</h4><div class="adj">${h.c.map((v,i)=>`<div class="ar"><b>${i+1}</b><span>${v}</span><button data-a="-" data-s="${i+1}" ${v&&!adb?"":"disabled"} aria-label="Restar un voto de ${i+1}">−</button><button data-a="+" data-s="${i+1}" ${adb?"disabled":""} aria-label="Sumar un voto de ${i+1}">+</button></div>`).join("")}</div>`:"";
const isF=fav===n;
const fv=h&&h.ok?`<p class="nt">${h.f?`Favorita de ${h.f} ${h.f===1?"persona":"personas"}.`:"Todavía nadie la eligió como favorita."}</p>`:"";
const act=lock?`<p class="nt">Tu voto ya cuenta en el promedio.</p><div class="ac"><button id="chg">Cambiar mi voto</button></div>`:ed2?`<p class="nt">Elegí tu nuevo puntaje (ahora tenés ${done}).</p><div class="ac"><button class="pri" id="env" ${sel&&sel!==done&&!busy?"":"disabled"}>${busy?"Guardando…":"Guardar cambio"}</button><button id="cnc" ${busy?"disabled":""}>Cancelar</button></div>`:`<div class="ac"><button class="pri" id="env" ${sel&&!busy?"":"disabled"}>${busy?"Enviando…":"Enviar mi puntaje"}</button></div>`;
$("sh").style.setProperty("--h",HUES[tab]);
const rd=relD(n),cdn=rd&&rd>new Date()?`<p class="cd">🗓 Estreno: ${fmtD(rd)} · faltan ${Math.ceil((rd-new Date())/864e5)} días</p>`:"";
$("sb").innerHTML=`${head(n,y)}${cdn}<p>${S[n]}</p>${crewBox(n)}<h4>Tu puntaje</h4><div class="pts">${btns}</div>${act}${msg?`<p class="nt">${msg}</p>`:""}${com}${fv}${monBox(n)}${ed}<div class="ac"><button id="rmx">Quitar de mi lista</button></div>`}
let adb=false;
async function adjust(sc,a){
const n=cur;if(adb)return;adb=true;msg="";draw();
try{const u=AB+"hit/"+NS+"/"+key(n,sc)+(a==="+"?"":"-x");
const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw 0;delete hist[n]}
catch(e){msg=a==="+"?"No se pudo sumar el voto.":"No se pudo restar el voto."}
adb=false;if(cur===n){draw();loadHist(n)}}
async function hitFav(n,k){const r=await fetch(AB+"hit/"+NS+"/"+key(n,k),{cache:"no-store"});if(!r.ok)throw 0}
async function setFav(n){
if(fbusy)return;fbusy=true;msg="";const old=fav;
fav=old===n?null:n;sv("ucm-fav-v2",{n:fav});grid();codeUpd();draw();
let fail=false;
try{if(old)await hitFav(old,"fav-x")}catch(e){fail=true}
try{if(fav)await hitFav(fav,"fav")}catch(e){fail=true}
if(fail)msg="Tu favorita se guardó en este dispositivo, pero no se pudo sumar al conteo general (sin conexión con el servidor).";
else if(old&&fav)msg="Tu favorita pasó de "+old+" a "+fav+".";
fbusy=false;delete hist[n];if(old)delete hist[old];
if(cur){draw();loadHist(cur)}}
async function enviar(){
const n=cur,v=pick[n],old=sent[n];if(!v||busy||old===v||(old&&!editing[n]))return;
busy=true;msg="";draw();
try{
const r=await fetch(AB+"hit/"+NS+"/"+key(n,v),{cache:"no-store"});
if(!r.ok)throw 0;
sent[n]=v;sv("ucm-enviados-v2",sent);
if(old){PEND[n]=(PEND[n]||[]).concat(old);sv("ucm-pend",PEND)}
codeUpd();delete hist[n];delete editing[n];grid();
}catch(e){msg="No se pudo enviar tu puntaje. Revisa tu conexión e inténtalo de nuevo."}
busy=false;
if(old&&sent[n]===v)await flushPend();
if(cur===n)draw();
if(sent[n])loadHist(n)}
function sheet(n){loadBanner(n);editing={};cur=n;vt="info";msg="";$("ov").hidden=false;document.body.style.overflow="hidden";draw();loadHist(n)}
function closeSheet(){$("ov").hidden=true;document.body.style.overflow="";cur=null}

(function(){const sh=$("sh");let y0=0,dy=0,drag=false,t0=0;
const reset=()=>{sh.style.transition="";sh.style.transform=""};
sh.addEventListener("touchstart",e=>{if(e.touches.length!==1)return;y0=e.touches[0].clientY;dy=0;drag=false;t0=Date.now();reset()},{passive:true});
sh.addEventListener("touchmove",e=>{const y=e.touches[0].clientY;if(!drag){if(sh.scrollTop>0){y0=y;return}if(y-y0>8){drag=true;sh.style.transition="none"}else return}
dy=Math.max(0,y-y0);sh.style.transform="translateY("+dy+"px)";if(e.cancelable)e.preventDefault()},{passive:false});
const end=()=>{if(!drag)return;drag=false;sh.style.transition="transform .22s ease";
if(dy>110||dy/Math.max(1,Date.now()-t0)>.6){sh.style.transform="translateY(100%)";setTimeout(()=>{closeSheet();reset()},200)}else sh.style.transform=""};
sh.addEventListener("touchend",end);sh.addEventListener("touchcancel",end)})();
$("grid").addEventListener("click",e=>{const b=e.target.closest(".inf");if(b)sheet(b.dataset.n)});
$("ov").addEventListener("click",e=>{if(e.target===$("ov"))closeSheet()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&cur)closeSheet()});
$("sb").addEventListener("click",e=>{
const p=e.target.dataset&&e.target.dataset.p;
const v=e.target.dataset&&e.target.dataset.v;if(v){vt=v;draw();return}
if(p&&(!sent[cur]||editing[cur])){pick[cur]=+p;draw()}
if(e.target.id==="chg"){editing[cur]=true;pick[cur]=sent[cur];draw();return}
if(e.target.id==="cnc"){delete editing[cur];delete pick[cur];draw();return}
if(e.target.id==="env")enviar();
const ad=e.target.dataset&&e.target.dataset.a;if(ad&&admin)adjust(+e.target.dataset.s,ad);
if(e.target.closest&&e.target.closest("#bk")){closeSheet();return}
if(e.target.closest&&e.target.closest("#rh")){delete hist[cur];draw();loadHist(cur);return}
if(e.target.closest&&e.target.closest("#fvb")){setFav(cur);return}
if(e.target.id==="rmx"){QT[cur]=1;sv("ucm-quitadas",QT);closeSheet();grid();stats();rmDraw();return}
if(e.target.id==="sn"){const c=cardOf(cur);if(c){toggle(c);draw()}}});
const ORD=["Iron Man", "El Increíble Hulk", "Iron Man 2", "Thor", "Capitán América: El primer vengador", "Los Vengadores", "Iron Man 3", "Thor: El mundo oscuro", "Capitán América: El soldado de invierno", "Guardianes de la Galaxia", "Vengadores: La era de Ultrón", "Ant-Man", "Capitán América: Civil War", "Doctor Strange", "Guardianes de la Galaxia Vol. 2", "Spider-Man: Homecoming", "Thor: Ragnarok", "Black Panther", "Vengadores: Infinity War", "Ant-Man y la Avispa", "Capitana Marvel", "Vengadores: Endgame", "Spider-Man: Lejos de casa", "Viuda Negra", "Shang-Chi", "Eternals", "Spider-Man: No Way Home", "Doctor Strange en el multiverso de la locura", "Thor: Love and Thunder", "Black Panther: Wakanda Forever", "Ant-Man y la Avispa: Quantumanía", "Guardianes de la Galaxia Vol. 3", "The Marvels", "Deadpool & Wolverine", "Capitán América: Brave New World", "Thunderbolts*", "Los 4 Fantásticos: Primeros pasos", "Spider-Man: Brand New Day", "Avengers: Doomsday", "WandaVision", "The Falcon and the Winter Soldier", "Loki", "What If...?", "Hawkeye", "Moon Knight", "Ms. Marvel", "She-Hulk: Attorney at Law", "I Am Groot", "Secret Invasion", "Loki: Temporada 2", "What If...? Temporada 2", "Echo", "X-Men '97", "Agatha All Along", "What If...? Temporada 3", "Your Friendly Neighborhood Spider-Man", "Daredevil: Born Again", "Ironheart", "Eyes of Wakanda", "Marvel Zombies", "Wonder Man", "Daredevil: Born Again Temporada 2", "VisionQuest", "The Punisher: One Last Kill", "Daredevil", "Avengers: Secret Wars", "X-Men", "X-Men 2", "X-Men: La batalla final", "X-Men orígenes: Wolverine", "X-Men: Primera generación", "Wolverine: Inmortal", "X-Men: Días del futuro pasado", "Deadpool", "X-Men: Apocalipsis", "Logan", "Deadpool 2", "X-Men: Fénix Oscura", "Los nuevos mutantes"];
const B32="0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const c3=(b,f)=>{let h=7;for(const ch of b+"."+f)h=(h*31+ch.charCodeAt(0))%32749;return B32[(h>>10)&31]+B32[(h>>5)&31]+B32[h&31]};
function enc(){let N=0n;
ORD.forEach((n,i)=>{const v=(seen[n]?11:0)+(sent[n]||0);N+=BigInt(v)*22n**BigInt(i)});
let t="";while(N>0n){t=B32[Number(N%32n)]+t;N/=32n}
const fi=fav?ORD.indexOf(fav)+1:0,f=fi>0?B32[fi>>5]+B32[fi&31]:"",b=t.padStart(35,"0");
return "U2-"+(b+c3(b,f)).match(/.{1,4}/g).join("-")+(f?"."+f:"")}
function dec(c){
const pt=String(c).split("."),cl=x=>x.toUpperCase().replace(/[^0-9A-Z]/g,"").replace(/O/g,"0").replace(/[IL]/g,"1");
let s0=cl(pt[0]);const fs=cl(pt[1]||"");let fi=0;
if(fs){if(fs.length!==2)return null;const x=B32.indexOf(fs[0]),y=B32.indexOf(fs[1]);if(x<0||y<0)return null;fi=x*32+y;if(fi>ORD.length)return null}
let body,okNew=null;
if(s0.startsWith("U2")){s0=s0.slice(2);if(s0.length<38)return null;body=s0.slice(0,-3);okNew=s0.slice(-3)===c3(body,fs)}
else{if(s0.length<36)return null;body=s0.slice(0,-1)} // formato anterior
let N=0n;for(const ch of body){const k=B32.indexOf(ch);if(k<0)return null;N=N*32n+BigInt(k)}
const out=[];let sum=0;for(let i=0;i<ORD.length;i++){const v=Number(N%22n);N/=22n;out.push(v);sum+=v*(i+1)}
if(N>0n)return null;
if(okNew===null){if(B32[sum%32]!==s0.slice(-1))return null}else if(!okNew)return null;
return{v:out,f:fi}}
function codeUpd(){const e=$("cd");if(e)e.textContent=enc()}
function cmsg(t){$("cmsg").textContent=t}
async function copyTxt(txt,btn){let ok=false;
try{await navigator.clipboard.writeText(txt);ok=true}catch(e){
try{const ta=document.createElement("textarea");ta.value=txt;ta.style.cssText="position:fixed;top:0;opacity:0";document.body.appendChild(ta);ta.focus();ta.select();ta.setSelectionRange(0,txt.length);ok=document.execCommand("copy");ta.remove()}catch(x){}}
const t0=btn.textContent;btn.textContent=ok?"¡Copiado!":"No se pudo copiar: mantené apretado el código de arriba";setTimeout(()=>btn.textContent=t0,2500);return ok}
const linkOf=()=>location.href.split("#")[0]+"#p="+enc().replace(/-/g,"");
$("cpy").onclick=()=>copyTxt(enc(),$("cpy"));
$("cpl").onclick=()=>copyTxt(linkOf(),$("cpl"));
// Busca un código válido dentro de lo que se pegó: enlace, código solo, o código con texto alrededor
function findCode(t){t=String(t||"");
const m=t.match(/[#?&]p=([0-9A-Za-z.\-]+)/);if(m){const r=dec(m[1]);if(r)return r}
const r0=dec(t);if(r0)return r0;
const c=t.match(/(?:U2-)?[0-9A-Za-z]{4}(?:-[0-9A-Za-z]{1,4})+(?:\.[0-9A-Za-z]{2})?|[0-9A-Za-z]{20,}(?:\.[0-9A-Za-z]{2})?/g)||[];
for(const x of c){const r=dec(x);if(r)return r}return null}
const sumry=r=>({s:r.v.filter(x=>x>=11).length,p:r.v.filter(x=>(x>=11?x-11:x)>0).length});
const EMPTY="Ese código no trae ninguna película ni puntaje, así que lo ignoré. Si lo copiaste de otro lado, puede haberse cortado.";
function applyCode(r){const v=r.v;seen={};sent={};
ORD.forEach((n,i)=>{const x=v[i];if(x>=11)seen[n]=true;const w=x>=11?x-11:x;if(w>0)sent[n]=w});
fav=r.f?ORD[r.f-1]:null;sv("ucm-fav-v2",{n:fav});sv("ucm-vistas",seen);sv("ucm-enviados-v2",sent);
grid();stats();if(cur)draw();
return "Listo: se cargaron "+Object.keys(seen).length+" películas vistas y "+Object.keys(sent).length+" puntajes."}
$("cld").onclick=()=>{const r=findCode($("cin").value);
if(!r){cmsg("No encontré un código válido en lo que pegaste. Revisá que esté completo o pegá el enlace entero.");return}
const q=sumry(r);if(!q.s&&!q.p&&!r.f){cmsg(EMPTY);return}
if(!confirm("Este progreso trae "+q.s+" películas vistas y "+q.p+" puntajes. Esto reemplaza el de este dispositivo. ¿Continuar?"))return;
cmsg(applyCode(r));$("cin").value=""};
// Al abrir un enlace de progreso se ofrece cargarlo
(function(){const m=location.hash.match(/^#p=([0-9A-Za-z.\-]+)/);if(!m)return;
const r=dec(m[1]);try{history.replaceState(null,"",location.href.split("#")[0])}catch(e){}
setTimeout(()=>{$("gd").open=true;
if(!r){cmsg("El enlace de progreso está incompleto o dañado.");return}
const q=sumry(r);if(!q.s&&!q.p&&!r.f){cmsg(EMPTY);return}
if(confirm("Este enlace trae "+q.s+" películas vistas y "+q.p+" puntajes. ¿Cargarlo? Reemplaza el progreso de este dispositivo."))cmsg(applyCode(r))},400)})();
const cy=(s,seed=0)=>{let h1=0xdeadbeef^seed,h2=0x41c6ce57^seed;for(let i=0,ch;i<s.length;i++){ch=s.charCodeAt(i);h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677)}h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);return 4294967296*(2097151&h2)+(h1>>>0)};
const AH=6088051037456907;let admin=false,adOpen=false;
try{admin=sessionStorage.getItem("ucm-admin")==="1"}catch(e){}
function admDraw(err){const f=$("adf");f.hidden=!adOpen&&!admin;
f.innerHTML=admin?`<span class="nt">Modo admin activo.</span><button id="adx">Salir</button>`:`<input id="adp" type="password" placeholder="Contraseña" autocomplete="off"><button id="adg">Entrar</button>${err?`<span class="nt">Contraseña incorrecta.</span>`:""}`}
function admTry(){const v=$("adp").value.trim().toLowerCase();
if(cy(v)===AH){admin=true;try{sessionStorage.setItem("ucm-admin","1")}catch(e){}admDraw()}else{admDraw(true);$("adp").focus()}}
$("ad0").onclick=()=>{adOpen=!adOpen;admDraw();if(adOpen&&!admin)$("adp").focus()};
$("adf").addEventListener("click",e=>{if(e.target.id==="adg")admTry();if(e.target.id==="adx"){admin=false;adOpen=false;try{sessionStorage.removeItem("ucm-admin")}catch(x){}admDraw()}});
$("adf").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="adp")admTry()});
admDraw();
let RMO=false;
function rmDraw(){const ns=Object.keys(QT);
$("rmv").innerHTML=ns.length?`<details class="gd"${RMO?" open":""}><summary>Quitadas de mi lista (${ns.length})</summary><div class="gdb"><p class="nt">No cuentan en el total ni en el porcentaje. Tocá Restaurar para volver a incluirlas.</p>${ns.map(n=>`<div class="rq"><span>${n}</span><button data-r="${esc(n)}">Restaurar</button></div>`).join("")}</div></details>`:""}
$("rmv").addEventListener("toggle",e=>{if(e.target.tagName==="DETAILS")RMO=e.target.open},true);
$("rmv").addEventListener("click",e=>{const r=e.target.dataset&&e.target.dataset.r;if(r){delete QT[r];sv("ucm-quitadas",QT);rmDraw();grid();stats()}});
$("shs").checked=SS;
$("shs").onchange=e=>{SS=e.target.checked;try{localStorage.setItem("ucm-series",SS?"1":"0")}catch(x){}grid();stats()};
rmDraw();
setTimeout(flushPend,2000);
tabs();grid();stats();loadPosters();
