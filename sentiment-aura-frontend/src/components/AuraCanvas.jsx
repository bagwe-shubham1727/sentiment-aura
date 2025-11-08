// src/components/AuraCanvas.jsx
import React, { useCallback } from "react";
import { ReactP5Wrapper } from "react-p5-wrapper";

/**
 * AuraCanvas (coherent-color version)
 * - uses single blendedColor per frame
 * - derives all variants (darker, lighter, additive glow) from that color
 *
 * Props:
 *  - sentiment (0..1)
 *  - pulse (int)
 */
export default function AuraCanvas({ sentiment = 0, pulse = 0 }) {
  const PARAMS = {
    flowSpeed: 0.0045,
    flowScale: 1.6,
    baseNoiseFreq: 0.06,
    glowStrength: 0.7,
    pulseBoost: 1.6,
    easing: 0.1,
    densityFactor: 90000,
  };

  const sketch = useCallback((p) => {
    let t = 0;
    p._sentiment = typeof sentiment === "number" ? sentiment : 0;
    p._pulse = typeof pulse === "number" ? pulse : 0;
    p._pulseEnergy = 0;
    p._smoothed = p._sentiment;
    p._flowT = 0;

    // color stops (HSB) — used only to compute the blended color for the frame
    const stops = [
      { pos: 0.0, col: () => p.color(0, 0, 100) }, // white
      { pos: 0.01, col: () => p.color(0, 0, 0) }, // black at extremely low
      { pos: 0.12, col: () => p.color(0, 90, 90) }, // red
      { pos: 0.24, col: () => p.color(25, 100, 95) }, // orange
      { pos: 0.38, col: () => p.color(50, 100, 100) }, // yellow
      { pos: 0.53, col: () => p.color(120, 80, 90) }, // green
      { pos: 0.66, col: () => p.color(200, 80, 90) }, // blue
      { pos: 0.76, col: () => p.color(230, 90, 85) }, // indigo
      { pos: 0.86, col: () => p.color(290, 80, 90) }, // purple/pink
      { pos: 0.96, col: () => p.color(330, 60, 98) }, // light pink
      { pos: 1.0, col: () => p.color(0, 0, 100) }, // white zone
    ];

    function paletteFor(v) {
      const s = Math.max(0, Math.min(1, v));
      // find pair
      let L = stops[0],
        R = stops[stops.length - 1];
      for (let i = 0; i < stops.length - 1; i++) {
        if (s >= stops[i].pos && s <= stops[i + 1].pos) {
          L = stops[i];
          R = stops[i + 1];
          break;
        }
      }
      const range = R.pos - L.pos || 1e-6;
      const tLocal = (s - L.pos) / range;
      p.colorMode(p.HSB, 360, 100, 100);
      return p.lerpColor(L.col(), R.col(), tLocal);
    }

    p.setup = () => {
      p.createCanvas(p.windowWidth, p.windowHeight);
      p.colorMode(p.HSB, 360, 100, 100);
      p.noStroke();
      p.background(0, 0, 100);
    };

    p.windowResized = () => {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
    };

    p.updateWithProps = (props) => {
      if (!props) return;
      if (typeof props.sentiment === "number")
        p._sentiment = Math.max(0, Math.min(1, props.sentiment));
      if (typeof props.pulse === "number" && props.pulse !== p._pulse) {
        p._pulse = props.pulse;
        p._pulseEnergy = 1.0;
      }
    };

    p.draw = () => {
      const external = typeof p._sentiment === "number" ? p._sentiment : 0;
      p._smoothed = p.lerp(p._smoothed ?? external, external, PARAMS.easing);
      const s = Math.max(0, Math.min(1, p._smoothed));

      p._pulseEnergy = Math.max(0, (p._pulseEnergy || 0) * 0.86);
      const baseEnergy = p.map(s, 0, 1, 0.28, 1.8);
      const energy = baseEnergy + p._pulseEnergy * PARAMS.pulseBoost;

      // SINGLE authoritative blended color for the frame
      const blended = paletteFor(s);

      // background handling: white when s near 0, black only very near 0
      if (s <= 0.01) {
        p.colorMode(p.RGB);
        p.background(255, 255, 255);
        p.colorMode(p.HSB, 360, 100, 100);
      } else if (s <= 0.02) {
        // slight dark wash for very low energy (not full black)
        let bg = p.lerpColor(p.color(0, 0, 100), blended, 0.18);
        bg.setAlpha(0.12 + s * 0.6 + p._pulseEnergy * 0.3);
        p.clear();
        p.push();
        p.noStroke();
        p.fill(bg);
        p.rect(0, 0, p.width, p.height);
        p.pop();
      } else {
        // colored wash derived from blended color
        const bgAlpha = Math.min(
          1,
          0.16 +
            Math.pow(s, 0.9) * 0.78 +
            p._pulseEnergy * 0.45 * PARAMS.glowStrength
        );
        const bgColor = blended;
        bgColor.setAlpha(bgAlpha);
        p.clear();
        p.push();
        p.noStroke();
        p.fill(bgColor);
        p.rect(0, 0, p.width, p.height);
        p.pop();
      }

      // advance ambient flow
      p._flowT += PARAMS.flowSpeed * (1 + energy * 0.6);

      // particle grid adapt
      const area = p.width * p.height;
      const base = Math.max(12, Math.floor(area / PARAMS.densityFactor));
      const cols = Math.max(10, Math.floor(p.width / Math.sqrt(base)));
      const rows = Math.max(7, Math.floor(p.height / Math.sqrt(base)));
      const spacingX = p.width / cols;
      const spacingY = p.height / rows;

      // Precompute color variants derived from blended
      const lighter = p.lerpColor(blended, p.color(0, 0, 100), 0.3); // t -> toward white
      const darker = p.lerpColor(blended, p.color(0, 0, 0), 0.22); // t -> toward black
      // small hue-shifted variant for subtle movement
      const shifted = p.lerpColor(
        blended,
        p.color(p.hue ? (p.hue(blended) + 24) % 360 : 0, 100, 90),
        0.12
      );

      // draw perlin blobs — all filled from variants of blended (coherent)
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const nx = x / cols;
          const ny = y / rows;
          const n1 = p.noise(
            nx * (PARAMS.baseNoiseFreq * 10) + p._flowT * 0.2,
            ny * (PARAMS.baseNoiseFreq * 10)
          );
          const n2 = p.noise(
            nx * PARAMS.flowScale + p._flowT * 0.6,
            ny * PARAMS.flowScale - p._flowT * 0.3
          );
          const n = n1 * 0.6 + n2 * 0.4;
          const px = x * spacingX + spacingX * 0.5;
          const py = y * spacingY + spacingY * 0.5;
          const radius = Math.max(1.2, Math.pow(n, 1.4) * (18 + 30 * energy));
          const alpha = 0.02 + n * 0.12 + s * 0.06 + p._pulseEnergy * 0.1;

          // choose variant based on noise so brightness is coherent
          const fillColor = n > 0.6 ? lighter : n < 0.35 ? darker : shifted;
          const fillCopy = fillColor;
          fillCopy.setAlpha(alpha);
          p.fill(fillCopy);
          p.circle(px, py, radius);
        }
      }

      // glow additive — derived from blended color (same hue)
      if (s > 0.02) {
        p.push();
        p.blendMode(p.ADD);
        const glowCount =
          5 + Math.round(s * 6) + Math.round(p._pulseEnergy * 5);
        for (let i = 0; i < glowCount; i++) {
          const gx = p.noise(i * 0.21 - p._flowT * 0.02) * p.width;
          const gy = p.noise(i * 0.37 + p._flowT * 0.03) * p.height;
          const gRadius = 80 + s * 320 + p._pulseEnergy * 220;
          // tilt toward white slightly for glow
          const gcol = p.lerpColor(
            blended,
            p.color(0, 0, 100),
            0.14 + (i / glowCount) * 0.06
          );
          gcol.setAlpha(0.02 + s * 0.05 + p._pulseEnergy * 0.04);
          p.noStroke();
          p.fill(gcol);
          p.ellipse(gx, gy, gRadius * 0.8, gRadius * 0.8);
        }
        p.pop();
      }

      // focal circle — same blended family
      p.noStroke();
      const cx = Math.floor(p.width * 0.72);
      const cy = Math.floor(p.height * 0.5);
      const big = 40 + s * 300 + p._pulseEnergy * 220;
      const centerColor = p.lerpColor(blended, p.color(0, 0, 100), 0.12);
      centerColor.setAlpha(0.16 + s * 0.26 + p._pulseEnergy * 0.16);
      p.fill(centerColor);
      p.ellipse(cx, cy, big, big);

      // rainbow shimmer (still derived from blended but overlayed additive)
      if (s >= 0.95) {
        p.push();
        p.blendMode(p.ADD);
        for (let i = 0; i < 6; i++) {
          const rHue = (p.frameCount * 2 + i * 60) % 360;
          const col = p.color(rHue, 80, 100, 0.05 + p._pulseEnergy * 0.05);
          p.fill(col);
          const rx = p.noise(i * 0.2, p.frameCount * 0.01) * p.width;
          const ry = p.noise(i * 0.3, p.frameCount * 0.01 + 5) * p.height;
          p.ellipse(rx, ry, 120 + i * 40, 120 + i * 40);
        }
        p.pop();
      }

      // small debug HUD (optional)
      p.push();
      p.resetMatrix();
      p.colorMode(p.RGB);
      p.noStroke();
      const hudColor = s <= 0.02 ? 0 : 255;
      p.fill(hudColor, hudColor, hudColor, 200);
      // p.textSize(12);
      // p.textAlign(p.LEFT, p.TOP);
      // p.text(`s:${s.toFixed(3)} pulse:${p._pulseEnergy.toFixed(2)}`, 12, 12);
      p.pop();

      t += 0.006 + energy * 0.003 + p._pulseEnergy * 0.02;
    };

    return sketch;
  }, []);

  return <ReactP5Wrapper sketch={sketch} sentiment={sentiment} pulse={pulse} />;
}
