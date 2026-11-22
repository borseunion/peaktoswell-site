// The app driven in headless Chrome at phone size, on real data: every screen and state is
// opened, the network is switched off and on again, and a screenshot of each step is saved.
// It reports console errors and failed requests. Not part of `npm test`: it needs Playwright
// and Chrome, which a Claude session has (set PLAYWRIGHT and CHROME where they live elsewhere).
//
//   python3 -m http.server 8765 --bind 127.0.0.1     (at the top of the repository, in another shell)
//   node tests/browser-check.mjs [base url] [output dir] [only names containing this]
//
// Look at the saved pictures afterwards: the script cannot judge the look.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/npm-tools/node_modules/playwright');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';

const base = process.argv[2] || 'http://127.0.0.1:8765/';
const out = process.argv[3] || '/tmp/peaktoswell-shots';
const only = process.argv[4] || '';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const problems = [];

async function phone(scale = 2) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: scale, isMobile: true, hasTouch: true, locale: 'en-GB', timezoneId: 'Europe/Sofia' });
  const page = await context.newPage();
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(`console ${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url()}`));
  return { context, page };
}

const want = (name) => !only || name.includes(only);
async function shot(page, name, full = false) {
  if (!want(name)) return;
  await page.waitForTimeout(150);
  // In a picture of the whole page the fixed bar would land in the middle of it.
  if (full) await page.addStyleTag({ content: '.nav{display:none !important}' }).then((tag) => (page.__tag = tag));
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
  if (full && page.__tag) await page.__tag.evaluate((node) => node.remove());
  console.log('saved', name);
}

const { context, page } = await phone();
await page.goto(base);
await page.waitForSelector('.row');
await page.evaluate(() => document.fonts.ready);
console.log('rows:', await page.locator('.row').count(), '| sections:', await page.locator('.sec h2').allTextContents().then((t) => t.join(', ')));
console.log('summary:', (await page.locator('.summary').innerText()).replace(/\n/g, ' / '));
await shot(page, '01-list');

// favourites
for (const name of ['Sölden', 'Bansko', 'Borovets']) await page.getByRole('button', { name: `Add ${name} to favourites`, exact: true }).first().click();
await page.evaluate(() => window.scrollTo(0, 0));
await shot(page, '02-list-favourites');
console.log('stored favourites:', await page.evaluate(() => localStorage.getItem('peaktoswell.favourites')));

// search
await page.fill('#q', 'solden');
await shot(page, '03-search-solden');
console.log('search "solden":', await page.locator('.row-name').allTextContents());
await page.fill('#q', 'bulgaria');
console.log('search "bulgaria":', await page.locator('.row-name').allTextContents());
await page.fill('#q', 'val tho');
console.log('search "val tho":', await page.locator('.row-name').allTextContents());
await page.fill('#q', 'zzz');
await shot(page, '04-search-none');
await page.fill('#q', '');

// a middle part of the list
await page.evaluate(() => window.scrollTo(0, 2600));
await shot(page, '05-list-middle');

// an open resort
await page.goto(`${base}#/resort/at-soelden`);
await page.waitForSelector('.tile');
await shot(page, '10-soelden-status', true);
await page.getByRole('link', { name: 'Forecast', exact: true }).click();
await page.waitForSelector('.day');
await shot(page, '11-soelden-forecast-top', true);
await page.getByRole('button', { name: /Base/ }).click();
await shot(page, '12-soelden-forecast-base', true);
await page.getByRole('link', { name: 'Satellite', exact: true }).click();
// Needs the backend's satellite files (backend 0.7.0); before them the tab says "No satellite image yet".
const loaded = (selector) => page.waitForFunction((s) => { const i = document.querySelector(s); return i && i.complete && i.naturalWidth > 0; }, selector);
await loaded('.sat-pic img');
await shot(page, '13-soelden-satellite', true);
console.log('satellite tab:', await page.locator('.sat-kv').innerText().then((t) => t.replace(/\n/g, ' ')), '|', await page.locator('.fine').allInnerTexts().then((t) => t.join(' | ')));
await page.getByRole('link', { name: 'Open the satellite image full screen' }).click();
await loaded('.viewer-stage img');
await shot(page, '15-soelden-satellite-full');
await page.getByRole('button', { name: 'Full size' }).click();
await loaded('.viewer-stage img');
await shot(page, '16-soelden-satellite-full-size');
console.log('full size: the picture is', await page.locator('.viewer-stage img').evaluate((i) => `${i.clientWidth} px wide, scrolled to ${i.parentElement.scrollLeft},${i.parentElement.scrollTop}`));
await page.getByRole('link', { name: 'Close the satellite image' }).click();
await page.waitForSelector('.sat-pic');
console.log('closed: back on', await page.evaluate(() => location.hash));
await page.getByRole('link', { name: 'About', exact: true }).first().click();
await shot(page, '14-soelden-about', true);

