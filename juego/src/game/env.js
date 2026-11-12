// Estado del entorno: hora, astros, meteorología.
import { sunDirection, moonState, starRotation } from '../world/celestial.js';

export class Environment {
  constructor() {
    this.timeOfDay = 10.5;   // horas locales
    this.dayOfYear = 172;
    this.latitude = 28;
    this.moonPhase = 0.46;
    this.timeScale = 1;      // segundos simulados por segundo real
    this.time = 0;           // tiempo transcurrido (s), para animaciones
    this.haze = 3.0;         // escala de aerosoles (1 = aire muy limpio)
    this.wind = { dir: 250, speed: 4 }; // de dónde viene (grados) y m/s
    this.rain = 0;           // intensidad de lluvia (0..1)
    this.clouds = { coverage: 0.42, base: 1500, top: 3600 };
    this.sunE0 = [1.0, 0.98, 0.95];
    this.sunDir = [0, 1, 0];
    this.moonDir = [0, -1, 0];
    this.moonFraction = 1;
    this.moonE0 = [0, 0, 0];
    this.starRot = new Float32Array(9);
    this.update(0);
  }
  update(dt) {
    this.time += dt;
    this.timeOfDay = (this.timeOfDay + (dt * this.timeScale) / 3600 + 24) % 24;
    this.sunDir = sunDirection(this.timeOfDay, this.dayOfYear, this.latitude);
    const m = moonState(this.timeOfDay, this.dayOfYear, this.latitude, this.moonPhase);
    this.moonDir = m.dir;
    this.moonFraction = m.fraction;
    const k = 2.4e-6 * m.fraction;
    this.moonE0 = [k, k, k * 1.02];
    this.starRot = starRotation(this.timeOfDay, this.dayOfYear, this.latitude);
  }
  // Luz principal para sombras: el Sol mientras esté sobre el horizonte; si no, la Luna.
  get primaryLight() { return this.sunDir[1] > -0.035 ? this.sunDir : this.moonDir; }
}
