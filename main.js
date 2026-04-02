import * as THREE from 'three';
import { CONFIG } from './Config.js';
import { Maze } from './Maze.js';
import { Enemy } from './Enemy.js';
import { PlayerController, FirstPersonCameraController } from './rosie/controls/rosieControls.js';

class Game {
    constructor() {
        this.init();
        this.createUI();
        this.setupScene();
        this.setupMaze();
        
        // Fetch NASA textures before player setup
        this.loadNASATextures().then(() => {
            this.setupPlayer();
            this.setupEnemies();
            this.setupPulse();
            this.animate();
        });
    }

    async loadNASATextures() {
        try {
            // Using 'galaxy' search and ensuring we get images
            const response = await fetch('https://images-api.nasa.gov/search?q=nebula&media_type=image');
            const data = await response.json();
            const items = data.collection.items;
            
            if (items && items.length > 0) {
                // Filter items that have links
                const imageItems = items.filter(item => item.links && item.links.length > 0);
                const randomItem = imageItems[Math.floor(Math.random() * Math.min(imageItems.length, 20))];
                let imageUrl = randomItem.links[0].href;
                
                // Force HTTPS
                imageUrl = imageUrl.replace('http://', 'https://');
                
                console.log("Setting wall texture to NASA image:", imageUrl);
                CONFIG.ASSETS.WALL = imageUrl;
            }
        } catch (error) {
            console.error("Failed to fetch NASA textures:", error);
        }
    }

    init() {
        this.canvas = document.createElement('canvas');
        document.body.appendChild(this.canvas);

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.scene.fog = new THREE.Fog(CONFIG.FOG_COLOR, CONFIG.FOG_NEAR, CONFIG.FOG_FAR);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        this.clock = new THREE.Clock();
        this.isGameOver = false;

        window.addEventListener('resize', () => {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
        });
    }

    createUI() {
        this.ui = document.createElement('div');
        this.ui.style.position = 'fixed';
        this.ui.style.top = '20px';
        this.ui.style.left = '20px';
        this.ui.style.color = 'cyan';
        this.ui.style.fontFamily = "'Orbitron', sans-serif";
        this.ui.style.fontSize = '18px';
        this.ui.style.pointerEvents = 'none';
        this.ui.innerHTML = `
            <div id="pulse-bar-container" style="width: 200px; height: 10px; border: 1px solid cyan; margin-bottom: 5px;">
                <div id="pulse-bar" style="width: 100%; height: 100%; background: cyan; transition: width 0.1s;"></div>
            </div>
            <div>PULSE ENERGY [SPACE / CLICK]</div>
            <div style="margin-top: 10px; font-size: 14px; color: #888;">FIND THE CYAN PORTAL</div>
        `;
        document.body.appendChild(this.ui);

        this.overlay = document.createElement('div');
        this.overlay.style.position = 'fixed';
        this.overlay.style.top = '0';
        this.overlay.style.left = '0';
        this.overlay.style.width = '100%';
        this.overlay.style.height = '100%';
        this.overlay.style.background = 'rgba(0,0,0,0.8)';
        this.overlay.style.display = 'none';
        this.overlay.style.flexDirection = 'column';
        this.overlay.style.alignItems = 'center';
        this.overlay.style.justifyContent = 'center';
        this.overlay.style.color = 'white';
        this.overlay.style.fontFamily = "'Orbitron', sans-serif";
        this.overlay.style.zIndex = '100';
        this.overlay.innerHTML = `
            <h1 id="overlay-title">GAME OVER</h1>
            <p id="overlay-msg">The shadows consumed you.</p>
            <button onclick="window.location.reload()" style="padding: 10px 20px; cursor: pointer; background: cyan; border: none; font-family: inherit; font-weight: bold;">RETRY</button>
        `;
        document.body.appendChild(this.overlay);
    }

    setupScene() {
        const ambient = new THREE.AmbientLight(0x404040, 0.05);
        this.scene.add(ambient);
    }

    setupMaze() {
        // We will call build inside loadNASATextures once image is set
        this.maze = new Maze(this.scene);
    }

    setupPlayer() {
        if (!this.maze) this.setupMaze(); // Ensure maze exists
        const playerGeo = new THREE.CapsuleGeometry(0.4, 1, 4, 8);
        const playerMat = new THREE.MeshBasicMaterial({ visible: false });
        this.playerMesh = new THREE.Mesh(playerGeo, playerMat);
        
        // Find safe spawn
        const spawn = this.maze.getRandomEmptyCell();
        this.playerMesh.position.set(spawn.x, CONFIG.PLAYER_HEIGHT, spawn.z);
        this.scene.add(this.playerMesh);

        // Build maze with spawn position for exit placement
        this.maze.build(this.playerMesh.position);

        this.playerController = new PlayerController(this.playerMesh, {
            moveSpeed: CONFIG.MOVE_SPEED,
            jumpForce: CONFIG.JUMP_FORCE,
            groundLevel: CONFIG.PLAYER_HEIGHT
        });

        this.cameraController = new FirstPersonCameraController(this.camera, this.playerMesh, this.renderer.domElement, {
            eyeHeight: 0
        });
        this.cameraController.enable();
        this.playerController.setCameraMode('first-person');

        // Flashlight
        this.flashlight = new THREE.SpotLight(
            CONFIG.FLASHLIGHT_COLOR, 
            CONFIG.FLASHLIGHT_INTENSITY, 
            CONFIG.FLASHLIGHT_DISTANCE, 
            CONFIG.FLASHLIGHT_ANGLE, 
            0.5, 
            1
        );
        this.flashlight.castShadow = true;
        this.flashlight.shadow.mapSize.width = 1024;
        this.flashlight.shadow.mapSize.height = 1024;
        this.scene.add(this.flashlight);
        this.scene.add(this.flashlight.target);
    }

