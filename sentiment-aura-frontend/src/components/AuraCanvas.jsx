// src/components/AuraCanvas.jsx
/**
 * Beautiful Aura Canvas with Orbitals & Hexagons
 *
 * Layers:
 * 1. Flowing Perlin blobs (base)
 * 2. Hexagonal grid overlay
 * 3. Orbital particles with trails
 * 4. Additive glows
 * 5. Focal circle
 */

import React, { useCallback } from "react";
import { ReactP5Wrapper } from "react-p5-wrapper";

export default function AuraCanvas({ sentiment = 0, pulse = 0 }) {
  const PARAMS = {
    flowSpeed: 0.0045,
    flowScale: 1.6,
    baseNoiseFreq: 0.06,
    glowStrength: 0.7,
    pulseBoost: 1.6,
    easing: 0.1,
    densityFactor: 90000,
    // Orbital system
    particleCount: 100,
    orbitCenters: 8,
    orbitRadius: 380,
    orbitSpeed: 0.029,
    spiralSpeed: 0.09,
    // Hexagonal grid
    hexSize: 85,
  };

  const sketch = useCallback((p) => {
    let t = 0;
    p._sentiment = typeof sentiment === "number" ? sentiment : 0;
    p._pulse = typeof pulse === "number" ? pulse : 0;
    p._pulseEnergy = 0;
    p._smoothed = p._sentiment;
    p._flowT = 0;
    p._rotationAngle = 0;
    p._particles = [];
    p._orbitCenters = [];
    p._hexGrid = [];

    // Color palette
    const stops = [
      { pos: 0.0, col: () => p.color(0, 0, 100) },
      { pos: 0.01, col: () => p.color(0, 0, 0) },
      { pos: 0.12, col: () => p.color(0, 90, 90) },
      { pos: 0.24, col: () => p.color(25, 100, 95) },
      { pos: 0.38, col: () => p.color(50, 100, 100) },
      { pos: 0.53, col: () => p.color(120, 80, 90) },
      { pos: 0.66, col: () => p.color(200, 80, 90) },
      { pos: 0.76, col: () => p.color(230, 90, 85) },
      { pos: 0.86, col: () => p.color(290, 80, 90) },
      { pos: 0.96, col: () => p.color(330, 60, 98) },
      { pos: 1.0, col: () => p.color(0, 0, 100) },
    ];

    function paletteFor(v) {
      const s = Math.max(0, Math.min(1, v));
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

    // ========== INITIALIZE HEXAGONAL GRID ==========
    function initHexGrid() {
      p._hexGrid = [];
      const hexSize = PARAMS.hexSize;
      const rows = Math.ceil(p.height / (hexSize * 1.5)) + 2;
      const cols = Math.ceil(p.width / (hexSize * Math.sqrt(3))) + 2;

      for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
          const x =
            col * hexSize * Math.sqrt(3) +
            ((row % 2) * hexSize * Math.sqrt(3)) / 2;
          const y = row * hexSize * 1.5;

          // Pre-calculate vertices
          const vertices = [];
          for (let i = 0; i < 6; i++) {
            const angle = (p.TWO_PI / 6) * i;
            vertices.push({
              x: Math.cos(angle) * hexSize,
              y: Math.sin(angle) * hexSize,
            });
          }

          p._hexGrid.push({
            x,
            y,
            vertices,
            activated: false,
            activationTime: 0,
            brightness: 0,
          });
        }
      }
    }

    function drawHexagon(hex, brightness, color) {
      p.push();
      p.translate(hex.x, hex.y);
      p.noFill();
      color.setAlpha(brightness);
      p.stroke(color);
      p.strokeWeight(1);
      p.beginShape();
      hex.vertices.forEach((v) => p.vertex(v.x, v.y));
      p.endShape(p.CLOSE);
      p.pop();
    }

    // ========== INITIALIZE ORBITAL PARTICLES ==========
    function initParticles() {
      p._particles = [];
      p._orbitCenters = [];

      // Create orbit centers in a circle pattern
      for (let i = 0; i < PARAMS.orbitCenters; i++) {
        const angle = (i / PARAMS.orbitCenters) * p.TWO_PI;
        const distance = p.min(p.width, p.height) * 0.25;
        p._orbitCenters.push({
          x: p.width * 0.5 + p.cos(angle) * distance,
          y: p.height * 0.5 + p.sin(angle) * distance,
          pulsePhase: p.random(p.TWO_PI),
        });
      }

      // Create particles
      for (let i = 0; i < PARAMS.particleCount; i++) {
        const centerIndex = i % PARAMS.orbitCenters;

        p._particles.push({
          centerIndex: centerIndex,
          angle: p.random(p.TWO_PI),
          orbitRadius: PARAMS.orbitRadius * (0.5 + p.random(0.6)),
          speed: PARAMS.orbitSpeed * (0.8 + p.random(0.4)),
          spiralPhase: p.random(p.TWO_PI),
          size: 2 + p.random(1.5),
          trail: [],
          orbitDirection: p.random() > 0.5 ? 1 : -1,
        });
      }
    }

    p.setup = () => {
      p.createCanvas(p.windowWidth, p.windowHeight);
      p.colorMode(p.HSB, 360, 100, 100);
      p.noStroke();
      p.background(0, 0, 100);
      initParticles();
      initHexGrid();
    };

    p.windowResized = () => {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
      initParticles();
      initHexGrid();
    };

    p.updateWithProps = (props) => {
      if (!props) return;
      if (typeof props.sentiment === "number")
        p._sentiment = Math.max(0, Math.min(1, props.sentiment));
      if (typeof props.pulse === "number" && props.pulse !== p._pulse) {
        p._pulse = props.pulse;
        p._pulseEnergy = 1.0;

        // Activate random hexagons on pulse
        p._hexGrid.forEach((hex) => {
          if (p.random() < 0.25) {
            hex.activated = true;
            hex.activationTime = p.millis();
          }
        });
      }
    };

    p.draw = () => {
      const external = typeof p._sentiment === "number" ? p._sentiment : 0;
      p._smoothed = p.lerp(p._smoothed ?? external, external, PARAMS.easing);
      const s = Math.max(0, Math.min(1, p._smoothed));

      p._pulseEnergy = Math.max(0, (p._pulseEnergy || 0) * 0.86);
      const baseEnergy = p.map(s, 0, 1, 0.28, 1.8);
      const energy = baseEnergy + p._pulseEnergy * PARAMS.pulseBoost;

      const blended = paletteFor(s);

      // ========== BACKGROUND ==========
      if (s <= 0.01) {
        p.colorMode(p.RGB);
        p.background(255, 255, 255);
        p.colorMode(p.HSB, 360, 100, 100);
      } else if (s <= 0.02) {
        let bg = p.lerpColor(p.color(0, 0, 100), blended, 0.18);
        bg.setAlpha(0.12 + s * 0.6 + p._pulseEnergy * 0.3);
        p.clear();
        p.noStroke();
        p.fill(bg);
        p.rect(0, 0, p.width, p.height);
      } else {
        const bgAlpha = Math.min(
          1,
          0.16 +
            Math.pow(s, 0.9) * 0.78 +
            p._pulseEnergy * 0.45 * PARAMS.glowStrength
        );
        const bgColor = blended;
        bgColor.setAlpha(bgAlpha);
        p.clear();
        p.noStroke();
        p.fill(bgColor);
        p.rect(0, 0, p.width, p.height);
      }

      p._flowT += PARAMS.flowSpeed * (1 + energy * 0.6);
      p._rotationAngle += PARAMS.spiralSpeed * (0.5 + s * 1.5 + p._pulseEnergy);

      // ========== PERLIN BLOBS ==========
      const area = p.width * p.height;
      const base = Math.max(12, Math.floor(area / PARAMS.densityFactor));
      const cols = Math.max(10, Math.floor(p.width / Math.sqrt(base)));
      const rows = Math.max(7, Math.floor(p.height / Math.sqrt(base)));
      const spacingX = p.width / cols;
      const spacingY = p.height / rows;

      const lighter = p.lerpColor(blended, p.color(0, 0, 100), 0.3);
      const darker = p.lerpColor(blended, p.color(0, 0, 0), 0.22);
      const shifted = p.lerpColor(
        blended,
        p.color((p.hue(blended) + 24) % 360, 100, 90),
        0.12
      );

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

          const fillColor = n > 0.6 ? lighter : n < 0.35 ? darker : shifted;
          fillColor.setAlpha(alpha);
          p.fill(fillColor);
          p.circle(px, py, radius);
        }
      }

      // ========== HEXAGONAL GRID OVERLAY ==========
      if (s > 0.1) {
        p.noFill();

        p._hexGrid.forEach((hex) => {
          // Proximity to particles creates brightness
          let nearestDist = Infinity;
          p._particles.forEach((particle) => {
            const dist = p.dist(hex.x, hex.y, particle.x, particle.y);
            nearestDist = Math.min(nearestDist, dist);
          });

          const proximityBrightness = p.map(
            nearestDist,
            0,
            150,
            0.2,
            0.02,
            true
          );

          // Activation decay
          if (hex.activated) {
            const timeSinceActivation = p.millis() - hex.activationTime;
            hex.brightness = Math.max(0, 0.35 - timeSinceActivation / 2000);
            if (timeSinceActivation > 2000) hex.activated = false;
          } else {
            hex.brightness = 0;
          }

          const baseBrightness = 0.03 + s * 0.04 + p._pulseEnergy * 0.08;
          const finalBrightness =
            baseBrightness + hex.brightness + proximityBrightness;

          if (finalBrightness > 0.03) {
            drawHexagon(hex, finalBrightness, blended);
          }
        });
      }

      // ========== ORBITAL PARTICLES ==========
      if (s > 0.02) {
        // Update particles
        p._particles.forEach((particle) => {
          const center = p._orbitCenters[particle.centerIndex];

          // Orbit motion
          particle.angle +=
            particle.speed *
            particle.orbitDirection *
            (0.5 + energy * 0.8 + p._pulseEnergy * 0.4);

          // Spiral effect
          particle.spiralPhase += 0.025 * (0.5 + s);
          const spiralOffset = p.sin(particle.spiralPhase) * 25 * s;
          const currentRadius =
            particle.orbitRadius + spiralOffset + p._pulseEnergy * 35;

          // Calculate position
          particle.x = center.x + p.cos(particle.angle) * currentRadius;
          particle.y = center.y + p.sin(particle.angle) * currentRadius;

          // Store trail
          particle.trail.push({ x: particle.x, y: particle.y });
          if (particle.trail.length > 12) {
            particle.trail.shift();
          }
        });

        // Draw particles
        p._particles.forEach((particle) => {
          // Draw trail
          if (s > 0.3 && particle.trail.length > 1) {
            p.noFill();
            for (let j = 0; j < particle.trail.length - 1; j++) {
              const trailAlpha = (j / particle.trail.length) * 0.2 * s;
              const trailColor = p.lerpColor(
                blended,
                lighter,
                (j / particle.trail.length) * 0.4
              );
              trailColor.setAlpha(trailAlpha);
              p.stroke(trailColor);
              p.strokeWeight(0.8 + (j / particle.trail.length) * 1);
              p.line(
                particle.trail[j].x,
                particle.trail[j].y,
                particle.trail[j + 1].x,
                particle.trail[j + 1].y
              );
            }
          }

          // Draw particle with glow
          p.noStroke();
          const particleSize =
            particle.size * (1 + energy * 0.5 + p._pulseEnergy * 0.7);

          // Outer glow
          const glowColor = p.lerpColor(blended, lighter, 0.3);
          glowColor.setAlpha(0.12 + p._pulseEnergy * 0.12);
          p.fill(glowColor);
          p.circle(particle.x, particle.y, particleSize * 5);

          // Middle glow
          const midColor = p.lerpColor(blended, p.color(0, 0, 100), 0.2);
          midColor.setAlpha(0.3 + p._pulseEnergy * 0.2);
          p.fill(midColor);
          p.circle(particle.x, particle.y, particleSize * 2.5);

          // Core
          const coreColor = p.lerpColor(blended, p.color(0, 0, 100), 0.5);
          coreColor.setAlpha(0.7 + p._pulseEnergy * 0.2);
          p.fill(coreColor);
          p.circle(particle.x, particle.y, particleSize);

          // Bright center
          p.fill(255, 255, 255, 220);
          p.circle(particle.x, particle.y, particleSize * 0.3);
        });

        // Draw orbit centers
        p._orbitCenters.forEach((center) => {
          const pulseFactor = 1 + p.sin(p._flowT * 3 + center.pulsePhase) * 0.3;
          const centerSize = (18 + s * 25 + p._pulseEnergy * 35) * pulseFactor;

          p.noStroke();
          const centerGlow = p.lerpColor(blended, p.color(0, 0, 100), 0.4);
          centerGlow.setAlpha(0.15 + s * 0.12 + p._pulseEnergy * 0.18);
          p.fill(centerGlow);
          p.circle(center.x, center.y, centerSize);

          // Bright core
          p.fill(255, 255, 255, 180 + p._pulseEnergy * 50);
          p.circle(center.x, center.y, centerSize * 0.3);
        });

        // Connection lines between nearby particles
        if (s > 0.4) {
          p.stroke(blended);
          p.strokeWeight(0.5);

          for (let i = 0; i < p._particles.length; i++) {
            for (let j = i + 1; j < p._particles.length; j++) {
              const dx = p._particles[i].x - p._particles[j].x;
              const dy = p._particles[i].y - p._particles[j].y;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist < 100) {
                const connectionAlpha = (1 - dist / 100) * 0.06 * s;
                const connectionColor = p.lerpColor(blended, lighter, 0.2);
                connectionColor.setAlpha(connectionAlpha);
                p.stroke(connectionColor);
                p.line(
                  p._particles[i].x,
                  p._particles[i].y,
                  p._particles[j].x,
                  p._particles[j].y
                );
              }
            }
          }
        }
      }

      // ========== ADDITIVE GLOW ==========
      if (s > 0.02) {
        p.push();
        p.blendMode(p.ADD);
        const glowCount =
          5 + Math.round(s * 6) + Math.round(p._pulseEnergy * 5);
        for (let i = 0; i < glowCount; i++) {
          const gx = p.noise(i * 0.21 - p._flowT * 0.02) * p.width;
          const gy = p.noise(i * 0.37 + p._flowT * 0.03) * p.height;
          const gRadius = 80 + s * 320 + p._pulseEnergy * 220;
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

      // ========== FOCAL CIRCLE ==========
      p.noStroke();
      const cx = Math.floor(p.width * 0.72);
      const cy = Math.floor(p.height * 0.5);
      const big = 40 + s * 300 + p._pulseEnergy * 220;
      const centerColor = p.lerpColor(blended, p.color(0, 0, 100), 0.12);
      centerColor.setAlpha(0.16 + s * 0.26 + p._pulseEnergy * 0.16);
      p.fill(centerColor);
      p.ellipse(cx, cy, big, big);

      // ========== RAINBOW SHIMMER ==========
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

      t += 0.006 + energy * 0.003 + p._pulseEnergy * 0.02;
    };

    return sketch;
  }, []);

  return <ReactP5Wrapper sketch={sketch} sentiment={sentiment} pulse={pulse} />;
}
