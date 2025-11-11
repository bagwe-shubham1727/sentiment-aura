// src/components/Controls.jsx
/**
 * Recording Controls Component
 * Provides start/stop recording functionality with loading states
 */

import React from "react";

export default function Controls({
  isRecording,
  isConnecting,
  onStart,
  onStop,
}) {
  // Determine button state
  const isDisabled = isConnecting;
  const buttonText = isConnecting
    ? "Connecting..."
    : isRecording
    ? "Stop Recording"
    : "Start Recording";

  const buttonIcon = isConnecting ? "⏳" : isRecording ? "⏹" : "🎤";

  const buttonColor = isRecording
    ? "rgba(255, 80, 80, 0.9)" // Red when recording
    : "rgba(80, 200, 120, 0.9)"; // Green when ready

  const handleClick = () => {
    if (isConnecting) return; // Don't allow clicks while connecting

    if (isRecording) {
      onStop();
    } else {
      onStart();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      style={{
        width: "100%",
        padding: "12px 16px",
        fontSize: "14px",
        fontWeight: 600,
        background: isDisabled ? "rgba(100, 100, 100, 0.5)" : buttonColor,
        border: "none",
        borderRadius: "8px",
        color: "white",
        cursor: isDisabled ? "not-allowed" : "pointer",
        transition: "all 0.2s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        opacity: isDisabled ? 0.6 : 1,
        boxShadow: isDisabled ? "none" : `0 2px 8px ${buttonColor}40`,
      }}
      onMouseEnter={(e) => {
        if (!isDisabled && !isRecording) {
          e.target.style.transform = "translateY(-2px)";
          e.target.style.boxShadow = `0 4px 12px ${buttonColor}60`;
        }
      }}
      onMouseLeave={(e) => {
        if (!isDisabled) {
          e.target.style.transform = "translateY(0)";
          e.target.style.boxShadow = `0 2px 8px ${buttonColor}40`;
        }
      }}
      aria-label={buttonText}
      aria-busy={isConnecting}
    >
      <span style={{ fontSize: "18px" }}>{buttonIcon}</span>
      <span>{buttonText}</span>
    </button>
  );
}
