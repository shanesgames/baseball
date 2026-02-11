export class DebugOverlay {
  constructor() {
    this.container = document.getElementById('debug-overlay');
    this.textEl = document.getElementById('debug-text');
    this.visible = false;
  }

  toggle() {
    this.visible = !this.visible;
    if (this.container) {
      this.container.classList.toggle('debug-hidden', !this.visible);
    }
  }

  update(info) {
    if (!this.visible || !this.textEl) return;
    const {
      fps = 0,
      state = 'UNKNOWN',
      pitchType = 'None',
      pitchMph = 0,
      lastCall = '—',
      ballPosition = { x: 0, y: 0, z: 0 },
      ballVelocity = { x: 0, y: 0, z: 0 }
    } = info;

    const formatVec = (v) =>
      `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;

    const lines = [
      `FPS:        ${fps.toFixed(1)}`,
      `State:      ${state}`,
      `Pitch:      ${pitchType}`,
      `Pitch mph:  ${pitchMph.toFixed(1)}`,
      `Last call:  ${lastCall}`,
      '',
      `Ball pos:   ${formatVec(ballPosition)}`,
      `Ball vel:   ${formatVec(ballVelocity)}`
    ];

    this.textEl.textContent = lines.join('\n');
  }
}

