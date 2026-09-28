/* Weave — 首页粒子光尘背景。
   取图片色系（紫 / 电蓝 / 品红 / 蜜桃 / 月白）做发光尘埃，
   缓慢上浮 + 左右摇曳 + 呼吸闪烁，配合指针做轻微视差。
   prefers-reduced-motion 时只渲染一帧静态图。 */
(() => {
  'use strict';
  const container = document.querySelector('.weave-bg');
  const canvas = document.getElementById('bgParticles');
  if (!container || !canvas) return;
  const ctx = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const GLOWS = [
    { rgb: '155,123,255', weight: 5 }, // 紫
    { rgb: '96,140,255', weight: 5 },  // 电蓝
    { rgb: '255,158,207', weight: 2 }, // 品红
    { rgb: '255,201,163', weight: 1 }, // 蜜桃
    { rgb: '234,230,255', weight: 2 }, // 月白
  ];
  const SPRITE = 160;

  function makeGlowSprite(rgb) {
    const c = document.createElement('canvas');
    c.width = c.height = SPRITE;
    const g = c.getContext('2d');
    const half = SPRITE / 2;
    const grad = g.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, `rgba(${rgb},.9)`);
    grad.addColorStop(0.18, `rgba(${rgb},.4)`);
    grad.addColorStop(0.45, `rgba(${rgb},.12)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE, SPRITE);
    return c;
  }
  function makeCoreSprite() {
    const c = document.createElement('canvas');
    c.width = c.height = SPRITE;
    const g = c.getContext('2d');
    const half = SPRITE / 2;
    const grad = g.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, 'rgba(255,255,255,.95)');
    grad.addColorStop(0.08, 'rgba(255,255,255,.5)');
    grad.addColorStop(0.22, 'rgba(255,255,255,.13)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE, SPRITE);
    return c;
  }
  const sprites = GLOWS.map(item => makeGlowSprite(item.glow ?? item.rgb));
  const coreSprite = makeCoreSprite();
  const weighted = [];
  GLOWS.forEach((item, i) => { for (let n = 0; n < item.weight; n += 1) weighted.push(i); });

  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = arr => arr[(Math.random() * arr.length) | 0];

  let width = 0;
  let height = 0;
  let particles = [];

  function spawn(p, first) {
    p.baseX = rand(0, Math.max(width, 1));
    p.y = first ? rand(0, Math.max(height, 1)) : height + rand(12, 90);
    p.r = p.bokeh ? rand(2.6, 4.6) : rand(0.7, 2.1);
    p.vy = p.bokeh ? rand(2, 5) : rand(5, 16);
    p.swayAmp = rand(6, 26);
    p.swaySpeed = rand(0.12, 0.5);
    p.swayPhase = rand(0, Math.PI * 2);
    p.twinkleSpeed = rand(0.5, 1.9);
    p.twinklePhase = rand(0, Math.PI * 2);
    p.sprite = pick(weighted);
    p.depth = rand(0.35, 1);
  }

  function buildParticles() {
    const target = Math.max(34, Math.min(120, Math.round((width * height) / 15000)));
    particles = [];
    for (let i = 0; i < target; i += 1) {
      const p = { bokeh: i < 7 };
      spawn(p, true);
      particles.push(p);
    }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = container.clientWidth || window.innerWidth;
    height = container.clientHeight || window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildParticles();
  }

  const pointer = { tx: 0, ty: 0, x: 0, y: 0 };
  window.addEventListener('pointermove', (event) => {
    pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  function drawParticle(p, t, ox, oy) {
    const twinkle = 0.5 + 0.5 * Math.sin(t * p.twinkleSpeed + p.twinklePhase);
    const alpha = (p.bokeh ? 0.22 : 0.55) * (0.35 + 0.65 * twinkle);
    if (alpha <= 0.015) return;
    const x = p.baseX + Math.sin(t * p.swaySpeed + p.swayPhase) * p.swayAmp + ox * p.depth;
    const y = p.y + oy * p.depth;
    const halo = (p.bokeh ? p.r * 12 : p.r * 8) * (0.9 + 0.25 * twinkle);
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprites[p.sprite], x - halo / 2, y - halo / 2, halo, halo);
    const core = p.r * 4.4;
    ctx.globalAlpha = Math.min(1, alpha * 1.5);
    ctx.drawImage(coreSprite, x - core / 2, y - core / 2, core, core);
  }

  function render(t, dt) {
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    const ox = pointer.x * -16;
    const oy = pointer.y * -10;
    for (const p of particles) {
      p.y -= p.vy * dt;
      if (p.y < -30) spawn(p, false);
      drawParticle(p, t, ox, oy);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    container.style.setProperty('--px', pointer.x.toFixed(4));
    container.style.setProperty('--py', pointer.y.toFixed(4));
  }

  let rafId = 0;
  let last = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    render(now / 1000, dt);
    rafId = requestAnimationFrame(frame);
  }
  function start() {
    if (rafId) return;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  window.addEventListener('resize', resize);
  resize();

  if (reducedMotion) {
    render(1.2, 0);
  } else {
    start();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else start();
    });
  }
})();