    setupEnemies() {
        this.enemies = [];
        for (let i = 0; i < 5; i++) {
            this.enemies.push(new Enemy(this.scene, this.maze, this.playerMesh));
        }
    }

    setupPulse() {
        this.pulseEnergy = CONFIG.PULSE_ENERGY_MAX;
        this.pulseMarks = [];
        
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.code === 'KeyF') {
                this.triggerPulse();
            }
        });

        window.addEventListener('mousedown', () => {
            this.triggerPulse();
        });
    }

    triggerPulse() {
        if (this.pulseEnergy < CONFIG.PULSE_COST || this.isGameOver) return;

        this.pulseEnergy -= CONFIG.PULSE_COST;
        this.updatePulseUI();

        // Create a visual ring
        const ringGeo = new THREE.RingGeometry(0.1, 0.5, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 1, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(this.playerMesh.position);
        ring.rotation.x = -Math.PI / 2;
        this.scene.add(ring);

        // Flashlight flare
        const originalIntensity = this.flashlight.intensity;
        this.flashlight.intensity = 10;
        setTimeout(() => this.flashlight.intensity = originalIntensity, 100);

        // Raycasting in many directions
        const raycaster = new THREE.Raycaster();
        const rayCount = 36;
        for (let i = 0; i < rayCount; i++) {
            const angle = (i / rayCount) * Math.PI * 2;
            const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
            raycaster.set(this.playerMesh.position, dir);
            
            const intersects = raycaster.intersectObjects(this.maze.walls);
            if (intersects.length > 0 && intersects[0].distance < 30) {
                this.createPulseMark(intersects[0].point);
            }
        }

        // Animate ring
        const startTime = Date.now();
        const duration = 1000;
        const animateRing = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / duration;
            if (progress < 1) {
                ring.scale.set(1 + progress * 50, 1 + progress * 50, 1);
                ring.material.opacity = 1 - progress;
                requestAnimationFrame(animateRing);
            } else {
                this.scene.remove(ring);
                ring.geometry.dispose();
                ring.material.dispose();
            }
        };
        animateRing();

        // Banish nearby enemies
        this.enemies.forEach(enemy => {
            if (enemy.mesh.position.distanceTo(this.playerMesh.position) < 15) {
                // Teleport away or push back
                const awayDir = new THREE.Vector3().subVectors(enemy.mesh.position, this.playerMesh.position).normalize();
                enemy.mesh.position.addScaledVector(awayDir, 10);
            }
        });
    }

    createPulseMark(position) {
        const markGeo = new THREE.SphereGeometry(0.2, 8, 8);
        const markMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
        const mark = new THREE.Mesh(markGeo, markMat);
        mark.position.copy(position);
        this.scene.add(mark);
        this.pulseMarks.push(mark);

        // Fade out
        setTimeout(() => {
            const startFade = Date.now();
            const fadeDur = 2000;
            const fade = () => {
                const elapsed = Date.now() - startFade;
                const p = elapsed / fadeDur;
                if (p < 1) {
                    mark.material.opacity = 0.8 * (1 - p);
                    requestAnimationFrame(fade);
                } else {
                    this.scene.remove(mark);
                    this.pulseMarks = this.pulseMarks.filter(m => m !== mark);
                    mark.geometry.dispose();
                    mark.material.dispose();
                }
            };
            fade();
        }, 3000);
    }

    updatePulseUI() {
        const bar = document.getElementById('pulse-bar');
        if (bar) bar.style.width = `${(this.pulseEnergy / CONFIG.PULSE_ENERGY_MAX) * 100}%`;
    }

    gameOver(won = false) {
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.overlay.style.display = 'flex';
        document.getElementById('overlay-title').innerText = won ? 'ESCAPE SUCCESSFUL' : 'GAME OVER';
        document.getElementById('overlay-msg').innerText = won ? 'You navigated the shadows.' : 'The shadows consumed you.';
        if (document.pointerLockElement) document.exitPointerLock();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const deltaTime = this.clock.getDelta();

        if (!this.isGameOver) {
            const rotation = this.cameraController.update(deltaTime);
            
            // Wall Collision Handling
            const prevPos = this.playerMesh.position.clone();
            this.playerController.update(deltaTime, rotation);
            
            const collisionRadius = 1.0;
            if (this.maze.checkCollision(this.playerMesh.position, collisionRadius)) {
                this.playerMesh.position.copy(prevPos);
                this.playerController.velocity.set(0, 0, 0);
            }

            // Update Flashlight
            this.flashlight.position.copy(this.camera.position);
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
            this.flashlight.target.position.copy(this.camera.position).add(dir);

            // Pulse Energy Recharge
            if (this.pulseEnergy < CONFIG.PULSE_ENERGY_MAX) {
                this.pulseEnergy = Math.min(CONFIG.PULSE_ENERGY_MAX, this.pulseEnergy + deltaTime * 10);
                this.updatePulseUI();
            }

            // Update Enemies
            this.enemies.forEach(enemy => {
                enemy.update(deltaTime);
                if (enemy.mesh.position.distanceTo(this.playerMesh.position) < 2) {
                    this.gameOver(false);
                }
            });

            // Check Win Condition
            if (this.playerMesh.position.distanceTo(this.maze.exit.position) < 3) {
                this.gameOver(true);
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}

new Game();
