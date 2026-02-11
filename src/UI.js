export class UI {
  constructor() {
    this.scoreEl = document.getElementById('score-value');
    this.strikesEl = document.getElementById('strikes-value');
    this.outsEl = document.getElementById('outs-value');
    this.resultEl = document.getElementById('result-text');
    this.pitchTypeEl = document.getElementById('pitch-type');
    this.pitchMphEl = document.getElementById('pitch-mph');
    this.distanceEl = document.getElementById('distance-value');

    this.pitchButton = document.getElementById('pitch-button');
    this.zoneOverlay = document.getElementById('strike-zone-overlay');
    this.reticle = document.getElementById('reticle');

    // Normalized reticle position within zone [0,1]x[0,1]
    this.reticleU = 0.5;
    this.reticleV = 0.5;

    this._setupReticle();
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

  setPitchHandler(handler) {
    if (!this.pitchButton) return;
    this.pitchButton.addEventListener('click', (event) => {
      event.preventDefault();
      handler();
    });
  }

  _setupReticle() {
    if (!this.zoneOverlay || !this.reticle) return;

    const updateFromEvent = (event) => {
      const rect = this.zoneOverlay.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      let u = (event.clientX - rect.left) / rect.width;
      let v = (event.clientY - rect.top) / rect.height;

      u = Math.min(1, Math.max(0, u));
      v = Math.min(1, Math.max(0, v));

      this.reticleU = u;
      this.reticleV = v;
      this._updateReticlePosition();
    };

    this.zoneOverlay.addEventListener('mousemove', updateFromEvent);
    this.zoneOverlay.addEventListener('mouseenter', updateFromEvent);
  }

  _updateReticlePosition() {
    if (!this.reticle) return;
    this.reticle.style.left = `${this.reticleU * 100}%`;
    this.reticle.style.top = `${this.reticleV * 100}%`;
  }

  getReticleUV() {
    return { u: this.reticleU, v: this.reticleV };
  }

  getStrikeZoneRect() {
    if (!this.zoneOverlay) return null;
    return this.zoneOverlay.getBoundingClientRect();
  }

  setDebugPCIVisible(visible) {
    if (this.zoneOverlay) {
      this.zoneOverlay.classList.toggle('debug-pci', visible);
    }
    if (this.reticle) {
      this.reticle.classList.toggle('debug-pci', visible);
    }
  }
}

