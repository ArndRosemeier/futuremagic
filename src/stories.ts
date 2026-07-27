import type { StoriesRegistry, Story } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStory(value: unknown): Story | null {
  if (!isRecord(value)) return null;
  const slug = value.slug;
  const title = value.title;
  const date = value.date;
  const path = value.path;
  if (
    typeof slug !== 'string' ||
    typeof title !== 'string' ||
    typeof date !== 'string' ||
    typeof path !== 'string'
  ) {
    return null;
  }
  const excerpt = typeof value.excerpt === 'string' ? value.excerpt : '';
  return { slug, title, date, excerpt, path };
}

function parseRegistry(data: unknown): StoriesRegistry {
  if (!isRecord(data) || !Array.isArray(data.stories)) {
    throw new Error('Invalid stories.json: expected { version, stories }');
  }
  const stories = data.stories
    .map(parseStory)
    .filter((story): story is Story => story !== null);
  const version = typeof data.version === 'number' ? data.version : 1;
  return { version, stories };
}

export async function loadStories(): Promise<Story[]> {
  const response = await fetch('/stories.json', { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load stories.json (${response.status})`);
  }
  const registry = parseRegistry(await response.json());
  return registry.stories;
}

export async function loadStoryHtml(path: string): Promise<string> {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load story (${response.status}): ${path}`);
  }
  return response.text();
}

export function formatStoryDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    // Allow plain YYYY-MM-DD without forcing UTC shift surprises
    const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
    if (plain) {
      const local = new Date(
        Number(plain[1]),
        Number(plain[2]) - 1,
        Number(plain[3]),
      );
      return local.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
    return isoDate;
  }
  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
