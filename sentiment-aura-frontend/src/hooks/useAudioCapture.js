// src/hooks/useAudioCapture.js
import React from "react";
import createDeepgramRealtime from "../services/deepgramRealtime";
import axios from "axios";

export default function useAudioCapture({ getDeepgramToken, onError = () => { } } = {}) {
    const serviceRef = React.useRef(null);
    const handlersRef = React.useRef({});

    React.useEffect(() => {
        serviceRef.current = createDeepgramRealtime({
            getToken: getDeepgramToken,
            debug: true,
        });

        return () => serviceRef.current?.stop();
    }, [getDeepgramToken]);

    React.useEffect(() => {
        if (!serviceRef.current) return;

        serviceRef.current.onTranscript(async ({ text, is_final }) => {
            console.log("Transcript:", text, "Final:", is_final);

            const { onTranscriptLine, onAnalysisResult } = handlersRef.current;

            onTranscriptLine?.({ text, is_final });

            if (is_final && text.trim()) {
                try {
                    console.log("Calling backend...");
                    const res = await axios.post(
                        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:3001"}/process_text`,
                        { text },
                        { timeout: 20000 }
                    );
                    console.log("Backend response:", res.data);
                    onAnalysisResult?.(res.data);
                } catch (err) {
                    console.error("Backend failed:", err);
                    onAnalysisResult?.({
                        model: "fallback",
                        sentiment: 0.5,
                        keywords: text.split(" ").slice(0, 5)
                    });
                    onError(err);
                }
            }
        });

        serviceRef.current.onError(onError);
    }, [onError]);

    const start = React.useCallback(async ({ onTranscriptLine, onAnalysisResult } = {}) => {
        handlersRef.current = { onTranscriptLine, onAnalysisResult };
        await serviceRef.current?.start();
    }, []);

    const stop = React.useCallback(async () => {
        await serviceRef.current?.stop();
        handlersRef.current = {};
    }, []);

    return { start, stop };
}