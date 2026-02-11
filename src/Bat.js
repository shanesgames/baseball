import * as THREE from 'three';

export class Bat {
  constructor() {
    this.group = new THREE.Group();

    const geometry = new THREE.CylinderGeometry(0.04, 0.11, 1.0, 20);
    geometry.rotateZ(Math.PI / 2); // lay horizontal

    const material = new THREE.MeshStandardMaterial({
      color: 0xffcc66,
      metalness: 0.15,
      roughness: 0.55
    });

    const batMesh = new THREE.Mesh(geometry, material);
    batMesh.castShadow = true;
    this.group.add(batMesh);

    // Right-handed batter near home plate
    this.group.position.set(0.8, 1.0, 0.35);

    this.restRotation = new THREE.Euler(0.1, 0.5, 0);
    this.swingRotation = new THREE.Euler(-0.15, -0.4, 0);
    this.group.rotation.copy(this.restRotation);

    this.isSwinging = false;
    this.swingTime = 0;
    this.totalSwingDuration = 0.25;

    // Tight contact window
    this.contactWindowStart = 0.08;
    this.contactWindowEnd = 0.13;

    // Local sweet spot near barrel end
    this._contactPointLocal = new THREE.Vector3(0.5, -0.02, 0);

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
    const t = Math.min(this.swingTime / this.totalSwingDuration, 1);

    const eased = 1 - Math.pow(1 - t, 3);

    this.group.rotation.set(
      THREE.MathUtils.lerp(this.restRotation.x, this.swingRotation.x, eased),
      THREE.MathUtils.lerp(this.restRotation.y, this.swingRotation.y, eased),
      THREE.MathUtils.lerp(this.restRotation.z, this.swingRotation.z, eased)
    );

    if (t >= 1) {
      this.isSwinging = false;
      this.group.rotation.copy(this.restRotation);
    }
  }

  isInContactWindow() {
    return (
      this.isSwinging &&
      this.swingTime >= this.contactWindowStart &&
      this.swingTime <= this.contactWindowEnd
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

