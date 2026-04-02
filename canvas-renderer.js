function drawGridOutline(ctx, tileW, tileH, tile) {
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(tile.currentC * tileW, tile.currentR * tileH, tileW, tileH);
}

function drawInvalidDropOverlay(ctx, tileW, tileH, tile) {
    ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.fillRect(tile.currentC * tileW, tile.currentR * tileH, tileW, tileH);
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.95)';
    ctx.lineWidth = 3;
    ctx.strokeRect(tile.currentC * tileW + 1.5, tile.currentR * tileH + 1.5, tileW - 3, tileH - 3);
}

export function getVideoDrawRegion(video, canvas) {
    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvas.width / canvas.height;
    let drawW;
    let drawH;
    let offsetX = 0;
    let offsetY = 0;

    if (videoAspect > canvasAspect) {
        drawH = video.videoHeight;
        drawW = video.videoHeight * canvasAspect;
        offsetX = (video.videoWidth - drawW) / 2;
    } else {
        drawW = video.videoWidth;
        drawH = video.videoWidth / canvasAspect;
        offsetY = (video.videoHeight - drawH) / 2;
    }

    return { drawH, drawW, offsetX, offsetY };
}

export function renderPuzzleFrame({
    canvas,
    draggedGroup,
    gridSize,
    invalidDropCells,
    mousePos,
    showHint,
    tiles,
    video
}) {
    const ctx = canvas.getContext('2d');
    const drawRegion = getVideoDrawRegion(video, canvas);
    const { drawH, drawW, offsetX, offsetY } = drawRegion;
    const tileW = canvas.width / gridSize;
    const tileH = canvas.height / gridSize;
    const sourceTileW = drawW / gridSize;
    const sourceTileH = drawH / gridSize;
    const invalidDropSet = new Set(invalidDropCells.map((cell) => `${cell.r},${cell.c}`));
    const draggedSet = new Set((draggedGroup || []).map((tile) => `${tile.r},${tile.c}`));

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (showHint) {
        ctx.drawImage(video, offsetX, offsetY, drawW, drawH, 0, 0, canvas.width, canvas.height);
        return;
    }

    tiles.forEach((tile) => {
        if (draggedSet.has(`${tile.r},${tile.c}`)) return;

        ctx.drawImage(
            video,
            offsetX + tile.c * sourceTileW,
            offsetY + tile.r * sourceTileH,
            sourceTileW,
            sourceTileH,
            tile.currentC * tileW,
            tile.currentR * tileH,
            tileW,
            tileH
        );
        drawGridOutline(ctx, tileW, tileH, tile);

        if (invalidDropSet.has(`${tile.currentR},${tile.currentC}`)) {
            drawInvalidDropOverlay(ctx, tileW, tileH, tile);
        }
    });

    if (!draggedGroup?.length || !mousePos) {
        return;
    }

    const pivot = draggedGroup[0];
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';

    draggedGroup.forEach((tile) => {
        const relC = tile.currentC - pivot.currentC;
        const relR = tile.currentR - pivot.currentR;
        const drawX = mousePos.x + relC * tileW - tileW / 2;
        const drawY = mousePos.y + relR * tileH - tileH / 2;

        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(tile.currentC * tileW, tile.currentR * tileH, tileW, tileH);
        ctx.globalAlpha = 1;
        ctx.drawImage(
            video,
            offsetX + tile.c * sourceTileW,
            offsetY + tile.r * sourceTileH,
            sourceTileW,
            sourceTileH,
            drawX,
            drawY,
            tileW,
            tileH
        );
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 3;
        ctx.strokeRect(drawX, drawY, tileW, tileH);
    });

    ctx.restore();
}
