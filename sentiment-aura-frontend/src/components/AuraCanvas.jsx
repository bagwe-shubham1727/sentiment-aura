// src/components/AuraCanvas.jsx
import React, { useCallback } from "react";
import { ReactP5Wrapper } from "react-p5-wrapper";

/**
 * AuraCanvas using react-p5-wrapper.
 * Props: { sentiment, pulse }
 */
export default function AuraCanvas({ sentiment = 0, pulse = 0 }) {
  // create the sketch factory (wrapper will call it)
  const sketch = useCallback((p) => {
    let t = 0;

    // initial props stored on the p instance
    p._sentiment = typeof sentiment === "number" ? sentiment : 0;
    p._pulse = typeof pulse === "number" ? pulse : 0;
    p._pulseEnergy = 0;
    p._smoothed = p._sentiment;

    p.setup = () => {
      p.createCanvas(p.windowWidth, p.windowHeight);
      p.colorMode(p.HSB, 360, 100, 100);
      p.noStroke();
      p.background(0, 0, 100);
    };

    p.windowResized = () => {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
    };

    // wrapper calls this when props change
    p.updateWithProps = (props) => {
      if (!props) return;
      if (typeof props.sentiment === "number") {
        p._sentiment = Math.max(0, Math.min(1, props.sentiment));
      }
      if (typeof props.pulse === "number") {
        if (props.pulse !== p._pulse) {
          p._pulse = props.pulse;
          p._pulseEnergy = 1.0;
        }
      }
    };

    p.draw = () => {
      const external = typeof p._sentiment === "number" ? p._sentiment : 0;
      p._smoothed = p.lerp(p._smoothed ?? external, external, 0.14);
      const s = Math.max(0, Math.min(1, p._smoothed));

      p._pulseEnergy = Math.max(0, (p._pulseEnergy || 0) * 0.86);
      const baseEnergy = p.map(s, 0, 1, 0.25, 1.9);
      const energy = baseEnergy + p._pulseEnergy * 2.2;

      // white at 0, colored otherwise
      if (s <= 0.001) {
        p.colorMode(p.RGB);
        p.background(255, 255, 255);
        p.colorMode(p.HSB, 360, 100, 100);
      } else {
        let hue =
          s < 0.5 ? p.lerp(6, 215, s / 0.5) : p.lerp(215, 165, (s - 0.5) / 0.5);
        const sat = p.lerp(30, 98, Math.pow(s, 1.05));
        const bright = p.lerp(40, 98, Math.pow(s, 0.95));
        const bgAlpha = Math.min(1, 0.2 + s * 0.65 + p._pulseEnergy * 0.6);
        p.clear();
        p.background(hue, sat, bright, bgAlpha);

        const cNeg = p.color(6, 40, 16);
        const cMid = p.color(215, 60, 60);
        const cPos = p.color(165, 80, 85);
        const blendedMid = p.lerpColor(cNeg, cMid, Math.min(1, s * 2));
        const blendedFinal = p.lerpColor(
          blendedMid,
          cPos,
          Math.max(0, (s - 0.5) * 2)
        );
        blendedFinal.setAlpha(0.12 + s * 0.36 + p._pulseEnergy * 0.5);
        p.push();
        p.noStroke();
        p.fill(blendedFinal);
        p.rect(0, 0, p.width, p.height);
        p.pop();
      }

      // visible center circle
      p.noStroke();
      const cx = Math.floor(p.width * 0.75);
      const cy = Math.floor(p.height * 0.5);
      const big = 60 + s * 350 + p._pulseEnergy * 250;
      if (s <= 0.001) {
        p.fill(210, 10, 90, 0.12);
      } else {
        let hueMain =
          s < 0.5 ? p.lerp(6, 215, s / 0.5) : p.lerp(215, 165, (s - 0.5) / 0.5);
        p.fill(hueMain, 90, 96, 0.18 + s * 0.3 + p._pulseEnergy * 0.22);
      }
      p.ellipse(cx, cy, big, big);

      // small perlin texture
      const cols = Math.max(12, Math.floor(p.width / 80));
      const rows = Math.max(8, Math.floor(p.height / 80));
      const spacingX = p.width / cols;
      const spacingY = p.height / rows;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const nx = x / cols;
          const ny = y / rows;
          const n = p.noise(nx * 2.0 + t * 0.06, ny * 2.1 - t * 0.03);
          const px = x * spacingX + spacingX * 0.5;
          const py = y * spacingY + spacingY * 0.5;
          const radius = Math.max(1.2, Math.pow(n, 1.5) * (28 + 36 * energy));
          const alpha =
            (0.02 + n * 0.12) * (0.2 + 0.9 * s) + p._pulseEnergy * 0.1;
          if (s <= 0.001) p.fill(210, 10, 90, 0.05);
          else
            p.fill(
              ((s < 0.5
                ? p.lerp(6, 215, s / 0.5)
                : p.lerp(215, 165, (s - 0.5) / 0.5)) +
                n * 32) %
                360,
              Math.min(100, 40 + n * 6),
              Math.min(100, 96 - n * 8),
              alpha
            );
          p.circle(px, py, radius);
        }
      }

      // HUD
      p.push();
      p.resetMatrix();
      p.colorMode(p.RGB);
      p.fill(s <= 0.001 ? 0 : 255, 255, 255, 220);
      p.textSize(12);
      p.textAlign(p.LEFT, p.TOP);
      p.text(`s:${s.toFixed(3)} pulse:${p._pulseEnergy.toFixed(2)}`, 12, 12);
      p.pop();

      t += 0.006 + energy * 0.004 + p._pulseEnergy * 0.02;
    };
    return sketch;
  }, []);

  // wrapper will call p.updateWithProps when sentiment/pulse change
  return <ReactP5Wrapper sketch={sketch} sentiment={sentiment} pulse={pulse} />;
}
