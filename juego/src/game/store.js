// Ajustes y récords guardados en el navegador.
const KEY = 'horizonte-v1';

export class Store {
  constructor(defaults) {
    this.settings = { ...defaults };
    this.scores = {};
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || '{}');
      Object.assign(this.settings, d.settings || {});
      this.scores = d.scores || {};
    } catch (e) { /* almacenamiento no disponible */ }
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ settings: this.settings, scores: this.scores })); } catch (e) { /* ignorar */ }
  }
  record(id, total, stars) {
    const s = this.scores[id];
    if (!s || total > s.best) { this.scores[id] = { best: total, stars }; this.save(); return true; }
    return false;
  }
}
