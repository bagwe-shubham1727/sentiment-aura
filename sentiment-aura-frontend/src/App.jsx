// src/App.jsx
import React, { useState, useEffect } from "react";
import Controls from "./components/Controls";
import TranscriptDisplay from "./components/TranscriptDisplay";
import KeywordsDisplay from "./components/KeywordsDisplay";
import AuraCanvas from "./components/AuraCanvas";
import useAudioCapture from "./hooks/useAudioCapture";
import "./index.css";

export default function App() {
  const [pulse, setPulse] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [sentiment, setSentiment] = useState(0); // authoritative sentiment from backend
  const [visualSentiment, setVisualSentiment] = useState(0); // eased sentiment used by visuals

  // Smoothly ease visualSentiment toward sentiment whenever sentiment changes
  useEffect(() => {
    let rafId = null;

    const step = () => {
      setVisualSentiment((prev) => {
        const next = prev + (sentiment - prev) * 0.08; // easing factor
        // If close enough to target, snap to avoid infinite tiny steps
        const done = Math.abs(next - sentiment) < 0.0005;
        if (!done) {
          // queue next frame
          rafId = requestAnimationFrame(step);
          return next;
        }
        // final set to exact target
        return sentiment;
      });
    };

    // start the animation loop
    rafId = requestAnimationFrame(step);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [sentiment]);

  const { handleStart, handleStop } = useAudioCapture(
    setTranscript,
    setIsRecording,
    setSentiment,
    setKeywords,
    setPulse,
    { mock: true } // set to false when ready for real mic streaming
  );

  useEffect(() => {
    console.log("Authoritative sentiment:", sentiment);
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
              <TranscriptDisplay transcript={transcript} />
            </div>
            <div className="panel" style={{ marginTop: 12 }}>
              <KeywordsDisplay keywords={keywords} />
            </div>
          </div>

          <aside style={{ width: 240 }}>
            <div
              className="panel"
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <Controls
                isRecording={isRecording}
                onStart={handleStart}
                onStop={handleStop}
              />
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                Sentiment: <strong>{(sentiment * 100).toFixed(0)}%</strong>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
