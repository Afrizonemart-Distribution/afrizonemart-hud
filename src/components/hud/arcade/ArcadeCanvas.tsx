'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import type { PulseParticle, PulseSnapshot } from '@/lib/hud/pulseTypes';

/**
 * The arena: the backend drawn as a side-on game level.
 *
 *   SHOPPERS ──▶ CACHE SHIELD ──▶ NODE.JS (boss, HP = CPU headroom) ──▶ POSTGRES
 *
 * Every request the API reports (or the simulator invents) becomes a
 * dot that runs the route it really took: cache hits bounce off the
 * shield, misses go through Node to Postgres and back, failures explode
 * at Node. Dot colour is its real latency: green < 100 ms, amber < 500
 * ms (the video's limit), red beyond.
 *
 * Drawn imperatively in its own requestAnimationFrame loop from refs —
 * no React state per frame (that starved App Router navigation before).
 */

const C = {
  amber: '#FBAC34',
  glow: '#FFD27A',
  green: '#3DDC97',
  red: '#FF4D4D',
  cyan: '#4DD8FF',
  grid: '#12184a',
  dim: 'rgba(251,172,52,0.35)',
};

type Phase = 'out' | 'node' | 'db' | 'back' | 'boom';
interface Dot {
  p: PulseParticle;
  x: number;
  y: number;
  sx: number; // start (crowd) position
  sy: number;
  phase: Phase;
  t: number; // ms elapsed in phase
  dur: number; // phase duration
  color: string;
}

