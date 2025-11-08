// src/App.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import Controls from "./components/Controls";
import TranscriptDisplay from "./components/TranscriptDisplay";
import KeywordsDisplay from "./components/KeywordsDisplay";
import AuraCanvas from "./components/AuraCanvas";
import useAudioCapture from "./hooks/useAudioCapture";
import { auraForSentiment } from "./utils/auraForSentiment";
import "./index.css";

// Dev: read token from Vite env for local testing
const getDeepgramToken = async () => {
  const token = import.meta.env.VITE_DEEPGRAM_TOKEN;
  if (!token) {
    throw new Error(
      "Deepgram token missing. Set VITE_DEEPGRAM_TOKEN in frontend .env."
    );
  }
  return token;
};

export default function App() {
  const [pulse, setPulse] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState([]); // final lines
  const [partial, setPartial] = useState(""); // live partial
  const [keywords, setKeywords] = useState([]);
  const [sentiment, setSentiment] = useState(0); // backend sentiment (0–1)
  const [visualSentiment, setVisualSentiment] = useState(0); // eased sentiment

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const analyzeTimeoutRef = useRef(null);

  // Smoothly ease visualSentiment toward sentiment
  useEffect(() => {
    let rafId = null;

    const step = () => {
      setVisualSentiment((prev) => {
        const next = prev + (sentiment - prev) * 0.08;
        if (Math.abs(next - sentiment) < 0.0005) return sentiment;
        return next;
      });
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [sentiment]);

  // "Analyzing..." indicator after pulse
  useEffect(() => {
    if (!pulse) return;
    setIsAnalyzing(true);
    if (analyzeTimeoutRef.current) clearTimeout(analyzeTimeoutRef.current);
    analyzeTimeoutRef.current = setTimeout(() => {
      setIsAnalyzing(false);
      analyzeTimeoutRef.current = null;
    }, 1800);
    return () => {
      if (analyzeTimeoutRef.current) clearTimeout(analyzeTimeoutRef.current);
    };
  }, [pulse]);

  // Aura color/meaning from eased sentiment
  const aura = auraForSentiment(visualSentiment);

  // hook: useAudioCapture (frontend-only)
  const { start: handleStart, stop: handleStop } = useAudioCapture({
    getDeepgramToken,
    onError: (err) => {
      console.error("useAudioCapture error:", err);
      setError(err?.message || String(err));
    },
  });

  // Transcript callbacks
  const handleTranscriptLine = useCallback(({ text, is_final }) => {
    if (!text) return;
    if (is_final) {
      setTranscript((s) => [...s, text]);
      setPartial("");
    } else {
      setPartial(text);
    }
  }, []);

  // Backend analysis callback
  const handleAnalysisResult = useCallback((result) => {
    if (!result) return;
    if (typeof result.sentiment === "number") setSentiment(result.sentiment);
    if (Array.isArray(result.keywords)) setKeywords(result.keywords);
    setPulse(Date.now());
  }, []);

  // Control handlers
  const onStart = useCallback(async () => {
    setError(null);
    try {
      await handleStart({
        onTranscriptLine: handleTranscriptLine,
        onAnalysisResult: handleAnalysisResult,
      });
      setIsRecording(true);
    } catch (e) {
      console.error("Failed to start recording:", e);
      setError(e?.message || String(e));
      setIsRecording(false);
    }
  }, [handleStart, handleTranscriptLine, handleAnalysisResult]);

  const onStop = useCallback(async () => {
    try {
      await handleStop();
      setIsRecording(false);
    } catch (e) {
      console.error("Failed to stop recording:", e);
      setError(e?.message || String(e));
    }
  }, [handleStop]);

  // Debug logs
  useEffect(() => {
    console.log("Sentiment (raw):", sentiment);
  }, [sentiment]);

  useEffect(() => {
    console.log("Visual sentiment (used by aura):", visualSentiment);
  }, [visualSentiment]);

  return (
    <div className="w-full h-screen relative overflow-hidden bg-transparent">
      <div className="p5-canvas-wrapper">
        <AuraCanvas sentiment={visualSentiment} pulse={pulse} />
      </div>

      <div className="app-overlay">
        <header>
          <h1 className="hero-title">Sentiment Aura</h1>
          <p className="helper">Speak and watch the aura react in real time.</p>
        </header>

        <main style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div className="panel transcript" aria-live="polite">
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
                onStart={onStart}
                onStop={onStop}
              />

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

              {/* Aura legend */}
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
                <div style={{ marginTop: 8, color: "#ffd1d1", fontSize: 12 }}>
                  Error: {error}
                </div>
              )}
            </div>
          </aside>
        </main>
      </div>

      {/* pulse animation */}
      <style>{`
        .dot-pulse {
          background: linear-gradient(90deg, rgba(255,255,255,0.95), rgba(255,255,255,0.6));
          box-shadow: 0 0 8px rgba(255,255,255,0.08);
          animation: pulse 1.2s infinite ease-in-out;
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.65; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
