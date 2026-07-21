const WORD = 'Futuremagic';

/** Soft copper - all letters share this (background-ish, not flashy) */
const LETTER_COLOR = '#c4844a';

type PropulsionKind =
  | 'plume'
  | 'sparks'
  | 'hex'
  | 'bolt'
  | 'orbit'
  | 'pixels'
  | 'rune'
  | 'comet';

const PROPULSION: readonly PropulsionKind[] = [
  'plume',
  'sparks',
  'hex',
  'bolt',
  'orbit',
  'pixels',
  'rune',
  'comet',
  'plume',
  'sparks',
  'hex',
] as const;

type Point = {
  x: number;
  y: number;
  angle: number;
};

type Segment = {
  kind: 'arc';
  cx: number;
  cy: number;
  r: number;
  a0: number;
  a1: number;
  len: number;
};

/** Chain of full circular loops drifting around the page */
function buildLoopPath(
  width: number,
  height: number,
): { segments: Segment[]; length: number } {
  const m = Math.min(width, height);
  const loops = [
    { cx: width * 0.26, cy: height * 0.3, r: m * 0.17 },
    { cx: width * 0.72, cy: height * 0.26, r: m * 0.15 },
    { cx: width * 0.78, cy: height * 0.62, r: m * 0.18 },
    { cx: width * 0.5, cy: height * 0.78, r: m * 0.14 },
    { cx: width * 0.24, cy: height * 0.68, r: m * 0.16 },
    { cx: width * 0.48, cy: height * 0.42, r: m * 0.2 },
  ];

  const segments: Segment[] = loops.map((loop, i) => {
    // Alternate direction so the train weaves through loops
    const clockwise = i % 2 === 0;
    const a0 = clockwise ? -Math.PI / 2 : Math.PI / 2;
    const a1 = clockwise ? a0 + Math.PI * 2 : a0 - Math.PI * 2;
    return {
      kind: 'arc' as const,
      cx: loop.cx,
      cy: loop.cy,
      r: loop.r,
      a0,
      a1,
      len: Math.PI * 2 * loop.r,
    };
  });

  const length = segments.reduce((sum, s) => sum + s.len, 0);
  return { segments, length };
}

function pointOnPath(segments: Segment[], distance: number): Point {
  let d = distance;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    const isLast = i === segments.length - 1;
    if (d > seg.len && !isLast) {
      d -= seg.len;
      continue;
    }
    const t = seg.len === 0 ? 0 : Math.min(1, Math.max(0, d / seg.len));
    const a = seg.a0 + (seg.a1 - seg.a0) * t;
    const tangent = seg.a1 >= seg.a0 ? a + Math.PI / 2 : a - Math.PI / 2;
    return {
      x: seg.cx + Math.cos(a) * seg.r,
      y: seg.cy + Math.sin(a) * seg.r,
      angle: tangent,
    };
  }
  return { x: 0, y: 0, angle: 0 };
}

function wrapDist(distance: number, length: number): number {
  const d = distance % length;
  return d < 0 ? d + length : d;
}

function propulsionHtml(kind: PropulsionKind): string {
  switch (kind) {
    case 'plume':
      return '<span class="prop prop--plume"></span>';
    case 'sparks':
      return '<span class="prop prop--sparks"><i></i><i></i><i></i><i></i></span>';
    case 'hex':
      return '<span class="prop prop--hex"></span>';
    case 'bolt':
      return '<span class="prop prop--bolt"></span>';
    case 'orbit':
      return '<span class="prop prop--orbit"><i></i><i></i></span>';
    case 'pixels':
      return '<span class="prop prop--pixels"><i></i><i></i><i></i><i></i><i></i></span>';
    case 'rune':
      return '<span class="prop prop--rune">✧</span>';
    case 'comet':
      return '<span class="prop prop--comet"></span>';
  }
}

export function mountOrbitBrand(host: HTMLElement): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const letters = [...WORD];

  const train = document.createElement('div');
  train.className = 'orbit-train';
  train.setAttribute('aria-hidden', 'true');

  const cars = letters.map((ch, i) => {
    const car = document.createElement('span');
    car.className = 'orbit-train__car';
    const kind = PROPULSION[i % PROPULSION.length] ?? 'plume';
    car.style.setProperty('--letter', LETTER_COLOR);
    car.innerHTML = `${propulsionHtml(kind)}<span class="orbit-train__glyph">${ch}</span>`;
    train.appendChild(car);
    return car;
  });

  host.appendChild(train);

  if (reduced) {
    train.classList.add('orbit-train--static');
    return () => {
      train.remove();
    };
  }

  let raf = 0;
  let segments: Segment[] = [];
  let pathLen = 1;
  const start = performance.now();

  const LAP_MS = 52000;
  const FONT_SIZE = 30;
  const SPACING = 72;

  function layout(): void {
    const built = buildLoopPath(window.innerWidth, window.innerHeight);
    segments = built.segments;
    pathLen = Math.max(1, built.length);
  }

  function tick(now: number): void {
    const t = now - start;
    const headProgress = (t % LAP_MS) / LAP_MS;
    const headDist = headProgress * pathLen;

    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (!car) continue;
      const dist = wrapDist(headDist + i * SPACING, pathLen);
      const pt = pointOnPath(segments, dist);
      car.style.transform = `translate(-50%, -50%) translate(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px) rotate(${pt.angle}rad)`;
    }

    raf = requestAnimationFrame(tick);
  }

  const onResize = (): void => {
    layout();
  };

  layout();
  for (const car of cars) {
    car.style.fontSize = `${FONT_SIZE}px`;
  }

  raf = requestAnimationFrame(tick);
  window.addEventListener('resize', onResize);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    train.remove();
  };
}
