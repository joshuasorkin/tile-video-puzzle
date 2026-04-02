import * as Tone from 'tone';

const SOUND_MAP = {
    lock: { duration: '8n', notes: ['E4', 'G4'], velocity: 0.2 },
    move: { duration: '8n', notes: 'C4', velocity: 0.1 },
    win: { duration: '2n', notes: ['C4', 'E4', 'G4', 'C5'] }
};

export function createAudioController() {
    const synth = new Tone.PolySynth(Tone.Synth).toDestination();

    return {
        async start() {
            await Tone.start();
        },
        dispose() {
            synth.dispose();
        },
        play(type) {
            const config = SOUND_MAP[type];
            if (!config) return;
            synth.triggerAttackRelease(config.notes, config.duration, undefined, config.velocity);
        }
    };
}
