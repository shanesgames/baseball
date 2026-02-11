import * as THREE from 'three';

// Bat with more realistic shape and swing keyframes around a hand pivot.

export class Bat {
  constructor() {
    this.group = new THREE.Group();

    // Create a simple bat profile for LatheGeometry: handle -> barrel
    const profile = [];
    // y goes along bat length, x is radius
    profile.push(new THREE.Vector2(0.02, -0.55)); // knob end
    profile.push(new THREE.Vector2(0.03, -0.5));  // handle
    profile.push(new THREE.Vector2(0.035, -0.2));
    profile.push(new THREE.Vector2(0.05, 0.05));
    profile.push(new THREE.Vector2(0.06, 0.25));  // start of barrel
    profile.push(new THREE.Vector2(0.065, 0.45)); // barrel

    const geometry = new THREE.LatheGeometry(profile, 24);
    geometry.rotateZ(Math.PI / 2);

    // Shift geometry so the hands/pivot are near the knob end
    geometry.translate(0.45, 0, 0);

    const material = new THREE.MeshStandardMaterial({
      color: 0xffe0a3,
      metalness: 0.1,
      roughness: 0.6
    });

    const batMesh = new THREE.Mesh(geometry, material);
    batMesh.castShadow = true;
    this.group.add(batMesh);

    // Right-handed batter: place pivot near hands
    this.group.position.set(0.4, 1.1, 0.45);

    // Keyframe rotations around the pivot (Euler in radians)
    this.restRotation = new THREE.Euler(0.2, 0.9, 0.1);      // relaxed stance
    this.loadRotation = new THREE.Euler(0.3, 1.2, 0.25);     // small coil back
    this.contactRotation = new THREE.Euler(-0.1, 0.0, -0.05); // through the zone
    this.followRotation = new THREE.Euler(-0.25, -0.4, -0.25); // follow-through

    this.group.rotation.copy(this.restRotation);

    this.isSwinging = false;
    this.swingTime = 0;

    // Timing (seconds)
    this.loadDuration = 0.08;
    this.attackDuration = 0.16; // fast whip to contact
    this.followDuration = 0.18;
    this.recoverDuration = 0.18;
    this.totalSwingDuration =
      this.loadDuration + this.attackDuration + this.followDuration + this.recoverDuration;

    // Contact window during attack phase
    this.contactWindowStartTime = this.loadDuration + this.attackDuration * 0.3;
    this.contactWindowEndTime = this.loadDuration + this.attackDuration * 0.9;

    // Local sweet spot near barrel end (for optional world checks)
    this._contactPointLocal = new THREE.Vector3(0.85, 0, 0);

    // Debug contact sphere (wireframe)
    const debugGeo = new THREE.SphereGeometry(0.09, 10, 10);
    const debugMat = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      wireframe: true
    });
    this.debugContactSphere = new THREE.Mesh(debugGeo, debugMat);
    this.debugContactSphere.position.copy(this._contactPointLocal);
    this.debugContactSphere.visible = false;
    this.group.add(this.debugContactSphere);
  }

  startSwing() {
    if (this.isSwinging) return;
    this.isSwinging = true;
    this.swingTime = 0;
  }

  update(dt) {
    if (!this.isSwinging) return;

    this.swingTime += dt;
    const t = this.swingTime;

    let fromRot = this.restRotation;
    let toRot = this.restRotation;
    let localT = 0;

    if (t <= this.loadDuration) {
      // Load phase
      fromRot = this.restRotation;
      toRot = this.loadRotation;
      localT = t / this.loadDuration;
    } else if (t <= this.loadDuration + this.attackDuration) {
      // Fast attack to contact
      fromRot = this.loadRotation;
      toRot = this.contactRotation;
      localT = (t - this.loadDuration) / this.attackDuration;
    } else if (t <= this.loadDuration + this.attackDuration + this.followDuration) {
      // Follow-through
      fromRot = this.contactRotation;
      toRot = this.followRotation;
      localT =
        (t - this.loadDuration - this.attackDuration) / this.followDuration;
    } else if (t <= this.totalSwingDuration) {
      // Recovery back to rest
      fromRot = this.followRotation;
      toRot = this.restRotation;
      localT =
        (t -
          this.loadDuration -
          this.attackDuration -
          this.followDuration) /
        this.recoverDuration;
    } else {
      this.isSwinging = false;
      this.group.rotation.copy(this.restRotation);
      return;
    }

    // Use smooth easing for transitions
    const eased = 1 - Math.pow(1 - THREE.MathUtils.clamp(localT, 0, 1), 3);

    this.group.rotation.set(
      THREE.MathUtils.lerp(fromRot.x, toRot.x, eased),
      THREE.MathUtils.lerp(fromRot.y, toRot.y, eased),
      THREE.MathUtils.lerp(fromRot.z, toRot.z, eased)
    );
  }

  isInContactWindow() {
    if (!this.isSwinging) return false;
    return (
      this.swingTime >= this.contactWindowStartTime &&
      this.swingTime <= this.contactWindowEndTime
    );
  }

  getContactPointWorld(target = new THREE.Vector3()) {
    return this.group.localToWorld(target.copy(this._contactPointLocal));
  }

  setDebugVisible(visible) {
    if (this.debugContactSphere) {
      this.debugContactSphere.visible = visible;
    }
  }
}

