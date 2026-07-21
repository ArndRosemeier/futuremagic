const PROMPT_SNIPPETS = [
  'make a browser titan game',
  'personas around a table',
  'write → rate → rewrite',
  'ship it to futuremagic.de',
  'hotseat + AI opponents',
  'vibe this into a UI',
  'EPUB export when done',
  'poker with LLM agents',
  'theater-of-the-mind RPG',
  'one more polish pass',
] as const;

const GLYPHS = [
  '{',
  '}',
  '=>',
  'fn',
  '::',
  '<>',
  '++',
  '~',
  'ai',
  'ok',
  '✓',
  '…',
] as const;

type Star = {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
};

type PromptLine = {
  text: string;
  x: number;
  y: number;
  drift: number;
  phase: number;
  alpha: number;
};

type Token = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  life: number;
  maxLife: number;
  glyph: string;
};

type UiFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
  phase: number;
  pulse: number;
};

type TrailDot = {
  x: number;
  y: number;
  life: number;
  glyph: string;
};

type Agent = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  trail: TrailDot[];
  blink: number;
};

export type VibeHandle = {
  destroy: () => void;
  getAgents: () => ReadonlyArray<{ x: number; y: number }>;
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T extends readonly string[]>(list: T): T[number] {
  const item = list[Math.floor(Math.random() * list.length)];
  if (item === undefined) {
    throw new Error('empty pick list');
  }
  return item;
}

export function mountVibe(canvas: HTMLCanvasElement): VibeHandle {
  const maybeCtx = canvas.getContext('2d');
  if (!maybeCtx) {
    throw new Error('2d canvas context unavailable');
  }
  const ctx: CanvasRenderingContext2D = maybeCtx;
  const reduced =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0;
  let height = 0;
  let stars: Star[] = [];
  let prompts: PromptLine[] = [];
  let tokens: Token[] = [];
  let frames: UiFrame[] = [];
  let agents: Agent[] = [];
  let raf = 0;
  let start = performance.now();
  let spawnAcc = 0;

  function seedWorld(): void {
    const starCount = Math.floor((width * height) / 16000);
    stars = Array.from({ length: starCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.35 + Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.35 + Math.random() * 1.1,
    }));

    const promptCount = Math.max(5, Math.floor(height / 110));
    prompts = Array.from({ length: promptCount }, (_, i) => ({
      text: pick(PROMPT_SNIPPETS),
      x: rand(-40, width * 0.42),
      y: rand(40, height - 40),
      drift: rand(4, 14) * (i % 2 === 0 ? 1 : -1),
      phase: Math.random() * Math.PI * 2,
      alpha: rand(0.08, 0.2),
    }));

    frames = Array.from({ length: 4 }, () => ({
      x: rand(width * 0.35, width * 0.78),
      y: rand(height * 0.12, height * 0.7),
      w: rand(90, 160),
      h: rand(58, 100),
      phase: Math.random() * Math.PI * 2,
      pulse: rand(0.4, 1),
    }));

    agents = Array.from({ length: 3 }, (_, i) => ({
      x: rand(width * 0.2, width * 0.9),
      y: rand(height * 0.15, height * 0.85),
      vx: rand(18, 42) * (i % 2 === 0 ? 1 : -1),
      vy: rand(12, 28) * (i % 3 === 0 ? 1 : -1),
      hue: i === 0 ? 28 : i === 1 ? 22 : 35,
      trail: [],
      blink: Math.random() * Math.PI * 2,
    }));

    tokens = [];
  }

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedWorld();
  }

  function spawnToken(): void {
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];
    const frame = frames[Math.floor(Math.random() * frames.length)];
    if (!prompt || !frame) return;
    tokens.push({
      x: prompt.x + rand(0, 120),
      y: prompt.y + rand(-6, 6),
      tx: frame.x + rand(8, frame.w - 8),
      ty: frame.y + rand(18, frame.h - 8),
      life: 0,
      maxLife: rand(2.2, 4.2),
      glyph: pick(GLYPHS),
    });
  }

  function drawBackdrop(t: number): void {
    const g = ctx.createLinearGradient(0, 0, width * 0.15, height);
    g.addColorStop(0, '#120c08');
    g.addColorStop(0.45, '#1a120c');
    g.addColorStop(1, '#24160f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    const amberX = width * (0.65 + 0.04 * Math.sin(t * 0.1));
    const amber = ctx.createRadialGradient(
      amberX,
      height * 0.2,
      12,
      amberX,
      height * 0.4,
      Math.max(width, height) * 0.5,
    );
    amber.addColorStop(0, 'rgba(196, 132, 74, 0.14)');
    amber.addColorStop(0.5, 'rgba(143, 90, 50, 0.06)');
    amber.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = amber;
    ctx.fillRect(0, 0, width, height);

    const ember = ctx.createRadialGradient(
      width * 0.2,
      height * 0.85,
      8,
      width * 0.28,
      height * 0.72,
      width * 0.4,
    );
    ember.addColorStop(0, 'rgba(180, 90, 40, 0.12)');
    ember.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = ember;
    ctx.fillRect(0, 0, width, height);
  }

  function drawStars(t: number): void {
    for (const star of stars) {
      const alpha =
        0.15 + 0.4 * (0.5 + 0.5 * Math.sin(t * star.speed + star.phase));
      ctx.beginPath();
      ctx.fillStyle = `rgba(212, 165, 116, ${alpha.toFixed(3)})`;
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPrompts(t: number): void {
    ctx.font = '500 14px "Cormorant Garamond", serif';
    ctx.textBaseline = 'middle';
    for (const line of prompts) {
      const x = line.x + Math.sin(t * 0.25 + line.phase) * line.drift;
      const y = line.y + Math.cos(t * 0.18 + line.phase) * 6;
      const alpha = line.alpha * (0.7 + 0.3 * Math.sin(t * 0.5 + line.phase));
      ctx.fillStyle = `rgba(168, 144, 120, ${(alpha * 0.85).toFixed(3)})`;
      ctx.fillText(line.text, x, y);
      ctx.fillStyle = `rgba(196, 132, 74, ${(alpha * 0.5).toFixed(3)})`;
      ctx.fillRect(x - 14, y - 5, 6, 2);
    }
  }

  function drawFrames(t: number): void {
    for (const frame of frames) {
      const glow =
        0.1 + 0.08 * (0.5 + 0.5 * Math.sin(t * frame.pulse + frame.phase));
      ctx.strokeStyle = `rgba(196, 132, 74, ${glow.toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.shadowColor = 'rgba(196, 132, 74, 0.25)';
      ctx.shadowBlur = 4;
      ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(26, 18, 12, ${(glow * 1.2).toFixed(3)})`;
      ctx.fillRect(frame.x, frame.y, frame.w, 12);
      ctx.fillStyle = `rgba(212, 165, 116, ${(glow * 1.1).toFixed(3)})`;
      ctx.fillRect(frame.x + 6, frame.y + 4, 4, 4);
      ctx.fillStyle = `rgba(196, 132, 74, ${(glow * 0.9).toFixed(3)})`;
      ctx.fillRect(frame.x + 14, frame.y + 4, 4, 4);
      for (let i = 0; i < 3; i++) {
        const ly = frame.y + 22 + i * 14;
        const lw =
          frame.w *
          (0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 0.7 + frame.phase + i)));
        ctx.fillStyle = `rgba(168, 144, 120, ${(glow * 0.75).toFixed(3)})`;
        ctx.fillRect(frame.x + 10, ly, lw - 20, 3);
      }
    }
  }

  function drawTokens(dt: number): void {
    const next: Token[] = [];
    ctx.font = '600 12px "Cinzel", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const token of tokens) {
      token.life += dt;
      const p = Math.min(1, token.life / token.maxLife);
      const ease = 1 - Math.pow(1 - p, 3);
      const x = token.x + (token.tx - token.x) * ease;
      const y = token.y + (token.ty - token.y) * ease;
      const alpha = p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;
      ctx.fillStyle = `rgba(196, 132, 74, ${(alpha * 0.7).toFixed(3)})`;
      ctx.fillText(token.glyph, x, y);
      if (p < 1) next.push(token);
    }
    tokens = next;
    ctx.textAlign = 'start';
  }

  function drawAgents(dt: number, t: number): void {
    for (const agent of agents) {
      agent.x += agent.vx * dt;
      agent.y += agent.vy * dt;
      if (agent.x < 40 || agent.x > width - 40) agent.vx *= -1;
      if (agent.y < 40 || agent.y > height - 40) agent.vy *= -1;
      agent.x = Math.max(40, Math.min(width - 40, agent.x));
      agent.y = Math.max(40, Math.min(height - 40, agent.y));

      // gentle steering noise
      agent.vx += Math.sin(t * 0.7 + agent.blink) * 8 * dt;
      agent.vy += Math.cos(t * 0.55 + agent.blink) * 6 * dt;
      const speed = Math.hypot(agent.vx, agent.vy);
      const max = 55;
      if (speed > max) {
        agent.vx = (agent.vx / speed) * max;
        agent.vy = (agent.vy / speed) * max;
      }

      agent.trail.push({
        x: agent.x,
        y: agent.y,
        life: 1,
        glyph: pick(GLYPHS),
      });
      if (agent.trail.length > 28) agent.trail.shift();

      ctx.font = '700 10px "Cinzel", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < agent.trail.length; i++) {
        const dot = agent.trail[i];
        if (!dot) continue;
        dot.life -= dt * 0.85;
        const a = Math.max(0, dot.life) * (i / agent.trail.length) * 0.65;
        ctx.fillStyle = `hsla(${agent.hue}, 55%, 55%, ${a.toFixed(3)})`;
        ctx.fillText(dot.glyph, dot.x, dot.y);
      }
      agent.trail = agent.trail.filter((d) => d.life > 0);

      const blink =
        0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 6 + agent.blink));
      const grd = ctx.createRadialGradient(
        agent.x,
        agent.y,
        0,
        agent.x,
        agent.y,
        18,
      );
      grd.addColorStop(0, `hsla(${agent.hue}, 60%, 50%, ${(0.9 * blink).toFixed(3)})`);
      grd.addColorStop(1, `hsla(${agent.hue}, 55%, 40%, 0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(agent.x, agent.y, 18, 0, Math.PI * 2);
      ctx.fill();

      // caret / cursor body
      ctx.fillStyle = `hsla(${agent.hue}, 55%, 58%, ${blink.toFixed(3)})`;
      ctx.fillRect(agent.x - 1.5, agent.y - 8, 3, 16);
      ctx.textAlign = 'start';
    }
  }

  function draw(now: number): void {
    const t = (now - start) / 1000;
    const dt = Math.min(0.05, 1 / 60);

    drawBackdrop(t);
    drawStars(t);

    if (!reduced) {
      drawPrompts(t);
      drawFrames(t);

      spawnAcc += dt;
      while (spawnAcc > 0.28) {
        spawnAcc -= 0.28;
        if (tokens.length < 36) spawnToken();
      }
      drawTokens(dt);
      drawAgents(dt, t);
    }

    raf = requestAnimationFrame(draw);
  }

  const onResize = (): void => {
    resize();
  };

  resize();
  raf = requestAnimationFrame(draw);
  window.addEventListener('resize', onResize);

  return {
    destroy: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    },
    getAgents: () => agents.map((a) => ({ x: a.x, y: a.y })),
  };
}
