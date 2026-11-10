// Interfaz del juego (menús en DOM): carga, menú principal, misiones, vuelo libre, ajustes,
// ayuda, pausa y resultados. La escena 3D sigue viva detrás.
import { MISSIONS, FREE_FLIGHT } from '../game/missions.js';
import { AIRPORTS } from '../world/airports.js';

const stars = (n, big = false) => `<span class="stars${big ? ' big' : ''}">${'★'.repeat(n)}<s>${'★'.repeat(3 - n)}</s></span>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TIMES = [['Amanecer', 6.4], ['Mañana', 9.5], ['Mediodía', 13], ['Tarde', 16.8], ['Atardecer', 18.7], ['Noche', 22.5]];
const SKIES = [['Despejado', 0.04], ['Algunas nubes', 0.3], ['Nuboso', 0.55], ['Cubierto', 0.86]];
const WINDS = [['Calma', 1], ['Brisa', 4], ['Fresco', 7.5], ['Fuerte', 11]];
const VIS = [['Cristalina', 1.4], ['Normal', 3], ['Calima', 7]];
const STARTS = [['En pista', 'runway'], ['En final (5 km)', 'final'], ['En el aire', 'air']];
const QUAL = [['Bajo', 'low'], ['Medio', 'medium'], ['Alto', 'high'], ['Ultra', 'ultra']];

export class Shell {
  constructor(root, store, handlers) {
    this.root = root;
    this.store = store;
    this.h = handlers;       // { startMission(m, opts), resume(), restart(), quit(), applySettings() }
    this.screen = null;
    this.free = { airport: 'HZPA', end: 0, start: 'runway', time: 10.5, sky: 0.3, wind: 4, windDir: null, vis: 3, turb: true };
    this.isTouch = false;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      this._act(b.dataset.a, b.dataset.v, b);
    });
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.s) { this.store.settings[t.dataset.s] = +t.value; this.store.save(); this.h.applySettings(); }
      if (t.dataset.f === 'time') { this.free.time = +t.value; const o = root.querySelector('#ftime'); if (o) o.textContent = this._hhmm(this.free.time); this.h.preview(this.free); }
    });
  }

  _hhmm(t) { return `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 60)).padStart(2, '0')}`; }
  _set(html, cls = 'dim') { this.root.className = cls; this.root.innerHTML = html; }
  hide() { this.screen = null; this.root.className = ''; this.root.innerHTML = ''; }

  loading(frac, text) {
    if (this.screen !== 'loading') {
      this.screen = 'loading';
      this._set(`<div class="load"><h1 class="logo">HORIZONTE</h1><p class="tag">Simulador de vuelo</p><div class="bar"><i id="lb"></i></div><p id="lt"></p></div>`, 'solid');
    }
    this.root.querySelector('#lb').style.width = `${Math.round(frac * 100)}%`;
    this.root.querySelector('#lt').textContent = text;
  }

  error(msg) {
    this.screen = 'error';
    this._set(`<div class="card mid"><h2>No se pudo iniciar</h2><p>${esc(msg)}</p><p class="sub">Horizonte necesita un navegador actual con WebGL 2 (Chrome, Edge, Firefox o Safari recientes) y aceleración gráfica activada.</p></div>`, 'solid');
  }

  menu() {
    this.screen = 'menu';
    this._set(`<div class="card menu">
      <h1 class="logo">HORIZONTE</h1><p class="tag">Simulador de vuelo</p>
      <div class="stack">
        <button class="primary" data-a="quick">Volar ahora</button>
        <button data-a="missions">Misiones</button>
        <button data-a="free">Vuelo libre</button>
        <div class="row"><button class="ghost" data-a="help">Controles</button><button class="ghost" data-a="settings">Ajustes</button></div>
      </div>
      <p class="sub" style="margin-top:14px;font-size:.8rem">Isla Aurora · 4 aeródromos · física de vuelo real</p>
    </div>`);
  }

  missions() {
    this.screen = 'missions';
    const sc = this.store.scores;
    const cards = MISSIONS.map((m) => {
      const s = sc[m.id];
      return `<button class="mis" data-a="mission" data-v="${m.id}">
        <b>${esc(m.title)}</b><span>${esc(m.desc)}</span>
        <div class="meta"><span class="lvl">${[1, 2, 3, 4].map((i) => `<i class="${i <= m.level ? 'on' : ''}"></i>`).join('')}</span>${s ? `${stars(s.stars)} <span>${s.best}</span>` : '<span>Sin volar</span>'}</div>
      </button>`;
    }).join('');
    this._set(`<div class="card wide"><div class="head"><button class="back" data-a="menu">‹ Menú</button><h2>Misiones</h2></div><div class="grid">${cards}</div></div>`);
  }

  freeSetup() {
    this.screen = 'free';
    const f = this.free;
    const seg = (name, list, cur) => `<div class="seg">${list.map(([l, v]) => `<button data-a="f" data-v="${name}:${v}" class="${String(cur) === String(v) ? 'sel' : ''}">${l}</button>`).join('')}</div>`;
    const ap = AIRPORTS.find((a) => a.id === f.airport);
    this._set(`<div class="card mid">
      <div class="head"><button class="back" data-a="menu">‹ Menú</button><h2>Vuelo libre</h2></div>
      <div class="opt"><label>Aeródromo</label>${seg('airport', AIRPORTS.map((a) => [`${a.name}`, a.id]), f.airport)}</div>
      <div class="opt"><label>Pista</label>${seg('end', [[ap.numbers[0], 0], [ap.numbers[1], 1]], f.end)}</div>
      <div class="opt"><label>Inicio</label>${seg('start', STARTS, f.start)}</div>
      <div class="opt"><label>Hora <b id="ftime">${this._hhmm(f.time)}</b></label><div><input type="range" min="0" max="23.9" step="0.1" value="${f.time}" data-f="time">${seg('time', TIMES, f.time)}</div></div>
      <div class="opt"><label>Cielo</label>${seg('sky', SKIES, f.sky)}</div>
      <div class="opt"><label>Viento</label>${seg('wind', WINDS, f.wind)}</div>
      <div class="opt"><label>Visibilidad</label>${seg('vis', VIS, f.vis)}</div>
      <div class="stack" style="margin-top:14px"><button class="primary" data-a="freeGo">Despegar</button></div>
    </div>`);
  }

  settings(fromPause = false) {
    this.screen = 'settings';
    const s = this.store.settings;
    const seg = (name, list, cur) => `<div class="seg">${list.map(([l, v]) => `<button data-a="s" data-v="${name}:${v}" class="${String(cur) === String(v) ? 'sel' : ''}">${l}</button>`).join('')}</div>`;
    this._set(`<div class="card mid">
      <div class="head"><button class="back" data-a="${fromPause ? 'pauseBack' : 'menu'}">‹ Volver</button><h2>Ajustes</h2></div>
      <h3>Gráficos</h3>
      <div class="opt"><label>Calidad</label>${seg('quality', QUAL, s.quality)}</div>
      <p class="sub" style="font-size:.84rem">Cambiar la calidad regenera el mundo (recarga el juego). Si va lento, prueba un nivel menos.</p>
      <div class="opt"><label>Resolución</label>${seg('autoRes', [['Automática', 1], ['Fija', 0]], s.autoRes)}</div>
      <div class="opt"><label>Nubes</label>${seg('clouds', [['Volumétricas', 1], ['Desactivadas', 0]], s.clouds)}</div>
      <h3>Sonido</h3>
      <div class="opt"><label>Volumen</label><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-s="volume"></div>
      <h3>Ayudas al pilotaje</h3>
      <div class="opt"><label>Timón</label>${seg('autoRudder', [['Automático', 1], ['Manual (A / D)', 0]], s.autoRudder)}</div>
      <div class="opt"><label>Daños</label>${seg('damage', [['Realistas', 1], ['Desactivados', 0]], s.damage)}</div>
      <div class="opt"><label>Paso del tiempo</label>${seg('timeScale', [['Real', 1], ['×20', 20], ['×120', 120]], s.timeScale)}</div>
    </div>`);
    this._fromPause = fromPause;
  }

  help(fromPause = false) {
    this.screen = 'help';
    const k = (a, b) => `<kbd>${a}</kbd><span>${b}</span>`;
    this._set(`<div class="card wide">
      <div class="head"><button class="back" data-a="${fromPause ? 'pauseBack' : 'menu'}">‹ Volver</button><h2>Controles</h2></div>
      <div class="cols">
        <div><h3>Vuelo</h3><div class="kv">
          ${k('↑ ↓', 'Cabeceo: ↓ tira de la palanca (morro arriba)')}${k('← →', 'Alabeo (y dirección en tierra)')}
          ${k('W S', 'Más / menos gases')}${k('1…9, 0', 'Gases al 10–90 % / 100 %')}
          ${k('A D', 'Timón de dirección')}${k('F V', 'Bajar / subir flaps')}
          ${k('Espacio', 'Frenos')}${k('B', 'Freno de estacionamiento')}
          ${k('T G', 'Compensador: morro arriba / abajo')}${k('E', 'Arrancar o parar el motor')}
          ${k('Y', 'Pilotar con el ratón (yugo)')}
        </div></div>
        <div><h3>Vista y juego</h3><div class="kv">
          ${k('C', 'Cambiar cámara: exterior, cabina, sobrevuelo')}${k('Arrastrar', 'Mirar alrededor')}
          ${k('Rueda', 'Zoom')}${k('X', 'Recentrar la vista')}
          ${k('M', 'Mapa')}${k('Tab', 'Cambiar HUD')}
          ${k('L', 'Luces del avión')}${k('R', 'Reiniciar')}
          ${k('Esc / P', 'Pausa')}
        </div>
        <h3>Mando</h3><div class="kv">${k('Palanca izq.', 'Cabeceo y alabeo')}${k('Palanca der.', 'Timón')}${k('RT / LT', 'Gases')}${k('X / B', 'Flaps')}${k('A', 'Frenos')}${k('Y', 'Cámara')}</div>
        </div>
      </div>
      <h3>Para despegar</h3>
      <p class="sub">Suelta el freno (B), gases a fondo (W), mantén el eje, y a 55 nudos tira suavemente (↓). Asciende a unos 75 nudos.</p>
      <h3>Para aterrizar</h3>
      <p class="sub">Reduce gases, baja flaps por debajo de 85 nudos, aproxima a 65 nudos apuntando al inicio de la pista; a pocos metros corta gases y sube el morro para posarte con las ruedas principales. Frena con Espacio.</p>
    </div>`);
  }

  pause(title = 'Pausa') {
    this.screen = 'pause';
    this._set(`<div class="card menu">
      <h2>${esc(title)}</h2>
      <div class="stack" style="margin-top:12px">
        <button class="primary" data-a="resume">Continuar</button>
        <button data-a="restart">Reiniciar</button>
        <div class="row"><button class="ghost" data-a="helpP">Controles</button><button class="ghost" data-a="settingsP">Ajustes</button></div>
        <button class="ghost" data-a="quit">Salir al menú</button>
      </div>
    </div>`);
  }

  result(r, mission) {
    this.screen = 'result';
    if (!r.ok) {
      this._set(`<div class="card res"><h2>${esc(mission ? mission.title : 'Vuelo')}</h2>
        <p class="fail">${esc(r.reason || 'Misión fallida')}</p>
        <p class="sub">${r.crash ? 'Los aviones perdonan poco cerca del suelo. Inténtalo de nuevo.' : 'Casi. Vuelve a intentarlo.'}</p>
        <div class="stack" style="margin-top:14px"><button class="primary" data-a="restart">Reintentar</button><button class="ghost" data-a="quit">Menú</button></div></div>`);
      return;
    }
    const parts = (r.parts || []).map((p) => {
      const cls = p.score > 0.8 ? '' : p.score > 0.5 ? 'm' : 'l';
      return `<div class="part"><span>${esc(p.label)}<br><em style="text-align:left">${esc(p.value)}</em></span><div class="pb"><i class="${cls}" style="width:${Math.round(p.score * 100)}%"></i></div><em>${esc(p.note)}</em></div>`;
    }).join('');
    const idx = mission ? MISSIONS.findIndex((m) => m.id === mission.id) : -1;
    const next = idx >= 0 && idx < MISSIONS.length - 1 ? MISSIONS[idx + 1] : null;
    this._set(`<div class="card res"><h2>${esc(mission ? mission.title : 'Aterrizaje')}</h2>
      ${stars(r.stars || 0, true)}
      <div class="score">${r.total}<small> / 100</small></div>
      ${r.text ? `<p>${esc(r.text)}</p>` : ''}
      ${parts ? `<div style="margin:14px 0 4px">${parts}</div>` : ''}
      ${r.stoppedOnRunway === false ? '<p class="sub">Te has salido de la pista en la carrera.</p>' : ''}
      <div class="stack" style="margin-top:14px">
        ${next ? `<button class="primary" data-a="mission" data-v="${next.id}">Siguiente: ${esc(next.title)}</button>` : ''}
        <div class="row"><button data-a="restart">Repetir</button><button data-a="continueFree">Seguir volando</button></div>
        <button class="ghost" data-a="quit">Menú</button>
      </div></div>`);
  }

  _act(a, v, el) {
    const h = this.h;
    if (h.click) h.click();
    switch (a) {
      case 'menu': this.menu(); h.preview(null); break;
      case 'missions': this.missions(); break;
      case 'free': this.freeSetup(); h.preview(this.free); break;
      case 'help': this.help(false); break;
      case 'helpP': this.help(true); break;
      case 'settings': this.settings(false); break;
      case 'settingsP': this.settings(true); break;
      case 'pauseBack': this.pause(); break;
      case 'quick': h.startMission(MISSIONS[0]); break;
      case 'mission': h.startMission(MISSIONS.find((m) => m.id === v)); break;
      case 'freeGo': h.startMission(this.freeMission()); break;
      case 'resume': h.resume(); break;
      case 'restart': h.restart(); break;
      case 'quit': h.quit(); break;
      case 'continueFree': h.continueFree(); break;
      case 'f': {
        const [k, val] = v.split(':');
        this.free[k] = k === 'airport' || k === 'start' ? val : +val;
        if (k === 'airport') this.free.end = 0;
        this.freeSetup();
        h.preview(this.free);
        break;
      }
      case 's': {
        const [k, val] = v.split(':');
        const s = this.store.settings;
        const old = s[k];
        s[k] = k === 'quality' ? val : +val;
        this.store.save();
        if (k === 'quality' && old !== val) { h.reload(); return; }
        h.applySettings();
        this.settings(this._fromPause);
        break;
      }
      default: break;
    }
    void el;
  }

  // Construye la misión de vuelo libre a partir de las opciones elegidas.
  freeMission() {
    const f = this.free;
    const ap = AIRPORTS.find((a) => a.id === f.airport);
    const hdg = f.end === 0 ? ap.heading : (ap.heading + 180) % 360;
    const start = f.start === 'runway' ? { airport: f.airport, end: f.end }
      : f.start === 'final' ? { airport: f.airport, end: f.end, approach: 5, speed: 72, flaps: 1 / 3, throttle: 0.42 }
        : { air: { x: ap.x, z: ap.z, alt: ap.elev + 950, heading: hdg, speed: 52, throttle: 0.72 } };
    // viento alineado ±30° con la pista en uso
    const dir = (hdg + 20 + 360) % 360;
    return { ...FREE_FLIGHT, env: { time: f.time, coverage: f.sky, wind: { dir, speed: f.wind }, haze: f.vis, turbulence: 1 }, start };
  }
}
