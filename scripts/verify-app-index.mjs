#!/usr/bin/env node
// scripts/verify-app-index.mjs — the OFFLINE differential for the generated app index.
//
// It runs `scripts/generate-app-index.mjs` against a FIXTURE apps host served on
// 127.0.0.1 (no external network), prints the SHA-256 of the generated index for every
// arm, and asserts the brief's pins. It is deliberately NOT a second test framework:
// there is no suite in this project, so this is the smallest harness that proves the
// generator's pins can go RED (docs/22 §"Pins").
//
//   node scripts/verify-app-index.mjs          exit 0 = all pins held, 1 = a pin failed
//
// Fixture shape (scripts/fixtures/appshost): folders `zeta/`, `alpha/`, `newapp/` and a
// FILE `README.md`. Only `zeta/` ships a `futuremagic.json`. The fixture overlay
// (scripts/fixtures/apps.overlay.json) decorates `Zeta` and `alpha` and has one DORMANT
// entry, `Ghost`, whose folder is not published.
//
// Pins exercised here:
//   1  a published folder with NO overlay entry becomes a card (folder name as title)
//   2  an overlay entry whose folder is NOT published produces NO card, and is reported
//      as dormant
//   3  a published folder WITH a manifesto IS enriched (tagline/tags/screenshot)
//   4  title precedence holds at all three levels: manifesto.title > overlay.title >
//      folder name
//   5  the generator contacts ONLY the apps host: with `APPS_HOST_BASE` pointed at the
//      fixture and NOTHING else configured, every fetch succeeds
//   6  an unreachable apps host exits non-zero and leaves the index BYTE-IDENTICAL
//   7  a malformed overlay is FATAL and leaves the index BYTE-IDENTICAL
//
// The RUNTIME half of the missing-date pin lives in src/main.ts + src/registry.ts and is
// covered by the full gate (`npm run build`): `updatedAt` is optional in the types, and
// main.ts omits the element when formatUpdatedAt returns ''.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATOR = join(REPO, 'scripts/generate-app-index.mjs');
const INDEX = join(REPO, 'public/apps.index.json');
const FIXTURE_HOST = join(REPO, 'scripts/fixtures/appshost');
const FIXTURE_OVERLAY = join(REPO, 'scripts/fixtures/apps.overlay.json');
const UNREACHABLE = 'http://127.0.0.1:1/'; // nothing can listen on port 1 -> refused

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail === undefined ? '' : ` — ${detail}`}`);
}

function startServer(root) {
  const server = createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    let filePath = join(root, urlPath);
    if (urlPath.endsWith('/')) filePath = join(filePath, 'index.html');
    try {
      const body = await readFile(filePath);
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => done({ server, port: server.address().port }));
  });
}

// `overlay === undefined` means "leave APPS_OVERLAY unset", so the generator falls back to
// its DEFAULT overlay path — that is the pin-5 arm. The legacy names `HUB_BASE` and
// `APPS_INVENTORY` are deleted from the child env on every arm (an arm may re-add one to
// prove the generator IGNORES it).
async function runGenerator({ hostBase, overlay, env: extraEnv = {} }) {
  const env = { ...process.env };
  delete env.HUB_BASE;
  delete env.APPS_INVENTORY;
  delete env.APPS_OVERLAY;
  Object.assign(env, extraEnv);
  env.APPS_HOST_BASE = hostBase;
  if (overlay !== undefined) env.APPS_OVERLAY = overlay;
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [GENERATOR], {
      cwd: REPO,
      env,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

async function indexHash() {
  try {
    return createHash('sha256').update(await readFile(INDEX)).digest('hex');
  } catch {
    return '(absent)';
  }
}

async function readIndex() {
  return JSON.parse(await readFile(INDEX, 'utf8'));
}

function bySlug(index) {
  return new Map(index.apps.map((app) => [app.slug, app]));
}

// Mirror of `featured` + the sort in src/registry.ts (kept trivial on purpose so it
// cannot drift from the two lines it mirrors).
function isFeatured(app) {
  return Boolean(app.tagline) || (app.tags?.length ?? 0) > 0 || Boolean(app.screenshot);
}
function runtimeOrder(apps) {
  return [...apps]
    .sort((a, b) => {
      const fa = isFeatured(a);
      const fb = isFeatured(b);
      if (fa !== fb) return fa ? -1 : 1;
      return a.title.localeCompare(b.title);
    })
    .map((a) => a.slug);
}

function summaryOf(run) {
  return run.stdout
    .split('\n')
    .filter(
      (l) =>
        l.startsWith('apps written:') ||
        l.startsWith('enrichment:') ||
        l.startsWith('dormant overlay entries:'),
    )
    .join(' | ');
}

function dormantCount(run) {
  const match = /^dormant overlay entries:\s*(\d+)/m.exec(run.stdout);
  return match === null ? null : Number(match[1]);
}

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), 'fm-appindex-'));
  const { server, port } = await startServer(FIXTURE_HOST);
  const base = `http://127.0.0.1:${port}/`;
  console.log(`fixture host  = ${base} (root: scripts/fixtures/appshost)`);
  console.log(`fixture overlay = ${FIXTURE_OVERLAY}`);
  console.log(`index file    = ${INDEX}\n`);

  try {
    // ---------------------------------------------------------------- arm A: baseline
    console.log('=== arm a · baseline (fixture host, fixture overlay) ===');
    const a = await runGenerator({ hostBase: base, overlay: FIXTURE_OVERLAY });
    const hashA = await indexHash();
    const indexA = await readIndex();
    const A = bySlug(indexA);
    const orderA = runtimeOrder(indexA.apps);
    const zetaA = A.get('zeta');
    const alphaA = A.get('alpha');
    const newappA = A.get('newapp');
    console.log(`exit=${a.code} sha256=${hashA}`);
    console.log(`summary: ${summaryOf(a)}`);
    console.log(`order:   ${orderA.join(' > ')}`);
    check('arm a exit 0', a.code === 0, `exit=${a.code}`);
    check('pin 1 · published folder "newapp" (no overlay entry) is a card titled "newapp"',
      newappA !== undefined && newappA.title === 'newapp' && newappA.path === `${base}newapp/`,
      `record=${JSON.stringify(newappA)}`);
    check('pin 1 · the no-overlay, no-manifesto card carries NO updatedAt (never fabricated)',
      newappA !== undefined && !('updatedAt' in newappA),
      `newapp.updatedAt=${JSON.stringify(newappA?.updatedAt)}`);
    check('pin 2 · DORMANT overlay entry "Ghost" produces NO card',
      !A.has('Ghost') && !A.has('ghost'),
      `slugs=${indexA.apps.map((x) => x.slug).join(',')}`);
    check('pin 2 · and the run REPORTS it as dormant, by name',
      dormantCount(a) === 1 && /Ghost/.test(a.stdout),
      a.stdout.split('\n').find((l) => l.startsWith('dormant overlay entries:')) ?? '(no line)');
    check('pin 3 · published folder "zeta" WITH a manifesto IS enriched',
      zetaA !== undefined && Boolean(zetaA.tagline) && (zetaA.tags?.length ?? 0) > 0,
      `record=${JSON.stringify(zetaA)}`);
    check('pin 4 · title precedence: manifesto.title beats overlay.title',
      zetaA !== undefined && zetaA.title === 'Zeta',
      `manifesto="Zeta" vs overlay="Overlay Zeta" -> title=${JSON.stringify(zetaA?.title)}`);
    check('pin 4 · title precedence: overlay.title beats folder name',
      alphaA !== undefined && alphaA.title === 'Alpha Overlay' && !('tagline' in alphaA),
      `folder="alpha" overlay="Alpha Overlay" -> title=${JSON.stringify(alphaA?.title)}`);
    check('pin 4 · title precedence: folder name is the last fallback',
      newappA !== undefined && newappA.title === 'newapp',
      `title=${JSON.stringify(newappA?.title)}`);
    check('every card path is ABSOLUTE on the apps host (no root-relative path)',
      indexA.apps.every((x) => x.path === `${base}${x.slug}/`),
      indexA.apps.map((x) => x.path).join(' '));
    check('listing FILE "README.md" is NOT a card',
      !A.has('README.md') && !indexA.apps.some((x) => x.title === 'README.md'),
      `slugs=${indexA.apps.map((x) => x.slug).join(',')}`);
    check('card ORDER: zeta is enriched and sorts FIRST (featured-first)',
      isFeatured(zetaA) && orderA[0] === 'zeta',
      `order=${orderA.join(' > ')}`);

    // ------------------------------------ arm B: pin 5 — ONLY APPS_HOST_BASE configured
    console.log('\n=== arm b · pin 5: only APPS_HOST_BASE set (default overlay, no HUB_BASE) ===');
    const b = await runGenerator({ hostBase: base }); // overlay undefined -> default path
    const hashB = await indexHash();
    const indexB = await readIndex();
    console.log(`exit=${b.code} sha256=${hashB}`);
    console.log(`summary: ${summaryOf(b)}`);
    check('pin 5 · exit 0 with nothing but APPS_HOST_BASE configured', b.code === 0, `exit=${b.code}`);
    check('pin 5 · every fetch succeeded — no transport failure', !/transport failure/i.test(b.stderr),
      b.stderr.trim().split('\n')[0] ?? '(no stderr)');
    check('pin 5 · the fixture listing was the only host contacted',
      b.stdout.includes(`apps host:       ${base}`),
      b.stdout.split('\n').find((l) => l.startsWith('apps host:')) ?? '(no line)');
    check('pin 5 · all three published folders became cards against the DEFAULT overlay',
      indexB.apps.length === 3, `slugs=${indexB.apps.map((x) => x.slug).join(',')}`);

    // ------------------------- arm C: the legacy env vars are DEAD (HUB_BASE/APPS_INVENTORY)
    console.log('\n=== arm c · HUB_BASE + APPS_INVENTORY set to junk are IGNORED ===');
    const c = await runGenerator({
      hostBase: base,
      overlay: FIXTURE_OVERLAY,
      env: { HUB_BASE: UNREACHABLE, APPS_INVENTORY: '/nonexistent/apps.inventory.json' },
    });
    const hashC = await indexHash();
    console.log(`exit=${c.code} sha256=${hashC}`);
    console.log(`summary: ${summaryOf(c)}`);
    check('arm c exit 0 (the old-host env var is never read)', c.code === 0, `exit=${c.code}`);
    check('and the index is IDENTICAL to arm a (dead env vars change nothing)',
      hashC === hashA, `${hashA} vs ${hashC}`);

    // --------------------------------------- arm D: a DORMANT overlay entry adds no card
    console.log('\n=== arm d · pin 2: add a DORMANT overlay entry "phantom" ===');
    const overlayD = join(tempRoot, 'overlay-d.json');
    const parsedD = JSON.parse(await readFile(FIXTURE_OVERLAY, 'utf8'));
    parsedD.apps.push({ slug: 'phantom', title: 'Phantom' });
    await writeFile(overlayD, `${JSON.stringify(parsedD, null, 2)}\n`);
    const d = await runGenerator({ hostBase: base, overlay: overlayD });
    const hashD = await indexHash();
    const indexD = await readIndex();
    console.log(`exit=${d.code} sha256=${hashD}`);
    console.log(`summary: ${summaryOf(d)}`);
    check('arm d exit 0', d.code === 0, `exit=${d.code}`);
    check('pin 2 · "phantom" produced NO card',
      !indexD.apps.some((x) => x.slug === 'phantom'),
      `slugs=${indexD.apps.map((x) => x.slug).join(',')}`);
    check('pin 2 · dormant count rose to 2 and names both entries',
      dormantCount(d) === 2 && /Ghost/.test(d.stdout) && /phantom/.test(d.stdout),
      d.stdout.split('\n').find((l) => l.startsWith('dormant overlay entries:')) ?? '(no line)');
    check('pin 2 · a dormant entry CANNOT change the grid (hash == arm a, by design)',
      hashD === hashA, `${hashA} vs ${hashD}`);

    // ------------------------ arm E: a published folder loses its manifesto -> kept, plain
    console.log('\n=== arm e1 · pin 3 inverse: published folder "zeta" loses its manifesto ===');
    const hostE = join(tempRoot, 'appshost-e');
    await cp(FIXTURE_HOST, hostE, { recursive: true });
    await rm(join(hostE, 'zeta/futuremagic.json'), { force: true });
    const { server: serverE, port: portE } = await startServer(hostE);
    const baseE = `http://127.0.0.1:${portE}/`;
    try {
      const e1 = await runGenerator({ hostBase: baseE, overlay: FIXTURE_OVERLAY });
      const hashE1 = await indexHash();
      const E1 = bySlug(await readIndex());
      const zetaE1 = E1.get('zeta');
      console.log(`exit=${e1.code} sha256=${hashE1}`);
      console.log(`summary: ${summaryOf(e1)}`);
      check('arm e1 exit 0', e1.code === 0, `exit=${e1.code}`);
      check('pin 3 inverse · the card is KEPT but NOT enriched',
        zetaE1 !== undefined && !('tagline' in zetaE1) && !('tags' in zetaE1),
        `record=${JSON.stringify(zetaE1)}`);
      check('pin 4 · manifesto gone -> overlay.title now wins over the folder name',
        zetaE1 !== undefined && zetaE1.title === 'Overlay Zeta',
        `title=${JSON.stringify(zetaE1?.title)}`);
      check('arm e1 differs from arm a (not a void duplicate)', hashA !== hashE1,
        `${hashA} vs ${hashE1}`);

      // ------------------ arm E2: manifesto present but NO title -> overlay still wins
      console.log('\n=== arm e2 · pin 4: manifesto present, title absent -> overlay wins ===');
      await writeFile(
        join(hostE, 'zeta/futuremagic.json'),
        `${JSON.stringify({ tagline: 'Titleless manifesto', tags: ['fixture'] }, null, 2)}\n`,
      );
      const e2 = await runGenerator({ hostBase: baseE, overlay: FIXTURE_OVERLAY });
      const hashE2 = await indexHash();
      const zetaE2 = bySlug(await readIndex()).get('zeta');
      console.log(`exit=${e2.code} sha256=${hashE2}`);
      console.log(`summary: ${summaryOf(e2)}`);
      check('arm e2 exit 0', e2.code === 0, `exit=${e2.code}`);
      check('pin 4 · no manifesto title -> the OVERLAY title is used, not the folder name',
        zetaE2 !== undefined && zetaE2.title === 'Overlay Zeta',
        `title=${JSON.stringify(zetaE2?.title)}`);
      check('pin 4 · and the card is still enriched (tagline present)',
        zetaE2 !== undefined && zetaE2.tagline === 'Titleless manifesto',
        `tagline=${JSON.stringify(zetaE2?.tagline)}`);
      check('arm e2 differs from arms a and e1 (not a void duplicate)',
        hashE2 !== hashA && hashE2 !== hashE1, `${hashA} / ${hashE1} / ${hashE2}`);
    } finally {
      serverE.close();
    }

    // -------------------------------------------- arm F: malformed overlay -> FATAL
    console.log('\n=== arm f · pin 7: malformed overlay is FATAL, index BYTE-IDENTICAL ===');
    const beforeF = await indexHash();
    const badJson = join(tempRoot, 'overlay-bad-json.json');
    await writeFile(badJson, '{ this is not json ');
    const f1 = await runGenerator({ hostBase: base, overlay: badJson });
    const afterF1 = await indexHash();
    console.log(`f1 exit=${f1.code} sha256 before=${beforeF} after=${afterF1}`);
    console.log(`f1 stderr: ${f1.stderr.trim().split('\n')[0] ?? ''}`);
    check('pin 7 · invalid overlay JSON exits NON-ZERO', f1.code !== 0, `exit=${f1.code}`);
    check('pin 7 · and the index is BYTE-IDENTICAL', beforeF === afterF1,
      `${beforeF} vs ${afterF1}`);
    check('pin 7 · failure names the overlay', /overlay is not valid JSON/i.test(f1.stderr),
      f1.stderr.trim().split('\n')[0] ?? '');

    const badKey = join(tempRoot, 'overlay-bad-key.json');
    await writeFile(
      badKey,
      `${JSON.stringify({ version: 1, apps: [{ slug: 'zeta', path: '/zeta/' }] }, null, 2)}\n`,
    );
    const f2 = await runGenerator({ hostBase: base, overlay: badKey });
    const afterF2 = await indexHash();
    console.log(`f2 exit=${f2.code} sha256 before=${beforeF} after=${afterF2}`);
    console.log(`f2 stderr: ${f2.stderr.trim().split('\n')[0] ?? ''}`);
    check('pin 7 · the OLD inventory shape ("path") exits NON-ZERO', f2.code !== 0,
      `exit=${f2.code}`);
    check('pin 7 · and the index is still BYTE-IDENTICAL', beforeF === afterF2,
      `${beforeF} vs ${afterF2}`);

    // -------------------------------------- arm G: unreachable host -> PIN 6
    console.log('\n=== arm g · pin 6: apps host unreachable ===');
    const beforeG = await indexHash();
    const g = await runGenerator({ hostBase: UNREACHABLE, overlay: FIXTURE_OVERLAY });
    const afterG = await indexHash();
    console.log(`exit=${g.code} sha256 before=${beforeG} after=${afterG}`);
    console.log(`stderr: ${g.stderr.trim().split('\n')[0] ?? ''}`);
    check('pin 6 · unreachable apps host exits NON-ZERO', g.code !== 0, `exit=${g.code}`);
    check('pin 6 · index is BYTE-IDENTICAL after the failure', beforeG === afterG,
      `${beforeG} vs ${afterG}`);
    check('pin 6 · failure reported as a transport failure',
      /transport failure/i.test(g.stderr), g.stderr.trim().split('\n')[0] ?? '');
  } finally {
    server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks held ===`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`FAILED: ${f.name} — ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log('ALL PINS HELD');
  }
}

main().catch((error) => {
  console.error(`verify harness error: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
