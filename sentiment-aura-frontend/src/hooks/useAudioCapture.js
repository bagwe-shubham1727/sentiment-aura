// src/hooks/useAudioCapture.js
/**
 * Updated Audio Capture Hook
 * 
 * Now uses shared audioCapture service and coordinates:
 * - Shared audio capture instance
 * - Deepgram transcription
 * - Backend sentiment analysis
 * 
 * Benefits:
 * - Single audio capture for all services
 * - Better resource management
 * - Cleaner architecture
 */

import { useRef, useEffect, useCallback } from "react";
import createAudioCapture from "../services/audioCapture";
import createDeepgramRealtime from "../services/deepgramRealtime";
import axios from "axios";

// ========== CONFIGURATION ==========
const CONFIG = {
    BACKEND_URL: import.meta.env.VITE_BACKEND_URL || "http://localhost:3001",
    BACKEND_TIMEOUT: 20000,
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000,
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
    NETWORK: "NETWORK_ERROR",
    BACKEND: "BACKEND_ERROR",
    DEEPGRAM: "DEEPGRAM_ERROR",
    AUDIO: "AUDIO_ERROR",
    TIMEOUT: "TIMEOUT_ERROR",
};

// ========== MAIN HOOK ==========
export default function useAudioCapture({ getDeepgramToken, onError = () => { } }) {
    // ===== REFS =====
    const audioCaptureRef = useRef(null);
    const deepgramServiceRef = useRef(null);
    const handlersRef = useRef({});
    const pendingRequestsRef = useRef(new Set());
    const lastTranscriptRef = useRef("");

    // ===== CLEANUP =====
    const cleanup = useCallback(() => {
        console.log("[useAudioCapture] Cleaning up...");

        // Stop Deepgram
        if (deepgramServiceRef.current) {
            deepgramServiceRef.current.stop().catch(err => {
                console.warn("[useAudioCapture] Error stopping Deepgram:", err);
            });
            deepgramServiceRef.current = null;
        }

        // Stop audio capture
        if (audioCaptureRef.current) {
            audioCaptureRef.current.stop().catch(err => {
                console.warn("[useAudioCapture] Error stopping audio capture:", err);
            });
            audioCaptureRef.current = null;
        }

        // Cancel pending requests
        pendingRequestsRef.current.forEach((controller) => {
            try {
                controller.abort();
            } catch (err) {
                console.warn("[useAudioCapture] Error aborting request:", err);
            }
        });
        pendingRequestsRef.current.clear();

        lastTranscriptRef.current = "";
        handlersRef.current = {};

        console.log("[useAudioCapture] Cleanup complete");
    }, []);

    // ===== BACKEND API CALL =====
    const callBackendAPI = useCallback(
        async (text, retryCount = 0) => {
            if (!text || typeof text !== "string" || text.trim().length === 0) {
                console.warn("[useAudioCapture] Skipping empty text");
                return;
            }

            if (text === lastTranscriptRef.current) {
                console.log("[useAudioCapture] Skipping duplicate transcript");
                return;
            }

            lastTranscriptRef.current = text;

            console.log(`[useAudioCapture] Calling backend (attempt ${retryCount + 1}/${CONFIG.MAX_RETRIES + 1})...`);

            const controller = new AbortController();
            pendingRequestsRef.current.add(controller);

            const timeoutId = setTimeout(() => {
                controller.abort();
            }, CONFIG.BACKEND_TIMEOUT);

            try {
                const response = await axios.post(
                    `${CONFIG.BACKEND_URL}/process_text`,
                    { text: text.trim() },
                    {
                        timeout: CONFIG.BACKEND_TIMEOUT,
                        signal: controller.signal,
                        headers: { "Content-Type": "application/json" },
                    }
                );

                clearTimeout(timeoutId);
                pendingRequestsRef.current.delete(controller);

                console.log("[useAudioCapture] Backend response received:", response.data);

                if (response.data.success && response.data.data) {
                    const analysisData = {
                        ...response.data.data,
                        metadata: response.data.metadata,
                    };

                    if (handlersRef.current.onAnalysisResult) {
                        handlersRef.current.onAnalysisResult(analysisData);
                    }
                } else if (response.data.success === false) {
                    throw new AudioCaptureError(
                        response.data.error?.message || "Backend error",
                        ERROR_TYPES.BACKEND,
                        response.data.error
                    );
                } else {
                    console.warn("[useAudioCapture] Unexpected response format:", response.data);
                    if (handlersRef.current.onAnalysisResult) {
                        handlersRef.current.onAnalysisResult(response.data);
                    }
                }
            } catch (err) {
                clearTimeout(timeoutId);
                pendingRequestsRef.current.delete(controller);

                if (axios.isCancel(err) || err.name === "AbortError") {
                    if (retryCount < CONFIG.MAX_RETRIES) {
                        console.log(`[useAudioCapture] Retrying in ${CONFIG.RETRY_DELAY}ms...`);
                        setTimeout(() => {
                            callBackendAPI(text, retryCount + 1);
                        }, CONFIG.RETRY_DELAY);
                        return;
                    }

                    const timeoutError = new AudioCaptureError(
                        "Backend request timed out",
                        ERROR_TYPES.TIMEOUT,
                        err
                    );
                    onError(timeoutError);
                    provideFallbackAnalysis(text);
                    return;
                }

                if (err.code === "ERR_NETWORK" || !err.response) {
                    if (retryCount < CONFIG.MAX_RETRIES) {
                        setTimeout(() => {
                            callBackendAPI(text, retryCount + 1);
                        }, CONFIG.RETRY_DELAY);
                        return;
                    }

                    const networkError = new AudioCaptureError(
                        "Network error: Unable to reach backend",
                        ERROR_TYPES.NETWORK,
                        err
                    );
                    onError(networkError);
                    provideFallbackAnalysis(text);
                    return;
                }

                if (err.response) {
                    const errorMessage = err.response.data?.error?.message ||
                        err.response.data?.error ||
                        "Backend analysis failed";

                    const backendError = new AudioCaptureError(
                        errorMessage,
                        ERROR_TYPES.BACKEND,
                        err.response.data
                    );
                    onError(backendError);
                    provideFallbackAnalysis(text);
                    return;
                }

                const unknownError = new AudioCaptureError(
                    err.message || "Unknown error",
                    ERROR_TYPES.BACKEND,
                    err
                );
                onError(unknownError);
                provideFallbackAnalysis(text);
            }
        },
        [onError]
    );

    // ===== FALLBACK ANALYSIS =====
    const provideFallbackAnalysis = useCallback((text) => {
        console.log("[useAudioCapture] Providing fallback analysis");

        const words = text
            .toLowerCase()
            .replace(/[^\w\s]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length > 3);

        const uniqueWords = [...new Set(words)].slice(0, 5);

        const fallbackData = {
            model: "fallback",
            sentiment: 0.5,
            sentiment_label: "neutral",
            confidence: 0.3,
            keywords: uniqueWords,
            tone: "neutral",
            short_summary: text.slice(0, 100),
            error: true,
            error_message: "Using fallback analysis",
        };

        if (handlersRef.current.onAnalysisResult) {
            handlersRef.current.onAnalysisResult(fallbackData);
        }
    }, []);

    // ===== TRANSCRIPT HANDLER =====
    const handleTranscript = useCallback(
        async ({ text, is_final }) => {
            console.log("[useAudioCapture] Transcript:", { text, is_final });

            if (handlersRef.current.onTranscriptLine) {
                handlersRef.current.onTranscriptLine({ text, is_final });
            }

            if (is_final && text && text.trim()) {
                await callBackendAPI(text);
            }
        },
        [callBackendAPI]
    );

    // ===== ERROR HANDLER =====
    const handleError = useCallback(
        (err) => {
            console.error("[useAudioCapture] Error:", err);

            const wrappedError = new AudioCaptureError(
                err.message || "Audio capture error",
                err.type || ERROR_TYPES.AUDIO,
                err
            );
            onError(wrappedError);
        },
        [onError]
    );

    // ===== INITIALIZE SERVICES =====
    useEffect(() => {
        console.log("[useAudioCapture] Initializing services...");

        // Create shared audio capture (but don't start yet)
        try {
            audioCaptureRef.current = createAudioCapture({
                targetSampleRate: 16000,
                enableSilenceDetection: true,
                debug: import.meta.env.DEV,
            });

            console.log("[useAudioCapture] Audio capture instance created");
        } catch (err) {
            console.error("[useAudioCapture] Failed to create audio capture:", err);
            handleError(err);
        }

        // Create Deepgram service (but don't start yet)
        try {
            if (audioCaptureRef.current) {
                deepgramServiceRef.current = createDeepgramRealtime({
                    audioCapture: audioCaptureRef.current,
                    getToken: getDeepgramToken,
                    debug: import.meta.env.DEV,
                });

                // Setup handlers
                deepgramServiceRef.current.onTranscript(handleTranscript);
                deepgramServiceRef.current.onError(handleError);

                console.log("[useAudioCapture] Deepgram service created");
            }
        } catch (err) {
            console.error("[useAudioCapture] Failed to create Deepgram service:", err);
            handleError(err);
        }

        return cleanup;
    }, [getDeepgramToken, handleTranscript, handleError, cleanup]);

    // ===== START FUNCTION =====
    const start = useCallback(
        async ({ onTranscriptLine, onAnalysisResult } = {}) => {
            console.log("[useAudioCapture] Starting...");

            if (!onTranscriptLine || typeof onTranscriptLine !== "function") {
                throw new AudioCaptureError(
                    "onTranscriptLine callback is required",
                    ERROR_TYPES.AUDIO
                );
            }

            if (!onAnalysisResult || typeof onAnalysisResult !== "function") {
                throw new AudioCaptureError(
                    "onAnalysisResult callback is required",
                    ERROR_TYPES.AUDIO
                );
            }

            handlersRef.current = { onTranscriptLine, onAnalysisResult };

            if (!deepgramServiceRef.current) {
                throw new AudioCaptureError(
                    "Deepgram service not initialized",
                    ERROR_TYPES.DEEPGRAM
                );
            }

            try {
                // Start Deepgram (which will start audio capture)
                await deepgramServiceRef.current.start();
                console.log("[useAudioCapture] Started successfully");
            } catch (err) {
                console.error("[useAudioCapture] Failed to start:", err);
                throw new AudioCaptureError(
                    err.message || "Failed to start",
                    ERROR_TYPES.AUDIO,
                    err
                );
            }
        },
        []
    );

    // ===== STOP FUNCTION =====
    const stop = useCallback(async () => {
        console.log("[useAudioCapture] Stopping...");

        try {
            await cleanup();
            console.log("[useAudioCapture] Stopped successfully");
        } catch (err) {
            console.error("[useAudioCapture] Error stopping:", err);
            throw err;
        }
    }, [cleanup]);

    // ===== GET AUDIO CAPTURE INSTANCE =====
    const getAudioCapture = useCallback(() => {
        return audioCaptureRef.current;
    }, []);

    return { start, stop, getAudioCapture };
}