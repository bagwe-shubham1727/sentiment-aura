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
                    console.log("Calling backend with text:", text);

                    const res = await axios.post(
                        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:3001"}/process_text`,
                        { text },
                        { timeout: 20000 }
                    );

                    console.log("Backend response:", res.data);

                    // Handle new response structure
                    if (res.data.success && res.data.data) {
                        // Extract the analysis data from the nested structure
                        const analysisData = {
                            ...res.data.data,
                            // Optionally include metadata for debugging or display
                            metadata: res.data.metadata
                        };

                        console.log("Analysis result:", analysisData);
                        onAnalysisResult?.(analysisData);
                    } else {
                        // Handle error response from backend
                        console.error("Backend returned error:", res.data.error);
                        throw new Error(res.data.error?.message || "Backend returned unsuccessful response");
                    }

                } catch (err) {
                    console.error("Backend call failed:", err.message);

                    // Check if it's an Axios error with response data
                    if (err.response?.data) {
                        console.error("Error details:", err.response.data);

                        // If backend returned structured error, log it
                        if (err.response.data.error) {
                            console.error("Backend error message:", err.response.data.error.message);
                        }
                    }

                    // Fallback response for UI to continue working
                    const fallbackData = {
                        model: "fallback",
                        sentiment: 0.5,
                        sentiment_label: "neutral",
                        confidence: 0.5,
                        keywords: text.split(" ").filter(w => w.length > 3).slice(0, 5),
                        tone: "neutral",
                        short_summary: text.slice(0, 100),
                        error: true,
                        error_message: err.message
                    };

                    onAnalysisResult?.(fallbackData);
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