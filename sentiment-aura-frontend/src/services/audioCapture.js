// src/services/audioCapture.js
/**
 * Audio Capture Service
 * 
 * Pure audio capture service that:
 * - Captures microphone audio
 * - Converts Float32 to Int16 PCM
 * - Provides raw audio chunks
 * - Handles silence detection
 * - Manages audio resources
 * 
 * This service is decoupled from any specific use case,
 * making it reusable for multiple consumers (Deepgram, audio analyzer, etc.)
 */

// ========== CONFIGURATION ==========
const CONFIG = {
    DEFAULT_SAMPLE_RATE: 16000,
    BUFFER_SIZE: 4096,
    CHANNELS: 1,
    SILENCE_THRESHOLD: 0.01,
    MAX_BUFFER_QUEUE: 50, // Max chunks to buffer
};

// ========== ERROR TYPES ==========
class AudioCaptureError extends Error {
    constructor(message, type, originalError = null) {
        super(message);
        this.name = "AudioCaptureError";
        this.type = type;
        this.originalError = originalError;
        this.timestamp = new Date().toISOString();
    }
}

const ERROR_TYPES = {
    PERMISSION_DENIED: "PERMISSION_DENIED",
    DEVICE_NOT_FOUND: "DEVICE_NOT_FOUND",
    DEVICE_IN_USE: "DEVICE_IN_USE",
    INITIALIZATION: "INITIALIZATION_ERROR",
    CONTEXT_ERROR: "CONTEXT_ERROR",
};

// ========== HELPER FUNCTIONS ==========
/**
 * Convert Float32Array to Int16Array (PCM)
 */
function floatTo16BitPCM(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
}

/**
 * Calculate RMS (Root Mean Square) for volume detection
 */
function calculateRMS(float32Array) {
    let sum = 0;
    for (let i = 0; i < float32Array.length; i++) {
        sum += float32Array[i] * float32Array[i];
    }
    return Math.sqrt(sum / float32Array.length);
}

/**
 * Detect if audio buffer contains silence
 */
function isSilence(float32Array, threshold = CONFIG.SILENCE_THRESHOLD) {
    const rms = calculateRMS(float32Array);
    return rms < threshold;
}

