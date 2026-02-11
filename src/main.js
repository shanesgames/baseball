import './style.css';
import * as THREE from 'three';
import { Game } from './Game.js';
import { UI } from './UI.js';
import { DebugOverlay } from './DebugOverlay.js';

const appElement = document.querySelector('#app');

// Three.js renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
appElement.appendChild(renderer.domElement);

// UI + debug
const ui = new UI();
const game = new Game(renderer, ui);
const debugOverlay = new DebugOverlay();

// Wire pitch button
ui.setPitchHandler(() => {
  game.requestPitch();
});

// Animation loop with delta time
let lastTime = performance.now();

function animate(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  game.update(dt);
  renderer.render(game.scene, game.camera);

  const debugInfo = game.getDebugInfo();
  const fps = dt > 0 ? 1 / dt : 0;
  debugOverlay.update({ fps, ...debugInfo });

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

// Handle resize
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  game.onResize(width, height);
});

// Keyboard input
window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    game.handleSwing();
  } else if (event.code === 'Enter') {
    event.preventDefault();
    game.requestPitch();
  } else if (event.code === 'KeyD') {
    debugOverlay.toggle();
    game.setDebugVisible(debugOverlay.visible);
  }
});

// Mouse input for swinging (left click)
window.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;

  const target = event.target;
  if (target.closest('#hud') || target.closest('#controls-panel')) {
    // Don't swing when clicking UI
    return;
  }

  game.handleSwing();
});
