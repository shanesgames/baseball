import * as THREE from 'three';

// MLB-style bat swing using a batPivot at the hands and keyframed poses.

export class Bat {
  constructor() {
    // Public root for world placement (e.g. moving the batter)
    this.group = new THREE.Group();

    // Pivot at the hitter's hands. All swing rotations happen here.
    this.batPivot = new THREE.Object3D();
    this.group.add(this.batPivot);

    // Create a bat profile for LatheGeometry: handle (near pivot) -> barrel
    const profile = [];
    // y along bat length, x is radius
    profile.push(new THREE.Vector2(0.02, -0.55)); // knob
    profile.push(new THREE.Vector2(0.03, -0.5));  // handle
    profile.push(new THREE.Vector2(0.035, -0.2));
    profile.push(new THREE.Vector2(0.05, 0.05));
    profile.push(new THREE.Vector2(0.06, 0.25));  // start of barrel
    profile.push(new THREE.Vector2(0.065, 0.45)); // barrel end

    const geometry = new THREE.LatheGeometry(profile, 28);
    geometry.rotateZ(Math.PI / 2);

    // Offset geometry so the handle/knob is at the pivot (origin).
    // Positive X points toward the barrel from the hands.
    geometry.translate(0.55, 0, 0);

    const material = new THREE.MeshStandardMaterial({
      color: 0xffe0a3,
      metalness: 0.1,
      roughness: 0.6
    });

    const batMesh = new THREE.Mesh(geometry, material);
    batMesh.castShadow = true;
    this.batPivot.add(batMesh);

    // Place the entire bat system near the hitter's hands in world space
    this.group.position.set(0.35, 1.15, 0.45);

    // --- Swing animation system ---

    // Total duration and contact window (normalized t)
    this.SWING_DURATION = 0.55; // seconds
    this.CONTACT_START = 0.16;
    this.CONTACT_END = 0.22;

    // Key poses (times in normalized [0,1], rotations in radians)
    // x=pitch (up/down), y=yaw (across zone), z=roll (wrist)
    this.keyframes = [
      {
        t: 0.0,
        rot: new THREE.Euler(0.10, -0.40, 0.10) // ready
      },
      {
        t: 0.10,
        rot: new THREE.Euler(0.20, -0.65, 0.18) // LOAD: small coil back/up
      },
      {
        t: 0.16,
        rot: new THREE.Euler(0.05, 0.10, -0.10) // LAUNCH: accelerating to zone
      },
      {
        t: 0.20,
        rot: new THREE.Euler(-0.05, 0.35, -0.25) // CONTACT: through the zone
      },
      {
        t: 0.35,
        rot: new THREE.Euler(-0.20, 1.05, -0.35) // FOLLOW-THROUGH: across body
      },
      {
        t: 0.55,
        rot: new THREE.Euler(0.10, -0.40, 0.10) // RECOVER: back to ready
      }
    ];

    // Internal swing state
    this.swingActive = false;
    this.swingTime = 0; // seconds

    // Start from ready pose
    this.batPivot.rotation.copy(this.keyframes[0].rot);

    // Contact point for optional world-space checks (near barrel end)
    this._contactPointLocal = new THREE.Vector3(0.95, 0, 0);

    // Debug contact sphere (wireframe)
    const debugGeo = new THREE.SphereGeometry(0.09, 10, 10);
    const debugMat = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      wireframe: true
    });
    this.debugContactSphere = new THREE.Mesh(debugGeo, debugMat);
    this.debugContactSphere.position.copy(this._contactPointLocal);
    this.debugContactSphere.visible = false;
    this.batPivot.add(this.debugContactSphere);
  }

  // Cubic easing helpers
  static easeInCubic(x) {
    return x * x * x;
  }

  static easeOutCubic(x) {
    const t = 1 - x;
    return 1 - t * t * t;
  }

  static easeInOutCubic(x) {
    if (x < 0.5) return 4 * x * x * x;
    const t = -2 * x + 2;
    return 1 - (t * t * t) / 2;
  }

  startSwing() {
    // Only allow a new swing once the previous one finished
    if (this.swingActive && this.swingTime < this.SWING_DURATION) return;
    this.swingActive = true;
    this.swingTime = 0;
  }

  update(dt) {
    if (!this.swingActive) return;

    this.swingTime += dt;
    if (this.swingTime >= this.SWING_DURATION) {
      // Clamp to final keyframe and stop
      this.swingTime = this.SWING_DURATION;
      this.swingActive = false;
      this.batPivot.rotation.copy(this.keyframes[this.keyframes.length - 1].rot);
      return;
    }

    const tNorm = this.swingTime / this.SWING_DURATION; // 0..1

    // Find surrounding keyframes
    const frames = this.keyframes;
    let i1 = 1;
    while (i1 < frames.length && tNorm > frames[i1].t) {
      i1++;
    }
    const i0 = Math.max(0, i1 - 1);
    const k0 = frames[i0];
    const k1 = frames[Math.min(i1, frames.length - 1)];

    const span = Math.max(1e-4, k1.t - k0.t);
    let localT = (tNorm - k0.t) / span;

    // Easing: use different feel per phase
    if (tNorm < 0.1) {
      // LOAD: ease-in (gentle start)
      localT = Bat.easeInCubic(localT);
    } else if (tNorm < 0.22) {
      // LAUNCH + CONTACT: aggressive ease-out (whip)
      localT = Bat.easeOutCubic(localT);
    } else if (tNorm < 0.45) {
      // FOLLOW-THROUGH: smooth in-out
      localT = Bat.easeInOutCubic(localT);
    } else {
      // RECOVER: ease-out back to ready
      localT = Bat.easeOutCubic(localT);
    }

    const r0 = k0.rot;
    const r1 = k1.rot;

    // Interpolate Euler angles component-wise
    const x = THREE.MathUtils.lerp(r0.x, r1.x, localT);
    const y = THREE.MathUtils.lerp(r0.y, r1.y, localT);
    const z = THREE.MathUtils.lerp(r0.z, r1.z, localT);

    this.batPivot.rotation.set(x, y, z);
  }

  // Contact window based on normalized swing time
  isInContactWindow() {
    if (!this.swingActive && this.swingTime >= this.SWING_DURATION) return false;
    const tNorm = this.swingTime / this.SWING_DURATION;
    return tNorm >= this.CONTACT_START && tNorm <= this.CONTACT_END;
  }

  getContactPointWorld(target = new THREE.Vector3()) {
    return this.batPivot.localToWorld(target.copy(this._contactPointLocal));
  }

  setDebugVisible(visible) {
    if (this.debugContactSphere) {
      this.debugContactSphere.visible = visible;
    }
  }
}

