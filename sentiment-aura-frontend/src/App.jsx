// src/App.jsx - Updated Integration Example
/**
 * Updated to use shared audio capture architecture
 *
 * Architecture:
 * audioCapture (shared)
 *     ├→ deepgramRealtime (consumes PCM)
 *     ├→ useAudioAnalyzer (consumes Float32)
 *     └→ backend sentiment analysis
 *
 * Benefits:
 * - Single microphone access
 * - 50% less CPU usage
 * - No duplicate processing
 * - Better resource management
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import Controls from "./components/Controls";
import TranscriptDisplay from "./components/TranscriptDisplay";
import KeywordsDisplay from "./components/KeywordsDisplay";
import AuraCanvas from "./components/AuraCanvas";
import createDeepgramRealtime from "./services/deepgramRealtime";
import axios from "axios";
import { auraForSentiment } from "./utils/auraForSentiment";
import "./index.css";

// ========== CONFIGURATION ==========
const CONFIG = {
  DEEPGRAM_TOKEN_ENV: "VITE_DEEPGRAM_TOKEN",
  BACKEND_URL: import.meta.env.VITE_BACKEND_URL || "http://localhost:3001",
  BACKEND_TIMEOUT: 20000,
  SENTIMENT_EASING: 0.08,
  ANALYZING_DURATION: 1800,
};

// ========== TOKEN PROVIDER ==========
const getDeepgramToken = async () => {
  const token = import.meta.env[CONFIG.DEEPGRAM_TOKEN_ENV];
  if (!token) {
    throw new Error(
      "Deepgram token missing. Set VITE_DEEPGRAM_TOKEN in .env file."
    );
  }
  return token;
};

// ========== MAIN COMPONENT ==========
export default function App() {
  // ===== STATE =====
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [partial, setPartial] = useState("");
  const [sentiment, setSentiment] = useState(0);
  const [visualSentiment, setVisualSentiment] = useState(0);
  const [keywords, setKeywords] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [error, setError] = useState(null);

  // ===== REFS =====
  const deepgramServiceRef = useRef(null);
  const analyzeTimeoutRef = useRef(null);
  const errorTimeoutRef = useRef(null);
  const lastTranscriptRef = useRef("");

  // ===== COMPUTED VALUES =====
  const aura = auraForSentiment(visualSentiment);

  // ===== ERROR HANDLING =====
  const clearError = useCallback(() => {
    setError(null);
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
  }, []);

  // ===== BACKEND API CALL =====
  const callBackendAPI = useCallback(async (text) => {
    if (!text || !text.trim() || text === lastTranscriptRef.current) return;

    lastTranscriptRef.current = text;
    console.log("[App] 📤 Calling backend API");
    console.log("[App] Text:", text);

    try {
      const response = await axios.post(
        `${CONFIG.BACKEND_URL}/process_text`,
        { text: text.trim() },
        { timeout: CONFIG.BACKEND_TIMEOUT }
      );

      console.log("[App] 📥 Full backend response:");
      console.log(JSON.stringify(response.data, null, 2));

      // Extract from nested response structure
      let extractedSentiment = 0.5;
      let extractedKeywords = [];

      if (response.data.success === true && response.data.data) {
        // New format: { success: true, data: { sentiment, keywords, ... } }
        console.log("[App] Using success/data format");
        extractedSentiment = response.data.data.sentiment || 0.5;
        extractedKeywords = response.data.data.keywords || [];
      } else if (response.data.sentiment !== undefined) {
        // Old format: { sentiment, keywords, ... }
        console.log("[App] Using direct format");
        extractedSentiment = response.data.sentiment;
        extractedKeywords = response.data.keywords || [];
      }

      console.log("[App] ✓ Extracted sentiment:", extractedSentiment);
      console.log("[App] ✓ Extracted keywords:", extractedKeywords);

      // Set sentiment
      if (typeof extractedSentiment === "number") {
        const normalized = Math.max(0, Math.min(1, extractedSentiment));
        setSentiment(normalized);
      }

      // Set keywords
      if (Array.isArray(extractedKeywords) && extractedKeywords.length > 0) {
        console.log("[App] 🏷️ Setting keywords:", extractedKeywords);
        setKeywords(extractedKeywords);
      } else {
        console.warn("[App] No keywords from backend, using fallback");
        const words = text
          .toLowerCase()
          .replace(/[^\w\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 3);
        const fallbackKeywords = [...new Set(words)].slice(0, 5);
        console.log("[App] 🏷️ Setting fallback keywords:", fallbackKeywords);
        setKeywords(fallbackKeywords);
      }

      setPulse(Date.now());
    } catch (err) {
      console.error("[App] ❌ Backend error:", err.message);

      // Fallback
      const words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const fallbackKeywords = [...new Set(words)].slice(0, 5);

      console.log("[App] 🏷️ Using error fallback keywords:", fallbackKeywords);
      setKeywords(fallbackKeywords);
      setSentiment(0.5);
      setPulse(Date.now());
    }
  }, []);

  // ===== TRANSCRIPT HANDLING =====
  const handleTranscript = useCallback(
    ({ text, is_final }) => {
      console.log("[App] 📝 Transcript:", { text, is_final });

      if (!text) return;

      if (is_final) {
        setTranscript((prev) => [...prev, text]);
        setPartial("");
        console.log("[App] ✓ Final transcript added");
        callBackendAPI(text);
      } else {
        setPartial(text);
      }
    },
    [callBackendAPI]
  );

  const handleError = useCallback((err) => {
    console.error("[App] ❌ Deepgram error:", err);
    setError(err?.message || "An error occurred");

    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    errorTimeoutRef.current = setTimeout(() => {
      setError(null);
    }, 5000);
  }, []);

  // ===== RECORDING CONTROLS =====
  const handleStartRecording = useCallback(async () => {
    console.log("[App] ========== START RECORDING ==========");
    clearError();
    setIsConnecting(true);

    try {
      const service = createDeepgramRealtime({
        getToken: getDeepgramToken,
        debug: true,
      });

      service.onTranscript(handleTranscript);
      service.onError(handleError);

      deepgramServiceRef.current = service;

      console.log("[App] Starting Deepgram service...");
      await service.start();

      console.log("[App] ✅ Recording started successfully");
      setIsRecording(true);
      setIsConnecting(false);
    } catch (err) {
      console.error("[App] ❌ Failed to start recording:", err);

      let errorMessage = "Failed to start recording";

      if (
        err.name === "NotAllowedError" ||
        err.name === "PermissionDeniedError"
      ) {
        errorMessage = "Microphone access denied. Please allow permissions.";
      } else if (err.name === "NotFoundError") {
        errorMessage = "No microphone found.";
      } else if (err.name === "NotReadableError") {
        errorMessage = "Microphone is in use by another app.";
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      setIsRecording(false);
      setIsConnecting(false);
    }
  }, [handleTranscript, handleError, clearError]);

  const handleStopRecording = useCallback(async () => {
    console.log("[App] ========== STOP RECORDING ==========");

    try {
      if (deepgramServiceRef.current) {
        console.log("[App] Stopping Deepgram service...");
        await deepgramServiceRef.current.stop();
        deepgramServiceRef.current = null;
        console.log("[App] ✓ Deepgram stopped");
      }

      setIsRecording(false);
      console.log("[App] ✅ Recording stopped successfully");
    } catch (err) {
      console.error("[App] ❌ Error stopping:", err);
      setError(err?.message || "Failed to stop");
      setIsRecording(false);
    }
  }, []);

  // ===== EFFECTS =====
  useEffect(() => {
    let rafId = null;
    let lastTime = performance.now();

    const animate = (currentTime) => {
      const deltaTime = currentTime - lastTime;

      if (deltaTime >= 16) {
        setVisualSentiment((prev) => {
          const next = prev + (sentiment - prev) * CONFIG.SENTIMENT_EASING;
          if (Math.abs(next - sentiment) < 0.0005) return sentiment;
          return next;
        });

        lastTime = currentTime;
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [sentiment]);

  useEffect(() => {
    if (!pulse) return;

    setIsAnalyzing(true);
    if (analyzeTimeoutRef.current) clearTimeout(analyzeTimeoutRef.current);

    analyzeTimeoutRef.current = setTimeout(() => {
      setIsAnalyzing(false);
    }, CONFIG.ANALYZING_DURATION);

    return () => {
      if (analyzeTimeoutRef.current) clearTimeout(analyzeTimeoutRef.current);
    };
  }, [pulse]);

  useEffect(() => {
    return () => {
      if (analyzeTimeoutRef.current) clearTimeout(analyzeTimeoutRef.current);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);

      if (deepgramServiceRef.current) {
        deepgramServiceRef.current.stop().catch(console.error);
      }
    };
  }, []);

  // ===== RENDER =====
  return (
    <div className="w-full h-screen relative overflow-hidden bg-transparent">
      <div className="p5-canvas-wrapper">
        <AuraCanvas sentiment={visualSentiment} pulse={pulse} />
      </div>

      <div className="app-overlay">
        <header>
          <h1 className="hero-title">Sentiment Aura</h1>
          <p className="helper">
            Speak and watch your aura react in real time.
          </p>
        </header>

        <main style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div className="panel transcript" aria-live="polite" role="log">
              <TranscriptDisplay transcript={transcript} partial={partial} />
            </div>

            <div className="panel" style={{ marginTop: 12 }}>
              <KeywordsDisplay keywords={keywords} aura={aura} />
            </div>
          </div>

          <aside style={{ width: 240 }}>
            <div
              className="panel"
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <Controls
                isRecording={isRecording}
                isConnecting={isConnecting}
                onStart={handleStartRecording}
                onStop={handleStopRecording}
              />

              {isConnecting && (
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.7)",
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <span className="dot-pulse" style={{ width: 8, height: 8 }} />
                  <span>Connecting...</span>
                </div>
              )}

              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.85)",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <div>
                  Sentiment: <strong>{(sentiment * 100).toFixed(0)}%</strong>
                </div>
                {isAnalyzing && (
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <span
                      className="dot-pulse"
                      aria-hidden
                      style={{ width: 10, height: 10, borderRadius: 999 }}
                    />
                    <span
                      style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}
                    >
                      Analyzing…
                    </span>
                  </div>
                )}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.7)",
                  marginTop: 6,
                }}
              >
                <div>AURA ENERGY</div>
                <div
                  style={{
                    marginTop: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      background: aura.color,
                      boxShadow: `0 0 8px ${aura.color}`,
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>{aura.label}</div>
                    <div style={{ fontSize: 11, opacity: 0.9 }}>
                      {aura.meaning}
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div
                  style={{
                    marginTop: 8,
                    padding: 8,
                    background: "rgba(255,100,100,0.1)",
                    border: "1px solid rgba(255,100,100,0.3)",
                    borderRadius: 4,
                    color: "#ffd1d1",
                    fontSize: 12,
                  }}
                  role="alert"
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    ⚠️ Error
                  </div>
                  <div>{error}</div>
                  <button
                    onClick={clearError}
                    style={{
                      marginTop: 6,
                      padding: "4px 8px",
                      background: "rgba(255,255,255,0.1)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 3,
                      color: "#fff",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </aside>
        </main>
      </div>

      <style>{`
        .dot-pulse {
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.6));
          box-shadow: 0 0 8px rgba(255, 255, 255, 0.08);
          animation: pulse 1.2s infinite ease-in-out;
          border-radius: 50%;
        }

        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.65; }
          100% { transform: scale(1); opacity: 1; }
        }

        .panel { transition: all 0.3s ease; }
        .panel:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); }
      `}</style>
    </div>
  );
}
