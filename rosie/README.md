# Rosie Component Library

This folder contains **pre-built Rosie components** that you can use or not, depending on your use case.
These are production-ready, tested components - but only use them if they fit the specific request.

## 🚨 Important: Always Read Before Using

**You must use the `read` tool to load a component's source code BEFORE importing it.**

Example workflow:
```javascript
// 1. Use read tool first
read(file_path="/rosie/controls/rosieControls.js")

// 2. Then import after reviewing
import { PlayerController } from './rosie/controls/rosieControls.js';
```

---

## Available Components

### 🎮 rosieControls.js (3D Games - Three.js)

**Path:** `/rosie/controls/rosieControls.js`
**Exports:** `PlayerController`, `ThirdPersonCameraController`, `FirstPersonCameraController`

**What it does:**
- WASD movement with camera-relative direction
- Jumping, gravity, ground detection
- Third-person orbiting camera OR first-person pointer-lock
- Automatic mobile controls (virtual joystick + buttons)

**Use for:** 3D platformers, exploration games, action games
**Don't use for:** 2D games, racing games, top-down games

**Quick example:**
```javascript
const controller = new PlayerController(playerMesh, {
  moveSpeed: 10,
  jumpForce: 15,
  groundLevel: 0
});

const camera = new ThirdPersonCameraController(
  camera, playerMesh, renderer.domElement, {
  distance: 7,
  height: 3
});

// In game loop:
const rotation = camera.update();
controller.update(deltaTime, rotation);
```

---

### 📱 phaserMobileControls.js (2D Games - Phaser)

**Path:** `/rosie/controls/phaserMobileControls.js`
**Exports:** `VirtualJoystick`, `ActionButton`, `MobileControlsManager`

**What it does:**
- Virtual joystick for movement (fixed position, left side)
- Action buttons with visual feedback (jump, shoot, etc.)
- Mobile controls manager with safe area handling

**Use for:** 2D mobile games using Phaser
**Don't use for:** 3D games, desktop-only games

**Quick example:**
```javascript
import { MobileControlsManager } from './rosie/controls/phaserMobileControls.js';

// In GameScene - add controls
this.mobileControls = new MobileControlsManager(this);
this.mobileControls.addJoystick();
this.mobileControls.addButton({
  label: 'JUMP',
  onPress: () => this.player.jump()
});

// In update() - get movement
const move = this.mobileControls.getMovement();
this.player.setVelocityX(move.x * speed);
```

---

### 📱 rosieMobileControls.js (Internal)

**Path:** `/rosie/controls/rosieMobileControls.js`
**Note:** Auto-imported by rosieControls.js - no need to import separately

---

## Usage Rules

✅ **DO:**
- Read source with `read` tool before using
- Import from rosie/ folder: `'./rosie/controls/...'`
- Only use components that fit the request
- Use phaserMobileControls.js for 2D mobile games
- Use rosieControls.js for 3D games

❌ **DON'T:**
- Import without reading first
- Recreate these components
- Use 3D controls for 2D games (or vice versa)