// ========== MAIN SERVICE FACTORY ==========
export default function createAudioCapture({
    targetSampleRate = CONFIG.DEFAULT_SAMPLE_RATE,
    enableSilenceDetection = true,
    debug = false,
} = {}) {
    // ===== STATE =====
    let audioContext = null;
    let mediaStream = null;
    let processor = null;
    let audioInput = null;
    let recording = false;
    let isPaused = false;
    let chunkBuffer = [];

    // ===== CALLBACKS =====
    let chunkCallback = null;
    let errorCallback = null;
    let silenceCallback = null;
    let resumeCallback = null;

    // ===== STATISTICS =====
    let stats = {
        chunksProcessed: 0,
        chunksSilent: 0,
        bytesProcessed: 0,
        startTime: null,
        lastChunkTime: null,
    };

    // ===== LOGGING =====
    const log = {
        info: (...args) => debug && console.log("[AudioCapture:INFO]", ...args),
        warn: (...args) => debug && console.warn("[AudioCapture:WARN]", ...args),
        error: (...args) => console.error("[AudioCapture:ERROR]", ...args),
        debug: (...args) => debug && console.log("[AudioCapture:DEBUG]", ...args),
    };

    // ===== ERROR HANDLING =====
    function handleError(error) {
        log.error("Error:", error);
        if (errorCallback) {
            try {
                errorCallback(error);
            } catch (err) {
                log.error("Error in error callback:", err);
            }
        }
    }

    // ===== AUDIO PROCESSING =====
    /**
     * Process audio buffer and emit chunk
     */
    function processAudioChunk(float32) {
        if (!recording || isPaused || !chunkCallback) return;

        stats.chunksProcessed++;
        stats.lastChunkTime = Date.now();

        // Detect silence
        const silent = enableSilenceDetection && isSilence(float32);

        if (silent) {
            stats.chunksSilent++;

            // Notify silence callback if registered
            if (silenceCallback) {
                try {
                    silenceCallback();
                } catch (err) {
                    log.warn("Error in silence callback:", err);
                }
            }

            // Optionally skip silent chunks
            // return; // Uncomment to skip sending silent audio
        } else if (stats.chunksSilent > 0 && resumeCallback) {
            // Notify resume callback (was silent, now has audio)
            try {
                resumeCallback();
            } catch (err) {
                log.warn("Error in resume callback:", err);
            }
            stats.chunksSilent = 0;
        }

        // Convert to PCM
        const int16 = floatTo16BitPCM(float32);
        stats.bytesProcessed += int16.byteLength;

        // Calculate volume (RMS)
        const volume = calculateRMS(float32);

        // Create chunk object
        const chunk = {
            pcm: int16,              // Int16Array (PCM format)
            rawFloat: float32,       // Float32Array (raw)
            timestamp: Date.now(),   // Timestamp
            volume,                  // Volume level (0-1)
            silent,                  // Is silence
            sampleRate: audioContext?.sampleRate || targetSampleRate,
            channels: CONFIG.CHANNELS,
            duration: float32.length / (audioContext?.sampleRate || targetSampleRate),
        };

        // Emit chunk
        try {
            chunkCallback(chunk);
        } catch (err) {
            log.error("Error in chunk callback:", err);
        }
    }

    // ===== PUBLIC API =====
    /**
     * Set chunk callback
     */
    function onChunk(cb) {
        if (typeof cb !== "function") {
            throw new TypeError("Chunk callback must be a function");
        }
        chunkCallback = cb;
    }

    /**
     * Set error callback
     */
    function onError(cb) {
        if (typeof cb !== "function") {
            throw new TypeError("Error callback must be a function");
        }
        errorCallback = cb;
    }

    /**
     * Set silence detected callback
     */
    function onSilence(cb) {
        if (typeof cb !== "function") {
            throw new TypeError("Silence callback must be a function");
        }
        silenceCallback = cb;
    }

    /**
     * Set audio resumed callback (after silence)
     */
    function onResume(cb) {
        if (typeof cb !== "function") {
            throw new TypeError("Resume callback must be a function");
        }
        resumeCallback = cb;
    }

    /**
     * Start audio capture
     */
    async function start() {
        if (recording) {
            log.warn("Already recording");
            return;
        }

        log.info("Starting audio capture...");
        recording = true;
        stats.startTime = Date.now();
        stats.chunksProcessed = 0;
        stats.chunksSilent = 0;
        stats.bytesProcessed = 0;

        try {
            // Request microphone access
            log.debug("Requesting microphone access...");
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: targetSampleRate,
                },
            });

            log.debug("Microphone access granted");

            // Create audio context
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContextClass({
                sampleRate: targetSampleRate,
            });

            log.info("Audio context created:", {
                sampleRate: audioContext.sampleRate,
                state: audioContext.state,
            });

            // Resume context if suspended
            if (audioContext.state === "suspended") {
                await audioContext.resume();
                log.debug("Audio context resumed");
            }

            // Create media stream source
            audioInput = audioContext.createMediaStreamSource(mediaStream);

            // Create script processor
            // Note: ScriptProcessorNode is deprecated but widely supported
            // TODO: Consider migrating to AudioWorkletNode for production
            processor = audioContext.createScriptProcessor(
                CONFIG.BUFFER_SIZE,
                CONFIG.CHANNELS,
                CONFIG.CHANNELS
            );

            log.debug("Script processor created:", {
                bufferSize: CONFIG.BUFFER_SIZE,
                channels: CONFIG.CHANNELS,
            });

            // Process audio
            processor.onaudioprocess = (event) => {
                if (!recording || isPaused) return;

                const float32 = event.inputBuffer.getChannelData(0);
                processAudioChunk(float32);
            };

            // Connect audio graph
            audioInput.connect(processor);
            processor.connect(audioContext.destination);

            log.info("Audio capture started successfully");

        } catch (err) {
            recording = false;
            log.error("Failed to start audio capture:", err);

            // Create user-friendly error
            let error;

            if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
                error = new AudioCaptureError(
                    "Microphone access denied. Please allow microphone permissions.",
                    ERROR_TYPES.PERMISSION_DENIED,
                    err
                );
            } else if (err.name === "NotFoundError") {
                error = new AudioCaptureError(
                    "No microphone found. Please connect a microphone.",
                    ERROR_TYPES.DEVICE_NOT_FOUND,
                    err
                );
            } else if (err.name === "NotReadableError") {
                error = new AudioCaptureError(
                    "Microphone is already in use by another application.",
                    ERROR_TYPES.DEVICE_IN_USE,
                    err
                );
            } else {
                error = new AudioCaptureError(
                    err.message || "Failed to initialize audio capture",
                    ERROR_TYPES.INITIALIZATION,
                    err
                );
            }

            handleError(error);
            throw error;
        }
    }

    /**
     * Stop audio capture
     */
    async function stop() {
        if (!recording) {
            log.warn("Not recording");
            return;
        }

        log.info("Stopping audio capture...");
        recording = false;
        isPaused = false;

        try {
            // Disconnect processor
            if (processor) {
                processor.disconnect();
                processor.onaudioprocess = null;
                processor = null;
                log.debug("Processor disconnected");
            }

            // Disconnect audio input
            if (audioInput) {
                audioInput.disconnect();
                audioInput = null;
                log.debug("Audio input disconnected");
            }

            // Close audio context
            if (audioContext) {
                if (audioContext.state !== "closed") {
                    await audioContext.close();
                    log.debug("Audio context closed");
                }
                audioContext = null;
            }

            // Stop media stream tracks
            if (mediaStream) {
                mediaStream.getTracks().forEach((track) => {
                    track.stop();
                    log.debug("Track stopped:", track.label);
                });
                mediaStream = null;
            }

            // Clear buffer
            chunkBuffer = [];

            // Log stats
            const duration = (Date.now() - stats.startTime) / 1000;
            log.info("Audio capture stopped. Stats:", {
                duration: `${duration.toFixed(2)}s`,
                chunksProcessed: stats.chunksProcessed,
                chunksSilent: stats.chunksSilent,
                bytesProcessed: `${(stats.bytesProcessed / 1024).toFixed(2)} KB`,
                avgChunkRate: `${(stats.chunksProcessed / duration).toFixed(2)} chunks/s`,
            });

        } catch (err) {
            log.error("Error stopping audio capture:", err);
            throw err;
        }
    }

    /**
     * Pause audio capture (keep resources, stop processing)
     */
    function pause() {
        if (!recording) {
            log.warn("Not recording, cannot pause");
            return;
        }

        if (isPaused) {
            log.warn("Already paused");
            return;
        }

        isPaused = true;
        log.info("Audio capture paused");
    }

    /**
     * Resume audio capture
     */
    function resume() {
        if (!recording) {
            log.warn("Not recording, cannot resume");
            return;
        }

        if (!isPaused) {
            log.warn("Not paused");
            return;
        }

        isPaused = false;
        log.info("Audio capture resumed");
    }

    /**
     * Check if currently recording
     */
    function isRecording() {
        return recording && !isPaused;
    }

    /**
     * Check if paused
     */
    function isPausedState() {
        return isPaused;
    }

    /**
     * Get current statistics
     */
    function getStats() {
        const duration = stats.startTime ? (Date.now() - stats.startTime) / 1000 : 0;

        return {
            ...stats,
            duration,
            avgChunkRate: duration > 0 ? stats.chunksProcessed / duration : 0,
            silencePercentage: stats.chunksProcessed > 0
                ? (stats.chunksSilent / stats.chunksProcessed) * 100
                : 0,
        };
    }

    /**
     * Get audio context info
     */
    function getAudioInfo() {
        if (!audioContext) return null;

        return {
            sampleRate: audioContext.sampleRate,
            state: audioContext.state,
            baseLatency: audioContext.baseLatency,
            outputLatency: audioContext.outputLatency,
        };
    }

    // Return public API
    return {
        start,
        stop,
        pause,
        resume,
        onChunk,
        onError,
        onSilence,
        onResume,
        isRecording,
        isPaused: isPausedState,
        getStats,
        getAudioInfo,
    };
}