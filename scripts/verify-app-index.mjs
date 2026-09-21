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
// Pins exercised here:
//   1  a record with NO `updatedAt` still emits a card and no `updatedAt` to format
//   2  a host folder absent from the inventory becomes a card AND the run warns
//   3  a listing FILE (`README.md`) is not a card
//   4  removing a record's inline tagline un-features it and moves it in the sort order
//   5  an unreachable host exits non-zero with the index BYTE-IDENTICAL
//
// The RUNTIME half of pin 1 (no "Updated" label) lives in src/main.ts + src/registry.ts
// and is covered by the full gate (`npm run build` = generator + tsc + vite build):
// `updatedAt` is optional in the types, and main.ts omits the element when
// formatUpdatedAt returns ''.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, cp } from 'node:fs/promises';
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
const FIXTURE_INVENTORY = join(REPO, 'scripts/fixtures/apps.inventory.json');
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

async function runGenerator({ hostBase, hubBase, inventory }) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [GENERATOR], {
      cwd: REPO,
      env: {
        ...process.env,
        APPS_HOST_BASE: hostBase,
        HUB_BASE: hubBase,
        APPS_INVENTORY: inventory,
      },
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
  const line = run.stdout.split('\n').filter((l) => l.startsWith('apps written:') || l.startsWith('enrichment:') || l.startsWith('discovered:'));
  return line.join(' | ');
}

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), 'fm-appindex-'));
  const { server, port } = await startServer(FIXTURE_HOST);
  const base = `http://127.0.0.1:${port}/`;
  console.log(`fixture host = ${base} (root: scripts/fixtures/appshost)`);
  console.log(`index file   = ${INDEX}\n`);

  try {
    // ---------------------------------------------------------------- arm A: baseline
    console.log('=== arm a · baseline (fixture host, fixture inventory) ===');
    const a = await runGenerator({ hostBase: base, hubBase: base, inventory: FIXTURE_INVENTORY });
    const hashA = await indexHash();
    const indexA = await readIndex();
    const orderA = runtimeOrder(indexA.apps);
    console.log(`exit=${a.code} sha256=${hashA}`);
    console.log(`summary: ${summaryOf(a)}`);
    console.log(`order:   ${orderA.join(' > ')}`);
    check('arm a exit 0', a.code === 0, `exit=${a.code}`);
    check('pin 2 · discovered folder "newapp" is a card titled "newapp"',
      indexA.apps.some((x) => x.slug === 'newapp' && x.title === 'newapp' && String(x.path).endsWith('/newapp/')),
      `record=${JSON.stringify(indexA.apps.find((x) => x.slug === 'newapp'))}`);
    check('pin 2 · the run WARNS naming the discovered folder',
      /newapp/.test(a.stderr) && /DISCOVERED/i.test(a.stderr),
      a.stderr.split('\n').find((l) => /newapp/.test(l)) ?? '(no warning line)');
    check('pin 3 · listing FILE "README.md" is NOT a card',
      !indexA.apps.some((x) => x.slug === 'README.md' || x.title === 'README.md'),
      `slugs=${indexA.apps.map((x) => x.slug).join(',')}`);
    check('pin 4 · baseline: Zeta is enriched and sorts FIRST (featured-first)',
      isFeatured(indexA.apps.find((x) => x.slug === 'Zeta')) && orderA[0] === 'Zeta',
      `order=${orderA.join(' > ')}`);
    check('missing-folder report names Ghost',
      /Ghost/.test(a.stdout), a.stdout.split('\n').find((l) => l.startsWith('no host folder:')) ?? '');

    // -------------------------------------------------- arm B: a record loses updatedAt
    console.log('\n=== arm b · one record loses `updatedAt` (pin 1) ===');
    const invB = join(tempRoot, 'apps.inventory.json');
    const parsedB = JSON.parse(await readFile(FIXTURE_INVENTORY, 'utf8'));
    for (const app of parsedB.apps) delete app.updatedAt; // Zeta and every other record
    await writeFile(invB, `${JSON.stringify(parsedB, null, 2)}\n`);
    const b = await runGenerator({ hostBase: base, hubBase: base, inventory: invB });
    const hashB = await indexHash();
    const indexB = await readIndex();
    const zetaB = indexB.apps.find((x) => x.slug === 'Zeta');
    console.log(`exit=${b.code} sha256=${hashB}`);
    console.log(`summary: ${summaryOf(b)}`);
    check('arm b exit 0', b.code === 0, `exit=${b.code}`);
    check('pin 1 · the no-updatedAt record still emits a card',
      zetaB !== undefined && zetaB.title === 'Zeta', JSON.stringify(zetaB));
    check('pin 1 · nothing supplied an updatedAt (never fabricated)',
      zetaB !== undefined && !('updatedAt' in zetaB) && indexB.apps.every((x) => !('updatedAt' in x)),
      `zeta.updatedAt=${JSON.stringify(zetaB?.updatedAt)}`);
    check('arms a and b DIFFER (not a void duplicate)', hashA !== hashB, `${hashA} vs ${hashB}`);

    // -------------------------------------- arm C: remove the only tagline -> un-feature
    console.log('\n=== arm c · remove Zeta\'s tagline+tags from the manifesto (pin 4) ===');
    const hostC = join(tempRoot, 'appshost-c');
    await cp(FIXTURE_HOST, hostC, { recursive: true });
    await writeFile(join(hostC, 'zeta/futuremagic.json'), `${JSON.stringify({ title: 'Zeta' }, null, 2)}\n`);
    const { server: serverC, port: portC } = await startServer(hostC);
    const baseC = `http://127.0.0.1:${portC}/`;
    try {
      const c = await runGenerator({ hostBase: baseC, hubBase: baseC, inventory: FIXTURE_INVENTORY });
      const hashC = await indexHash();
      const indexC = await readIndex();
      const orderC = runtimeOrder(indexC.apps);
      console.log(`exit=${c.code} sha256=${hashC}`);
      console.log(`order:   ${orderC.join(' > ')}`);
      check('arm c exit 0', c.code === 0, `exit=${c.code}`);
      check('pin 4 · losing the inline tagline un-features Zeta',
        !isFeatured(indexC.apps.find((x) => x.slug === 'Zeta')),
        JSON.stringify(indexC.apps.find((x) => x.slug === 'Zeta')));
      check('pin 4 · and its position CHANGES (was first, now later)',
        orderA[0] === 'Zeta' && orderC[0] !== 'Zeta' && orderC.includes('Zeta'),
        `before=${orderA.join(' > ')} | after=${orderC.join(' > ')}`);
      check('arms c and a DIFFER (not a void duplicate)', hashA !== hashC, `${hashA} vs ${hashC}`);
    } finally {
      serverC.close();
    }

    // ------------------------------------------- arm D: unreachable host, file unchanged
    console.log('\n=== arm d · apps host unreachable (pin 5) ===');
    const beforeD = await indexHash();
    const d = await runGenerator({ hostBase: UNREACHABLE, hubBase: base, inventory: FIXTURE_INVENTORY });
    const afterD = await indexHash();
    console.log(`exit=${d.code} sha256 before=${beforeD} after=${afterD}`);
    console.log(`stderr: ${d.stderr.trim().split('\n')[0] ?? ''}`);
    check('pin 5 · unreachable host exits NON-ZERO', d.code !== 0, `exit=${d.code}`);
    check('pin 5 · index is BYTE-IDENTICAL after the failure', beforeD === afterD, `${beforeD} vs ${afterD}`);
    check('pin 5 · failure reported as a transport failure',
      /transport failure/i.test(d.stderr), d.stderr.trim().split('\n')[0] ?? '');
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