// the states
const states = [
  ['20-bansko-closed', 'bg-bansko', ''],
  ['21-bansko-forecast', 'bg-bansko', '/forecast'],
  ['22-borovets-nodata', 'bg-borovets', ''],
  ['23-serfaus-noreport', 'at-serfaus-fiss-ladis', ''],
  ['24-axamer-delayed', 'at-axamer-lizum', ''],
  ['25-mavrovo-nodates', 'mk-mavrovo', ''],
  ['26-valthorens-status', 'fr-val-thorens', ''],
  ['27-grindelwald-note', 'ch-grindelwald-wengen', ''],
  ['28-davos-nofile', 'ch-davos-klosters', ''],
  ['29-murren-forecast', 'ch-murren-schilthorn', '/forecast'],
  ['34-yllas-satellite', 'fi-yllas', '/satellite'],
  ['35-bansko-satellite', 'bg-bansko', '/satellite'],
  ['36-mavrovo-satellite', 'mk-mavrovo', '/satellite'],
];
for (const [name, id, tab] of states) {
  if (!want(name)) continue;
  await page.goto(`${base}#/resort/${id}${tab}`);
  await page.waitForSelector(tab === '/satellite' ? '.sat-pic, .note-card' : tab ? '.day, .note-card' : '.src, .cta, .note-card h2');
  await page.waitForTimeout(tab === '/satellite' ? 600 : 250);
  await shot(page, name, true);
}

await page.goto(`${base}#/favourites`);
await page.waitForSelector('.fav-stats');
await page.waitForFunction(() => document.querySelectorAll('.fav-stats div').length >= 5); // Sölden 3, Bansko 2
await shot(page, '30-favourites', true);
console.log('favourites:', await page.locator('.fav-name').allTextContents(), '|', await page.locator('.topline span').innerText());
await page.goto(`${base}#/resort/bg-bansko/about`);
await page.waitForSelector('.elev');
await shot(page, '33-bansko-about', true);
await page.goto(`${base}#/about`);
await shot(page, '31-about', true);
await page.goto(`${base}#/resort/no-such-resort`);
await shot(page, '32-not-found');

// back from a resort returns to the same place in the list
await page.goto(base);
await page.waitForSelector('.row');
await page.evaluate(() => window.scrollTo(0, 3000));
const link = page.locator('.row-main').nth(60);
await link.scrollIntoViewIfNeeded();
const before = await page.evaluate(() => window.scrollY);
await link.click();
await page.waitForSelector('.band');
await page.getByRole('link', { name: 'Back to resorts' }).click();
await page.waitForSelector('.row');
await page.waitForTimeout(200);
console.log('list scroll before / after going back:', before, await page.evaluate(() => window.scrollY));
await context.close();

