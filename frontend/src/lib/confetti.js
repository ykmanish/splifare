'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * A confetti burst on a canvas the caller positions.
 *
 * Canvas rather than DOM nodes: ninety absolutely-positioned divs animating
 * transform at once is the one thing that reliably drops a mid-range phone
 * below 60fps, and this fires at exactly the moment the app is trying to feel
 * good about itself.
 *
 * The hook owns the animation frame so a burst that is still running when the
 * panel unmounts cannot keep drawing into a detached canvas.
 */

const COLORS = ['#eaff72', '#d8ccff', '#60d394', '#ff7aa2', '#71a7ff', '#ffd166', '#ff9f68'];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function useConfetti() {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const fire = useCallback(({ count = 90, spread = 7, origin = 0.34 } = {}) => {
    const canvas = canvasRef.current;
    if (!canvas || prefersReducedMotion()) return;

    const box = canvas.parentElement?.getBoundingClientRect();
    const width = Math.max(1, Math.floor(box?.width || 360));
    const height = Math.max(1, Math.floor(box?.height || 320));
    /* Back the canvas at device resolution but lay it out in CSS pixels, or
       the whole burst renders soft on any phone made after 2014. */
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pieces = Array.from({ length: count }, () => ({
      x: width / 2 + (Math.random() - 0.5) * 70,
      y: height * origin,
      vx: (Math.random() - 0.5) * spread,
      vy: -Math.random() * 7 - 3,
      size: Math.random() * 7 + 4,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.35,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 90 + Math.random() * 35,
    }));

    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    let frame = 0;

    const draw = () => {
      frame += 1;
      ctx.clearRect(0, 0, width, height);
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18;
        p.vx *= 0.995;
        p.rot += p.spin;
        const alpha = Math.max(0, 1 - frame / p.life);
        if (alpha <= 0) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        ctx.restore();
      }
      if (frame < 130) frameRef.current = requestAnimationFrame(draw);
      else {
        ctx.clearRect(0, 0, width, height);
        frameRef.current = 0;
      }
    };
    frameRef.current = requestAnimationFrame(draw);
  }, []);

  return { canvasRef, fire };
}

/** The canvas itself — absolutely positioned, never in the way of a tap. */
export function ConfettiLayer({ canvasRef, className = '' }) {
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-20 h-full w-full ${className}`}
    />
  );
}
