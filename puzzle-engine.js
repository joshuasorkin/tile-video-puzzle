function tileKey(tile) {
    return `${tile.r},${tile.c}`;
}

function cellKey(cell) {
    return `${cell.r},${cell.c}`;
}

function isTileHome(tile) {
    return tile.r === tile.currentR && tile.c === tile.currentC;
}

function normalizeCluster(cluster) {
    const baseR = Math.min(...cluster.map((tile) => tile.currentR));
    const baseC = Math.min(...cluster.map((tile) => tile.currentC));
    const shape = cluster.map((tile) => ({
        tile,
        dr: tile.currentR - baseR,
        dc: tile.currentC - baseC
    }));

    return {
        maxDR: Math.max(...shape.map((part) => part.dr)),
        maxDC: Math.max(...shape.map((part) => part.dc)),
        shape
    };
}

export function createShuffledTiles(size, random = Math.random) {
    const tiles = [];
    const positions = [];

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            tiles.push({ r, c, currentR: r, currentC: c });
            positions.push({ r, c });
        }
    }

    for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    return tiles.map((tile, index) => ({
        ...tile,
        currentR: positions[index].r,
        currentC: positions[index].c
    }));
}

export function getTileGroup(startTile, allTiles) {
    const group = [startTile];
    const queue = [startTile];
    const visited = new Set([tileKey(startTile)]);
    const offsetR = startTile.currentR - startTile.r;
    const offsetC = startTile.currentC - startTile.c;

    while (queue.length > 0) {
        const current = queue.shift();
        const neighbors = allTiles.filter((tile) => {
            const key = tileKey(tile);
            if (visited.has(key)) return false;

            const isAdjacent =
                Math.abs(tile.currentR - current.currentR) + Math.abs(tile.currentC - current.currentC) === 1;
            const sameOffset = tile.currentR - tile.r === offsetR && tile.currentC - tile.c === offsetC;

            return isAdjacent && sameOffset;
        });

        for (const neighbor of neighbors) {
            visited.add(tileKey(neighbor));
            group.push(neighbor);
            queue.push(neighbor);
        }
    }

    return group;
}

export function getLockedSubgroups(tiles) {
    const remaining = [...tiles];
    const groups = [];

    while (remaining.length > 0) {
        const seed = remaining[0];
        const group = getTileGroup(seed, remaining);
        groups.push(group);

        const groupKeys = new Set(group.map(tileKey));
        for (let index = remaining.length - 1; index >= 0; index--) {
            if (groupKeys.has(tileKey(remaining[index]))) {
                remaining.splice(index, 1);
            }
        }
    }

    return groups.sort((left, right) => right.length - left.length);
}

function reassignTiles(tiles, draggedKeys, delta, reassignment) {
    return tiles.map((tile) => {
        const key = tileKey(tile);
        if (draggedKeys.has(key)) {
            return {
                ...tile,
                currentR: tile.currentR + delta.dr,
                currentC: tile.currentC + delta.dc
            };
        }

        const reassignedSpot = reassignment.get(key);
        if (reassignedSpot) {
            return { ...tile, currentR: reassignedSpot.r, currentC: reassignedSpot.c };
        }

        return tile;
    });
}

function rotateDisplacedTiles(newTiles, reassignment) {
    const displacedKeys = [...reassignment.keys()];
    const positions = displacedKeys.map((key) => {
        const tile = newTiles.find((candidate) => tileKey(candidate) === key);
        return { r: tile.currentR, c: tile.currentC };
    });
    const rotated = [...positions.slice(1), positions[0]];

    return newTiles.map((tile) => {
        const index = displacedKeys.indexOf(tileKey(tile));
        if (index === -1) return tile;
        return { ...tile, currentR: rotated[index].r, currentC: rotated[index].c };
    });
}

function findBestPlacement(cluster, gridSize, fixedCells, placedCells, boardCellMap) {
    const { shape, maxDR, maxDC } = normalizeCluster(cluster);
    let bestPlacement = null;
    let bestCascadeSize = Infinity;

    for (let r = 0; r <= gridSize - 1 - maxDR; r++) {
        for (let c = 0; c <= gridSize - 1 - maxDC; c++) {
            const targetCoords = shape.map((part) => ({
                r: r + part.dr,
                c: c + part.dc
            }));

            const overlapsReservedCell = targetCoords.some((coord) => {
                const key = cellKey(coord);
                return fixedCells.has(key) || placedCells.has(key);
            });
            if (overlapsReservedCell) continue;

            const cascadeSet = new Set();
            for (const coord of targetCoords) {
                const hitCluster = boardCellMap.get(cellKey(coord));
                if (hitCluster) cascadeSet.add(hitCluster);
            }

            const cascadeSize = [...cascadeSet].reduce((sum, candidate) => sum + candidate.length, 0);
            if (cascadeSize < bestCascadeSize) {
                bestCascadeSize = cascadeSize;
                bestPlacement = {
                    cascadeClusters: [...cascadeSet],
                    shape,
                    targetCoords
                };
                if (cascadeSize === 0) break;
            }
        }

        if (bestPlacement && bestCascadeSize === 0) {
            break;
        }
    }

    return bestPlacement;
}

