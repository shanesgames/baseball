// Simple pitcher AI: chooses pitch types and concrete pitch parameters.

export const PITCH_CODES = {
  FOUR_SEAM: 'FOUR_SEAM',
  SLIDER: 'SLIDER',
  CURVE: 'CURVE',
  CHANGEUP: 'CHANGEUP'
};

export class PitcherAI {
  constructor() {
    this.pitchDefs = [
      {
        code: PITCH_CODES.FOUR_SEAM,
        name: 'Four-seam Fastball',
        speedMin: 93,
        speedMax: 98,
        movementXPerSec: 0.8, // small arm-side run
        movementYPerSec: 0.5, // a bit of ride
        gravityScale: 0.55,
        usageWeight: 0.5
      },
      {
        code: PITCH_CODES.SLIDER,
        name: 'Slider',
        speedMin: 84,
        speedMax: 89,
        movementXPerSec: -1.6, // glove-side sweep
        movementYPerSec: -1.5, // modest drop
        gravityScale: 0.9,
        usageWeight: 0.2
      },
      {
        code: PITCH_CODES.CURVE,
        name: 'Curveball',
        speedMin: 76,
        speedMax: 82,
        movementXPerSec: -0.6, // small glove-side
        movementYPerSec: -6.0, // big downward break
        gravityScale: 1.4,
        usageWeight: 0.15
      },
      {
        code: PITCH_CODES.CHANGEUP,
        name: 'Changeup',
        speedMin: 80,
        speedMax: 86,
        movementXPerSec: 0.4, // arm-side fade
        movementYPerSec: 0.8,
        gravityScale: 0.9,
        usageWeight: 0.15
      }
    ];
  }

  // In future we can factor in count, hitter hot zones, etc.
  chooseNextPitch(/*context*/) {
    const def = this._chooseWeightedRandom(this.pitchDefs);

    const speedMph =
      def.speedMin +
      Math.random() * (def.speedMax - def.speedMin); // uniform in range

    // Slight random variation on movement
    const vary = (base, pct) => base + base * pct * (Math.random() - 0.5) * 2;

    const movementXPerSec = vary(def.movementXPerSec, 0.25);
    const movementYPerSec = vary(def.movementYPerSec, 0.25);
    const gravityScale = vary(def.gravityScale, 0.15);

    return {
      code: def.code,
      name: def.name,
      speedMph,
      movementXPerSec,
      movementYPerSec,
      gravityScale
    };
  }

  _chooseWeightedRandom(list) {
    const total = list.reduce((sum, p) => sum + p.usageWeight, 0);
    let r = Math.random() * total;
    for (const item of list) {
      if (r < item.usageWeight) return item;
      r -= item.usageWeight;
    }
    return list[list.length - 1];
  }
}

