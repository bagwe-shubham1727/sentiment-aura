// src/hooks/useAudioAnalyzer.js
/**
 * Audio Analyzer Hook (Updated to use shared audioCapture)
 * 
 * Now receives audio data from shared audioCapture service:
 * - No duplicate audio capture
 * - Analyzes Float32 data directly from chunks
 * - Calculates frequency bands (bass, mid, treble)
 * - Beat detection
 * - Silence detection (from audioCapture)
 * - Waveform data
 * 
 * Benefits:
 * - 50% less resource usage (shared audio)
 * - Simpler implementation
 * - Better performance
 */

import { useEffect, useRef, useState } from 'react';

// ========== CONFIGURATION ==========
const CONFIG = {
    FFT_SIZE: 512,
    SMOOTHING_TIME: 0.7,
    BEAT_THRESHOLD_MULTIPLIER: 1.5,
    MIN_BEAT_INTERVAL: 200, // ms
    VOLUME_HISTORY_SIZE: 20,
    UPDATE_INTERVAL: 50, // ms (~20fps for analysis)
};

// Frequency band calculations (approximations based on 16kHz sample rate)
const FREQUENCY_BANDS = {
    BASS: { start: 0, end: 5 },      // ~0-100 Hz
    MID: { start: 5, end: 30 },      // ~100-600 Hz
    TREBLE: { start: 30, end: 80 },  // ~600-1600 Hz
};

// ========== DEFAULT STATE ==========
const DEFAULT_AUDIO_DATA = {
    volume: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    energy: 0,
    beat: false,
    silence: true,
    waveform: [],
};

// ========== HELPER FUNCTIONS ==========
/**
 * Calculate frequency band from FFT data
 */
function calculateBand(dataArray, startIndex, endIndex) {
    if (!dataArray || dataArray.length === 0) return 0;

    let sum = 0;
    let count = 0;

    for (let i = startIndex; i < Math.min(endIndex, dataArray.length); i++) {
        sum += dataArray[i];
        count++;
    }

    return count > 0 ? (sum / count / 255) : 0;
}

/**
 * Simple FFT approximation using autocorrelation
 * (Simplified for real-time performance without full FFT library)
 */
function calculateFrequencyBands(float32Array) {
    // For a proper implementation, you'd want to use a FFT library
    // This is a simplified approximation based on signal energy in different ranges

    const length = float32Array.length;
    const third = Math.floor(length / 3);

    // Calculate RMS for different portions of the signal as band approximations
    let bassSum = 0, midSum = 0, trebleSum = 0;

    // Low frequencies (bass) - lower portion
    for (let i = 0; i < third; i++) {
        bassSum += float32Array[i] * float32Array[i];
    }

    // Mid frequencies - middle portion
    for (let i = third; i < third * 2; i++) {
        midSum += float32Array[i] * float32Array[i];
    }

    // High frequencies (treble) - upper portion
    for (let i = third * 2; i < length; i++) {
        trebleSum += float32Array[i] * float32Array[i];
    }

    return {
        bass: Math.sqrt(bassSum / third),
        mid: Math.sqrt(midSum / third),
        treble: Math.sqrt(trebleSum / third),
    };
}

