// src/components/Controls.jsx
import React from "react";

export default function Controls({ isRecording, onStart, onStop }) {
  return (
    <div
      className="controls"
      role="group"
      aria-label="Recording controls"
      style={{ width: "100%" }}
    >
      {isRecording ? (
        <button
          onClick={onStop}
          aria-pressed="true"
          className="control-button stop-button"
          style={{
            width: "100%",
            padding: "16px 24px",
            borderRadius: 16,
            background: "linear-gradient(135deg, #ff4d4f, #ff7875)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(255, 77, 79, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            transition: "all 0.3s ease",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <span
            className="recording-pulse"
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "#fff",
              animation: "pulse 1.5s infinite",
            }}
          />
          Stop Recording
        </button>
      ) : (
        <button
          onClick={onStart}
          aria-pressed="false"
          className="control-button start-button"
          style={{
            width: "100%",
            padding: "16px 24px",
            borderRadius: 16,
            background: "linear-gradient(135deg, #10b981, #34d399)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(16, 185, 129, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            transition: "all 0.3s ease",
          }}
        >
          <span style={{ fontSize: 20 }}>▶</span>
          Start Recording
        </button>
      )}

      <style>{`
        .control-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(0,0,0,0.3);
        }

        .control-button:active {
          transform: translateY(0);
        }

        .stop-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          transition: left 0.5s;
        }

        .stop-button:hover::before {
          left: 100%;
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.3);
            opacity: 0.7;
          }
        }
      `}</style>
    </div>
  );
}
