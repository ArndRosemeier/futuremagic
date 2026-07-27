export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type TocNode = {
  id: string;
  text: string;
  level: HeadingLevel;
  children: TocNode[];
};

export type StoryReaderHandle = {
  destroy: () => void;
};

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'section';
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

function headingLevel(tag: string): HeadingLevel | null {
  switch (tag) {
    case 'H1':
      return 1;
    case 'H2':
      return 2;
    case 'H3':
      return 3;
    case 'H4':
      return 4;
    case 'H5':
      return 5;
    case 'H6':
      return 6;
    default:
      return null;
  }
}

/** Collect all story headings in document order (h1–h6). */
export function prepareHeadings(body: HTMLElement): HTMLHeadingElement[] {
  return [...body.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6')];
}

/**
 * Build a nested TOC from heading levels.
 * Example Markdown mapping:
 *   # Book / Series volume
 *   ## Act
 *   ### Chapter
 *   #### Scene
 */
export function buildTocTree(headings: HTMLHeadingElement[]): TocNode[] {
  const used = new Set<string>();
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];

  for (const heading of headings) {
    const level = headingLevel(heading.tagName);
    if (level === null) continue;
    const text = heading.textContent?.trim() ?? '';
    if (text.length === 0) continue;

    const id = uniqueId(slugifyHeading(text), used);
    heading.id = id;
    const node: TocNode = { id, text, level, children: [] };

    while (stack.length > 0) {
      const parent = stack[stack.length - 1];
      if (parent === undefined || parent.level < level) break;
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent === undefined) {
      roots.push(node);
    } else {
      parent.children.push(node);
    }
    stack.push(node);
  }

  return roots;
}

function renderTocNodes(nodes: TocNode[], depth: number): string {
  if (nodes.length === 0) return '';
  const nestClass = depth > 0 ? ' story-toc-list--nested' : '';
  return `<ul class="story-toc-list${nestClass}" data-toc-depth="${depth}">${nodes
    .map((node) => {
      const kids = renderTocNodes(node.children, depth + 1);
      return `
        <li class="story-toc-item" data-toc-level="${node.level}">
          <a
            class="story-toc-link story-toc-link--l${node.level}"
            href="#${escapeHtml(node.id)}"
            data-toc-id="${escapeHtml(node.id)}"
          >${escapeHtml(node.text)}</a>
          ${kids}
        </li>`;
    })
    .join('')}</ul>`;
}

function renderTocHtml(nodes: TocNode[]): string {
  return renderTocNodes(nodes, 0);
}

function storageKey(slug: string): string {
  return `futuremagic.storyProgress.${slug}`;
}

export function loadScrollRatio(slug: string): number | null {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (raw === null) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 1) return null;
    return value;
  } catch {
    return null;
  }
}

export function saveScrollRatio(slug: string, ratio: number): void {
  try {
    localStorage.setItem(storageKey(slug), String(Math.min(1, Math.max(0, ratio))));
  } catch {
    // ignore quota / private mode
  }
}

function measureScrollRatio(): number {
  const doc = document.documentElement;
  const scrollable = doc.scrollHeight - window.innerHeight;
  if (scrollable <= 0) return 0;
  return window.scrollY / scrollable;
}

function applyScrollRatio(ratio: number): void {
  const doc = document.documentElement;
  const scrollable = doc.scrollHeight - window.innerHeight;
  if (scrollable <= 0) return;
  window.scrollTo({ top: ratio * scrollable, behavior: 'auto' });
}

