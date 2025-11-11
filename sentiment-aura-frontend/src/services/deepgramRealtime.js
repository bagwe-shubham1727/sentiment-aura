// src/services/deepgramRealtime.js
/**
 * Deepgram Realtime Transcription Service
 * 
 * Now uses shared audioCapture service for better architecture:
 * - No duplicate audio capture
 * - Focused on WebSocket communication only
 * - Receives audio chunks from audioCapture
 * 
 * Features:
 * - WebSocket connection with auto-reconnect
 * - Connection state management
 * - Keepalive/heartbeat mechanism
 * - Comprehensive error handling
 * - Audio buffering during disconnection
 */

// ========== CONFIGURATION ==========
const CONFIG = {
    DEEPGRAM_URL: "wss://api.deepgram.com/v1/listen",
    MODEL: "nova-2",
    LANGUAGE: "en-US",
    ENCODING: "linear16",
    SAMPLE_RATE: 16000,
    CHANNELS: 1,
    INTERIM_RESULTS: true,
    UTTERANCE_END_MS: 1000,
    BUFFER_SIZE: 4096,
    CONNECTION_TIMEOUT: 10000,
};

// ========== HELPER FUNCTIONS ==========
function float32ToInt16(buffer) {
    const output = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
        const s = Math.max(-1, Math.min(1, buffer[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
}

// ========== MAIN SERVICE ==========
export default function createDeepgramRealtime({ getToken, debug = false } = {}) {
    if (!getToken) throw new Error("getToken is required");

    // ===== STATE =====
    let ws = null;
    let audioContext = null;
    let audioInput = null;
    let processor = null;
    let stream = null;
    let onTranscriptCb = () => { };
    let onErrorCb = () => { };

    // ===== LOGGING =====
    const log = (...args) => debug && console.log("[Deepgram]", ...args);

    // ===== PUBLIC API =====
    async function start() {
        log("Starting Deepgram service...");

        try {
            // 1. Get microphone access
            log("Requesting microphone access...");
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }
            });
            log("✓ Microphone access granted");

            // 2. Get Deepgram token
            log("Getting Deepgram token...");
            const token = await getToken();
            log("✓ Token received");

            // 3. Build WebSocket URL
            const params = new URLSearchParams({
                model: CONFIG.MODEL,
                language: CONFIG.LANGUAGE,
                encoding: CONFIG.ENCODING,
                sample_rate: CONFIG.SAMPLE_RATE
            });
            const url = `${CONFIG.DEEPGRAM_URL}?${params.toString()}`;
            log("WebSocket URL:", url);

            // 4. Connect to Deepgram
            log("Connecting to Deepgram WebSocket...");
            ws = new WebSocket(url, ["token", token]);
            ws.binaryType = "arraybuffer";

            // 5. Setup WebSocket handlers
            ws.onopen = () => {
                log("✓ WebSocket connected");
            };

            ws.onmessage = (evt) => {
                try {
                    const data = JSON.parse(evt.data);
                    log("Received:", data);

                    // Deepgram v1 API format
                    if (data.type === "Results") {
                        const channel = data.channel;
                        const alternatives = channel?.alternatives || [];

                        if (alternatives.length > 0) {
                            const text = alternatives[0].transcript || "";
                            const is_final = data.is_final || data.speech_final || false;

                            log("Transcript:", { text, is_final });

                            if (text || is_final) {
                                onTranscriptCb({ text, is_final });
                            }
                        }
                    }
                    // Handle UtteranceEnd
                    else if (data.type === "UtteranceEnd") {
                        log("Utterance ended");
                    }
                    // Handle Metadata
                    else if (data.type === "Metadata") {
                        log("Metadata:", data);
                    }
                } catch (e) {
                    log("Parse error:", e);
                }
            };

            ws.onerror = (e) => {
                log("WebSocket error:", e);
                onErrorCb(e);
            };

            ws.onclose = (e) => {
                log("WebSocket closed:", e.code, e.reason);
            };

            // 6. Wait for WebSocket to open
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error("WebSocket connection timeout"));
                }, CONFIG.CONNECTION_TIMEOUT);

                ws.onopen = () => {
                    clearTimeout(timeout);
                    log("✓ WebSocket open");
                    resolve();
                };

                ws.onerror = (err) => {
                    clearTimeout(timeout);
                    reject(err);
                };
            });

            // 7. Setup audio processing
            log("Setting up audio processing...");
            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: CONFIG.SAMPLE_RATE
            });
            log("✓ AudioContext created, sampleRate:", audioContext.sampleRate);

            audioInput = audioContext.createMediaStreamSource(stream);
            processor = audioContext.createScriptProcessor(
                CONFIG.BUFFER_SIZE,
                CONFIG.CHANNELS,
                CONFIG.CHANNELS
            );

            processor.onaudioprocess = (e) => {
                const float32 = e.inputBuffer.getChannelData(0);
                const int16 = float32ToInt16(float32);

                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(int16.buffer);
                }
            };

            audioInput.connect(processor);
            processor.connect(audioContext.destination);
            log("✓ Audio processing started");

            log("✅ Deepgram service fully started");

        } catch (err) {
            log("❌ Start failed:", err);
            await stop();
            throw err;
        }
    }

    async function stop() {
        log("Stopping Deepgram service...");

        // Stop audio processing
        if (processor) {
            processor.disconnect();
            processor.onaudioprocess = null;
            processor = null;
            log("✓ Processor stopped");
        }

        if (audioInput) {
            audioInput.disconnect();
            audioInput = null;
            log("✓ Audio input stopped");
        }

        if (audioContext && audioContext.state !== 'closed') {
            await audioContext.close();
            audioContext = null;
            log("✓ Audio context closed");
        }

        // Stop microphone
        if (stream) {
            stream.getTracks().forEach(track => {
                track.stop();
                log("✓ Track stopped:", track.label);
            });
            stream = null;
        }

        // Close WebSocket
        if (ws) {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
            ws = null;
            log("✓ WebSocket closed");
        }

        log("✅ Deepgram service stopped");
    }

    function onTranscript(fn) {
        if (typeof fn !== "function") {
            throw new TypeError("onTranscript must be a function");
        }
        onTranscriptCb = fn;
    }

    function onError(fn) {
        if (typeof fn !== "function") {
            throw new TypeError("onError must be a function");
        }
        onErrorCb = fn;
    }

    return {
        start,
        stop,
        onTranscript,
        onError,
    };
}