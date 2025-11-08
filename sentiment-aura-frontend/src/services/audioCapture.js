// src/services/audioCapture.js
// Simplified audio capture service: captures mic, produces 16-bit PCM chunks
// Exposes: start(), stop(), onChunk(cb), onError(cb)

const DEFAULT_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

function floatTo16BitPCM(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
}

export default function createAudioCapture({ targetSampleRate = DEFAULT_SAMPLE_RATE } = {}) {
    let audioContext = null;
    let mediaStream = null;
    let processor = null;
    let audioInput = null;
    let recording = false;
    let chunkCallback = null;
    let errorCallback = null;

    function onChunk(cb) {
        chunkCallback = cb;
    }

    function onError(cb) {
        errorCallback = cb;
    }

    async function start() {
        if (recording) return;
        recording = true;

        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }
            });

            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: targetSampleRate
            });

            audioInput = audioContext.createMediaStreamSource(mediaStream);
            processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

            processor.onaudioprocess = (e) => {
                if (!recording || !chunkCallback) return;

                const float32 = e.inputBuffer.getChannelData(0);
                const int16 = floatTo16BitPCM(float32);

                chunkCallback({
                    pcm: int16,
                    rawFloat: float32,
                    ts: Date.now()
                });
            };

            audioInput.connect(processor);
            processor.connect(audioContext.destination);
        } catch (err) {
            recording = false;
            errorCallback?.(err);
            throw err;
        }
    }

    async function stop() {
        if (!recording) return;
        recording = false;

        if (processor) {
            processor.disconnect();
            processor.onaudioprocess = null;
            processor = null;
        }

        if (audioInput) {
            audioInput.disconnect();
            audioInput = null;
        }

        if (audioContext && audioContext.state !== 'closed') {
            await audioContext.close();
            audioContext = null;
        }

        mediaStream?.getTracks().forEach((t) => t.stop());
        mediaStream = null;
    }

    return {
        start,
        stop,
        onChunk,
        onError,
        isRecording: () => recording,
    };
}