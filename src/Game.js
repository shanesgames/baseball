import * as THREE from 'three';
import { Ball } from './Ball.js';
import { Bat } from './Bat.js';

const GAME_STATES = {
  IDLE: 'IDLE',
  PITCHING: 'PITCHING',
  SWINGING: 'SWINGING',
  BALL_IN_PLAY: 'BALL_IN_PLAY',
  RESULT: 'RESULT'
};

const MPH_TO_MS = 0.44704;
const FT_PER_M = 3.28084;

export class Game {
  constructor(renderer, ui) {
    this.renderer = renderer;
    this.ui = ui;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1220);

    // Camera config (batter POV)
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      120
    );

    this.cameraConfig = {
      distance: 5.5, // meters behind plate
      height: 1.4,
      fov: 55
    };

    // Plate / mound layout (z ~ 0 for plate plane)
    this.plateZ = 0.25;
    this.pitcherPosition = new THREE.Vector3(0, 1.1, -18.4); // ~60.5 ft
    this.strikeZoneCenterZ = this.plateZ;
    this.strikeZoneCenterY = 1.1;

    this._applyCameraConfig();

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
    this._createCharacters();

    this.bat = new Bat();
    this.scene.add(this.bat.group);

    this.ball = new Ball();
    this.scene.add(this.ball.mesh);

    // Physics
    this.gravity = new THREE.Vector3(0, -9.8, 0);
    this.pitchDragCoeff = 0.02;
    this.flightDragCoeff = 0.03;

    // Base ranges for pitch variability (all fastballs for now)
    this.pitchBaseConfig = {
      speedMin: 88,
      speedMax: 97,
      moveXMin: -0.9,
      moveXMax: 0.9,
      moveYMin: -1.0,
      moveYMax: 0.2,
      gravityScaleMin: 0.55,
      gravityScaleMax: 0.9
    };

    // These are set fresh every pitch
    this.pitchSpeedMph = 92;
    this.pitchMoveXPerSec = 0.0;
    this.pitchMoveYPerSec = 0.0;
    this.pitchGravityScale = 0.75;

    // Game state
    this.score = 0;
    this.strikes = 0;
    this.outs = 0;
    this.maxStrikes = 3;

    this.lastResult = 'Ready';
    this.lastPitchType = 'Fastball';
    this.lastPitchMph = this.pitchSpeedMph;
    this.lastExitMph = 0;
    this.lastHitDistanceFeet = 0;
    this.lastWasFairHit = false;

    this.state = GAME_STATES.IDLE;
    this.stateTimer = 0;
    this.resultDelay = 1.2;

    // Current pitch info / plate call
    this.currentPitchCall = '—'; // 'Ball' or 'Strike'
    this.currentPitchHasCrossedPlate = false;
    this.swingUsedThisPitch = false;
    this.hadContactThisPitch = false;

    // Hitting/contact parameters (screen-space + timing)
    this.swingTimingWindowZ = 0.6; // meters around plate
    this.maxScreenDistForHit = 0.18; // normalized in strike-zone space
    this.maxScreenDistForPerfect = 0.07;

    this.ball.deactivate();
    this.ball.mesh.position.set(0, -10, 0);

    this.debugStrikeZoneVisible = false;

    this._updateUI();
  }

  _applyCameraConfig() {
    const { distance, height, fov } = this.cameraConfig;
    this.camera.fov = fov;
    this.camera.position.set(0, height, this.plateZ + distance);
    this.camera.lookAt(0, this.strikeZoneCenterY, this.plateZ);
    this.camera.updateProjectionMatrix();
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

  _createCharacters() {
    // Simple batter silhouette (boxes + cylinder)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.8,
      metalness: 0.1
    });

    const batter = new THREE.Group();

    const legsGeo = new THREE.BoxGeometry(0.45, 0.8, 0.3);
    const legs = new THREE.Mesh(legsGeo, bodyMat);
    legs.position.set(0.45, 0.4, 0.55);
    legs.castShadow = true;
    legs.receiveShadow = true;
    batter.add(legs);

    const torsoGeo = new THREE.BoxGeometry(0.5, 0.8, 0.35);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.set(0.45, 1.2, 0.55);
    torso.castShadow = true;
    torso.receiveShadow = true;
    batter.add(torso);

    const headGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.set(0.45, 1.75, 0.55);
    head.castShadow = true;
    head.receiveShadow = true;
    batter.add(head);

    this.scene.add(batter);

    // Simple pitcher silhouette far away
    const pitcher = new THREE.Group();
    const pLegs = new THREE.Mesh(legsGeo.clone(), bodyMat);
    pLegs.scale.set(0.8, 0.9, 0.8);
    pLegs.position.set(0, 0.4, this.pitcherPosition.z);
    pitcher.add(pLegs);

    const pTorso = new THREE.Mesh(torsoGeo.clone(), bodyMat);
    pTorso.scale.set(0.8, 0.9, 0.8);
    pTorso.position.set(0, 1.2, this.pitcherPosition.z);
    pitcher.add(pTorso);

    const pHead = new THREE.Mesh(headGeo.clone(), bodyMat);
    pHead.position.set(0, 1.75, this.pitcherPosition.z);
    pitcher.add(pHead);

    this.scene.add(pitcher);
  }

  update(dt) {
    this.stateTimer += dt;

    switch (this.state) {
      case GAME_STATES.IDLE:
        break;

      case GAME_STATES.PITCHING:
      case GAME_STATES.SWINGING:
        this._updatePitching(dt);
        break;

      case GAME_STATES.BALL_IN_PLAY:
        this._updateBallInPlay(dt);
        break;

      case GAME_STATES.RESULT:
        if (this.stateTimer >= this.resultDelay) {
          this._toIdle();
        }
        break;
    }

    this.bat.update(dt);
  }

  requestPitch() {
    if (this.state !== GAME_STATES.IDLE) return;
    this._startPitch();
  }

  _startPitch() {
    this.state = GAME_STATES.PITCHING;
    this.stateTimer = 0;

    // Randomize pitch each time within reasonable MLB-ish ranges
    const base = this.pitchBaseConfig;
    const speedMph = THREE.MathUtils.randFloat(base.speedMin, base.speedMax);
    this.pitchSpeedMph = speedMph;
    this.lastPitchType = 'Fastball';
    this.lastPitchMph = speedMph;

    this.pitchMoveXPerSec = THREE.MathUtils.randFloat(
      base.moveXMin,
      base.moveXMax
    );
    this.pitchMoveYPerSec = THREE.MathUtils.randFloat(
      base.moveYMin,
      base.moveYMax
    );
    this.pitchGravityScale = THREE.MathUtils.randFloat(
      base.gravityScaleMin,
      base.gravityScaleMax
    );

    const speedMs = speedMph * MPH_TO_MS;

    // Decide if this pitch is intended as a strike or a ball
    const isStrikeIntent = Math.random() < 0.7; // ~70% strikes, 30% balls
    let xTarget;
    let yTarget;

    if (isStrikeIntent) {
      // Aim somewhere inside the zone
      xTarget =
        THREE.MathUtils.randFloat(
          this.zoneLeftX * 0.6,
          this.zoneRightX * 0.6
        );
      yTarget =
        this.strikeZoneCenterY +
        THREE.MathUtils.randFloatSpread(this.strikeZoneHeight * 0.4);
    } else {
      // Miss off the plate (up/down/in/out)
      const side = Math.floor(Math.random() * 4); // 0: up,1:down,2:in,3:away
      const off = this.strikeZoneHeight * 0.5;
      switch (side) {
        case 0: // high
          xTarget = THREE.MathUtils.randFloat(
            this.zoneLeftX * 0.8,
            this.zoneRightX * 0.8
          );
          yTarget = this.zoneTopY + off;
          break;
        case 1: // low
          xTarget = THREE.MathUtils.randFloat(
            this.zoneLeftX * 0.8,
            this.zoneRightX * 0.8
          );
          yTarget = this.zoneBottomY - off;
          break;
        case 2: // inside (to righty)
          xTarget = this.zoneRightX + off;
          yTarget =
            this.strikeZoneCenterY +
            THREE.MathUtils.randFloatSpread(this.strikeZoneHeight * 0.2);
          break;
        default: // away
          xTarget = this.zoneLeftX - off;
          yTarget =
            this.strikeZoneCenterY +
            THREE.MathUtils.randFloatSpread(this.strikeZoneHeight * 0.2);
          break;
      }
    }

    const target = new THREE.Vector3(xTarget, yTarget, this.strikeZoneCenterZ);

    const direction = target.clone().sub(this.pitcherPosition).normalize();
    this.ball.startPitch(this.pitcherPosition, direction, speedMs);

    this.currentPitchCall = '—';
    this.currentPitchHasCrossedPlate = false;
    this.swingUsedThisPitch = false;
    this.hadContactThisPitch = false;
    this.lastResult = 'Pitching';

    this._updateUI();
  }

  _updatePitching(dt) {
    const prevPos = this.ball.mesh.position.clone();

    const pitchGravity = this.gravity
      .clone()
      .multiplyScalar(this.pitchGravityScale);

    this.ball.update(dt, pitchGravity, this.pitchDragCoeff);

    // Apply slight break as velocity changes
    this.ball.velocity.x += this.pitchMoveXPerSec * dt;
    this.ball.velocity.y += this.pitchMoveYPerSec * dt;

    // Plate crossing detection (for balls/strikes)
    this._checkPlateCrossing(prevPos, this.ball.mesh.position);

    const pos = this.ball.mesh.position;

    const finishedDistance =
      pos.z > this.strikeZoneCenterZ + 1.0 || pos.y < 0 || !this.ball.isActive;

    if (finishedDistance && !this.hadContactThisPitch) {
      this._finishPitchWithoutContact(pos.y < 0 ? 'In the dirt' : undefined);
    }
  }

  _checkPlateCrossing(prevPos, currPos) {
    if (
      this.currentPitchHasCrossedPlate ||
      !this.ball.isActive ||
      this.hadContactThisPitch
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

  _finishPitchWithoutContact(optionalLabel) {
    // Determine outcome based on pitch call and whether hitter swung
    if (this.currentPitchCall === 'Ball') {
      this.lastResult = optionalLabel || 'Ball';
      // Balls/true count system will be expanded later
    } else if (this.swingUsedThisPitch) {
      this._addStrike();
      this.lastResult = 'Strike (swinging)';
    } else if (this.currentPitchCall === 'Strike') {
      this._addStrike();
      this.lastResult = 'Strike (looking)';
    } else {
      this.lastResult = optionalLabel || 'Miss';
    }

    this.ball.deactivate();
    this.ball.mesh.position.set(0, -10, 0);
    this._enterResultState();
  }

  _updateBallInPlay(dt) {
    if (!this.ball.isActive) {
      this._enterResultState();
      return;
    }

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
      this._enterResultState();
      return;
    }

    const maxDistance = 150;
    if (p.lengthSq() > maxDistance * maxDistance) {
      this.ball.deactivate();
      this._enterResultState();
    }
  }

  _enterResultState() {
    this.state = GAME_STATES.RESULT;
    this.stateTimer = 0;
    this._updateUI();
  }

  _toIdle() {
    this.state = GAME_STATES.IDLE;
    this.stateTimer = 0;
    if (!this.ball.isActive) {
      this.ball.mesh.position.set(0, -10, 0);
    }
    this.currentPitchCall = '—';
  }

  _addStrike() {
    this.strikes += 1;
    if (this.strikes >= this.maxStrikes) {
      this.strikes = 0;
      this.outs += 1;
    }
  }

  // Screen-space contact check based on reticle vs ball projection
  _tryScreenSpaceContact() {
    if (!this.ball.isActive) return false;

    const ballPos = this.ball.mesh.position.clone();
    const zDelta = Math.abs(ballPos.z - this.plateZ);
    const timingOk = zDelta <= this.swingTimingWindowZ;
    if (!timingOk) return false;

    const rect = this.ui.getStrikeZoneRect();
    if (!rect || !rect.width || !rect.height) return false;

    const projected = ballPos.project(this.camera);
    const screenX = ((projected.x + 1) / 2) * window.innerWidth;
    const screenY = ((-projected.y + 1) / 2) * window.innerHeight;

    const u = (screenX - rect.left) / rect.width;
    const v = (screenY - rect.top) / rect.height;

    const reticle = this.ui.getReticleUV();

    const du = u - reticle.u;
    const dv = v - reticle.v;
    const dist = Math.hypot(du, dv);

    if (dist > this.maxScreenDistForHit) {
      return false;
    }

    // Quality based on distance + timing
    const distFactor = THREE.MathUtils.clamp(
      1 - dist / this.maxScreenDistForHit,
      0,
      1
    );
    const perfectFactor =
      dist <= this.maxScreenDistForPerfect ? 1 : distFactor * 0.7;

    this._onContact(ballPos, perfectFactor);
    return true;
  }

  _onContact(ballPos, contactQuality) {
    this.hadContactThisPitch = true;

    const quality = THREE.MathUtils.clamp(contactQuality, 0, 1);

    // Exit velocity and launch angle inspired by quality
    const minExitMph = 65;
    const maxExitMph = 110;
    const exitMph = minExitMph + (maxExitMph - minExitMph) * quality;
    const exitMs = exitMph * MPH_TO_MS;
    this.lastExitMph = exitMph;

    let launchAngleDeg = 8 + 20 * quality; // grounder -> elevated
    launchAngleDeg = THREE.MathUtils.clamp(launchAngleDeg, 0, 35);

    const horizDir = new THREE.Vector3(0, 0, -1);
    const elevRad = THREE.MathUtils.degToRad(launchAngleDeg);
    const baseDir = new THREE.Vector3(
      horizDir.x,
      Math.tan(elevRad),
      horizDir.z
    ).normalize();

    // Pull vs oppo based on whether ball is slightly early/late relative to zone center
    const timingOffset = ballPos.z - this.plateZ;
    const pullAngleMax = THREE.MathUtils.degToRad(30);
    const pullFactor = THREE.MathUtils.clamp(
      -timingOffset / this.swingTimingWindowZ,
      -1,
      1
    );
    const sideAngle = pullAngleMax * pullFactor;

    const launchDir = baseDir.clone();
    launchDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), sideAngle);

    // Small random spray
    const sprayAngle = THREE.MathUtils.degToRad(4);
    launchDir.applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      THREE.MathUtils.randFloatSpread(sprayAngle)
    );

    launchDir.normalize().multiplyScalar(exitMs);
    this.ball.launch(launchDir);

    this.lastWasFairHit = true; // foul logic will be refined later
    this.lastResult = quality > 0.85 ? 'Perfect contact' : 'In play';

    this.state = GAME_STATES.BALL_IN_PLAY;
    this.stateTimer = 0;
    this._updateUI();
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
    // Always animate swing, even without pitch
    this.bat.startSwing();

    if (
      this.state === GAME_STATES.PITCHING ||
      this.state === GAME_STATES.SWINGING
    ) {
      if (this.swingUsedThisPitch) return;
      this.swingUsedThisPitch = true;
      this.state = GAME_STATES.SWINGING;

      const hit = this._tryScreenSpaceContact();
      if (!hit) {
        // Outcome decided later when pitch finishes
        this.lastResult = 'Swinging...';
        this._updateUI();
      }
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
    if (this.ui) {
      this.ui.setDebugPCIVisible(visible);
    }
  }

  getDebugInfo() {
    const pos = this.ball.mesh.position;
    const vel = this.ball.velocity;

    return {
      state: this.state,
      pitchType: this.lastPitchType,
      pitchMph: this.lastPitchMph,
      lastCall: this.currentPitchCall,
      ballPosition: { x: pos.x, y: pos.y, z: pos.z },
      ballVelocity: { x: vel.x, y: vel.y, z: vel.z }
    };
  }
}

