#!/usr/bin/env node
// scripts/verify-app-index.mjs — the OFFLINE differential for the generated app index.
//
// It runs `scripts/generate-app-index.mjs` against a FIXTURE APPS ROOT DIRECTORY on disk
// (no HTTP server, no network, nothing bound), prints the SHA-256 of the generated index
// for every arm, and asserts the brief's pins. It is deliberately NOT a second test
// framework: there is no suite in this project, so this is the smallest harness that
// proves the generator's pins can go RED (docs/22 §"Pins").
//
//   node scripts/verify-app-index.mjs          exit 0 = all pins held, 1 = a pin failed
//
// WHY THERE IS NO SERVER HERE ANY MORE (ledger row 10, the TRAP
// `hub-at-the-root-blinds-discovery`): the hub is installed AT the apps root, so the
// static host serves the hub's own `index.html` for `/` INSTEAD of the directory listing
// the old generator discovered from. The read is now a LOCAL directory read, so the
// fixture is a directory and the harness fetches nothing.
//
// Fixture shape (scripts/fixtures/appsroot):
//   zeta/     index.html + futuremagic.json   -> a card, ENRICHED
//   alpha/    index.html only                 -> a card, un-enriched (missing-manifesto WARNING)
//   omega/    index.html only                 -> WITHHELD by the overlay (`hidden: true`),
//                                                so NO card and NO warning: never read
//   newapp/   NO index.html                   -> NOT an app; reported as ignored
//   assets/   NO index.html                   -> NOT an app; reported as ignored (the hub's own)
//   README.md a top-level FILE                -> ignored SILENTLY
// The fixture overlay (scripts/fixtures/apps.overlay.json) decorates `Zeta` and `alpha`,
// WITHHOLDS the published `omega`, and has one DORMANT entry, `Ghost`, whose folder is not
// an app.
//
// Pins exercised here (the brief's numbering):
//   1  a DIRECTORY containing `index.html` becomes a card; a directory WITHOUT one does
//      not, and is NAMED under `ignored (no index.html)`; a PUBLISHED folder with
//      `hidden: true` produces NO card (and `hidden: false` restores it — arm k)
//   2  the summary NAMES every hidden app (`hidden: N [names]`)
//   3  a local manifesto enriches the card; a missing one warns and KEEPS the card —
//      but a HIDDEN app's manifesto is NOT read and its absence produces NO warning
//   4  a missing/nonexistent APPS_ROOT_DIR exits NON-ZERO with the index BYTE-IDENTICAL;
//      a `hidden: true` entry whose folder is NOT published is DORMANT (no card, no crash,
//      reported consistently — arm j)
//   5  a dormant overlay entry produces NO card and is reported; a NON-BOOLEAN `hidden`
//      is FATAL, names the app, and leaves the index BYTE-IDENTICAL (arm g3)
//   6  title precedence holds at all three levels (manifesto > overlay > folder name);
//      an UNKNOWN overlay key is FATAL and NAMES the key (arm g4)
//   7  the generator makes NO HTTP request: with APPS_HOST_BASE unroutable it still
//      succeeds, because that value only builds URLs
//   8  a malformed overlay exits NON-ZERO with the index BYTE-IDENTICAL (bad JSON, the
//      OLD inventory shape `path`, a typo key, a non-boolean `hidden`)
//
// The RUNTIME half of the missing-date pin lives in src/main.ts + src/registry.ts and is
// covered by the full gate (`npm run build`): `updatedAt` is optional in the types, and
// main.ts omits the element when formatUpdatedAt returns ''.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATOR = join(REPO, 'scripts/generate-app-index.mjs');
const INDEX = join(REPO, 'public/apps.index.json');
const FIXTURE_ROOT = join(REPO, 'scripts/fixtures/appsroot');
const FIXTURE_OVERLAY = join(REPO, 'scripts/fixtures/apps.overlay.json');
const BASE = 'https://apps.futuremagic.de/';
// An unroutable PREFIX: a real fetch against it cannot succeed, so an exit 0 under it is
// proof that nothing was fetched.
const UNROUTABLE_BASE = 'https://unroutable.invalid.futuremagic/';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail === undefined ? '' : ` — ${detail}`}`);
}

// `overlay === undefined` means "leave APPS_OVERLAY unset", so the generator falls back to
// its DEFAULT overlay path. The legacy names `HUB_BASE` and `APPS_INVENTORY` are deleted
// from the child env on every arm (an arm may re-add one to prove the generator IGNORES it).
async function runGenerator({ root, hostBase, overlay, env: extraEnv = {} }) {
  const env = { ...process.env };
  delete env.HUB_BASE;
  delete env.APPS_INVENTORY;
  delete env.APPS_OVERLAY;
  delete env.APPS_ROOT_DIR;
  delete env.APPS_HOST_BASE;
  Object.assign(env, extraEnv);
  if (root !== undefined) env.APPS_ROOT_DIR = root;
  if (overlay !== undefined) env.APPS_OVERLAY = overlay;
  if (hostBase !== undefined) env.APPS_HOST_BASE = hostBase;
  if (hostBase === UNROUTABLE_BASE) {
    // Belt AND braces for pin 7. A fetch would fail on the poisoned proxy immediately and
    // on the `.invalid` TLD at DNS level — so if this arm needed the network at all it
    // would go RED, not merely slow.
    env.HTTP_PROXY = 'http://127.0.0.1:1';
    env.HTTPS_PROXY = 'http://127.0.0.1:1';
    env.NO_PROXY = '';
  }
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

async function hashOf(path) {
  try {
    return createHash('sha256').update(await readFile(path)).digest('hex');
  } catch {
    return '(absent)';
  }
}

const indexHash = () => hashOf(INDEX);
async function readIndex() {
  return JSON.parse(await readFile(INDEX, 'utf8'));
}

function bySlug(index) {
  return new Map(index.apps.map((app) => [app.slug, app]));
}

// The summary line, parsed rather than grepped, so the pin is about the CONTENT.
function ignoredOf(run) {
  const match = /^ignored \(no index\.html\):\s*(.*)$/m.exec(run.stdout);
  if (match === null) return null;
  const raw = match[1].trim();
  if (raw === '(none)') return [];
  return raw.split(',').map((s) => s.trim());
}

function dormantCount(run) {
  const match = /^dormant overlay entries:\s*(\d+)/m.exec(run.stdout);
  return match === null ? null : Number(match[1]);
}

// `hidden: N [names]` — parsed, not grepped, so the pin is about the CONTENT. Returns
// `{ count, names }` where `count` is the number of PUBLISHED folders whose card was
// WITHHELD and `names` are those folder names.
function hiddenOf(run) {
  const match = /^hidden:\s+(\d+)(?:\s*\[([^\]]*)\])?\s*$/m.exec(run.stdout);
  if (match === null) return null;
  const raw = (match[2] ?? '').trim();
  return {
    count: Number(match[1]),
    names: raw === '' ? [] : raw.split(',').map((s) => s.trim()),
  };
}

function dormantNames(run) {
  const match = /^dormant overlay entries:\s*\d+\s*\[([^\]]*)\]/m.exec(run.stdout);
  if (match === null) return null;
  return match[1].split(',').map((s) => s.trim());
}

function enrichmentOf(run) {
  const match = /^enrichment:\s+found (\d+), missing (\d+)/m.exec(run.stdout);
  return match === null ? null : { found: Number(match[1]), missing: Number(match[2]) };
}

function summaryOf(run) {
  return run.stdout
    .split('\n')
    .filter(
      (l) =>
        l.startsWith('apps written:') ||
        l.startsWith('hidden:') ||
        l.startsWith('enrichment:') ||
        l.startsWith('ignored (no index.html):') ||
        l.startsWith('dormant overlay entries:'),
    )
    .join(' | ');
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

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), 'fm-appindex-'));
  console.log(`fixture apps root = ${FIXTURE_ROOT}`);
  console.log(`fixture overlay   = ${FIXTURE_OVERLAY}`);
  console.log(`index file        = ${INDEX}`);
  console.log(`temp root         = ${tempRoot}\n`);

  try {
    // ------------------------------------------------------------ arm a: baseline
    console.log('=== arm a · baseline (fixture apps root, fixture overlay) ===');
    const a = await runGenerator({ root: FIXTURE_ROOT, hostBase: BASE, overlay: FIXTURE_OVERLAY });
    const hashA = await indexHash();
    const indexA = await readIndex();
    const A = bySlug(indexA);
    const orderA = runtimeOrder(indexA.apps);
    const zetaA = A.get('zeta');
    const alphaA = A.get('alpha');
    const ignoredA = ignoredOf(a);
    console.log(`exit=${a.code} sha256=${hashA}`);
    console.log(`summary: ${summaryOf(a)}`);
    console.log(`order:   ${orderA.join(' > ')}`);
    check('arm a exit 0', a.code === 0, `exit=${a.code}`);
    check('pin 1 · a directory WITH index.html is a card (zeta, alpha)',
      A.has('zeta') && A.has('alpha'),
      `slugs=${indexA.apps.map((x) => x.slug).join(',')}`);
    check('pin 1 · a directory WITHOUT index.html is NOT a card',
      !A.has('newapp') && !A.has('assets'),
      `slugs=${indexA.apps.map((x) => x.slug).join(',')}`);
    check('pin 1 · and BOTH are NAMED under "ignored (no index.html)"',
      ignoredA !== null && ignoredA.length === 2 && ignoredA.includes('newapp') && ignoredA.includes('assets'),
      `ignored=${JSON.stringify(ignoredA)}`);
    check('pin 1 · the ignored line is NOT a warning (no WARNING for assets/newapp)',
      !/WARNING[^\n]*(newapp|assets)/.test(a.stderr),
      a.stderr.trim().split('\n').find((l) => l.startsWith('WARNING')) ?? '(no warnings)');
    check('pin 2 · the top-level FILE "README.md" is NOT a card and not reported',
      !A.has('README.md') && !indexA.apps.some((x) => x.title === 'README.md') &&
        ignoredA !== null && !ignoredA.includes('README.md'),
      `slugs=${indexA.apps.map((x) => x.slug).join(',')} | ignored=${JSON.stringify(ignoredA)}`);
    check('pin 3 · a local manifesto IS folded in (zeta enriched)',
      zetaA !== undefined && zetaA.tagline ===
        'Fixture tagline for Zeta — the ONLY enrichment, so removing it un-features the card.' &&
        (zetaA.tags?.length ?? 0) > 0,
      `record=${JSON.stringify(zetaA)}`);
    check('pin tier · overlay tier hero is INLINED (zeta.tier === "hero")',
      zetaA !== undefined && zetaA.tier === 'hero',
      `record=${JSON.stringify(zetaA)}`);
    check('pin tier · the hero extras are INLINED from the manifesto (description/highlights/links/cta)',
      zetaA !== undefined && typeof zetaA.description === 'string' &&
        zetaA.description.includes('second paragraph') &&
        (zetaA.highlights?.length ?? 0) === 2 && (zetaA.links?.length ?? 0) === 1 &&
        zetaA.cta === 'Play Zeta',
      `record=${JSON.stringify(zetaA)}`);
    check('pin tier · a card WITHOUT an overlay tier has NO tier key (defaults to normal)',
      alphaA !== undefined && !('tier' in alphaA),
      `record=${JSON.stringify(alphaA)}`);
    check('pin 3 · a MISSING manifesto warns and KEEPS the card (alpha)',
      alphaA !== undefined && !('tagline' in alphaA) &&
        /WARNING: manifesto absent for "alpha"/.test(a.stderr),
      `record=${JSON.stringify(alphaA)} | stderr=${a.stderr.trim().split('\n')[0] ?? ''}`);
    check('pin 3 · enrichment counts found 1 / missing 1',
      JSON.stringify(enrichmentOf(a)) === '{"found":1,"missing":1}',
      JSON.stringify(enrichmentOf(a)));
    check('pin 5 · DORMANT overlay entry "Ghost" produces NO card',
      !A.has('Ghost') && !A.has('ghost'),
      `slugs=${indexA.apps.map((x) => x.slug).join(',')}`);
    check('pin 5 · and the run REPORTS it as dormant, by name',
      dormantCount(a) === 1 && /Ghost/.test(a.stdout),
      a.stdout.split('\n').find((l) => l.startsWith('dormant overlay entries:')) ?? '(no line)');
    check('pin 6 · title precedence: manifesto.title beats overlay.title',
      zetaA !== undefined && zetaA.title === 'Zeta',
      `manifesto="Zeta" vs overlay="Overlay Zeta" -> title=${JSON.stringify(zetaA?.title)}`);
    check('pin 6 · title precedence: overlay.title beats folder name',
      alphaA !== undefined && alphaA.title === 'Alpha Overlay',
      `folder="alpha" overlay="Alpha Overlay" -> title=${JSON.stringify(alphaA?.title)}`);
    // Pin 6's third level (folder name) needs an app with NEITHER a manifesto title NOR an
    // overlay entry, so it is armed in arm h — a check that cannot fail is not a check.
    check('every card path is ABSOLUTE on the apps host, derived from APPS_HOST_BASE',
      indexA.apps.every((x) => x.path === `${BASE}${x.slug}/`),
      indexA.apps.map((x) => x.path).join(' '));
    check('SOUNDNESS (the landmine): the generated index contains NO folder-anchor HTML',
      !/<a\s[^>]*href=/i.test(JSON.stringify(indexA)) && !/Directory listing for/.test(JSON.stringify(indexA)),
      'the emitted index is JSON records only — it cannot be its own discovery source');
    check('card ORDER: zeta is enriched and sorts FIRST (featured-first)',
      zetaA !== undefined && isFeatured(zetaA) && orderA[0] === 'zeta',
      `order=${orderA.join(' > ')}`);

    // -------- arm a (hidden): pin 1/2/3 — a PUBLISHED folder WITHHELD by `hidden: true`
    const hiddenA = hiddenOf(a);
    check('pin 1 (hidden) · a PUBLISHED folder with hidden:true produces NO card (omega)',
      !A.has('omega') && !indexA.apps.some((x) => x.slug === 'omega' || x.title === 'Omega Overlay'),
      `slugs=${indexA.apps.map((x) => x.slug).join(',')}`);
    check('pin 1 (hidden) · omega is STILL discovered as an app folder (nothing was removed)',
      /^app folders:\s+.*\bomega\b/m.test(a.stdout),
      a.stdout.split('\n').find((l) => l.startsWith('app folders:')) ?? '(no line)');
    check('pin 1 (hidden) · omega is NOT reported as ignored (it IS an app, just not shown)',
      ignoredA !== null && !ignoredA.includes('omega'), `ignored=${JSON.stringify(ignoredA)}`);
    check('pin 2 · the summary NAMES the hidden app (hidden: 1 [omega])',
      hiddenA !== null && hiddenA.count === 1 && hiddenA.names.includes('omega'),
      `hidden=${JSON.stringify(hiddenA)}`);
    check('pin 3 · a hidden app is NOT DORMANT — it was withheld, and the run says so',
      dormantCount(a) === 1 && !(dormantNames(a) ?? []).includes('omega'),
      `dormant=${JSON.stringify(dormantNames(a))}`);
    check('pin 3 · a hidden app\'s ABSENT manifesto produces NO warning AND is never read',
      !/WARNING[^\n]*omega/.test(a.stderr) &&
        JSON.stringify(enrichmentOf(a)) === '{"found":1,"missing":1}',
      `stderr=${JSON.stringify(a.stderr.trim().split('\n').filter((l) => /WARNING/.test(l)))} ` +
        `enrichment=${JSON.stringify(enrichmentOf(a))}`);
    // A NON-HIDDEN published folder must still become a card (the negative control for
    // pin 1: hiding is surgical, not a blanket suppression).
    check('pin 8 · a NON-hidden published folder STILL becomes a card (zeta, alpha)',
      A.has('zeta') && A.has('alpha'),
      `slugs=${indexA.apps.map((x) => x.slug).join(',')}`);

    // ------------------------- arm a2: the two output files are BYTE-IDENTICAL (COPIES:)
    console.log('\n=== arm a2 · public/apps.json is byte-identical to public/apps.index.json ===');
    console.log(`index=${hashA}`);
    check('the generated index is non-empty JSON', indexA.apps.length > 0, `cards=${indexA.apps.length}`);

    // ---------------- arm b: a directory LOSES its index.html -> card vanishes, ignored
    console.log('\n=== arm b · pin 1: "zeta" loses its index.html ===');
    const rootB = join(tempRoot, 'appsroot-b');
    await cp(FIXTURE_ROOT, rootB, { recursive: true });
    await rm(join(rootB, 'zeta/index.html'), { force: true });
    const b = await runGenerator({ root: rootB, hostBase: BASE, overlay: FIXTURE_OVERLAY });
    const hashB = await indexHash();
    const indexB = await readIndex();
    const ignoredB = ignoredOf(b);
    console.log(`exit=${b.code} sha256=${hashB}`);
    console.log(`summary: ${summaryOf(b)}`);
    check('arm b exit 0 (a directory without index.html is not fatal)', b.code === 0, `exit=${b.code}`);
    check('pin 1 · the card VANISHES', !bySlug(indexB).has('zeta'),
      `slugs=${indexB.apps.map((x) => x.slug).join(',')}`);
    check('pin 1 · and "zeta" is now NAMED as ignored (with the hub\'s own dirs)',
      ignoredB !== null && ignoredB.includes('zeta') && ignoredB.includes('assets') &&
        ignoredB.includes('newapp'),
      `ignored=${JSON.stringify(ignoredB)}`);
    check('pin 1 · "alpha" survives as a card (the change is surgical)',
      bySlug(indexB).has('alpha'), `slugs=${indexB.apps.map((x) => x.slug).join(',')}`);
    check('arm b DIFFERS from arm a (not a void duplicate)', hashA !== hashB, `${hashA} vs ${hashB}`);

    // ---------------- arm c: a nonexistent APPS_ROOT_DIR -> non-zero, BYTE-IDENTICAL
    console.log('\n=== arm c · pin 4: APPS_ROOT_DIR does not exist ===');
    const beforeC = await indexHash();
    const missingRoot = join(tempRoot, 'no-such-apps-root');
    const c = await runGenerator({ root: missingRoot, hostBase: BASE, overlay: FIXTURE_OVERLAY });
    const afterC = await indexHash();
    console.log(`exit=${c.code} sha256 before=${beforeC} after=${afterC}`);
    console.log(`stderr: ${c.stderr.trim().split('\n')[0] ?? ''}`);
    check('pin 4 · a nonexistent apps root exits NON-ZERO', c.code !== 0, `exit=${c.code}`);
    check('pin 4 · the message NAMES the path', c.stderr.includes(missingRoot),
      c.stderr.trim().split('\n')[0] ?? '');
    check('pin 4 · the index is BYTE-IDENTICAL', beforeC === afterC, `${beforeC} vs ${afterC}`);

    // -------------------------------------------- arm c2: the root is a FILE, not a dir
    console.log('\n=== arm c2 · pin 4: APPS_ROOT_DIR is a FILE ===');
    const beforeC2 = await indexHash();
    const fileRoot = join(tempRoot, 'apps-root-is-a-file');
    await writeFile(fileRoot, 'not a directory\n');
    const c2 = await runGenerator({ root: fileRoot, hostBase: BASE, overlay: FIXTURE_OVERLAY });
    const afterC2 = await indexHash();
    console.log(`exit=${c2.code} sha256 before=${beforeC2} after=${afterC2}`);
    console.log(`stderr: ${c2.stderr.trim().split('\n')[0] ?? ''}`);
    check('pin 4 · a FILE as the apps root exits NON-ZERO', c2.code !== 0, `exit=${c2.code}`);
    check('pin 4 · and the index is BYTE-IDENTICAL', beforeC2 === afterC2, `${beforeC2} vs ${afterC2}`);

    // ------------------- arm d: pin 7 — unroutable APPS_HOST_BASE, NO HTTP ANYWHERE
    console.log('\n=== arm d · pin 7: APPS_HOST_BASE unroutable + poisoned proxy, still exit 0 ===');
    const d = await runGenerator({
      root: FIXTURE_ROOT,
      hostBase: UNROUTABLE_BASE,
      overlay: FIXTURE_OVERLAY,
    });
    const hashD = await indexHash();
    const indexD = await readIndex();
    console.log(`exit=${d.code} sha256=${hashD}`);
    console.log(`summary: ${summaryOf(d)}`);
    check('pin 7 · exit 0 with an UNROUTABLE (and proxied-to-a-dead-port) APPS_HOST_BASE',
      d.code === 0, `exit=${d.code} stderr=${d.stderr.trim().split('\n')[0] ?? ''}`);
    check('pin 7 · NOTHING was fetched — no transport failure, and the host base is echoed as a prefix only',
      !/transport failure|fetch failed|ENOTFOUND|ECONNREFUSED/i.test(`${d.stdout}${d.stderr}`),
      d.stdout.split('\n').find((l) => l.startsWith('apps host base:')) ?? '(no line)');
    check('pin 7 · the CARDS are identical to arm a apart from the URL PREFIX',
      indexD.apps.length === indexA.apps.length &&
        indexD.apps.every((card, i) => {
          const ref = indexA.apps[i];
          const { path: cardPath, ...cardRest } = card;
          const { path: refPath, ...refRest } = ref;
          return cardPath === `${UNROUTABLE_BASE}${card.slug}/` &&
            refPath === `${BASE}${ref.slug}/` &&
            JSON.stringify(cardRest) === JSON.stringify(refRest);
        }),
      `d=${indexD.apps.map((x) => x.path).join(' ')}`);
    check('pin 7 · the unroutable prefix appears ONLY in `path` (no other URL anywhere)',
      indexD.apps.every((x) => x.path.startsWith(UNROUTABLE_BASE)) &&
        !JSON.stringify(indexD).includes('apps.futuremagic.de'),
      JSON.stringify(indexD).match(/https?:\/\/[^"]*/g)?.join(' ') ?? '(no URLs at all)');

    // ------------------------------- arm e: a DORMANT overlay entry adds no card
    console.log('\n=== arm e · pin 5: add a DORMANT overlay entry "phantom" ===');
    const overlayE = join(tempRoot, 'overlay-e.json');
    const parsedE = JSON.parse(await readFile(FIXTURE_OVERLAY, 'utf8'));
    parsedE.apps.push({ slug: 'phantom', title: 'Phantom' });
    await writeFile(overlayE, `${JSON.stringify(parsedE, null, 2)}\n`);
    const e = await runGenerator({ root: FIXTURE_ROOT, hostBase: BASE, overlay: overlayE });
    const hashE = await indexHash();
    const indexE = await readIndex();
    console.log(`exit=${e.code} sha256=${hashE}`);
    console.log(`summary: ${summaryOf(e)}`);
    check('arm e exit 0', e.code === 0, `exit=${e.code}`);
    check('pin 5 · "phantom" produced NO card',
      !indexE.apps.some((x) => x.slug === 'phantom'),
      `slugs=${indexE.apps.map((x) => x.slug).join(',')}`);
    check('pin 5 · dormant count rose to 2 and names both entries',
      dormantCount(e) === 2 && /Ghost/.test(e.stdout) && /phantom/.test(e.stdout),
      e.stdout.split('\n').find((l) => l.startsWith('dormant overlay entries:')) ?? '(no line)');
    check('pin 5 · a dormant entry CANNOT change the grid (hash == arm a, BY DESIGN)',
      hashE === hashA, `${hashA} vs ${hashE}`);

    // --------------------- arm f: an app loses its manifesto -> card KEPT, un-enriched
    console.log('\n=== arm f · pin 3 inverse + pin 6: "zeta" loses its manifesto ===');
    const rootF = join(tempRoot, 'appsroot-f');
    await cp(FIXTURE_ROOT, rootF, { recursive: true });
    await rm(join(rootF, 'zeta/futuremagic.json'), { force: true });
    const f1 = await runGenerator({ root: rootF, hostBase: BASE, overlay: FIXTURE_OVERLAY });
    const hashF1 = await indexHash();
    const zetaF1 = bySlug(await readIndex()).get('zeta');
    console.log(`exit=${f1.code} sha256=${hashF1}`);
    console.log(`summary: ${summaryOf(f1)}`);
    check('arm f1 exit 0', f1.code === 0, `exit=${f1.code}`);
    check('pin 3 inverse · the card is KEPT but NOT enriched',
      zetaF1 !== undefined && !('tagline' in zetaF1) && !('tags' in zetaF1),
      `record=${JSON.stringify(zetaF1)}`);
    check('pin 6 · manifesto gone -> overlay.title now wins over the folder name',
      zetaF1 !== undefined && zetaF1.title === 'Overlay Zeta',
      `title=${JSON.stringify(zetaF1?.title)}`);
    check('arm f1 DIFFERS from arm a (not a void duplicate)', hashA !== hashF1,
      `${hashA} vs ${hashF1}`);

    // --------------- arm f2: manifesto present but NO title -> overlay still wins
    console.log('\n=== arm f2 · pin 6: manifesto present, title ABSENT -> overlay wins ===');
    await writeFile(
      join(rootF, 'zeta/futuremagic.json'),
      `${JSON.stringify({ tagline: 'Titleless manifesto', tags: ['fixture'] }, null, 2)}\n`,
    );
    const f2 = await runGenerator({ root: rootF, hostBase: BASE, overlay: FIXTURE_OVERLAY });
    const hashF2 = await indexHash();
    const zetaF2 = bySlug(await readIndex()).get('zeta');
    console.log(`exit=${f2.code} sha256=${hashF2}`);
    console.log(`summary: ${summaryOf(f2)}`);
    check('arm f2 exit 0', f2.code === 0, `exit=${f2.code}`);
    check('pin 6 · no manifesto title -> the OVERLAY title is used, not the folder name',
      zetaF2 !== undefined && zetaF2.title === 'Overlay Zeta',
      `title=${JSON.stringify(zetaF2?.title)}`);
    check('pin 6 · and the card is still enriched (tagline present)',
      zetaF2 !== undefined && zetaF2.tagline === 'Titleless manifesto',
      `tagline=${JSON.stringify(zetaF2?.tagline)}`);
    check('arm f2 DIFFERS from arms a and f1 (not a void duplicate)',
      hashF2 !== hashA && hashF2 !== hashF1, `${hashA} / ${hashF1} / ${hashF2}`);

    // ------------------------------ arm g: a malformed overlay -> FATAL, byte-identical
    console.log('\n=== arm g · pin 8: malformed overlay is FATAL, index BYTE-IDENTICAL ===');
    const beforeG = await indexHash();
    const badJson = join(tempRoot, 'overlay-bad-json.json');
    await writeFile(badJson, '{ this is not json ');
    const g1 = await runGenerator({ root: FIXTURE_ROOT, hostBase: BASE, overlay: badJson });
    const afterG1 = await indexHash();
    console.log(`g1 exit=${g1.code} sha256 before=${beforeG} after=${afterG1}`);
    console.log(`g1 stderr: ${g1.stderr.trim().split('\n')[0] ?? ''}`);
    check('pin 8 · invalid overlay JSON exits NON-ZERO', g1.code !== 0, `exit=${g1.code}`);
    check('pin 8 · and the index is BYTE-IDENTICAL', beforeG === afterG1, `${beforeG} vs ${afterG1}`);
    check('pin 8 · failure names the overlay', /overlay is not valid JSON/i.test(g1.stderr),
      g1.stderr.trim().split('\n')[0] ?? '');

    const badKey = join(tempRoot, 'overlay-bad-key.json');
    await writeFile(
      badKey,
      `${JSON.stringify({ version: 1, apps: [{ slug: 'zeta', path: '/zeta/' }] }, null, 2)}\n`,
    );
    const g2 = await runGenerator({ root: FIXTURE_ROOT, hostBase: BASE, overlay: badKey });
    const afterG2 = await indexHash();
    console.log(`g2 exit=${g2.code} sha256 before=${beforeG} after=${afterG2}`);
    console.log(`g2 stderr: ${g2.stderr.trim().split('\n')[0] ?? ''}`);
    check('pin 8 · the OLD inventory shape ("path") exits NON-ZERO', g2.code !== 0,
      `exit=${g2.code}`);
    check('pin 8 · and the index is still BYTE-IDENTICAL', beforeG === afterG2,
      `${beforeG} vs ${afterG2}`);
    check('pin 8 · the forbidden-key message now says DECORATE **or WITHHOLD** (reworded)',
      /DECORATE/i.test(g2.stderr) && /WITHHOLD/i.test(g2.stderr) && /cannot ADD/i.test(g2.stderr),
      g2.stderr.trim().split('\n').find((l) => /path/.test(l)) ?? '(no line)');

    // ---------------- arm g3: pin 5 — a NON-BOOLEAN `hidden` is FATAL, byte-identical
    console.log('\n=== arm g3 · pin 5: non-boolean hidden is FATAL, index BYTE-IDENTICAL ===');
    const beforeG3 = await indexHash();
    for (const [label, bad] of [['string "true"', 'true'], ['number 1', 1], ['null', null]]) {
      const overlayG3 = join(tempRoot, `overlay-g3-${label.replace(/\W+/g, '-')}.json`);
      await writeFile(
        overlayG3,
        `${JSON.stringify({ version: 1, apps: [{ slug: 'omega', hidden: bad }] }, null, 2)}\n`,
      );
      const g3 = await runGenerator({ root: FIXTURE_ROOT, hostBase: BASE, overlay: overlayG3 });
      const afterG3 = await indexHash();
      console.log(`g3 (${label}) exit=${g3.code} sha256 before=${beforeG3} after=${afterG3}`);
      console.log(`g3 stderr: ${g3.stderr.trim().split('\n')[0] ?? ''}`);
      check(`pin 5 · hidden: ${label} exits NON-ZERO`, g3.code !== 0, `exit=${g3.code}`);
      check(`pin 5 · and the message NAMES the app ("omega") for hidden: ${label}`,
        g3.stderr.includes('omega'), g3.stderr.trim().split('\n')[0] ?? '');
      check('pin 5 · and NAMES `hidden` for hidden: ' + label,
        /non-boolean hidden/.test(g3.stderr), g3.stderr.trim().split('\n')[0] ?? '');
      check(`pin 5 · the index is BYTE-IDENTICAL after hidden: ${label}`, beforeG3 === afterG3,
        `${beforeG3} vs ${afterG3}`);
    }

    // ---------------- arm g4: pin 6 — an UNKNOWN overlay key is FATAL, byte-identical
    console.log('\n=== arm g4 · pin 6: an UNKNOWN overlay key is FATAL, index BYTE-IDENTICAL ===');
    const beforeG4 = await indexHash();
    for (const typo of ['hiden', 'titel']) {
      const overlayG4 = join(tempRoot, `overlay-g4-${typo}.json`);
      await writeFile(
        overlayG4,
        `${JSON.stringify({ version: 1, apps: [{ slug: 'zeta', [typo]: true }] }, null, 2)}\n`,
      );
      const g4 = await runGenerator({ root: FIXTURE_ROOT, hostBase: BASE, overlay: overlayG4 });
      const afterG4 = await indexHash();
      console.log(`g4 (${typo}) exit=${g4.code} sha256 before=${beforeG4} after=${afterG4}`);
      console.log(`g4 stderr: ${g4.stderr.trim().split('\n')[0] ?? ''}`);
      check(`pin 6 · the typo key "${typo}" exits NON-ZERO`, g4.code !== 0, `exit=${g4.code}`);
      check(`pin 6 · and the message NAMES the key "${typo}"`,
        g4.stderr.includes(`"${typo}"`), g4.stderr.trim().split('\n')[0] ?? '');
      check(`pin 6 · and NAMES the app ("zeta") for the "${typo}" typo`,
        g4.stderr.includes('zeta'), g4.stderr.trim().split('\n')[0] ?? '');
      check(`pin 6 · the index is BYTE-IDENTICAL after the "${typo}" typo`, beforeG4 === afterG4,
        `${beforeG4} vs ${afterG4}`);
    }

    // ------------- arm h: pin 6 last level — NO overlay entry and NO manifesto
    console.log('\n=== arm h · pin 6: folder name is the last fallback (no overlay, no manifesto) ===');
    const overlayH = join(tempRoot, 'overlay-h.json');
    await writeFile(overlayH, `${JSON.stringify({ version: 1, apps: [] }, null, 2)}\n`);
    const h = await runGenerator({ root: FIXTURE_ROOT, hostBase: BASE, overlay: overlayH });
    const hashH = await indexHash();
    const indexH = await readIndex();
    const H = bySlug(indexH);
    console.log(`exit=${h.code} sha256=${hashH}`);
    console.log(`summary: ${summaryOf(h)}`);
    check('arm h exit 0', h.code === 0, `exit=${h.code}`);
    check('pin 6 · with an EMPTY overlay, "alpha" (no manifesto) falls back to the FOLDER NAME',
      H.get('alpha')?.title === 'alpha', `title=${JSON.stringify(H.get('alpha')?.title)}`);
    check('pin 6 · and the enriched "zeta" still uses its MANIFESTO title',
      H.get('zeta')?.title === 'Zeta', `title=${JSON.stringify(H.get('zeta')?.title)}`);
    check('pin 5 · with an empty overlay nothing is dormant and no VISIBLE card is lost',
      dormantCount(h) === 0 && indexH.apps.length === 3,
      `dormant=${dormantCount(h)} cards=${indexH.apps.length}`);
    check('pin 1 · without the overlay, "omega" is an ORDINARY card — hiding lives in the overlay',
      H.has('omega') && hiddenOf(h)?.count === 0,
      `cards=${indexH.apps.map((x) => x.slug).join(',')} hidden=${JSON.stringify(hiddenOf(h))}`);
    check('arm h DIFFERS from arm a (the overlay really did decorate)', hashA !== hashH,
      `${hashA} vs ${hashH}`);

    // ------------------------- arm i: the dead legacy env vars are still DEAD
    console.log('\n=== arm i · HUB_BASE + APPS_INVENTORY set to junk are IGNORED ===');const i = await runGenerator({
      root: FIXTURE_ROOT,
      hostBase: BASE,
      overlay: FIXTURE_OVERLAY,
      env: { HUB_BASE: UNROUTABLE_BASE, APPS_INVENTORY: '/nonexistent/apps.inventory.json' },
    });
    const hashI = await indexHash();
    console.log(`exit=${i.code} sha256=${hashI}`);
    console.log(`summary: ${summaryOf(i)}`);
    check('arm i exit 0 (the old-host env var is never read)', i.code === 0, `exit=${i.code}`);
    check('and the index is IDENTICAL to arm a (dead env vars change nothing)',
      hashI === hashA, `${hashA} vs ${hashI}`);

    // ------- arm j: pin 4 — a `hidden: true` entry whose folder is NOT published is DORMANT
    console.log('\n=== arm j · pin 4: a hidden entry with NO published folder is DORMANT ===');
    const overlayJ = join(tempRoot, 'overlay-j.json');
    const parsedJ = JSON.parse(await readFile(FIXTURE_OVERLAY, 'utf8'));
    parsedJ.apps.push({ slug: 'ghost-hidden', title: 'Ghost Hidden', hidden: true });
    await writeFile(overlayJ, `${JSON.stringify(parsedJ, null, 2)}\n`);
    const j = await runGenerator({ root: FIXTURE_ROOT, hostBase: BASE, overlay: overlayJ });
    const hashJ = await indexHash();
    const indexJ = await readIndex();
    const hiddenJ = hiddenOf(j);
    console.log(`exit=${j.code} sha256=${hashJ}`);
    console.log(`summary: ${summaryOf(j)}`);
    check('arm j exit 0 (a dormant hidden entry is not fatal)', j.code === 0, `exit=${j.code}`);
    check('pin 4 · the dormant hidden entry produces NO card',
      !bySlug(indexJ).has('ghost-hidden'),
      `slugs=${indexJ.apps.map((x) => x.slug).join(',')}`);
    check('pin 4 · it is reported as DORMANT, by name, consistently with every dormant entry',
      dormantCount(j) === 2 && (dormantNames(j) ?? []).includes('Ghost') &&
        (dormantNames(j) ?? []).includes('ghost-hidden'),
      `dormant=${JSON.stringify(dormantNames(j))}`);
    check('pin 4 · and it is NOT reported as a WITHHELD card (it withholds nothing)',
      hiddenJ !== null && hiddenJ.count === 1 && hiddenJ.names.includes('omega') &&
        !hiddenJ.names.includes('ghost-hidden'),
      `hidden=${JSON.stringify(hiddenJ)}`);
    check('pin 4 · a dormant hidden entry cannot change the grid (hash == arm a)',
      hashJ === hashA, `${hashA} vs ${hashJ}`);

    // ------- arm k: pin 1 reversal — `hidden: false` on a published folder RESTORES the card
    console.log('\n=== arm k · pin 1 reversed: hidden:false on "omega" -> the card is BACK ===');const overlayK = join(tempRoot, 'overlay-k.json');
    const parsedK = JSON.parse(await readFile(FIXTURE_OVERLAY, 'utf8'));
    for (const entry of parsedK.apps) {
      if (entry.slug.toLowerCase() === 'omega') entry.hidden = false;
    }
    await writeFile(overlayK, `${JSON.stringify(parsedK, null, 2)}\n`);
    const k = await runGenerator({ root: FIXTURE_ROOT, hostBase: BASE, overlay: overlayK });
    const hashK = await indexHash();
    const indexK = await readIndex();
    const hiddenK = hiddenOf(k);
    console.log(`exit=${k.code} sha256=${hashK}`);
    console.log(`summary: ${summaryOf(k)}`);
    check('arm k exit 0', k.code === 0, `exit=${k.code}`);
    check('pin 1 reversed · hidden:false -> the card is BACK',
      bySlug(indexK).has('omega'),
      `slugs=${indexK.apps.map((x) => x.slug).join(',')}`);
    check('pin 1 reversed · nothing is hidden now (hidden: 0)',
      hiddenK !== null && hiddenK.count === 0 && hiddenK.names.length === 0,
      `hidden=${JSON.stringify(hiddenK)}`);
    check('pin 3 inverse · a now-VISIBLE folder is READ, so its missing manifesto DOES warn',
      /WARNING: manifesto absent for "omega"/.test(k.stderr),
      k.stderr.trim().split('\n').find((l) => l.includes('omega')) ?? '(no omega warning)');
    check('arm k DIFFERS from arm a (reversibility is real, not a no-op)',
      hashA !== hashK, `${hashA} vs ${hashK}`);

    // ------- arm l: pin tier — an INVALID overlay tier is FATAL, index BYTE-IDENTICAL
    console.log('\n=== arm l · pin tier: an INVALID overlay tier is FATAL, index BYTE-IDENTICAL ===');
    const beforeL = await indexHash();
    for (const badTier of ['showcase', 1, null]) {
      const overlayL = join(tempRoot, `overlay-l-${String(badTier).replace(/\W+/g, '-')}.json`);
      await writeFile(
        overlayL,
        `${JSON.stringify({ version: 1, apps: [{ slug: 'zeta', tier: badTier }] }, null, 2)}\n`,
      );
      const l = await runGenerator({ root: FIXTURE_ROOT, hostBase: BASE, overlay: overlayL });
      const afterL = await indexHash();
      console.log(`l (tier=${JSON.stringify(badTier)}) exit=${l.code}`);
      console.log(`l stderr: ${l.stderr.trim().split('\n')[0] ?? ''}`);
      check(`pin tier · tier=${JSON.stringify(badTier)} exits NON-ZERO`, l.code !== 0,
        `exit=${l.code}`);
      check(`pin tier · and NAMES the app + the invalid tier (${JSON.stringify(badTier)})`,
        l.stderr.includes('zeta') && /invalid tier/.test(l.stderr),
        l.stderr.trim().split('\n')[0] ?? '');
      check(`pin tier · the index is BYTE-IDENTICAL after tier=${JSON.stringify(badTier)}`,
        beforeL === afterL, `${beforeL} vs ${afterL}`);
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  // ---------------------------------------------------------------- verdict
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
