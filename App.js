import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom';
import htm from 'htm';
import * as Tone from 'tone';
import { Play, RotateCcw, Maximize, Settings, Info, AlertTriangle, CheckCircle2, Volume2, VolumeX, Upload } from 'lucide-react';

const html = htm.bind(React.createElement);
const DEFAULT_VIDEO = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

function App() {
    const [videoUrl, setVideoUrl] = useState('');
    const [gridSize, setGridSize] = useState(2);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isWon, setIsWon] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [tiles, setTiles] = useState([]);
    const [draggedGroup, setDraggedGroup] = useState(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [showHint, setShowHint] = useState(false);
    const [error, setError] = useState(null);
    const [status, setStatus] = useState('idle');
    const [isFetching, setIsFetching] = useState(false);
    const [invalidDropCells, setInvalidDropCells] = useState([]);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const requestRef = useRef(null);
    const synthRef = useRef(null);
    const fileInputRef = useRef(null);
    const blobUrlRef = useRef(null);

    useEffect(() => {
        synthRef.current = new Tone.PolySynth(Tone.Synth).toDestination();
        return () => {
            synthRef.current?.dispose();
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        };
    }, []);

    const playSound = (type) => {
        if (!synthRef.current) return;
        if (type === 'move') {
            synthRef.current.triggerAttackRelease("C4", "8n", undefined, 0.1);
        } else if (type === 'lock') {
            synthRef.current.triggerAttackRelease(["E4", "G4"], "8n", undefined, 0.2);
        } else if (type === 'win') {
            synthRef.current.triggerAttackRelease(["C4", "E4", "G4", "C5"], "2n");
        }
    };

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = isMuted;
        }
    }, [isMuted]);

    const handleStart = async (urlOverride = null) => {
        await Tone.start();
        setError(null);
        setStatus('loading');
        setIsWon(false);

        const url = (urlOverride || videoUrl).trim();
        
        const isBlob = url.startsWith('blob:');
        if (url && !isBlob && !url.match(/\.(mp4|webm|ogv|ogg|mov|m4v)$/i) && !url.includes('googleusercontent')) {
            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                setError("YouTube links are not supported due to browser security (CORS). Please use a direct .mp4 link.");
            } else if (url.includes('wikimedia.org/wiki/File:')) {
                setError("That's a link to a web page. Right-click the video and select 'Copy video address' for the direct .webm link.");
            } else {
                setError("This doesn't look like a direct video file. Ensure the URL ends in .mp4, .webm, or .ogg.");
            }
            setStatus('idle');
            return;
        }

        const source = url || DEFAULT_VIDEO;
        
        if (!videoRef.current) return;

        try {
            videoRef.current.crossOrigin = "anonymous";
            videoRef.current.src = source;
            videoRef.current.loop = true; // Ensure looping is set programmatically
            await videoRef.current.play();
            initPuzzle(gridSize);
            setIsPlaying(true);
            setStatus('playing');
        } catch (err) {
            console.error(err);
            setError("Failed to load video. Ensure the URL is correct and supports CORS.");
            setStatus('idle');
        }
    };

    const fetchRandomVideo = async () => {
        setIsFetching(true);
        setError(null);
        
        const searchTerms = [
            "movie preview", "film trailer", "cinema", "feature film", 
            "short film", "cinematic", "documentary preview", "movie clip",
            "animated film", "classic cinema", "public domain movie"
        ];

        const tryFetch = async (depth = 0) => {
            if (depth > 5) throw new Error("Could not find any movie previews after several attempts. Please try again.");
            
            try {
                const selectedTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
                const randomOffset = Math.floor(Math.random() * 100);
                const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(selectedTerm)}&gsrlimit=50&gsroffset=${randomOffset}&gsrnamespace=6&prop=imageinfo&iiprop=url|mime&format=json&origin=*`;
                
                const response = await fetch(searchUrl);
                const data = await response.json();
                
                let videos = [];
                if (data.query && data.query.pages) {
                    videos = Object.values(data.query.pages)
                        .filter(p => p.imageinfo?.[0]?.mime?.startsWith('video/'))
                        .map(p => p.imageinfo[0].url);
                }

                if (videos.length === 0) {
                    return await tryFetch(depth + 1);
                }

                const randomVideo = videos[Math.floor(Math.random() * videos.length)];
                setVideoUrl(randomVideo);
                handleStart(randomVideo);
            } catch (err) {
                return await tryFetch(depth + 1);
            }
        };

        try {
            await tryFetch();
        } catch (err) {
            console.error(err);
            setError(err.message || "Failed to fetch a movie preview.");
        } finally {
            setIsFetching(false);
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
            const url = URL.createObjectURL(file);
            blobUrlRef.current = url;
            setVideoUrl(url);
            handleStart(url);
        }
    };

    const getTileGroup = useCallback((startTile, allTiles) => {
        const group = [startTile];
        const queue = [startTile];
        const visited = new Set([`${startTile.r},${startTile.c}`]);
        const offsetR = startTile.currentR - startTile.r;
        const offsetC = startTile.currentC - startTile.c;

        while (queue.length > 0) {
            const current = queue.shift();
            const neighbors = allTiles.filter(t => {
                const key = `${t.r},${t.c}`;
                if (visited.has(key)) return false;
                const isAdjacent = Math.abs(t.currentR - current.currentR) + Math.abs(t.currentC - current.currentC) === 1;
                const sameOffset = (t.currentR - t.r === offsetR) && (t.currentC - t.c === offsetC);
                return isAdjacent && sameOffset;
            });

            for (const n of neighbors) {
                visited.add(`${n.r},${n.c}`);
                group.push(n);
                queue.push(n);
            }
        }
        return group;
    }, []);

    const getLockedSubgroups = useCallback((selectedTiles) => {
        const remaining = [...selectedTiles];
        const groups = [];

        while (remaining.length > 0) {
            const seed = remaining[0];
            const group = getTileGroup(seed, remaining);
            groups.push(group);

            const groupKeys = new Set(group.map(t => `${t.r},${t.c}`));
            for (let i = remaining.length - 1; i >= 0; i--) {
                if (groupKeys.has(`${remaining[i].r},${remaining[i].c}`)) {
                    remaining.splice(i, 1);
                }
            }
        }

        return groups.sort((a, b) => b.length - a.length);
    }, [getTileGroup]);

    const sortCoords = (coords) => [...coords].sort((a, b) => a.r !== b.r ? a.r - b.r : a.c - b.c);

    const flashInvalidDrop = useCallback((cells) => {
        setInvalidDropCells(cells);
        window.setTimeout(() => setInvalidDropCells([]), 220);
    }, []);

    const initPuzzle = useCallback((size) => {
        const newTiles = [];
        const positions = [];
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                newTiles.push({ r, c, currentR: r, currentC: c });
                positions.push({ r, c });
            }
        }
        
        for (let i = positions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [positions[i], positions[j]] = [positions[j], positions[i]];
        }

        const shuffledTiles = newTiles.map((tile, idx) => ({
            ...tile,
            currentR: positions[idx].r,
            currentC: positions[idx].c
        }));
        
        setTiles(shuffledTiles);
        setIsWon(false);
    }, []);

    const getPointerPos = (e) => {
        const rect = containerRef.current.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] || e.changedTouches[0] : e;
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };

    const handlePointerDown = useCallback((e) => {
        if (!isPlaying || isWon || showHint) return;
        e.preventDefault();
        const { x, y } = getPointerPos(e);
        const c = Math.floor((x / containerRef.current.getBoundingClientRect().width) * gridSize);
        const r = Math.floor((y / containerRef.current.getBoundingClientRect().height) * gridSize);
        const tile = tiles.find(t => t.currentR === r && t.currentC === c);
        if (tile) {
            const group = getTileGroup(tile, tiles);
            setDraggedGroup(group);
            setMousePos({ x, y });
        }
    }, [isPlaying, isWon, showHint, gridSize, tiles, getTileGroup]);

    const handlePointerMove = useCallback((e) => {
        if (!draggedGroup || !containerRef.current) return;
        e.preventDefault();
        setMousePos(getPointerPos(e));
    }, [draggedGroup]);

    const handlePointerUp = useCallback((e) => {
        if (!draggedGroup) return;
        e.preventDefault();
        const rect = containerRef.current.getBoundingClientRect();
        const { x, y } = getPointerPos(e);
        const pivot = draggedGroup[0];
        const targetC = Math.floor((x / rect.width) * gridSize);
        const targetR = Math.floor((y / rect.height) * gridSize);
        const dr = targetR - pivot.currentR;
        const dc = targetC - pivot.currentC;

        const canMove = draggedGroup.every(t => {
            const newR = t.currentR + dr;
            const newC = t.currentC + dc;
            return newR >= 0 && newR < gridSize && newC >= 0 && newC < gridSize;
        });

        if (canMove && (dr !== 0 || dc !== 0)) {
            const groupOldPositions = new Set(draggedGroup.map(t => `${t.currentR},${t.currentC}`));
            const groupNewPositions = new Set(draggedGroup.map(t => `${t.currentR + dr},${t.currentC + dc}`));
            const draggedKeys = new Set(draggedGroup.map(t => `${t.r},${t.c}`));

            const nonDraggedTiles = tiles.filter(t => !draggedKeys.has(`${t.r},${t.c}`));
            const allLockedGroups = getLockedSubgroups(nonDraggedTiles);

            // Cascading displacement: displaced clusters can land anywhere
            // on the grid, displacing further clusters as needed.
            const touchedGroups = allLockedGroups.filter(group =>
                group.some(t => groupNewPositions.has(`${t.currentR},${t.currentC}`))
            );

            // Map each board cell to its cluster (for untouched tiles only)
            const boardCellMap = new Map();
            allLockedGroups.forEach(group => {
                if (!touchedGroups.includes(group)) {
                    group.forEach(t => boardCellMap.set(`${t.currentR},${t.currentC}`, group));
                }
            });

            // Dragged group's new cells are permanently occupied
            const fixedCells = new Set(groupNewPositions);
            // Cells claimed by successfully placed displaced clusters
            const placedCells = new Set();

            const needsPlacement = [...touchedGroups];
            const reassignment = new Map();
            let failedGroup = null;

            // Remove initially displaced clusters from the board
            touchedGroups.forEach(group => {
                group.forEach(t => boardCellMap.delete(`${t.currentR},${t.currentC}`));
            });

            const maxIterations = gridSize * gridSize;
            let iterations = 0;

            while (needsPlacement.length > 0) {
                if (++iterations > maxIterations) {
                    failedGroup = needsPlacement[0];
                    break;
                }

                // Place largest clusters first (fewest valid positions)
                needsPlacement.sort((a, b) => b.length - a.length);
                const cluster = needsPlacement.shift();

                const baseR = Math.min(...cluster.map(t => t.currentR));
                const baseC = Math.min(...cluster.map(t => t.currentC));
                const shape = cluster.map(t => ({
                    tile: t,
                    dr: t.currentR - baseR,
                    dc: t.currentC - baseC
                }));
                const maxDR = Math.max(...shape.map(s => s.dr));
                const maxDC = Math.max(...shape.map(s => s.dc));

                let bestPlacement = null;
                let bestCascadeSize = Infinity;

                for (let r = 0; r <= gridSize - 1 - maxDR; r++) {
                    for (let c = 0; c <= gridSize - 1 - maxDC; c++) {
                        const targetCoords = shape.map(part => ({
                            r: r + part.dr,
                            c: c + part.dc
                        }));

                        // Cannot overlap dragged group or already-placed clusters
                        if (targetCoords.some(coord =>
                            fixedCells.has(`${coord.r},${coord.c}`) ||
                            placedCells.has(`${coord.r},${coord.c}`)
                        )) continue;

                        // Find board clusters this placement would cascade
                        const cascadeSet = new Set();
                        for (const coord of targetCoords) {
                            const hit = boardCellMap.get(`${coord.r},${coord.c}`);
                            if (hit) cascadeSet.add(hit);
                        }

                        const cascadeSize = [...cascadeSet].reduce((sum, g) => sum + g.length, 0);
                        if (cascadeSize < bestCascadeSize) {
                            bestCascadeSize = cascadeSize;
                            bestPlacement = { targetCoords, cascadeClusters: [...cascadeSet] };
                            if (cascadeSize === 0) break; // perfect fit
                        }
                    }
                    if (bestPlacement && bestCascadeSize === 0) break;
                }

                if (!bestPlacement) {
                    failedGroup = cluster;
                    break;
                }

                // Commit this placement
                shape.forEach((part, index) => {
                    reassignment.set(`${part.tile.r},${part.tile.c}`, bestPlacement.targetCoords[index]);
                });
                bestPlacement.targetCoords.forEach(coord =>
                    placedCells.add(`${coord.r},${coord.c}`)
                );

                // Cascade: remove overlapped board clusters and queue them
                for (const cascaded of bestPlacement.cascadeClusters) {
                    cascaded.forEach(t => boardCellMap.delete(`${t.currentR},${t.currentC}`));
                    needsPlacement.push(cascaded);
                }
            }

            if (failedGroup) {
                flashInvalidDrop(failedGroup.map(t => ({ r: t.currentR, c: t.currentC })));
                setDraggedGroup(null);
                return;
            }

            const newTiles = tiles.map(t => {
                const tileKey = `${t.r},${t.c}`;
                if (draggedKeys.has(tileKey)) {
                    return { ...t, currentR: t.currentR + dr, currentC: t.currentC + dc };
                }
                const reassignedSpot = reassignment.get(tileKey);
                if (reassignedSpot) {
                    return { ...t, currentR: reassignedSpot.r, currentC: reassignedSpot.c };
                }
                return t;
            });
            
            const allHome = newTiles.every(t => t.r === t.currentR && t.c === t.currentC);
            if (allHome && reassignment.size === 0) {
                // Player placed the final piece — legitimate win
                setTiles(newTiles);
                setIsWon(true);
                playSound('win');
            } else if (allHome && reassignment.size > 0) {
                // Displacement accidentally solved the puzzle — reshuffle
                // displaced tiles by rotating their positions so none stay home
                const displacedKeys = [...reassignment.keys()];
                const homePositions = displacedKeys.map(key => {
                    const t = newTiles.find(t => `${t.r},${t.c}` === key);
                    return { r: t.currentR, c: t.currentC };
                });
                // Rotate by 1: each displaced tile gets the next one's position
                const rotated = [...homePositions.slice(1), homePositions[0]];
                const reshuffled = newTiles.map(t => {
                    const idx = displacedKeys.indexOf(`${t.r},${t.c}`);
                    if (idx !== -1) {
                        return { ...t, currentR: rotated[idx].r, currentC: rotated[idx].c };
                    }
                    return t;
                });
                setTiles(reshuffled);
                playSound('move');
            } else {
                setTiles(newTiles);
                const anyLocked = newTiles.some(t => {
                    if (!draggedKeys.has(`${t.r},${t.c}`)) return false;
                    return t.r === t.currentR && t.c === t.currentC;
                });
                playSound(anyLocked ? 'lock' : 'move');
            }
        }
        setDraggedGroup(null);
    }, [draggedGroup, gridSize, tiles, getLockedSubgroups, flashInvalidDrop, playSound]);

    useEffect(() => {
        const container = containerRef.current;
        const root = document.getElementById('root-inner');
        if (!container || !root) return;
        container.addEventListener('touchstart', handlePointerDown, { passive: false });
        root.addEventListener('touchmove', handlePointerMove, { passive: false });
        root.addEventListener('touchend', handlePointerUp, { passive: false });
        return () => {
            container.removeEventListener('touchstart', handlePointerDown);
            root.removeEventListener('touchmove', handlePointerMove);
            root.removeEventListener('touchend', handlePointerUp);
        };
    }, [handlePointerDown, handlePointerMove, handlePointerUp]);

    const resetPuzzle = () => {
        setIsPlaying(false);
        setIsWon(false);
        setStatus('idle');
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.removeAttribute('src');
            videoRef.current.load();
        }
        cancelAnimationFrame(requestRef.current);
    };

    const renderFrame = useCallback(() => {
        if (!isPlaying || !videoRef.current || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        const v = videoRef.current;
        const c = canvasRef.current;
        if (v.readyState < 2) {
            requestRef.current = requestAnimationFrame(renderFrame);
            return;
        }
        const videoAspect = v.videoWidth / v.videoHeight;
        const canvasAspect = c.width / c.height;
        let drawW, drawH, offsetX = 0, offsetY = 0;
        if (videoAspect > canvasAspect) {
            drawH = v.videoHeight;
            drawW = v.videoHeight * canvasAspect;
            offsetX = (v.videoWidth - drawW) / 2;
        } else {
            drawW = v.videoWidth;
            drawH = v.videoWidth / canvasAspect;
            offsetY = (v.videoHeight - drawH) / 2;
        }

        ctx.clearRect(0, 0, c.width, c.height);

        if (showHint) {
            ctx.drawImage(v, offsetX, offsetY, drawW, drawH, 0, 0, c.width, c.height);
            requestRef.current = requestAnimationFrame(renderFrame);
            return;
        }

        const tileW = c.width / gridSize;
        const tileH = c.height / gridSize;
        const sourceTileW = drawW / gridSize;
        const sourceTileH = drawH / gridSize;

        tiles.forEach(tile => {
            if (draggedGroup && draggedGroup.some(gt => gt.r === tile.r && gt.c === tile.c)) return;
            ctx.drawImage(v, offsetX + tile.c * sourceTileW, offsetY + tile.r * sourceTileH, sourceTileW, sourceTileH, tile.currentC * tileW, tile.currentR * tileH, tileW, tileH);
            ctx.strokeStyle = "rgba(255,255,255,0.1)";
            ctx.lineWidth = 1;
            ctx.strokeRect(tile.currentC * tileW, tile.currentR * tileH, tileW, tileH);

            if (invalidDropCells.some(cell => cell.r === tile.currentR && cell.c === tile.currentC)) {
                ctx.fillStyle = "rgba(239, 68, 68, 0.35)";
                ctx.fillRect(tile.currentC * tileW, tile.currentR * tileH, tileW, tileH);
                ctx.strokeStyle = "rgba(248, 113, 113, 0.95)";
                ctx.lineWidth = 3;
                ctx.strokeRect(tile.currentC * tileW + 1.5, tile.currentR * tileH + 1.5, tileW - 3, tileH - 3);
            }
        });

        if (draggedGroup && draggedGroup.length > 0) {
            const rect = containerRef.current.getBoundingClientRect();
            const canvasX = (mousePos.x / rect.width) * c.width;
            const canvasY = (mousePos.y / rect.height) * c.height;
            const pivot = draggedGroup[0];
            ctx.save();
            ctx.shadowBlur = 20;
            ctx.shadowColor = "rgba(0,0,0,0.5)";
            draggedGroup.forEach(tile => {
                const relC = tile.currentC - pivot.currentC;
                const relR = tile.currentR - pivot.currentR;
                const drawX = canvasX + (relC * tileW) - (tileW / 2);
                const drawY = canvasY + (relR * tileH) - (tileH / 2);
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = "#1e293b";
                ctx.fillRect(tile.currentC * tileW, tile.currentR * tileH, tileW, tileH);
                ctx.globalAlpha = 1.0;
                ctx.drawImage(v, offsetX + tile.c * sourceTileW, offsetY + tile.r * sourceTileH, sourceTileW, sourceTileH, drawX, drawY, tileW, tileH);
                ctx.strokeStyle = "#3b82f6";
                ctx.lineWidth = 3;
                ctx.strokeRect(drawX, drawY, tileW, tileH);
            });
            ctx.restore();
        }
        requestRef.current = requestAnimationFrame(renderFrame);
    }, [isPlaying, isWon, gridSize, tiles, draggedGroup, mousePos, invalidDropCells, showHint]);

    useEffect(() => {
        if (isPlaying) requestRef.current = requestAnimationFrame(renderFrame);
        return () => cancelAnimationFrame(requestRef.current);
    }, [isPlaying, renderFrame]);

    return html`
        <div id="root-inner" className="min-h-screen p-4 md:p-8 flex flex-col items-center justify-center bg-[#0f172a] text-slate-100 font-sans" onMouseMove=${handlePointerMove} onMouseUp=${handlePointerUp}>
            ${!isPlaying && html`
                <header className="mb-8 text-center max-w-2xl">
                    <h1 className="text-4xl font-black mb-2 bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">LIVE VIDEO PUZZLE</h1>
                    <p className="text-slate-400">Drag video clusters to swap their positions and solve the puzzle.</p>
                </header>
            `}
            <main className="w-full max-w-6xl ${isPlaying ? '' : 'grid grid-cols-1 lg:grid-cols-3 gap-8'} items-start">
                ${!isPlaying && html`
                    <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Direct Video URL</label>
                            <input type="text" placeholder="https://example.com/video.mp4" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-slate-100 placeholder:text-slate-600 transition-all" value=${videoUrl} onChange=${(e) => setVideoUrl(e.target.value)} />
                            <button onClick=${() => setVideoUrl(DEFAULT_VIDEO)} className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"><${Info} size=${12} /> Use Sample Video</button>
                        </div>
                        <div>
                            <div className="flex justify-between mb-2">
                                <label className="text-sm font-medium text-slate-300">Grid Size: ${gridSize}x${gridSize}</label>
                                <span className="text-xs text-slate-500">${gridSize * gridSize} tiles</span>
                            </div>
                            <input type="range" min="2" max="20" value=${gridSize} onChange=${(e) => setGridSize(parseInt(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                        </div>
                        <div className="flex flex-col gap-3">
                            <input type="file" ref=${fileInputRef} onChange=${handleFileUpload} accept="video/*" className="hidden" />
                            <div className="grid grid-cols-2 gap-3">
                                <button id="start-puzzle-btn" onClick=${() => handleStart()} disabled=${status === 'loading' || isFetching} className="col-span-1 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50">
                                    ${status === 'loading' ? 'Loading...' : html`<${Play} size=${20} /> Start`}
                                </button>
                                <button onClick=${() => fileInputRef.current.click()} disabled=${status === 'loading' || isFetching} className="col-span-1 py-3 bg-slate-700 hover:bg-slate-600 active:bg-slate-800 rounded-xl font-bold flex items-center justify-center gap-2 transition-all border border-slate-600 disabled:opacity-50">
                                    <${Upload} size=${20} /> Upload
                                </button>
                                <button onClick=${fetchRandomVideo} disabled=${status === 'loading' || isFetching} className="col-span-2 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50">
                                    ${isFetching ? 'Searching...' : html`Random Video`}
                                </button>
                            </div>
                        </div>
                        <div className="bg-blue-500/10 p-4 rounded-xl border border-blue-500/20">
                            <p className="text-xs text-blue-300 leading-relaxed"><span className="font-bold">Tip:</span> Tiles that belong together will lock into clusters. Dragging a cluster moves the entire group!</p>
                        </div>
                        ${error && html`<div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-3"><${AlertTriangle} className="text-red-500 shrink-0" size=${20} /><p className="text-xs text-red-400 leading-relaxed">${error}</p></div>`}
                    </div>
                `}
                <div className="${isPlaying ? 'w-full' : 'lg:col-span-2'} relative">
                    ${isPlaying && !isWon && html`
                        <div className="absolute top-3 right-3 z-10 flex gap-2">
                            <button onMouseDown=${() => setShowHint(true)} onMouseUp=${() => setShowHint(false)} onMouseLeave=${() => setShowHint(false)} onTouchStart=${() => setShowHint(true)} onTouchEnd=${() => setShowHint(false)} className="p-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-600 transition-all" title="Hold to Peek">
                                <${Maximize} size=${18} />
                            </button>
                            <button onClick=${() => setIsMuted(!isMuted)} className="p-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-600 transition-all" title=${isMuted ? 'Unmute' : 'Mute'}>
                                ${isMuted ? html`<${VolumeX} size=${18} />` : html`<${Volume2} size=${18} />`}
                            </button>
                            <button onClick=${resetPuzzle} className="p-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-600 transition-all" title="Settings">
                                <${Settings} size=${18} />
                            </button>
                        </div>
                    `}
                    <div ref=${containerRef} className="aspect-video bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl relative select-none" style=${{ cursor: isPlaying && !isWon ? (draggedGroup ? 'grabbing' : 'grab') : 'default', touchAction: 'none' }} onMouseDown=${handlePointerDown}>
                        ${!isPlaying && status === 'idle' && html`<div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600"><${Maximize} size=${48} strokeWidth=${1} className="mb-4 opacity-20" /><p>Enter a URL and click Start</p></div>`}
                        <canvas ref=${canvasRef} width="1280" height="720" className="w-full h-full block" style=${{ display: isPlaying ? 'block' : 'none' }} />
                        ${isWon && html`<div className="absolute inset-0 bg-emerald-500/20 backdrop-blur-sm flex flex-col items-center justify-center transition-all duration-500"><${CheckCircle2} size=${64} className="text-emerald-400 mb-4 animate-bounce" /><h2 className="text-4xl font-black text-white drop-shadow-lg">PUZZLE SOLVED!</h2><button onClick=${() => initPuzzle(gridSize)} className="mt-6 px-8 py-3 bg-white text-emerald-600 rounded-full font-bold hover:scale-105 transition-transform shadow-xl">Play Again</button></div>`}
                    </div>
                    <video ref=${videoRef} loop playsInline className="hidden" />
                </div>
            </main>
        </div>
    `;
}

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(App));