export function moveDraggedGroup({ draggedGroup, gridSize, tiles }) {
    const pivot = draggedGroup.tiles[0];
    const delta = {
        dr: draggedGroup.target.r - pivot.currentR,
        dc: draggedGroup.target.c - pivot.currentC
    };

    const hasMovement = delta.dr !== 0 || delta.dc !== 0;
    const fitsBoard = draggedGroup.tiles.every((tile) => {
        const newR = tile.currentR + delta.dr;
        const newC = tile.currentC + delta.dc;
        return newR >= 0 && newR < gridSize && newC >= 0 && newC < gridSize;
    });

    if (!hasMovement || !fitsBoard) {
        return { status: 'no-op' };
    }

    const draggedTiles = draggedGroup.tiles;
    const draggedKeys = new Set(draggedTiles.map(tileKey));
    const draggedCells = new Set(
        draggedTiles.map((tile) => cellKey({ r: tile.currentR + delta.dr, c: tile.currentC + delta.dc }))
    );
    const nonDraggedTiles = tiles.filter((tile) => !draggedKeys.has(tileKey(tile)));
    const allLockedGroups = getLockedSubgroups(nonDraggedTiles);
    const touchedGroups = allLockedGroups.filter((group) =>
        group.some((tile) => draggedCells.has(cellKey({ r: tile.currentR, c: tile.currentC })))
    );

    const boardCellMap = new Map();
    for (const group of allLockedGroups) {
        if (touchedGroups.includes(group)) continue;
        for (const tile of group) {
            boardCellMap.set(cellKey({ r: tile.currentR, c: tile.currentC }), group);
        }
    }

    for (const group of touchedGroups) {
        for (const tile of group) {
            boardCellMap.delete(cellKey({ r: tile.currentR, c: tile.currentC }));
        }
    }

    const fixedCells = new Set(draggedCells);
    const placedCells = new Set();
    const reassignment = new Map();
    const needsPlacement = [...touchedGroups];
    const maxIterations = gridSize * gridSize;
    let iterations = 0;
    let failedGroup = null;

    while (needsPlacement.length > 0) {
        if (++iterations > maxIterations) {
            failedGroup = needsPlacement[0];
            break;
        }

        needsPlacement.sort((left, right) => right.length - left.length);
        const cluster = needsPlacement.shift();
        const placement = findBestPlacement(cluster, gridSize, fixedCells, placedCells, boardCellMap);

        if (!placement) {
            failedGroup = cluster;
            break;
        }

        placement.shape.forEach((part, index) => {
            reassignment.set(tileKey(part.tile), placement.targetCoords[index]);
        });
        placement.targetCoords.forEach((coord) => placedCells.add(cellKey(coord)));

        for (const cascaded of placement.cascadeClusters) {
            cascaded.forEach((tile) => boardCellMap.delete(cellKey({ r: tile.currentR, c: tile.currentC })));
            needsPlacement.push(cascaded);
        }
    }

    if (failedGroup) {
        return {
            cells: failedGroup.map((tile) => ({ r: tile.currentR, c: tile.currentC })),
            status: 'invalid'
        };
    }

    const newTiles = reassignTiles(tiles, draggedKeys, delta, reassignment);
    const allHome = newTiles.every(isTileHome);
    const draggedMovedHome = draggedTiles.some((draggedTile) => {
        const before = tiles.find((tile) => tileKey(tile) === tileKey(draggedTile));
        const after = newTiles.find((tile) => tileKey(tile) === tileKey(draggedTile));
        return !isTileHome(before) && isTileHome(after);
    });

    if (allHome && reassignment.size > 0 && !draggedMovedHome) {
        return {
            outcome: 'move',
            status: 'success',
            tiles: rotateDisplacedTiles(newTiles, reassignment)
        };
    }

    if (allHome) {
        return {
            outcome: 'win',
            status: 'success',
            tiles: newTiles
        };
    }

    const anyDraggedTileLockedHome = newTiles.some((tile) => draggedKeys.has(tileKey(tile)) && isTileHome(tile));
    return {
        outcome: anyDraggedTileLockedHome ? 'lock' : 'move',
        status: 'success',
        tiles: newTiles
    };
}
