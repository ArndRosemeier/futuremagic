import './styles.css';
import { formatUpdatedAt, loadResolvedApps } from './registry';
import { mountOrbitBrand } from './orbitBrand';
import { mountVibe, type VibeHandle } from './vibe';
import type { ResolvedApp } from './types';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderCard(app: ResolvedApp, index: number): string {
  const delay = Math.min(index * 70, 420);
  const tagline =
    app.tagline !== null
      ? `<p class="app-tagline">${escapeHtml(app.tagline)}</p>`
      : '';
  const tags =
    app.tags.length > 0
      ? `<ul class="app-tags">${app.tags
          .map((t) => `<li>${escapeHtml(t)}</li>`)
          .join('')}</ul>`
      : '';
  const updated = formatUpdatedAt(app.updatedAt);
  const updatedHtml =
    updated !== ''
      ? `<span class="app-updated">Updated ${escapeHtml(updated)}</span>`
      : '<span class="app-updated"></span>';

  const shotHtml =
    app.screenshotUrl !== null
      ? `<img
          class="app-shot"
          src="${escapeHtml(app.screenshotUrl)}"
          alt=""
          loading="lazy"
        />`
      : `<div class="app-shot-fallback">${escapeHtml(app.title)}</div>`;

  return `
    <a
      class="app-card"
      data-app-card
      href="${escapeHtml(app.href)}"
      style="animation-delay: ${delay}ms"
    >
      <div class="app-shot-wrap">
        ${shotHtml}
      </div>
      <div class="app-body">
        <h2 class="app-title">${escapeHtml(app.title)}</h2>
        ${tagline}
        ${tags}
        <div class="app-meta">
          ${updatedHtml}
          <span class="app-open">Open →</span>
        </div>
      </div>
    </a>
  `;
}

function renderShell(root: HTMLElement): {
  canvas: HTMLCanvasElement;
  appsMount: HTMLElement;
} {
  root.innerHTML = `
    <canvas class="sky" aria-hidden="true"></canvas>
    <div class="page">
      <header class="masthead">
        <h1 class="brand-sr">Futuremagic</h1>
        <p class="tag">Vibe-coded apps</p>
      </header>
      <main class="apps" aria-label="Apps">
        <div class="apps-mount" data-apps>
          <p class="apps-status">Loading apps…</p>
        </div>
      </main>
    </div>
    <footer class="site-footer">
      <div class="site-footer-row">
        <span>Futuremagic-Productions</span>
        <a href="mailto:armchair@futuremagic.de">armchair@futuremagic.de</a>
      </div>
      <p class="site-footer-note">
        For some of my apps, an openrouter key is needed. Register and then get a key here:
        <a href="https://openrouter.ai/workspaces/default/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/workspaces/default/keys</a>
      </p>
    </footer>
  `;

  const canvas = root.querySelector('.sky');
  const appsMount = root.querySelector('[data-apps]');
  if (!(canvas instanceof HTMLCanvasElement) || !(appsMount instanceof HTMLElement)) {
    throw new Error('Failed to mount page shell');
  }
  return { canvas, appsMount };
}

function bindCardMotion(grid: HTMLElement): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return () => undefined;

  const cards = [...grid.querySelectorAll<HTMLElement>('[data-app-card]')];
  const cleanups: Array<() => void> = [];

  for (const card of cards) {
    const onMove = (event: PointerEvent): void => {
      const rect = card.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.setProperty('--mx', `${(px * 6).toFixed(2)}px`);
      card.style.setProperty('--my', `${(py * 5).toFixed(2)}px`);
    };
    const onLeave = (): void => {
      card.style.setProperty('--mx', '0px');
      card.style.setProperty('--my', '0px');
    };
    card.addEventListener('pointermove', onMove);
    card.addEventListener('pointerleave', onLeave);
    cleanups.push(() => {
      card.removeEventListener('pointermove', onMove);
      card.removeEventListener('pointerleave', onLeave);
    });
  }

  return () => {
    for (const fn of cleanups) fn();
  };
}

function bindAgentHighlights(
  grid: HTMLElement,
  vibe: VibeHandle,
): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return () => undefined;

  const cards = [...grid.querySelectorAll<HTMLElement>('[data-app-card]')];
  let raf = 0;

  const tick = (): void => {
    const agents = vibe.getAgents();
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      let near = false;
      for (const agent of agents) {
        const cx = Math.max(rect.left, Math.min(agent.x, rect.right));
        const cy = Math.max(rect.top, Math.min(agent.y, rect.bottom));
        const dx = agent.x - cx;
        const dy = agent.y - cy;
        if (dx * dx + dy * dy < 55 * 55) {
          near = true;
          break;
        }
      }
      card.classList.toggle('agent-near', near);
    }
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

async function main(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('#app missing');
  }

  const { canvas, appsMount } = renderShell(root);
  const vibe = mountVibe(canvas);
  const destroyOrbit = mountOrbitBrand(root);
  let unbindMotion: (() => void) | undefined;
  let unbindAgents: (() => void) | undefined;

  try {
    const apps = await loadResolvedApps();
    if (apps.length === 0) {
      appsMount.innerHTML =
        '<p class="apps-status">No apps registered yet.</p>';
      return;
    }

    appsMount.innerHTML = `<div class="apps-grid" data-grid>${apps
      .map((app, i) => renderCard(app, i))
      .join('')}</div>`;
    const grid = appsMount.querySelector('[data-grid]');
    if (!(grid instanceof HTMLElement)) {
      throw new Error('apps grid missing');
    }
    unbindMotion = bindCardMotion(grid);
    unbindAgents = bindAgentHighlights(grid, vibe);

    // Replace broken screenshots with fallback; warn instead of leaving a hard error
    for (const img of grid.querySelectorAll<HTMLImageElement>('.app-shot')) {
      img.addEventListener('error', () => {
        console.warn(`Screenshot missing: ${img.currentSrc || img.src}`);
        const fallback = document.createElement('div');
        fallback.className = 'app-shot-fallback';
        const card = img.closest('[data-app-card]');
        const title = card?.querySelector('.app-title')?.textContent ?? 'App';
        fallback.textContent = title;
        img.replaceWith(fallback);
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    appsMount.innerHTML = `<p class="apps-status error">${escapeHtml(message)}</p>`;
    throw err;
  }

  window.addEventListener(
    'beforeunload',
    () => {
      vibe.destroy();
      destroyOrbit();
      unbindMotion?.();
      unbindAgents?.();
    },
    { once: true },
  );
}

void main();
