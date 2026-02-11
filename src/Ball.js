import * as THREE from 'three';

export class Ball {
  constructor() {
    const geometry = new THREE.SphereGeometry(0.12, 20, 20);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.0
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    this.velocity = new THREE.Vector3();
    this.isActive = false;
    this.isHit = false;
  }

  startPitch(startPosition, direction, speed) {
    this.mesh.position.copy(startPosition);
    this.velocity.copy(direction).setLength(speed);
    this.isActive = true;
    this.isHit = false;
  }

  launch(newVelocity) {
    this.velocity.copy(newVelocity);
    this.isHit = true;
    this.isActive = true;
  }

  deactivate() {
    this.isActive = false;
  }

  update(dt, gravity, dragCoeff = 0) {
    if (!this.isActive) return;

    if (gravity) {
      this.velocity.addScaledVector(gravity, dt);
    }

    if (dragCoeff > 0) {
      const speed = this.velocity.length();
      if (speed > 0.0001) {
        const dragMag = dragCoeff * speed * speed;
        const drag = this.velocity.clone().normalize().multiplyScalar(-dragMag);
        this.velocity.addScaledVector(drag, dt);
      }
    }

    this.mesh.position.addScaledVector(this.velocity, dt);
  }
}