export function mountStoryReader(options: {
  shell: HTMLElement;
  body: HTMLElement;
  slug: string;
  onBack: () => void;
}): StoryReaderHandle {
  const { shell, body, slug, onBack } = options;
  const cleanups: Array<() => void> = [];

  document.body.classList.add('is-reading');
  cleanups.push(() => document.body.classList.remove('is-reading'));

  const headings = prepareHeadings(body);
  const tocTree = buildTocTree(headings);
  const hasToc = tocTree.length > 0;

  shell.classList.toggle('has-toc', hasToc);

  const tocNav = shell.querySelector('[data-story-toc]');
  if (tocNav instanceof HTMLElement) {
    if (hasToc) {
      tocNav.innerHTML = `
        <p class="story-toc-label">Contents</p>
        ${renderTocHtml(tocTree)}
      `;
      tocNav.hidden = false;
    } else {
      tocNav.innerHTML = '';
      tocNav.hidden = true;
    }
  }

  const tocToggle = shell.querySelector('[data-toc-toggle]');
  const tocBackdrop = shell.querySelector('[data-toc-backdrop]');
  if (tocToggle instanceof HTMLButtonElement) {
    tocToggle.hidden = !hasToc;
  }

  const setDrawerOpen = (open: boolean): void => {
    shell.classList.toggle('toc-open', open);
    if (tocToggle instanceof HTMLButtonElement) {
      tocToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  };

  if (tocToggle instanceof HTMLButtonElement && hasToc) {
    const onToggle = (): void => {
      setDrawerOpen(!shell.classList.contains('toc-open'));
    };
    tocToggle.addEventListener('click', onToggle);
    cleanups.push(() => tocToggle.removeEventListener('click', onToggle));
  }

  if (tocBackdrop instanceof HTMLElement) {
    const onBackdrop = (): void => setDrawerOpen(false);
    tocBackdrop.addEventListener('click', onBackdrop);
    cleanups.push(() => tocBackdrop.removeEventListener('click', onBackdrop));
  }

  const progressEl = shell.querySelector('[data-story-progress]');
  const updateProgress = (): void => {
    if (!(progressEl instanceof HTMLElement)) return;
    const ratio = measureScrollRatio();
    progressEl.style.transform = `scaleX(${ratio})`;
  };

  let setActiveHeading: ((id: string) => void) | undefined;
  let syncActiveFromScroll: (() => void) | undefined;
  /** While true, ignore scroll-spy so click navigation isn't overwritten mid-scroll. */
  let spyLockedUntil = 0;
  let unlockTimer = 0;

  if (hasToc && headings.length > 0) {
    const links = [...shell.querySelectorAll<HTMLAnchorElement>('[data-toc-id]')];
    let activeId = '';

    setActiveHeading = (id: string): void => {
      if (id === activeId) return;
      activeId = id;
      for (const link of links) {
        link.classList.remove('is-active', 'is-ancestor');
      }
      const active = links.find((link) => link.dataset.tocId === id);
      if (active === undefined) return;
      active.classList.add('is-active');

      let item = active.parentElement;
      while (item !== null) {
        if (item.classList.contains('story-toc-item')) {
          const parentList = item.parentElement;
          const parentItem = parentList?.parentElement;
          if (parentItem?.classList.contains('story-toc-item')) {
            const parentLink = parentItem.querySelector(':scope > .story-toc-link');
            if (parentLink instanceof HTMLElement) {
              parentLink.classList.add('is-ancestor');
            }
            item = parentItem;
            continue;
          }
        }
        break;
      }

      // Keep the active entry visible inside a long TOC
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

    syncActiveFromScroll = (): void => {
      if (performance.now() < spyLockedUntil) return;

      // Reading line: section whose heading last crossed ~22% from the top
      const marker = window.innerHeight * 0.22;
      let current = headings[0];
      for (const heading of headings) {
        const top = heading.getBoundingClientRect().top;
        if (top <= marker) {
          current = heading;
        } else {
          break;
        }
      }
      if (current !== undefined && current.id) {
        setActiveHeading?.(current.id);
      }
    };

    const firstHeading = headings[0];
    if (firstHeading !== undefined) {
      setActiveHeading(firstHeading.id);
    }
  }

  const onScrollSave = (): void => {
    updateProgress();
    saveScrollRatio(slug, measureScrollRatio());
    syncActiveFromScroll?.();
  };
  const onResize = (): void => {
    updateProgress();
    syncActiveFromScroll?.();
  };
  window.addEventListener('scroll', onScrollSave, { passive: true });
  window.addEventListener('resize', onResize);
  cleanups.push(() => {
    window.removeEventListener('scroll', onScrollSave);
    window.removeEventListener('resize', onResize);
  });
  updateProgress();

  for (const link of shell.querySelectorAll<HTMLAnchorElement>('[data-toc-id]')) {
    const onClick = (event: MouseEvent): void => {
      event.preventDefault();
      const id = link.dataset.tocId;
      if (id === undefined) return;
      const target = document.getElementById(id);
      if (target === null) return;

      // Apply highlight immediately; lock spy until smooth scroll settles
      setActiveHeading?.(id);
      spyLockedUntil = performance.now() + 700;
      window.clearTimeout(unlockTimer);
      unlockTimer = window.setTimeout(() => {
        spyLockedUntil = 0;
        syncActiveFromScroll?.();
      }, 750);

      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setDrawerOpen(false);
      history.replaceState(null, '', `#${id}`);
    };
    link.addEventListener('click', onClick);
    cleanups.push(() => link.removeEventListener('click', onClick));
  }
  cleanups.push(() => window.clearTimeout(unlockTimer));

  const saved = loadScrollRatio(slug);
  const resumeBtn = shell.querySelector('[data-story-resume]');
  if (
    saved !== null &&
    saved >= 0.15 &&
    resumeBtn instanceof HTMLButtonElement
  ) {
    resumeBtn.hidden = false;
    const onResume = (): void => {
      applyScrollRatio(saved);
      resumeBtn.hidden = true;
      updateProgress();
    };
    resumeBtn.addEventListener('click', onResume);
    cleanups.push(() => resumeBtn.removeEventListener('click', onResume));
  } else if (resumeBtn instanceof HTMLElement) {
    resumeBtn.hidden = true;
  }

  const back = shell.querySelector('[data-story-back]');
  if (back instanceof HTMLButtonElement) {
    const onBackClick = (): void => onBack();
    back.addEventListener('click', onBackClick);
    cleanups.push(() => back.removeEventListener('click', onBackClick));
  }

  return {
    destroy: () => {
      for (const fn of cleanups) fn();
    },
  };
}
