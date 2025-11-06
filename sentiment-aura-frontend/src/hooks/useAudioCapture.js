// src/hooks/useAudioCapture.js
import React from "react";
import createAudioCapture from "../services/audioCapture";
import axios from "axios";

/**
 * useAudioCapture
 * @param {Function} setTranscript (React state setter)
 * @param {Function} setIsRecording (React state setter)
 * @param {Function} setSentiment (React state setter)
 * @param {Function} setKeywords (React state setter)
 * @param {Object} options - optional { mock: boolean, targetSampleRate: number }
 *
 * Returns { handleStart, handleStop }
 */
export default function useAudioCapture(
    setTranscript,
    setIsRecording,
    setSentiment,
    setKeywords,
    options = { mock: true, targetSampleRate: 16000 }
) {
    const audioServiceRef = React.useRef(null);

    // POST helper (kept stable with useCallback)
    const postToBackend = React.useCallback(
        async (text) => {
            try {
                const base = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
                const res = await axios.post(`${base}/process_text`, { text });
                if (res?.data) {
                    const { sentiment: s, keywords: ks } = res.data;
                    if (typeof s === "number") setSentiment(s);
                    if (Array.isArray(ks)) setKeywords(ks);
                }
            } catch (err) {
                console.warn("Backend /process_text failed:", err);
            }
        },
        [setSentiment, setKeywords]
    );

    // initialize audio service on mount
    React.useEffect(() => {
        // create service
        audioServiceRef.current = createAudioCapture({
            mock: !!options.mock,
            targetSampleRate: options.targetSampleRate || 16000,
        });

        // chunk handler
        const onChunkHandler = (payload) => {
            // Mock transcription payload path: { text, is_final }
            if (payload && payload.text && typeof payload.is_final !== "undefined") {
                // append transcript (partial or final)
                setTranscript((t) => [...t, payload.text + (payload.is_final ? "" : " ...")]);

                if (payload.is_final) {
                    // send final text to backend for sentiment/keywords
                    postToBackend(payload.text);
                }
                return;
            }

            // Real audio PCM chunk path
            if (payload && payload.pcm) {
                console.log("PCM chunk length:", payload.pcm.length, "ts:", payload.ts);
                // In a real integration you would stream payload.pcm.buffer via WebSocket to Deepgram here
            }
        };

        // error handler
        const onErrorHandler = (err) => {
            console.error("Audio error:", err);
        };

        // wire callbacks
        audioServiceRef.current.onChunk(onChunkHandler);
        audioServiceRef.current.onError(onErrorHandler);

        // cleanup on unmount
        return () => {
            if (audioServiceRef.current) {
                audioServiceRef.current.stop().catch(() => { });
                audioServiceRef.current = null;
            }
        };
        // include setters in deps so callback closures are fresh if they change
    }, [options.mock, options.targetSampleRate, postToBackend, setTranscript]);

    // start handler
    const handleStart = React.useCallback(async () => {
        try {
            if (!audioServiceRef.current) {
                audioServiceRef.current = createAudioCapture({
                    mock: !!options.mock,
                    targetSampleRate: options.targetSampleRate || 16000,
                });
            }
            await audioServiceRef.current.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Unable to start audio:", err);
            setIsRecording(false);
        }
    }, [options.mock, options.targetSampleRate, setIsRecording]);

    // stop handler
    const handleStop = React.useCallback(async () => {
        if (audioServiceRef.current) {
            await audioServiceRef.current.stop();
        }
        setIsRecording(false);
    }, [setIsRecording]);

    return { handleStart, handleStop };
}
