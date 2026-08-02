import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const shotsDir = path.resolve('public/shots');
await mkdir(shotsDir, { recursive: true });

const targets = [
  {
    slug: 'ArmchairGeneral',
    url: 'https://www.futuremagic.de/ArmchairGeneral/',
  },
  {
    slug: 'Conquest',
    url: 'https://www.futuremagic.de/Conquest/',
  },
  {
    slug: 'Eco',
    url: 'https://www.futuremagic.de/Eco/',
  },
];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
});

const context = await browser.newContext({
  viewport: { width: 1664, height: 1042 },
  deviceScaleFactor: 1,
});

for (const target of targets) {
  const page = await context.newPage();
  console.log(`Capturing ${target.slug}…`);
  await page.goto(target.url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(2500);
  const out = path.join(shotsDir, `${target.slug}.png`);
  await page.screenshot({ path: out, type: 'png' });
  console.log(`Wrote ${out}`);
  await page.close();
}

await browser.close();
console.log('Done.');
