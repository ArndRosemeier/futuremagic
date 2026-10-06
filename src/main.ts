import './styles.css';
import { formatUpdatedAt, loadResolvedApps } from './registry';
import {
  formatStoryDate,
  loadStories,
  loadStoryHtml,
} from './stories';
import { mountStoryReader, type StoryReaderHandle } from './storyReader';
import { mountOrbitBrand } from './orbitBrand';
import { mountVibe, type VibeHandle } from './vibe';
import type { ResolvedApp, Story, TieredApps } from './types';

type Section = 'apps' | 'stories';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderAppCard(app: ResolvedApp, index: number): string {
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

function renderParagraphs(text: string, className: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p class="${className}">${escapeHtml(p)}</p>`)
    .join('');
}

function renderHeroCard(app: ResolvedApp, index: number): string {
  const delay = Math.min(index * 90, 270);
  const shots = app.screenshotUrls;
  const galleryInner =
    shots.length > 0
      ? shots
          .map(
            (url, i) => `<img
              class="hero-shot${i === 0 ? ' is-active' : ''}"
              src="${escapeHtml(url)}"
              alt=""
              ${i === 0 ? '' : 'loading="lazy"'}
            />`,
          )
          .join('')
      : `<div class="app-shot-fallback">${escapeHtml(app.title)}</div>`;
  const dots =
    shots.length > 1
      ? `<div class="hero-dots" role="tablist" aria-label="Screenshots">${shots
          .map(
            (_, i) => `<button
              type="button"
              role="tab"
              class="hero-dot${i === 0 ? ' is-active' : ''}"
              data-hero-dot="${i}"
              aria-selected="${i === 0 ? 'true' : 'false'}"
              aria-label="Screenshot ${i + 1}"
            ></button>`,
          )
          .join('')}</div>`
      : '';
  const tagline =
    app.tagline !== null
      ? `<p class="hero-tagline">${escapeHtml(app.tagline)}</p>`
      : '';
  const description =
    app.description !== null
      ? renderParagraphs(app.description, 'hero-description')
      : '';
  const highlights =
    app.highlights.length > 0
      ? `<ul class="hero-highlights">${app.highlights
          .map((h) => `<li>${escapeHtml(h)}</li>`)
          .join('')}</ul>`
      : '';
  const tags =
    app.tags.length > 0
      ? `<ul class="app-tags">${app.tags
          .map((t) => `<li>${escapeHtml(t)}</li>`)
          .join('')}</ul>`
      : '';
  const links = app.links
    .map(
      (link) => `<a
        class="hero-link"
        href="${escapeHtml(link.url)}"
        target="_blank"
        rel="noopener noreferrer"
      >${escapeHtml(link.label)}</a>`,
    )
    .join('');
  const updated = formatUpdatedAt(app.updatedAt);
  const updatedHtml =
    updated !== ''
      ? `<span class="app-updated">Updated ${escapeHtml(updated)}</span>`
      : '';

  return `
    <article
      class="hero-card${index % 2 === 1 ? ' hero-card--flip' : ''}"
      data-hero
      style="animation-delay: ${delay}ms"
    >
      <div class="hero-gallery" data-hero-gallery>
        <a
          class="hero-gallery-link"
          href="${escapeHtml(app.href)}"
          tabindex="-1"
          aria-hidden="true"
        >
          ${galleryInner}
        </a>
        ${dots}
      </div>
      <div class="hero-body">
        <p class="hero-kicker">Featured</p>
        <h2 class="hero-title">${escapeHtml(app.title)}</h2>
        ${tagline}
        ${description}
        ${highlights}
        ${tags}
        <div class="hero-actions">
          <a class="hero-cta" href="${escapeHtml(app.href)}">
            ${escapeHtml(app.cta ?? 'Launch')} →
          </a>
          ${links}
        </div>
        ${updatedHtml}
      </div>
    </article>
  `;
}

function renderFurtherRow(app: ResolvedApp): string {
  const tagline =
    app.tagline !== null
      ? `<span class="further-tagline">${escapeHtml(app.tagline)}</span>`
      : '';
  const updated = formatUpdatedAt(app.updatedAt);
  return `
    <li>
      <a class="further-row" href="${escapeHtml(app.href)}">
        <span class="further-title">${escapeHtml(app.title)}</span>
        ${tagline}
        <span class="further-updated">${escapeHtml(updated)}</span>
      </a>
    </li>
  `;
}

function renderAppTiers(tiers: TieredApps): string {
  const hero =
    tiers.hero.length > 0
      ? `<div class="hero-list">${tiers.hero
          .map((app, i) => renderHeroCard(app, i))
          .join('')}</div>`
      : '';
  const normal =
    tiers.normal.length > 0
      ? `<div class="apps-grid" data-grid>${tiers.normal
          .map((app, i) => renderAppCard(app, i))
          .join('')}</div>`
      : '';
  const further =
    tiers.further.length > 0
      ? `<section class="further" aria-labelledby="further-heading">
          <h2 class="further-heading" id="further-heading">Further experiments</h2>
          <ul class="further-list">${tiers.further
            .map(renderFurtherRow)
            .join('')}</ul>
        </section>`
      : '';
  return `<div class="apps-tiers" data-tiers>${hero}${normal}${further}</div>`;
}

function renderStoryCard(story: Story, index: number): string {
  const delay = Math.min(index * 70, 420);
  const date = formatStoryDate(story.date);
  const excerpt =
    story.excerpt.length > 0
      ? `<p class="story-excerpt">${escapeHtml(story.excerpt)}</p>`
      : '';
  return `
    <button
      type="button"
      class="story-card"
      data-story-slug="${escapeHtml(story.slug)}"
      style="animation-delay: ${delay}ms"
    >
      <h2 class="story-card-title">${escapeHtml(story.title)}</h2>
      ${excerpt}
      <div class="story-card-meta">
        <time datetime="${escapeHtml(story.date)}">${escapeHtml(date)}</time>
        <span class="story-open">Read →</span>
      </div>
    </button>
  `;
}

function renderShell(root: HTMLElement): {
  canvas: HTMLCanvasElement;
  contentMount: HTMLElement;
  nav: HTMLElement;
} {
  root.innerHTML = `
    <canvas class="sky" aria-hidden="true"></canvas>
    <div class="page">
      <header class="masthead">
        <h1 class="brand-sr">Futuremagic</h1>
        <p class="tag">Vibe-coded apps</p>
        <nav class="site-nav" aria-label="Sections">
          <button type="button" class="site-nav-btn is-active" data-section="apps">
            Apps
          </button>
          <button type="button" class="site-nav-btn" data-section="stories">
            Stories
          </button>
        </nav>
      </header>
      <main class="content" aria-label="Content">
        <div class="content-mount" data-content>
          <p class="apps-status">Loading…</p>
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
  const contentMount = root.querySelector('[data-content]');
  const nav = root.querySelector('.site-nav');
  if (
    !(canvas instanceof HTMLCanvasElement) ||
    !(contentMount instanceof HTMLElement) ||
    !(nav instanceof HTMLElement)
  ) {
    throw new Error('Failed to mount page shell');
  }
  return { canvas, contentMount, nav };
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

const HERO_ROTATE_MS = 6000;

function bindHeroGalleries(root: HTMLElement): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cleanups: Array<() => void> = [];

  for (const gallery of root.querySelectorAll<HTMLElement>(
    '[data-hero-gallery]',
  )) {
    let index = 0;
    let paused = false;

    const shots = (): HTMLImageElement[] => [
      ...gallery.querySelectorAll<HTMLImageElement>('.hero-shot'),
    ];
    const dots = (): HTMLButtonElement[] => [
      ...gallery.querySelectorAll<HTMLButtonElement>('[data-hero-dot]'),
    ];

    const show = (next: number): void => {
      const imgs = shots();
      if (imgs.length === 0) return;
      index = ((next % imgs.length) + imgs.length) % imgs.length;
      imgs.forEach((img, i) => img.classList.toggle('is-active', i === index));
      dots().forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
        dot.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });
    };

    for (const img of shots()) {
      img.addEventListener('error', () => {
        console.warn(`Screenshot missing: ${img.currentSrc || img.src}`);
        const pos = shots().indexOf(img);
        img.remove();
        dots()[pos]?.remove();
        dots().forEach((dot, i) => {
          dot.dataset.heroDot = String(i);
        });
        if (dots().length < 2) gallery.querySelector('.hero-dots')?.remove();
        if (shots().length === 0) {
          const fallback = document.createElement('div');
          fallback.className = 'app-shot-fallback';
          fallback.textContent =
            gallery.closest('[data-hero]')?.querySelector('.hero-title')
              ?.textContent ?? 'App';
          gallery.querySelector('.hero-gallery-link')?.append(fallback);
          return;
        }
        show(pos < index ? index - 1 : index);
      });
    }

    const onDotClick = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const dot = target.closest<HTMLElement>('[data-hero-dot]');
      if (!dot) return;
      show(Number(dot.dataset.heroDot));
    };
    const onEnter = (): void => {
      paused = true;
    };
    const onLeave = (): void => {
      paused = false;
    };
    gallery.addEventListener('click', onDotClick);
    gallery.addEventListener('pointerenter', onEnter);
    gallery.addEventListener('pointerleave', onLeave);

    const timer =
      reduced || shots().length < 2
        ? undefined
        : window.setInterval(() => {
            if (!paused && !document.hidden) show(index + 1);
          }, HERO_ROTATE_MS);

    cleanups.push(() => {
      if (timer !== undefined) window.clearInterval(timer);
      gallery.removeEventListener('click', onDotClick);
      gallery.removeEventListener('pointerenter', onEnter);
      gallery.removeEventListener('pointerleave', onLeave);
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

  const cards = [
    ...grid.querySelectorAll<HTMLElement>('[data-app-card], [data-hero]'),
  ];
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

function setActiveNav(nav: HTMLElement, section: Section): void {
  for (const btn of nav.querySelectorAll<HTMLButtonElement>('[data-section]')) {
    const isActive = btn.dataset.section === section;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  }
  const tag = document.querySelector('.tag');
  if (tag instanceof HTMLElement) {
    tag.textContent =
      section === 'apps' ? 'Vibe-coded apps' : 'Stories from Futuremagic';
  }
}

async function main(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('#app missing');
  }

  const { canvas, contentMount, nav } = renderShell(root);
  const vibe = mountVibe(canvas);
  const destroyOrbit = mountOrbitBrand(root);
  let unbindMotion: (() => void) | undefined;
  let unbindAgents: (() => void) | undefined;
  let unbindHeroes: (() => void) | undefined;
  let storyReader: StoryReaderHandle | undefined;
  let section: Section = 'apps';
  let appsCache: TieredApps | null = null;
  let storiesCache: Story[] | null = null;

  const clearViewBindings = (): void => {
    unbindMotion?.();
    unbindAgents?.();
    unbindHeroes?.();
    unbindMotion = undefined;
    unbindAgents = undefined;
    unbindHeroes = undefined;
    storyReader?.destroy();
    storyReader = undefined;
  };

  const renderApps = async (): Promise<void> => {
    clearViewBindings();
    contentMount.innerHTML = '<p class="apps-status">Loading apps…</p>';
    try {
      if (appsCache === null) {
        appsCache = await loadResolvedApps();
      }
      const tiers = appsCache;
      const total =
        tiers.hero.length + tiers.normal.length + tiers.further.length;
      if (total === 0) {
        contentMount.innerHTML =
          '<p class="apps-status">No apps registered yet.</p>';
        return;
      }

      contentMount.innerHTML = renderAppTiers(tiers);
      const tiersRoot = contentMount.querySelector('[data-tiers]');
      if (!(tiersRoot instanceof HTMLElement)) {
        throw new Error('apps tiers missing');
      }
      unbindMotion = bindCardMotion(tiersRoot);
      unbindAgents = bindAgentHighlights(tiersRoot, vibe);
      unbindHeroes = bindHeroGalleries(tiersRoot);

      for (const img of tiersRoot.querySelectorAll<HTMLImageElement>(
        '.app-shot',
      )) {
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
      contentMount.innerHTML = `<p class="apps-status error">${escapeHtml(message)}</p>`;
      throw err;
    }
  };

  const renderStoryReader = async (story: Story): Promise<void> => {
    clearViewBindings();
    contentMount.innerHTML = '<p class="apps-status">Loading story…</p>';
    try {
      const html = await loadStoryHtml(story.path);
      const date = formatStoryDate(story.date);
      contentMount.innerHTML = `
        <div class="story-reader-shell" data-story-shell>
          <div class="story-progress" aria-hidden="true">
            <div class="story-progress-bar" data-story-progress></div>
          </div>
          <div class="story-reader-toolbar">
            <button type="button" class="story-back" data-story-back>
              ← All stories
            </button>
            <div class="story-reader-toolbar-actions">
              <button type="button" class="story-resume" data-story-resume hidden>
                Resume reading
              </button>
              <button
                type="button"
                class="story-toc-toggle"
                data-toc-toggle
                aria-expanded="false"
                aria-controls="story-toc"
                hidden
              >
                Contents
              </button>
            </div>
          </div>
          <div class="story-toc-backdrop" data-toc-backdrop></div>
          <div class="story-reader-layout">
            <nav
              class="story-toc"
              id="story-toc"
              data-story-toc
              aria-label="Chapters"
              hidden
            ></nav>
            <article class="story-reader">
              <header class="story-reader-header">
                <h2 class="story-reader-title">${escapeHtml(story.title)}</h2>
                <time class="story-reader-date" datetime="${escapeHtml(story.date)}">${escapeHtml(date)}</time>
              </header>
              <div class="story-body" data-story-body>${html}</div>
            </article>
          </div>
        </div>
      `;
      const shell = contentMount.querySelector('[data-story-shell]');
      const body = contentMount.querySelector('[data-story-body]');
      if (!(shell instanceof HTMLElement) || !(body instanceof HTMLElement)) {
        throw new Error('story reader shell missing');
      }
      storyReader = mountStoryReader({
        shell,
        body,
        slug: story.slug,
        onBack: () => {
          void renderStoriesList();
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      contentMount.innerHTML = `
        <div class="story-reader-shell">
          <button type="button" class="story-back" data-story-back>← All stories</button>
          <p class="apps-status error">${escapeHtml(message)}</p>
        </div>
      `;
      const back = contentMount.querySelector('[data-story-back]');
      if (back instanceof HTMLButtonElement) {
        back.addEventListener('click', () => {
          void renderStoriesList();
        });
      }
      throw err;
    }
  };

  const renderStoriesList = async (): Promise<void> => {
    clearViewBindings();
    contentMount.innerHTML = '<p class="apps-status">Loading stories…</p>';
    try {
      if (storiesCache === null) {
        storiesCache = await loadStories();
      }
      const stories = storiesCache;
      if (stories.length === 0) {
        contentMount.innerHTML =
          '<p class="apps-status">No stories published yet.</p>';
        return;
      }

      contentMount.innerHTML = `<div class="stories-list" data-stories-list>${stories
        .map((story, i) => renderStoryCard(story, i))
        .join('')}</div>`;

      for (const card of contentMount.querySelectorAll<HTMLButtonElement>(
        '[data-story-slug]',
      )) {
        card.addEventListener('click', () => {
          const slug = card.dataset.storySlug;
          if (slug === undefined) return;
          const story = stories.find((s) => s.slug === slug);
          if (story === undefined) return;
          void renderStoryReader(story);
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      contentMount.innerHTML = `<p class="apps-status error">${escapeHtml(message)}</p>`;
      throw err;
    }
  };

  const showSection = async (next: Section): Promise<void> => {
    section = next;
    setActiveNav(nav, section);
    if (section === 'apps') {
      await renderApps();
    } else {
      storiesCache = null;
      await renderStoriesList();
    }
  };

  for (const btn of nav.querySelectorAll<HTMLButtonElement>('[data-section]')) {
    btn.addEventListener('click', () => {
      const next = btn.dataset.section;
      if (next !== 'apps' && next !== 'stories') return;
      if (next === section) return;
      void showSection(next).catch((err: unknown) => {
        console.error(err);
      });
    });
  }

  try {
    await showSection('apps');
  } catch (err) {
    // Error already rendered into the mount
    console.error(err);
  }

  window.addEventListener(
    'beforeunload',
    () => {
      vibe.destroy();
      destroyOrbit();
      clearViewBindings();
    },
    { once: true },
  );
}

void main();
