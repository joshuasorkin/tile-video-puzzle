import * as THREE from 'three';
import { CONFIG } from './Config.js';

export class Enemy {
    constructor(scene, maze, player) {
        this.scene = scene;
        this.maze = maze;
        this.player = player;

        this.mesh = this.createMesh();
        const startPos = maze.getRandomEmptyCell();
        this.mesh.position.set(startPos.x, 2, startPos.z);
        this.scene.add(this.mesh);

        this.speed = 2.5;
        this.state = 'wandering'; // wandering, hunting
        this.targetCell = maze.getRandomEmptyCell();
        this.direction = new THREE.Vector3();
    }

    createMesh() {
        const spriteMat = new THREE.SpriteMaterial({ 
            map: new THREE.TextureLoader().load(CONFIG.ASSETS.SHADOW),
            transparent: true,
            opacity: 0.9
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(4, 8, 1);
        
        // Add a small light to make it visible
        const light = new THREE.PointLight(0xffffff, 0.5, 5);
        light.position.y = 2;
        sprite.add(light);

        return sprite;
    }

    update(deltaTime) {
        const distToPlayer = this.mesh.position.distanceTo(this.player.position);

        if (distToPlayer < 20) {
            this.state = 'hunting';
        } else if (distToPlayer > 30) {
            this.state = 'wandering';
        }

        if (this.state === 'hunting') {
            this.direction.subVectors(this.player.position, this.mesh.position).normalize();
        } else {
            // Wandering logic
            if (this.mesh.position.distanceTo(this.targetCell) < 1) {
                this.targetCell = this.maze.getRandomEmptyCell();
            }
            this.direction.subVectors(this.targetCell, this.mesh.position).normalize();
        }

        // Apply movement with simple avoidance
        const nextPos = this.mesh.position.clone().addScaledVector(this.direction, this.speed * deltaTime);
        if (!this.maze.checkCollision(nextPos, 2)) {
            this.mesh.position.copy(nextPos);
        } else {
            // Pick a new target if we hit a wall
            this.targetCell = this.maze.getRandomEmptyCell();
        }

        // Bobbing effect
        this.mesh.position.y = 2.5 + Math.sin(Date.now() * 0.005) * 0.2;

        // Flickering light
        if (this.mesh.children[0]) {
            this.mesh.children[0].intensity = 0.5 + Math.random() * 0.5;
        }
    }
}
