// src/services/audioCapture.js
// Audio capture service: captures mic, produces 16-bit PCM chunks, fallback to ScriptProcessor.
// Exposes: start(), stop(), onChunk(cb), onError(cb), enableMock(modeSeconds)
const DEFAULT_SAMPLE_RATE = 16000; // adjust based on transcription API (Deepgram often accepts 16k)
const CHUNK_MS = 250; // produce ~250ms chunks

function floatTo16BitPCM(float32Array) {
    const l = float32Array.length;
    const buffer = new ArrayBuffer(l * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < l; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Int16Array(buffer);
}

export default function createAudioCapture({ mock = false, targetSampleRate = DEFAULT_SAMPLE_RATE } = {}) {
    let audioContext = null;
    let mediaStream = null;
    let node = null;
    let audioInput = null;
    let recording = false;
    let chunkCallback = null;
    let errorCallback = null;



    // mock helpers
    let mockTimer = null;
    let mockCounter = 0;

    function onChunk(cb) {
        chunkCallback = cb;
    }
    function onError(cb) {
        errorCallback = cb;
    }

    async function start() {
        if (recording) return;
        recording = true;

        if (mock) {
            // start mock transcript emission (for dev)
            mockTimer = setInterval(() => {
                mockCounter += 1;
                const isFinal = mockCounter % 3 === 0; // every third message final
                const text = ["hello", "this is a mock line", "testing sentiment aura", "AI demo"][mockCounter % 4];
                if (chunkCallback) {
                    // mimic the transcription payload format: {text, is_final}
                    chunkCallback({ text: `[MOCK] ${text} (#${mockCounter})`, is_final: isFinal });
                }
            }, 1200);
            return;
        }

        try {
            // request mic
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

            // create audio context
            audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // If the audio context sample rate differs, we will resample in the processor
            const inputSampleRate = audioContext.sampleRate || 48000;

            audioInput = audioContext.createMediaStreamSource(mediaStream);

            // Prefer AudioWorklet if available
            if (audioContext.audioWorklet) {
                try {
                    // Create a tiny worklet processor inline using a Blob + URL to avoid extra files.
                    const processorCode = `
            class RecorderProcessor extends AudioWorkletProcessor {
              constructor() {
                super();
                this._buffer = [];
                this._bufferFrames = Math.ceil(${(CHUNK_MS / 1000) * 48000}); // frames at 48k (approx)
                this.port.onmessage = (evt) => {
                  if (evt.data && evt.data.cmd === 'flush') {
                    this._buffer = [];
                  }
                };
              }
              process(inputs) {
                const input = inputs[0];
                if (!input || input.length === 0) return true;
                // pick channel 0
                const ch = input[0];
                this._buffer.push(new Float32Array(ch));
                // when buffer gets large enough, post it to main
                const totalLen = this._buffer.reduce((s, a) => s + a.length, 0);
                if (totalLen >= this._bufferFrames) {
                  // concat
                  const out = new Float32Array(totalLen);
                  let offset = 0;
                  for (let i = 0; i < this._buffer.length; i++) {
                    out.set(this._buffer[i], offset);
                    offset += this._buffer[i].length;
                  }
                  this.port.postMessage({ audio: out.buffer }, [out.buffer]);
                  this._buffer = [];
                }
                return true;
              }
            }
            registerProcessor('recorder-processor', RecorderProcessor);
          `;
                    const blob = new Blob([processorCode], { type: "application/javascript" });
                    const url = URL.createObjectURL(blob);
                    await audioContext.audioWorklet.addModule(url);
                    node = new AudioWorkletNode(audioContext, 'recorder-processor');
                    node.port.onmessage = (e) => {
                        const ab = e.data.audio;
                        if (ab && ab.byteLength) {
                            const float32 = new Float32Array(ab);
                            handleFloat32Chunk(float32, inputSampleRate, targetSampleRate);
                        }
                    };
                    audioInput.connect(node);
                    node.connect(audioContext.destination); // keep context running; no audible output due to pointer-events none
                } catch (e) {
                    console.warn("AudioWorklet failed, falling back to ScriptProcessor:", e);
                    // fallback to script processor below
                    setupScriptProcessor();
                }
            } else {
                setupScriptProcessor();
            }
        } catch (err) {
            recording = false;
            if (errorCallback) errorCallback(err);
            throw err;
        }
    }

    // fallback: ScriptProcessorNode
    function setupScriptProcessor() {
        const bufferSize = 4096;
        node = audioContext.createScriptProcessor(bufferSize, 1, 1);
        node.onaudioprocess = (audioProcessingEvent) => {
            const inputBuffer = audioProcessingEvent.inputBuffer;
            const channelData = inputBuffer.getChannelData(0);
            handleFloat32Chunk(channelData, audioContext.sampleRate, targetSampleRate);
        };
        audioInput.connect(node);
        node.connect(audioContext.destination);
    }

    // convert or resample float32 chunk to target rate then call chunkCallback with Int16
    function handleFloat32Chunk(float32, srcRate, dstRate) {
        // If srcRate === dstRate, just push; else simple linear resample
        let resampled;
        if (srcRate === dstRate) {
            resampled = float32;
        } else {
            // linear resample
            const ratio = srcRate / dstRate;
            const outLength = Math.round(float32.length / ratio);
            resampled = new Float32Array(outLength);
            for (let i = 0; i < outLength; i++) {
                const idx = i * ratio;
                const i0 = Math.floor(idx);
                const i1 = Math.min(i0 + 1, float32.length - 1);
                const frac = idx - i0;
                resampled[i] = (1 - frac) * float32[i0] + frac * float32[i1];
            }
        }

        // convert to 16-bit PCM
        const int16 = floatTo16BitPCM(resampled);
        // deliver
        if (chunkCallback) {
            // deliver {pcm: Int16Array, rawFloat: Float32Array, ts: Date.now()}
            chunkCallback({ pcm: int16, rawFloat: resampled, ts: Date.now() });
        }
    }

    async function stop() {
        if (!recording) return;
        recording = false;

        if (mock) {
            if (mockTimer) clearInterval(mockTimer);
            mockTimer = null;
            return;
        }

        try {
            if (node) {
                try {
                    node.disconnect && node.disconnect();
                    // for AudioWorkletNode try to port.postMessage to flush (best-effort)
                    if (node.port) node.port.postMessage({ cmd: "flush" });
                } catch (e) { console.log("Error disconnecting node:", e); }
                node = null;
            }
            if (audioInput) {
                audioInput.disconnect && audioInput.disconnect();
                audioInput = null;
            }
            if (mediaStream) {
                mediaStream.getTracks().forEach((t) => t.stop());
                mediaStream = null;
            }
            if (audioContext) {
                await audioContext.close();
                audioContext = null;
            }
        } catch (err) {
            console.warn("Error stopping audio:", err);
        }
    }

    function isRecording() {
        return recording;
    }

    return {
        start,
        stop,
        onChunk,
        onError,
        isRecording,
        enableMock: (m) => { mock = !!m; },
    };
}