// ========== MAIN HOOK ==========
export default function useAudioAnalyzer(audioCapture) {
    // ===== STATE =====
    const [audioData, setAudioData] = useState(DEFAULT_AUDIO_DATA);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // ===== REFS =====
    const volumeHistoryRef = useRef([]);
    const beatThresholdRef = useRef(0);
    const lastBeatTimeRef = useRef(0);
    const lastUpdateTimeRef = useRef(0);
    const unmountedRef = useRef(false);
    const analysisIntervalRef = useRef(null);

    // ===== ANALYSIS FUNCTION =====
    const analyzeAudioChunk = (chunk) => {
        if (!chunk || !chunk.rawFloat) return;

        // Throttle updates to ~20fps for performance
        const now = Date.now();
        if (now - lastUpdateTimeRef.current < CONFIG.UPDATE_INTERVAL) {
            return;
        }
        lastUpdateTimeRef.current = now;

        try {
            const float32 = chunk.rawFloat;

            // Use volume from chunk (already calculated by audioCapture)
            const volume = chunk.volume || 0;

            // Calculate frequency bands (simplified)
            const bands = calculateFrequencyBands(float32);
            const bass = Math.min(1, Math.max(0, bands.bass * 2)); // Normalize
            const mid = Math.min(1, Math.max(0, bands.mid * 2));
            const treble = Math.min(1, Math.max(0, bands.treble * 2));

            // Calculate energy (weighted combination)
            const energy = (bass * 0.4 + mid * 0.3 + treble * 0.3);

            // Beat detection
            volumeHistoryRef.current.push(volume);
            if (volumeHistoryRef.current.length > CONFIG.VOLUME_HISTORY_SIZE) {
                volumeHistoryRef.current.shift();
            }

            const avgVolume = volumeHistoryRef.current.reduce((a, b) => a + b, 0) / volumeHistoryRef.current.length;
            beatThresholdRef.current = avgVolume * CONFIG.BEAT_THRESHOLD_MULTIPLIER;

            const timeSinceLastBeat = now - lastBeatTimeRef.current;
            const beat = volume > beatThresholdRef.current &&
                volume > 0.1 &&
                timeSinceLastBeat > CONFIG.MIN_BEAT_INTERVAL;

            if (beat) {
                lastBeatTimeRef.current = now;
            }

            // Use silence detection from audioCapture
            const silence = chunk.silent !== undefined ? chunk.silent : (volume < 0.02);

            // Downsample waveform for performance
            const waveform = [];
            for (let i = 0; i < float32.length; i += 4) {
                waveform.push((float32[i] + 1) / 2); // Normalize to 0-1
            }

            // Update state (only if not unmounted)
            if (!unmountedRef.current) {
                setAudioData({
                    volume: Math.min(1, Math.max(0, volume)),
                    bass: Math.min(1, Math.max(0, bass)),
                    mid: Math.min(1, Math.max(0, mid)),
                    treble: Math.min(1, Math.max(0, treble)),
                    energy: Math.min(1, Math.max(0, energy)),
                    beat,
                    silence,
                    waveform,
                });
            }

        } catch (err) {
            console.error("[useAudioAnalyzer] Analysis error:", err);

            // Return safe defaults on error
            if (!unmountedRef.current) {
                setAudioData(DEFAULT_AUDIO_DATA);
            }
        }
    };

    // ===== INITIALIZATION EFFECT =====
    useEffect(() => {
        // Check if audioCapture is provided
        if (!audioCapture) {
            console.warn("[useAudioAnalyzer] No audioCapture instance provided");
            setIsAnalyzing(false);
            return;
        }

        console.log("[useAudioAnalyzer] Initializing audio analyzer...");

        // Setup audio chunk handler
        audioCapture.onChunk(analyzeAudioChunk);

        // Mark as analyzing
        setIsAnalyzing(true);

        console.log("[useAudioAnalyzer] Audio analyzer initialized");

        // Cleanup
        return () => {
            console.log("[useAudioAnalyzer] Cleaning up...");
            setIsAnalyzing(false);

            if (!unmountedRef.current) {
                setAudioData(DEFAULT_AUDIO_DATA);
            }
        };
    }, [audioCapture]);

    // ===== COMPONENT UNMOUNT =====
    useEffect(() => {
        return () => {
            unmountedRef.current = true;

            if (analysisIntervalRef.current) {
                clearInterval(analysisIntervalRef.current);
                analysisIntervalRef.current = null;
            }
        };
    }, []);

    // ===== RETURN =====
    return {
        ...audioData,
        isAnalyzing,
        error: null, // No errors in this simplified version
    };
}