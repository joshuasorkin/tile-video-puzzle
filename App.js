import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom';
import htm from 'htm';
import {
    AlertTriangle,
    CheckCircle2,
    Info,
    Maximize,
    Play,
    Settings,
    Upload,
    Volume2,
    VolumeX
} from 'lucide-react';
import { createAudioController } from './audio-controller.js';
import { renderPuzzleFrame } from './canvas-renderer.js';
import { DEFAULT_VIDEO, INVALID_DROP_FLASH_MS } from './constants.js';
import { createShuffledTiles, getTileGroup, moveDraggedGroup } from './puzzle-engine.js';
import { fetchRandomVideoUrl, validateVideoUrl } from './video-source.js';

const html = htm.bind(React.createElement);

function getPointerPos(container, event) {
    const rect = container.getBoundingClientRect();
    const touch = event.touches ? event.touches[0] || event.changedTouches[0] : event;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
}

function getGridCell(container, point, gridSize) {
    const rect = container.getBoundingClientRect();
    return {
        c: Math.floor((point.x / rect.width) * gridSize),
        r: Math.floor((point.y / rect.height) * gridSize)
    };
}

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

    const audioRef = useRef(null);
    const blobUrlRef = useRef(null);
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const fileInputRef = useRef(null);
    const frameRequestRef = useRef(null);
    const invalidDropTimeoutRef = useRef(null);
    const videoRef = useRef(null);

    useEffect(() => {
        audioRef.current = createAudioController();

        return () => {
            audioRef.current?.dispose();
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
            }
            if (invalidDropTimeoutRef.current) {
                window.clearTimeout(invalidDropTimeoutRef.current);
            }
            cancelAnimationFrame(frameRequestRef.current);
        };
    }, []);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = isMuted;
        }
    }, [isMuted]);

    const startPuzzle = useCallback(async (sourceOverride = null) => {
        const nextUrl = (sourceOverride ?? videoUrl).trim();
        const validation = validateVideoUrl(nextUrl);
        if (!validation.ok) {
            setError(validation.message);
            setStatus('idle');
            return;
        }

        if (!videoRef.current) return;

        try {
            await audioRef.current?.start();
            setError(null);
            setStatus('loading');
            setIsWon(false);

            const source = validation.url || DEFAULT_VIDEO;
            videoRef.current.crossOrigin = 'anonymous';
            videoRef.current.src = source;
            videoRef.current.loop = true;
            await videoRef.current.play();

            setTiles(createShuffledTiles(gridSize));
            setIsPlaying(true);
            setStatus('playing');
        } catch (err) {
            console.error(err);
            setError('Failed to load video. Ensure the URL is correct and supports CORS.');
            setStatus('idle');
        }
    }, [gridSize, videoUrl]);

    const handleFetchRandomVideo = useCallback(async () => {
        setIsFetching(true);
        setError(null);

        try {
            const randomVideoUrl = await fetchRandomVideoUrl();
            setVideoUrl(randomVideoUrl);
            await startPuzzle(randomVideoUrl);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to fetch a movie preview.');
        } finally {
            setIsFetching(false);
        }
    }, [startPuzzle]);

    const handleFileUpload = useCallback(async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
        }

        const blobUrl = URL.createObjectURL(file);
        blobUrlRef.current = blobUrl;
        setVideoUrl(blobUrl);
        await startPuzzle(blobUrl);
    }, [startPuzzle]);

    const flashInvalidDrop = useCallback((cells) => {
        setInvalidDropCells(cells);
        if (invalidDropTimeoutRef.current) {
            window.clearTimeout(invalidDropTimeoutRef.current);
        }
        invalidDropTimeoutRef.current = window.setTimeout(() => {
            setInvalidDropCells([]);
            invalidDropTimeoutRef.current = null;
        }, INVALID_DROP_FLASH_MS);
    }, []);

    const resetPuzzle = useCallback(() => {
        setIsPlaying(false);
        setIsWon(false);
        setStatus('idle');
        setDraggedGroup(null);
        setShowHint(false);

        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.removeAttribute('src');
            videoRef.current.load();
        }

        cancelAnimationFrame(frameRequestRef.current);
    }, []);

    const handlePointerDown = useCallback((event) => {
        if (!isPlaying || isWon || showHint || !containerRef.current) return;

        event.preventDefault();
        const point = getPointerPos(containerRef.current, event);
        const cell = getGridCell(containerRef.current, point, gridSize);
        const selectedTile = tiles.find((tile) => tile.currentR === cell.r && tile.currentC === cell.c);

        if (!selectedTile) return;

        setDraggedGroup(getTileGroup(selectedTile, tiles));
        setMousePos(point);
    }, [gridSize, isPlaying, isWon, showHint, tiles]);

    const handlePointerMove = useCallback((event) => {
        if (!draggedGroup || !containerRef.current) return;

        event.preventDefault();
        setMousePos(getPointerPos(containerRef.current, event));
    }, [draggedGroup]);

    const handlePointerUp = useCallback((event) => {
        if (!draggedGroup || !containerRef.current) return;

        event.preventDefault();
        const point = getPointerPos(containerRef.current, event);
        const target = getGridCell(containerRef.current, point, gridSize);
        const result = moveDraggedGroup({
            draggedGroup: { target, tiles: draggedGroup },
            gridSize,
            tiles
        });

        if (result.status === 'invalid') {
            flashInvalidDrop(result.cells);
            setDraggedGroup(null);
            return;
        }

        if (result.status === 'success') {
            setTiles(result.tiles);
            if (result.outcome === 'win') {
                setIsWon(true);
            }
            audioRef.current?.play(result.outcome);
        }

        setDraggedGroup(null);
    }, [draggedGroup, flashInvalidDrop, gridSize, tiles]);

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

    useEffect(() => {
        if (!isPlaying || !videoRef.current || !canvasRef.current || !containerRef.current) return undefined;

        const tick = () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const container = containerRef.current;

            if (!video || !canvas || !container) return;
            if (video.readyState < 2) {
                frameRequestRef.current = requestAnimationFrame(tick);
                return;
            }

            const rect = container.getBoundingClientRect();
            const scaledMousePos =
                draggedGroup && rect.width > 0 && rect.height > 0
                    ? {
                          x: (mousePos.x / rect.width) * canvas.width,
                          y: (mousePos.y / rect.height) * canvas.height
                      }
                    : mousePos;

            renderPuzzleFrame({
                canvas,
                draggedGroup,
                gridSize,
                invalidDropCells,
                mousePos: scaledMousePos,
                showHint,
                tiles,
                video
            });
            frameRequestRef.current = requestAnimationFrame(tick);
        };

        frameRequestRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameRequestRef.current);
    }, [draggedGroup, gridSize, invalidDropCells, isPlaying, mousePos, showHint, tiles]);

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
                            <input type="text" placeholder="https://example.com/video.mp4" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-slate-100 placeholder:text-slate-600 transition-all" value=${videoUrl} onChange=${(event) => setVideoUrl(event.target.value)} />
                            <button onClick=${() => setVideoUrl(DEFAULT_VIDEO)} className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"><${Info} size=${12} /> Use Sample Video</button>
                        </div>
                        <div>
                            <div className="flex justify-between mb-2">
                                <label className="text-sm font-medium text-slate-300">Grid Size: ${gridSize}x${gridSize}</label>
                                <span className="text-xs text-slate-500">${gridSize * gridSize} tiles</span>
                            </div>
                            <input type="range" min="2" max="20" value=${gridSize} onChange=${(event) => setGridSize(parseInt(event.target.value, 10))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                        </div>
                        <div className="flex flex-col gap-3">
                            <input type="file" ref=${fileInputRef} onChange=${handleFileUpload} accept="video/*" className="hidden" />
                            <div className="grid grid-cols-2 gap-3">
                                <button id="start-puzzle-btn" onClick=${() => startPuzzle()} disabled=${status === 'loading' || isFetching} className="col-span-1 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50">
                                    ${status === 'loading' ? 'Loading...' : html`<${Play} size=${20} /> Start`}
                                </button>
                                <button onClick=${() => fileInputRef.current.click()} disabled=${status === 'loading' || isFetching} className="col-span-1 py-3 bg-slate-700 hover:bg-slate-600 active:bg-slate-800 rounded-xl font-bold flex items-center justify-center gap-2 transition-all border border-slate-600 disabled:opacity-50">
                                    <${Upload} size=${20} /> Upload
                                </button>
                                <button onClick=${handleFetchRandomVideo} disabled=${status === 'loading' || isFetching} className="col-span-2 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50">
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
                        ${isWon && html`<div className="absolute inset-0 bg-emerald-500/20 backdrop-blur-sm flex flex-col items-center justify-center transition-all duration-500"><${CheckCircle2} size=${64} className="text-emerald-400 mb-4 animate-bounce" /><h2 className="text-4xl font-black text-white drop-shadow-lg">PUZZLE SOLVED!</h2><button onClick=${() => { setTiles(createShuffledTiles(gridSize)); setIsWon(false); }} className="mt-6 px-8 py-3 bg-white text-emerald-600 rounded-full font-bold hover:scale-105 transition-transform shadow-xl">Play Again</button></div>`}
                    </div>
                    <video ref=${videoRef} loop playsInline className="hidden" />
                </div>
            </main>
        </div>
    `;
}

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(App));
