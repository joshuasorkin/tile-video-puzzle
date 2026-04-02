import * as THREE from 'three';
import { CONFIG } from './Config.js';

export class Maze {
    constructor(scene) {
        this.scene = scene;
        this.size = CONFIG.MAZE_SIZE;
        this.cellSize = CONFIG.CELL_SIZE;
        this.grid = [];
        this.walls = [];
        this.floor = null;

        // Maze cell structure
        // 0: path, 1: wall
        this.generate();
    }

    generate() {
        // Initialize grid with all walls
        for (let y = 0; y < this.size; y++) {
            this.grid[y] = [];
            for (let x = 0; x < this.size; x++) {
                this.grid[y][x] = 1;
            }
        }

        // Recursive backtracking algorithm
        const startX = 1;
        const startY = 1;
        this.carve(startX, startY);

        // Ensure edges are walls
        for (let i = 0; i < this.size; i++) {
            this.grid[0][i] = 1;
            this.grid[this.size - 1][i] = 1;
            this.grid[i][0] = 1;
            this.grid[i][this.size - 1] = 1;
        }
    }

    carve(x, y) {
        this.grid[y][x] = 0;

        const directions = [
            [0, -2], [0, 2], [-2, 0], [2, 0]
        ].sort(() => Math.random() - 0.5);

        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx > 0 && nx < this.size - 1 && ny > 0 && ny < this.size - 1 && this.grid[ny][nx] === 1) {
                this.grid[y + dy / 2][x + dx / 2] = 0;
                this.carve(nx, ny);
            }
        }
    }

    build(spawnPos) {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        
        const wallTex = loader.load(CONFIG.ASSETS.WALL);
        wallTex.colorSpace = THREE.SRGBColorSpace;
        wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
        wallTex.repeat.set(1, 1);

        const floorTex = loader.load(CONFIG.ASSETS.FLOOR);
        floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
        floorTex.repeat.set(this.size, this.size);

        const wallGeo = new THREE.BoxGeometry(this.cellSize, CONFIG.WALL_HEIGHT, this.cellSize);
        const wallMat = new THREE.MeshStandardMaterial({ 
            map: wallTex,
            roughness: 0.8,
            metalness: 0.2,
            color: 0x444444 // Fallback dark grey tint
        });

        const floorGeo = new THREE.PlaneGeometry(this.size * this.cellSize, this.size * this.cellSize);
        const floorMat = new THREE.MeshStandardMaterial({ 
            map: floorTex,
            roughness: 0.9,
            metalness: 0.1
        });

        this.floor = new THREE.Mesh(floorGeo, floorMat);
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.position.set(
            (this.size * this.cellSize) / 2 - this.cellSize / 2,
            0,
            (this.size * this.cellSize) / 2 - this.cellSize / 2
        );
        this.floor.receiveShadow = true;
        this.scene.add(this.floor);

        // Ceiling for darkness
        const ceilingGeo = new THREE.PlaneGeometry(this.size * this.cellSize, this.size * this.cellSize);
        const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(
            (this.size * this.cellSize) / 2 - this.cellSize / 2,
            CONFIG.WALL_HEIGHT,
            (this.size * this.cellSize) / 2 - this.cellSize / 2
        );
        this.scene.add(ceiling);

        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                if (this.grid[y][x] === 1) {
                    const wall = new THREE.Mesh(wallGeo, wallMat);
                    wall.position.set(x * this.cellSize, CONFIG.WALL_HEIGHT / 2, y * this.cellSize);
                    wall.castShadow = true;
                    wall.receiveShadow = true;
                    this.scene.add(wall);
                    this.walls.push(wall);
                }
            }
        }

        // Add Exit Portal far from spawn
        let exitPos;
        do {
            exitPos = this.getRandomEmptyCell();
        } while (exitPos.distanceTo(spawnPos) < (this.size * this.cellSize) / 2);

        const portalGeo = new THREE.TorusGeometry(2, 0.5, 16, 100);
        const portalMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true });
        this.exit = new THREE.Mesh(portalGeo, portalMat);
        this.exit.position.copy(exitPos);
        this.exit.position.y = 3;
        this.scene.add(this.exit);

        const exitLight = new THREE.PointLight(0x00ffff, 2, 20);
        exitLight.position.copy(this.exit.position);
        this.scene.add(exitLight);
    }

    getRandomEmptyCell() {
        let x, y;
        do {
            x = Math.floor(Math.random() * this.size);
            y = Math.floor(Math.random() * this.size);
        } while (this.grid[y][x] !== 0);
        return new THREE.Vector3(x * this.cellSize, 0, y * this.cellSize);
    }

    checkCollision(position, radius = 0.5) {
        const gridX = Math.round(position.x / this.cellSize);
        const gridY = Math.round(position.z / this.cellSize);

        if (gridX < 0 || gridX >= this.size || gridY < 0 || gridY >= this.size) return true;
        return this.grid[gridY][gridX] === 1;
    }
}
