import * as THREE from 'three';
import { Ball } from './Ball.js';
import { Bat } from './Bat.js';
import { PitcherAI } from './PitcherAI.js';

const GAME_STATES = {
  WAITING_FOR_PITCH: 'WAITING_FOR_PITCH',
  PITCHING: 'PITCHING',
  POST_MISS: 'POST_MISS',
  POST_HIT: 'POST_HIT'
};

const MPH_TO_MS = 0.44704;
const FT_PER_M = 3.28084;

export class Game {
  constructor(renderer, ui) {
    this.renderer = renderer;
    this.ui = ui;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1220);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      120
    );
    this.camera.position.set(0, 1.6, 7.5);
    this.camera.lookAt(0, 1.1, 0.5);

    // Plate / mound layout (z ~ 0 for plate plane)
    this.plateZ = 0.25;
    this.pitcherPosition = new THREE.Vector3(0, 1.1, -18.4); // ~60.5 ft
    this.strikeZoneCenterZ = this.plateZ;
    this.strikeZoneCenterY = 1.1;

    // Strike zone dimensions (in meters)
    this.strikeZoneWidth = 0.6; // ~17 inches
    this.strikeZoneHeight = 0.8;

    this.zoneLeftX = -this.strikeZoneWidth / 2;
    this.zoneRightX = this.strikeZoneWidth / 2;
    this.zoneTopY = this.strikeZoneCenterY + this.strikeZoneHeight / 2;
    this.zoneBottomY = this.strikeZoneCenterY - this.strikeZoneHeight / 2;

    this._createLights();
    this._createField();
    this._createStrikeZoneVisual();

    this.bat = new Bat();
    this.scene.add(this.bat.group);

    this.ball = new Ball();
    this.scene.add(this.ball.mesh);

    this.pitcherAI = new PitcherAI();

    // Physics
    this.gravity = new THREE.Vector3(0, -9.8, 0);
    this.pitchDragCoeff = 0.02;
    this.flightDragCoeff = 0.03;

    // Game state
    this.score = 0;
    this.strikes = 0;
    this.outs = 0;
    this.maxStrikes = 3;

    this.lastResult = 'Ready';
    this.lastPitchType = '–';
    this.lastPitchMph = 0;
    this.lastExitMph = 0;
    this.lastHitDistanceFeet = 0;
    this.lastWasFairHit = false;

    this.state = GAME_STATES.WAITING_FOR_PITCH;
    this.stateTimer = 0;
    this.pitchInterval = 1.0;
    this.postMissDelay = 0.7;
    this.postHitDelay = 1.1;

    // Current pitch info / plate call
    this.currentPitch = null;
    this.currentPitchCall = '—'; // 'Ball' or 'Strike'
    this.currentPitchHasCrossedPlate = false;

    // Hitting/contact parameters
    this.sweetSpotRadius = 0.09;
    this.maxContactRadius = 0.16;
    this.perfectTimingThreshold = 0.08;
    this.goodTimingThreshold = 0.22;
    this.idealContactZ = this.plateZ - 0.25;

    this.ball.deactivate();
    this.ball.mesh.position.set(0, -10, 0);

    this.debugStrikeZoneVisible = false;

    this._updateUI();
  }

  _createLights() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.6);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(6, 12, 3);
    dir.castShadow = true;
    dir.shadow.camera.top = 12;
    dir.shadow.camera.bottom = -6;
    dir.shadow.camera.left = -12;
    dir.shadow.camera.right = 12;
    this.scene.add(dir);
  }

  _createField() {
    const groundGeo = new THREE.PlaneGeometry(80, 80);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x246b35 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const plateGeo = new THREE.BoxGeometry(0.8, 0.05, 0.8);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.set(0, 0.03, this.plateZ);
    plate.receiveShadow = true;
    this.scene.add(plate);

    const moundGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.25, 20);
    const moundMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
    const mound = new THREE.Mesh(moundGeo, moundMat);
    mound.position.copy(this.pitcherPosition);
    mound.position.y = 0.125;
    mound.receiveShadow = true;
    this.scene.add(mound);
  }

  _createStrikeZoneVisual() {
    const boxGeo = new THREE.BoxGeometry(
      this.strikeZoneWidth,
      this.strikeZoneHeight,
      0.02
    );
    const edges = new THREE.EdgesGeometry(boxGeo);
    const mat = new THREE.LineBasicMaterial({ color: 0x00ffff });
    this.strikeZoneWire = new THREE.LineSegments(edges, mat);
    this.strikeZoneWire.position.set(
      0,
      this.strikeZoneCenterY,
      this.strikeZoneCenterZ
    );
    this.strikeZoneWire.visible = false;
    this.scene.add(this.strikeZoneWire);
  }

  update(dt) {
    this.stateTimer += dt;

    switch (this.state) {
      case GAME_STATES.WAITING_FOR_PITCH:
        if (this.stateTimer >= this.pitchInterval) {
          this._startPitch();
        }
        break;

      case GAME_STATES.PITCHING:
        this._updatePitching(dt);
        break;

      case GAME_STATES.POST_MISS:
        if (this.stateTimer >= this.postMissDelay) {
          this._resetForNextPitch();
        }
        break;

      case GAME_STATES.POST_HIT:
        this._updateBallInPlay(dt);
        if (this.stateTimer >= this.postHitDelay) {
          this._resetForNextPitch();
        }
        break;
    }

    this.bat.update(dt);
  }

  _startPitch() {
    this.state = GAME_STATES.PITCHING;
    this.stateTimer = 0;

    this.currentPitch = this.pitcherAI.chooseNextPitch();
    const speedMs = this.currentPitch.speedMph * MPH_TO_MS;
    this.lastPitchType = this.currentPitch.name;
    this.lastPitchMph = this.currentPitch.speedMph;

    // Aim around strike zone with small offsets
    const yTarget =
      this.strikeZoneCenterY + THREE.MathUtils.randFloatSpread(0.12);
    const xTarget = THREE.MathUtils.randFloatSpread(0.15);
    const target = new THREE.Vector3(xTarget, yTarget, this.strikeZoneCenterZ);

    const direction = target.clone().sub(this.pitcherPosition).normalize();
    this.ball.startPitch(this.pitcherPosition, direction, speedMs);

    this.currentPitchCall = '—';
    this.currentPitchHasCrossedPlate = false;

    this._updateUI();
  }

  _updatePitching(dt) {
    if (!this.currentPitch) return;

    const prevPos = this.ball.mesh.position.clone();

    const pitchGravity = this.gravity
      .clone()
      .multiplyScalar(this.currentPitch.gravityScale);

    this.ball.update(dt, pitchGravity, this.pitchDragCoeff);

    // Apply movement (break) as velocity changes
    this.ball.velocity.x += this.currentPitch.movementXPerSec * dt;
    this.ball.velocity.y += this.currentPitch.movementYPerSec * dt;

    // Plate crossing detection (for balls/strikes)
    this._checkPlateCrossing(prevPos, this.ball.mesh.position);

    // Check for hit contact while pitch is in flight
    if (this.bat.isInContactWindow() && !this.ball.isHit && this.ball.isActive) {
      this._checkForHit();
    }

    const pos = this.ball.mesh.position;

    // Pitch is over once it travels well past plate or buries
    if (pos.z > this.strikeZoneCenterZ + 1.0 && this.ball.isActive && !this.ball.isHit) {
      if (this.currentPitchCall === 'Strike') {
        this._registerMiss('Strike (looking)');
      } else if (this.currentPitchCall === 'Ball') {
        this._registerBall();
      } else {
        this._registerMiss('Miss');
      }
    }

    if (pos.y < 0 && this.ball.isActive && !this.ball.isHit) {
      // Spiked / in dirt: usually a ball
      this._registerBall('In the dirt');
    }
  }

  _checkPlateCrossing(prevPos, currPos) {
    if (
      this.currentPitchHasCrossedPlate ||
      !this.ball.isActive ||
      this.ball.isHit
    ) {
      return;
    }

    const plateZ = this.plateZ;
    const prevZ = prevPos.z;
    const currZ = currPos.z;

    if (prevZ < plateZ && currZ >= plateZ) {
      const t = (plateZ - prevZ) / (currZ - prevZ);
      const intersection = new THREE.Vector3().lerpVectors(prevPos, currPos, t);
      this._callPitchAtPlate(intersection);
      this.currentPitchHasCrossedPlate = true;
    }
  }

  _callPitchAtPlate(pos) {
    const inX = pos.x >= this.zoneLeftX && pos.x <= this.zoneRightX;
    const inY = pos.y >= this.zoneBottomY && pos.y <= this.zoneTopY;

    this.currentPitchCall = inX && inY ? 'Strike' : 'Ball';
  }

  _updateBallInPlay(dt) {
    if (!this.ball.isActive) return;

    this.ball.update(dt, this.gravity, this.flightDragCoeff);

    const p = this.ball.mesh.position;

    if (p.y <= 0) {
      const dx = p.x;
      const dz = p.z - this.plateZ;
      const horizDistM = Math.sqrt(dx * dx + dz * dz);
      const horizDistFt = horizDistM * FT_PER_M;
      this.lastHitDistanceFeet = horizDistFt;

      if (this.lastWasFairHit && this.lastHitDistanceFeet > 0) {
        const distanceScore = this.lastHitDistanceFeet * 0.5;
        const exitBonus = Math.max(0, this.lastExitMph - 60) * 1.1;
        const points = Math.round(distanceScore + exitBonus);
        this.score += points;
      }

      this.ball.deactivate();
      this._updateUI();
      return;
    }

    const maxDistance = 150;
    if (p.lengthSq() > maxDistance * maxDistance) {
      this.ball.deactivate();
    }
  }

  _checkForHit() {
    const ballPos = this.ball.mesh.position.clone();
    const contactPoint = this.bat.getContactPointWorld();

    const centerDist = ballPos.distanceTo(contactPoint);
    if (centerDist > this.maxContactRadius) {
      return;
    }

    const timingOffset = ballPos.z - this.idealContactZ;
    const absTiming = Math.abs(timingOffset);

    let timingLabel;
    if (absTiming <= this.perfectTimingThreshold) {
      timingLabel = 'Perfect';
    } else if (absTiming <= this.goodTimingThreshold) {
      timingLabel = 'Good';
    } else {
      timingLabel = 'Foul';
    }

    let barrelQuality;
    if (centerDist <= this.sweetSpotRadius) {
      barrelQuality = 1;
    } else {
      const t =
        (centerDist - this.sweetSpotRadius) /
        (this.maxContactRadius - this.sweetSpotRadius);
      barrelQuality = 1 - THREE.MathUtils.clamp(t, 0, 1);
    }

    let timingQuality;
    if (absTiming <= this.perfectTimingThreshold) {
      timingQuality = 1;
    } else if (absTiming >= this.goodTimingThreshold) {
      timingQuality = 0;
    } else {
      const t =
        (absTiming - this.perfectTimingThreshold) /
        (this.goodTimingThreshold - this.perfectTimingThreshold);
      timingQuality = 1 - THREE.MathUtils.clamp(t, 0, 1);
    }

    const verticalOffset = ballPos.y - contactPoint.y;
    const verticalQuality = 1 - Math.min(Math.abs(verticalOffset) / 0.4, 1);

    const quality =
      0.55 * barrelQuality + 0.35 * timingQuality + 0.1 * verticalQuality;

    const isTimingFoul = timingLabel === 'Foul';
    const isWeakContact = quality < 0.25;
    const isFoul = isTimingFoul || isWeakContact;

    const minExitMph = 60;
    const maxExitMph = 110;
    const clampedQ = THREE.MathUtils.clamp(quality, 0, 1);
    const exitMph = minExitMph + (maxExitMph - minExitMph) * clampedQ;
    const exitMs = exitMph * MPH_TO_MS;
    this.lastExitMph = exitMph;

    let launchAngleDeg = 10 + 20 * clampedQ;
    if (verticalOffset < -0.05) launchAngleDeg += 10;
    else if (verticalOffset > 0.05) launchAngleDeg -= 10;
    launchAngleDeg = THREE.MathUtils.clamp(launchAngleDeg, -5, 45);

    const horizDir = new THREE.Vector3(0, 0, -1);
    const elevRad = THREE.MathUtils.degToRad(launchAngleDeg);
    const baseDir = new THREE.Vector3(
      horizDir.x,
      Math.tan(elevRad),
      horizDir.z
    ).normalize();

    const pullAngleMax = THREE.MathUtils.degToRad(35);
    const pullFactor = THREE.MathUtils.clamp(
      -timingOffset / this.goodTimingThreshold,
      -1,
      1
    );
    const sideAngle = pullAngleMax * pullFactor;

    const launchDir = baseDir.clone();
    launchDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), sideAngle);

    const sprayAngle = THREE.MathUtils.degToRad(3);
    launchDir.applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      THREE.MathUtils.randFloatSpread(sprayAngle)
    );

    launchDir.normalize().multiplyScalar(exitMs);
    this.ball.launch(launchDir);

    this.lastWasFairHit = !isFoul;

    if (isFoul) {
      this._registerFoul();
    } else {
      this.lastResult = timingLabel === 'Perfect' ? 'Perfect' : 'Good';
      this.state = GAME_STATES.POST_HIT;
      this.stateTimer = 0;
    }

    this._updateUI();
  }

  _registerMiss(label) {
    if (this.state !== GAME_STATES.PITCHING) return;

    this.lastResult = label || 'Miss';

    // Simple strikes / outs for now
    this.strikes += 1;
    if (this.strikes >= this.maxStrikes) {
      this.strikes = 0;
      this.outs += 1;
    }

    this.state = GAME_STATES.POST_MISS;
    this.stateTimer = 0;
    this.ball.deactivate();
    this.ball.mesh.position.set(0, -10, 0);
    this._updateUI();
  }

  _registerBall(optionalLabel) {
    if (this.state !== GAME_STATES.PITCHING) return;

    this.lastResult = optionalLabel || 'Ball';

    // Full count/at-bat logic comes in Stage 3.
    this.state = GAME_STATES.POST_MISS;
    this.stateTimer = 0;
    this.ball.deactivate();
    this.ball.mesh.position.set(0, -10, 0);
    this._updateUI();
  }

  _registerFoul() {
    if (this.strikes < 2) {
      this.strikes += 1;
    }
    this.lastResult = 'Foul';
    this.state = GAME_STATES.POST_HIT;
    this.stateTimer = 0;
    this._updateUI();
  }

  _resetForNextPitch() {
    this.state = GAME_STATES.WAITING_FOR_PITCH;
    this.stateTimer = 0;

    if (!this.ball.isActive) {
      this.ball.mesh.position.set(0, -10, 0);
    }

    this.currentPitch = null;
    this.currentPitchCall = '—';
  }

  _updateUI() {
    if (!this.ui) return;
    this.ui.setScore(this.score);
    this.ui.setStrikes(this.strikes);
    this.ui.setOuts(this.outs);
    this.ui.setResult(this.lastResult);
    this.ui.setPitchType(this.lastPitchType);
    this.ui.setPitchMph(this.lastPitchMph);
    this.ui.setDistanceFeet(this.lastHitDistanceFeet);
  }

  handleSwing() {
    if (
      this.state === GAME_STATES.WAITING_FOR_PITCH ||
      this.state === GAME_STATES.PITCHING
    ) {
      this.bat.startSwing();
    }
  }

  onResize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setDebugVisible(visible) {
    this.debugStrikeZoneVisible = visible;
    if (this.strikeZoneWire) {
      this.strikeZoneWire.visible = visible;
    }
    if (this.bat) {
      this.bat.setDebugVisible(visible);
    }
  }

  getDebugInfo() {
    const pos = this.ball.mesh.position;
    const vel = this.ball.velocity;

    return {
      state: this.state,
      pitchType: this.currentPitch ? this.currentPitch.name : 'None',
      pitchMph: this.currentPitch ? this.currentPitch.speedMph : 0,
      lastCall: this.currentPitchCall,
      ballPosition: { x: pos.x, y: pos.y, z: pos.z },
      ballVelocity: { x: vel.x, y: vel.y, z: vel.z }
    };
  }
}