const colorFor = (p: PulseParticle) =>
  p.s >= 500 ? C.red : p.ms >= 500 ? C.red : p.ms >= 100 ? C.amber : C.green;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function ArcadeCanvas({
  incoming,
  snap,
}: {
  incoming: MutableRefObject<PulseParticle[]>;
  snap: PulseSnapshot | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapRef = useRef<PulseSnapshot | null>(snap);
  snapRef.current = snap;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0;
    let H = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const dots: Dot[] = [];
    const sparks: Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }> = [];
    let shieldFlash = 0;
    let dbFlash = 0;
    let last = performance.now();
    let raf = 0;
    let carry = 0;

    // Stations, as fractions of the canvas.
    const pos = () => ({
      crowd: { x0: W * 0.03, x1: W * 0.24, y0: H * 0.2, y1: H * 0.82 },
      shield: { x: W * 0.44, y: H * 0.5 },
      node: { x: W * 0.58, y: H * 0.5 },
      db: { x: W * 0.86, y: H * 0.5 },
    });

    const spawn = (p: PulseParticle) => {
      const L = pos();
      const sx = lerp(L.crowd.x0, L.crowd.x1, Math.random());
      const sy = lerp(L.crowd.y0, L.crowd.y1, Math.random());
      dots.push({ p, x: sx, y: sy, sx, sy, phase: 'out', t: 0, dur: 700, color: colorFor(p) });
    };

    const burst = (x: number, y: number, color: string, n = 10) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 30 + Math.random() * 90;
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color });
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      const s = snapRef.current;
      const L = pos();

      // Drain incoming particles evenly across the 500 ms frame window.
      const q = incoming.current;
      carry += (q.length * dt) / 500;
      let take = Math.floor(carry);
      carry -= take;
      while (take-- > 0 && q.length && dots.length < 1500) spawn(q.shift()!);

      // ---- background ------------------------------------------------
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      // the wire
      ctx.strokeStyle = C.dim;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(L.crowd.x1 + 10, H * 0.5);
      ctx.lineTo(L.db.x, H * 0.5);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';

      // ---- crowd -----------------------------------------------------
      const players = s ? s.players.loadtest || s.players.shoppers : 0;
      const maxDots = 600;
      const per = Math.max(1, Math.ceil(players / maxDots));
      const shown = Math.min(maxDots, Math.ceil(players / per));
      const cols = 20;
      const cw = (L.crowd.x1 - L.crowd.x0) / cols;
      const rows = Math.ceil(maxDots / cols);
      const rh = (L.crowd.y1 - L.crowd.y0) / rows;
      for (let i = 0; i < shown; i++) {
        const cx = L.crowd.x0 + (i % cols) * cw + cw / 2;
        const cy = L.crowd.y0 + Math.floor(i / cols) * rh + rh / 2;
        const tw = 0.45 + 0.35 * Math.sin(now / 600 + i * 1.7);
        ctx.fillStyle = `rgba(251,172,52,${tw})`;
        ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
      }
      ctx.fillStyle = C.amber;
      ctx.fillText('SHOPPERS', (L.crowd.x0 + L.crowd.x1) / 2, L.crowd.y0 - 14);
      ctx.fillStyle = C.dim;
      ctx.fillText(per > 1 ? `1 dot = ${per} players` : '1 dot = 1 player', (L.crowd.x0 + L.crowd.x1) / 2, L.crowd.y1 + 18);

      // ---- cache shield -----------------------------------------------
      const cacheOn = !!s && s.cache.ttlMs > 0;
      const hitRate = s?.cache.hitRate ?? 0;
      shieldFlash = Math.max(0, shieldFlash - dt / 300);
      ctx.save();
      ctx.lineWidth = 4 + shieldFlash * 4;
      ctx.strokeStyle = cacheOn ? `rgba(77,216,255,${0.35 + (hitRate / 100) * 0.5 + shieldFlash * 0.3})` : 'rgba(77,216,255,0.12)';
      if (!cacheOn) ctx.setLineDash([3, 6]);
      ctx.shadowColor = C.cyan;
      ctx.shadowBlur = cacheOn ? 10 + shieldFlash * 20 : 0;
      ctx.beginPath();
      ctx.arc(L.node.x + 40, L.node.y, L.node.x + 40 - L.shield.x, Math.PI * 0.72, Math.PI * 1.28);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = cacheOn ? C.cyan : 'rgba(77,216,255,0.4)';
      ctx.fillText(cacheOn ? `${(s!.cache.ttlMs / 1000).toFixed(0)}s CACHE` : 'CACHE OFF', L.shield.x - 6, H * 0.5 - 92);
      if (cacheOn) ctx.fillText(`${hitRate}% hit`, L.shield.x - 6, H * 0.5 + 104);

      // ---- node (the boss) ---------------------------------------------
      const cpu = s?.cpu.pct ?? 0;
      const shake = cpu > 85 ? (Math.random() - 0.5) * ((cpu - 85) / 3) : 0;
      const nx = L.node.x + shake;
      const ny = L.node.y + shake;
      ctx.save();
      ctx.shadowColor = cpu > 85 ? C.red : C.green;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = cpu > 85 ? C.red : C.green;
      ctx.lineWidth = 2;
      const hex = (r: number) => {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          const px = nx + Math.cos(a) * r;
          const py = ny + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      };
      hex(34);
      ctx.fillStyle = 'rgba(61,220,151,0.08)';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = C.green;
      ctx.fillText('NODE.JS API', nx, ny - 48);
      // HP bar = CPU headroom
      const hpW = 90;
      ctx.strokeStyle = C.dim;
      ctx.strokeRect(nx - hpW / 2, ny + 44, hpW, 7);
      const hp = Math.max(0, 100 - cpu) / 100;
      ctx.fillStyle = hp > 0.4 ? C.green : hp > 0.15 ? C.amber : C.red;
      ctx.fillRect(nx - hpW / 2 + 1, ny + 45, (hpW - 2) * hp, 5);
      ctx.fillStyle = C.dim;
      ctx.fillText(`HP ${Math.round(hp * 100)} · CPU ${cpu}%`, nx, ny + 66);
      // queue: in-flight requests stacked above the boss
      const inflight = Math.min(60, s?.inflight ?? 0);
      for (let i = 0; i < inflight; i++) {
        ctx.fillStyle = 'rgba(251,172,52,0.7)';
        ctx.fillRect(nx - 30 + (i % 15) * 4, ny - 70 - Math.floor(i / 15) * 4, 2.5, 2.5);
      }

      // ---- postgres ----------------------------------------------------
      dbFlash = Math.max(0, dbFlash - dt / 400);
      const dx = L.db.x;
      const dy = L.db.y;
      ctx.save();
      ctx.shadowColor = C.cyan;
      ctx.shadowBlur = 6 + dbFlash * 18;
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(dx, dy - 26, 30, 9, 0, 0, Math.PI * 2);
      ctx.moveTo(dx - 30, dy - 26);
      ctx.lineTo(dx - 30, dy + 26);
      ctx.ellipse(dx, dy + 26, 30, 9, 0, Math.PI, 0, true);
      ctx.lineTo(dx + 30, dy - 26);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = C.cyan;
      ctx.fillText('POSTGRES', dx, dy - 50);
      ctx.fillStyle = C.dim;
      ctx.fillText(s ? `${s.db.qps} q/s · ${s.db.avgMs} ms` : '—', dx, dy + 56);

      // ---- dots --------------------------------------------------------
      for (let i = dots.length - 1; i >= 0; i--) {
        const d = dots[i];
        d.t += dt;
        const k = Math.min(1, d.t / d.dur);
        const bounce = d.p.c === 'hit' || d.p.c === 'shared';
        if (d.phase === 'out') {
          const tx = bounce ? L.shield.x - 4 : L.node.x - 30;
          d.x = lerp(d.sx, tx, ease(k));
          d.y = lerp(d.sy, L.node.y + (d.sy - L.node.y) * 0.15, ease(k));
          if (k >= 1) {
            if (bounce) {
              shieldFlash = Math.min(1, shieldFlash + 0.25);
              d.phase = 'back';
              d.dur = 600;
            } else if (d.p.s >= 500) {
              d.phase = 'boom';
              burst(d.x, d.y, C.red, 14);
            } else {
              d.phase = 'node';
              d.dur = Math.min(1600, 120 + d.p.ms * 1.2); // slow requests visibly sit in Node
            }
            d.t = 0;
            d.sx = d.x;
            d.sy = d.y;
          }
        } else if (d.phase === 'node') {
          d.x = L.node.x - 20 + Math.sin((d.t + i) / 90) * 6;
          d.y = d.sy + Math.cos((d.t + i) / 110) * 6;
          if (k >= 1) {
            d.phase = d.p.db > 0 ? 'db' : 'back';
            d.t = 0;
            d.dur = d.p.db > 0 ? 500 : 650;
            d.sx = d.x;
            d.sy = d.y;
          }
        } else if (d.phase === 'db') {
          // there and back
          const tt = k < 0.5 ? ease(k * 2) : ease((1 - k) * 2);
          d.x = lerp(d.sx, L.db.x - 34, tt);
          d.y = lerp(d.sy, L.db.y, tt);
          if (k >= 0.5 && d.t - dt < d.dur / 2) dbFlash = Math.min(1, dbFlash + 0.15);
          if (k >= 1) {
            d.phase = 'back';
            d.t = 0;
            d.dur = 650;
            d.sx = d.x;
            d.sy = d.y;
          }
        } else if (d.phase === 'back') {
          d.x = lerp(d.sx, L.crowd.x1 - 6, ease(k));
          d.y = lerp(d.sy, d.sy + (Math.random() - 0.5) * 2, k);
          if (k >= 1) {
            dots.splice(i, 1);
            continue;
          }
        } else {
          dots.splice(i, 1);
          continue;
        }
        ctx.fillStyle = d.color;
        ctx.shadowColor = d.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(d.x, d.y, bounce ? 2.2 : 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // ---- sparks ------------------------------------------------------
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.life -= dt / 600;
        if (p.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        p.x += (p.vx * dt) / 1000;
        p.y += (p.vy * dt) / 1000;
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 2, 2);
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [incoming]);

  return <canvas ref={canvasRef} className="block h-[420px] w-full" aria-label="Live backend arena" />;
}