// ---- without a connection
if (want('5')) {
  const { context: c2, page: p2 } = await phone();
  await p2.goto(base);
  await p2.waitForSelector('.row');
  await p2.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await p2.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  console.log('service worker controls the page:', await p2.evaluate(() => navigator.serviceWorker.controller.scriptURL));
  const manifest = await p2.evaluate(() => fetch(document.querySelector('link[rel=manifest]').href).then((r) => r.json()));
  console.log('manifest:', manifest.name, manifest.display, manifest.icons.map((i) => i.sizes + (i.purpose === 'maskable' ? ' maskable' : '')).join(', '));
  // No reload: one visit must be enough. The list was loaded before the worker took over and is asked for again through it.
  await p2.waitForFunction(async () => Boolean(await (await caches.open('data-1')).match('/data/status/index.json')), null, { timeout: 15000 });
  console.log('first visit: the list is kept on the device without a reload');
  await p2.getByRole('button', { name: 'Add Sölden to favourites', exact: true }).first().click();
  await p2.goto(`${base}#/resort/fr-val-thorens`);
  await p2.waitForSelector('.tile');
  await p2.getByRole('link', { name: 'Forecast', exact: true }).click();
  await p2.waitForSelector('.day');
  await p2.waitForTimeout(800); // the favourite's own files arrive in the background
  console.log('kept on the device:', await p2.evaluate(async () => (await (await caches.open('data-1')).keys()).map((r) => new URL(r.url).pathname.replace('/data/', '')).sort().join(', ')));

  await c2.setOffline(true);
  await p2.goto(base);
  await p2.reload();
  await p2.waitForSelector('.row');
  console.log('offline, list:', (await p2.locator('.banner-off').first().innerText()).trim(), '| rows', await p2.locator('.row').count());
  await shot(p2, '50-offline-list');
  await p2.goto(`${base}#/resort/fr-val-thorens`);
  await p2.waitForSelector('.tile');
  console.log('offline, a resort opened before:', (await p2.locator('.banner-off').first().innerText()).trim());
  await shot(p2, '51-offline-resort', true);
  await p2.getByRole('link', { name: 'Forecast', exact: true }).click();
  await p2.waitForSelector('.day');
  console.log('offline, its forecast:', (await p2.locator('.banner-off').first().innerText()).trim());
  await p2.goto(`${base}#/favourites`);
  await p2.waitForSelector('.fav-stats');
  await p2.waitForFunction(() => document.querySelectorAll('.fav-stats div').length >= 3);
  console.log('offline, favourites:', await p2.locator('.fav-stats').first().innerText().then((t) => t.replace(/\n/g, ' ')));
  await shot(p2, '52-offline-favourites');
  // The picture of a resort that was opened is on the device, though its Satellite tab never was.
  await p2.goto(`${base}#/resort/fr-val-thorens/satellite`);
  await p2.waitForFunction(() => { const i = document.querySelector('.sat-pic img'); return i && i.complete && i.naturalWidth > 0; });
  console.log('offline, the picture of a resort opened before:', (await p2.locator('.banner-off').first().innerText()).trim(), '|', await p2.locator('.sat-kv').innerText().then((t) => t.replace(/\n/g, ' ')));
  await shot(p2, '54-offline-satellite', true);
  // A favourite that was never opened: its files are on the device, its picture is not.
  await p2.goto(`${base}#/resort/at-soelden/satellite`);
  await p2.waitForSelector('.sat');
  console.log('offline, the picture of a resort never opened:', (await p2.locator('.sat').innerText()).replace(/\n/g, ' | '));
  await shot(p2, '55-offline-satellite-never-loaded');
  await p2.goto(`${base}#/resort/at-ischgl-silvretta-arena`);
  await p2.waitForSelector('[data-retry]');
  console.log('offline, a resort never opened:', (await p2.locator('.note-card').last().innerText()).replace(/\n/g, ' | '));
  await shot(p2, '53-offline-never-opened');
  // every failure from here back was expected: the network was off on purpose
  const expected = problems.splice(0).filter((line) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource|peaktoswell:|request failed/.test(line));
  problems.push(...expected);

  await c2.setOffline(false);
  await p2.waitForSelector('.tile', { timeout: 15000 });
  console.log('back online, the same resort:', await p2.locator('.count b').first().innerText(), 'lifts shown | offline banners left:', await p2.locator('.banner-off').count());
  await p2.goto(base);
  await p2.waitForSelector('.row');
  await p2.waitForFunction(() => !document.querySelector('.banner-off'), null, { timeout: 15000 });
  console.log('back online, list: no banner');
  await c2.close();
}

// a computer window
if (want('40-desktop')) {
  const wide = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'en-GB', timezoneId: 'Europe/Sofia' });
  const p2 = await wide.newPage();
  await p2.goto(base);
  await p2.waitForSelector('.row');
  await p2.evaluate(() => document.fonts.ready);
  await p2.screenshot({ path: `${out}/40-desktop.png` });
  console.log('saved 40-desktop');
  await wide.close();
}

await browser.close();
console.log(problems.length ? `PROBLEMS (${problems.length}):\n  ${[...new Set(problems)].join('\n  ')}` : 'no console errors, no failed requests');
