export class UI {
  constructor() {
    this.scoreEl = document.getElementById('score-value');
    this.strikesEl = document.getElementById('strikes-value');
    this.outsEl = document.getElementById('outs-value');
    this.resultEl = document.getElementById('result-text');
    this.pitchTypeEl = document.getElementById('pitch-type');
    this.pitchMphEl = document.getElementById('pitch-mph');
    this.distanceEl = document.getElementById('distance-value');
  }

  setScore(value) {
    if (this.scoreEl) this.scoreEl.textContent = String(value);
  }

  setStrikes(value) {
    if (this.strikesEl) this.strikesEl.textContent = String(value);
  }

  setOuts(value) {
    if (this.outsEl) this.outsEl.textContent = String(value);
  }

  setResult(text) {
    if (this.resultEl) this.resultEl.textContent = text;
  }

  setPitchType(text) {
    if (this.pitchTypeEl) this.pitchTypeEl.textContent = text;
  }

  setPitchMph(value) {
    if (this.pitchMphEl) this.pitchMphEl.textContent = Math.round(value).toString();
  }

  setDistanceFeet(value) {
    if (this.distanceEl) this.distanceEl.textContent = Math.round(value).toString();
  }
}

