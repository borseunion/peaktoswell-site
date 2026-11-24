// Tests of the app's pure functions. Run from the top of the repository: node --test tests/app.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as app from '../app/app.js';

const file = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

const NOW = new Date(2026, 10, 21, 15, 0, 0); // 21 Nov 2026, on the device's clock
const HOUR = 3600 * 1000;

test('search ignores accents and letter case', () => {
  assert.equal(app.fold('Sölden'), 'solden');
  assert.equal(app.fold('Białka Tatrzańska'), 'bialka tatrzanska');
  assert.equal(app.fold('Åre'), 'are');
  assert.equal(app.fold('Méribel'), 'meribel');
  const row = { name: 'Kitzbühel (KitzSki)', country_name: 'Austria', region: 'Tirol' };
  assert.ok(app.matches(row, 'kitzbuhel'));
  assert.ok(app.matches(row, 'KITZ tirol'));
  assert.ok(app.matches(row, 'austria'));
  assert.ok(app.matches(row, '   '));
  assert.ok(!app.matches(row, 'kitz salzburg'));
});

test('dates show the year only when it is not this year', () => {
  assert.equal(app.fmtDate('2026-12-12', 'auto', NOW), '12 Dec');
  assert.equal(app.fmtDate('2027-04-11', 'auto', NOW), '11 Apr 2027');
  assert.equal(app.fmtDate('2026-12-12', 'always', NOW), '12 Dec 2026');
  assert.equal(app.fmtDate('2027-04-11', 'never', NOW), '11 Apr');
  assert.equal(app.fmtDate('not a date'), '');
  assert.equal(app.weekday('2026-11-21'), 'Sat');
  assert.equal(app.today(NOW), '2026-11-21');
});

test('numbers, temperatures and ranges', () => {
  assert.equal(app.num(79.6), '79.6');
  assert.equal(app.num(147.0), '147');
  assert.equal(app.num(null), '');
  assert.equal(app.temp(-22), '\u221222°');
  assert.equal(app.temp(7), '7°');
  assert.equal(app.temp(-0.2), '0°');
  assert.equal(app.temp(null), '–');
  assert.equal(app.span([30, 31]), '30–31');
  assert.equal(app.span([8, 8]), '8');
  assert.equal(app.span(null), '');
});

test('the line under the status follows the state and the season', () => {
  const season = (phase, opens = '2026-12-12', ends = '2027-04-11') => ({ opens, ends, phase });
  const text = (...args) => app.seasonText(...args).text;
  assert.equal(text('open', season('running', '2026-10-09', '2027-05-02'), '', NOW), 'Season ends 2 May 2027');
  assert.equal(text('closed', season('before'), '', NOW), 'Expected to open 12 Dec · season ends 11 Apr 2027');
  assert.equal(text('closed', season('delayed', '2026-11-20'), '', NOW), 'Opening was planned for 20 Nov · season ends 11 Apr 2027');
  assert.equal(text('closed', season('running', '2026-11-01'), '', NOW), 'Season ends 11 Apr 2027');
  assert.equal(text('closed', season('ended', '2025-12-01', '2026-04-12'), '', NOW), 'Season ended 12 Apr');
  assert.deepEqual(app.seasonText('closed_today', season('running', '2026-11-12', '2027-04-18'), 'Strong wind', NOW), { lead: 'Strong wind', text: 'season ends 18 Apr 2027' });
  assert.equal(text('closed_today', season('running', '2026-11-12', '2027-04-18'), '', NOW), 'Season ends 18 Apr 2027');
  // Without a report only the calendar speaks, whatever phase the file carries.
  assert.equal(text('no_data', season('before', '2026-12-19'), '', NOW), 'Expected to open 19 Dec · season ends 11 Apr 2027');
  assert.equal(text('no_data', season('delayed', '2026-11-13', '2027-04-04'), '', NOW), 'Planned season 13 Nov – 4 Apr 2027');
  assert.equal(text('no_data', { opens: '2025-12-01', ends: '2026-04-12' }, '', NOW), 'Season ended 12 Apr');
  assert.equal(text('closed', {}, '', NOW), '');
  assert.equal(text('closed', { opens: '2026-12-04', ends: null, phase: 'before' }, '', NOW), 'Expected to open 4 Dec');
});

test('a report older than a day is old, a resort without data never is', () => {
  const at = (hours) => new Date(NOW.getTime() - hours * HOUR).toISOString();
  assert.equal(app.isStale({ state: 'closed', checked_at: at(25) }, NOW.getTime()), true);
  assert.equal(app.isStale({ state: 'open', checked_at: at(23) }, NOW.getTime()), false);
  assert.equal(app.isStale({ state: 'open' }, NOW.getTime()), true);
  assert.equal(app.isStale({ state: 'no_data', checked_at: at(400) }, NOW.getTime()), false);
});

const RESORTS = {
  resorts: [
    { id: 'at-soelden', name: 'Sölden', country: 'at', country_name: 'Austria', region: 'Tirol' },
    { id: 'at-ischgl', name: 'Ischgl – Silvretta Arena', country: 'at', country_name: 'Austria', region: 'Tirol' },
    { id: 'bg-bansko', name: 'Bansko', country: 'bg', country_name: 'Bulgaria', region: '' },
    { id: 'bg-borovets', name: 'Borovets', country: 'bg', country_name: 'Bulgaria', region: '' },
  ],
};
const INDEX = {
  generated_at: '2026-11-21T15:01:42Z',
  resorts: [
    { id: 'at-soelden', state: 'open', lifts: { open: 24, total: 31 }, snow_top_cm: 84, checked_at: NOW.toISOString(), source: 'liftradar' },
    { id: 'at-ischgl', state: 'closed', lifts: { open: 0, total: 46 }, checked_at: NOW.toISOString(), source: 'liftradar' },
    { id: 'bg-bansko', state: 'closed', lifts: { open: 0, total: 14 }, snow_top_cm: 0, checked_at: NOW.toISOString(), source: 'resort' },
  ],
};

test('the list joins the resorts with their status, in the list’s order', () => {
  const rows = app.joinRows(RESORTS, INDEX, NOW.getTime());
  assert.deepEqual(rows.map((r) => [r.id, r.state]), [['at-soelden', 'open'], ['at-ischgl', 'closed'], ['bg-bansko', 'closed'], ['bg-borovets', 'no_data']]);
  assert.equal(app.summaryText(app.summarize(rows)), '1 open · 2 closed · 1 no data');
  assert.equal(app.summaryText({ open: 13, closed_today: 1, closed: 74, no_data: 42 }), '13 open · 1 closed today · 74 closed · 42 no data');
  const groups = app.byCountry(rows);
  assert.deepEqual(groups.map((g) => [g.name, g.rows.length, g.open]), [['Austria', 2, 1], ['Bulgaria', 2, 0]]);
  assert.equal(app.subline(rows[0], 'Tirol'), 'Tirol · 24 of 31 lifts · 84 cm');
  assert.equal(app.subline(rows[1], 'Tirol'), 'Tirol · 0 of 46 lifts');
  assert.equal(app.subline(rows[2], ''), '0 of 14 lifts'); // a closed resort shows no snow depth
  assert.equal(app.subline(rows[3], 'Bulgaria'), 'Bulgaria');
});

test('the list’s HTML: favourites on top, countries after, names escaped', () => {
  const rows = app.joinRows(RESORTS, INDEX, NOW.getTime());
  const html = app.resultsHtml(rows, new Set(['bg-bansko']), '', INDEX.generated_at);
  assert.ok(html.indexOf('<h2>Favourites</h2>') < html.indexOf('<h2>Austria</h2>'));
  assert.ok(html.indexOf('<h2>Austria</h2>') < html.indexOf('<h2>Bulgaria</h2>'));
  assert.match(html, /2 resorts · 1 open/);
  assert.match(html, /aria-label="Remove Bansko from favourites"/);
  assert.match(html, /aria-label="Add Sölden to favourites"/);
  assert.ok(!app.resultsHtml(rows, new Set(), '', INDEX.generated_at).includes('Favourites'));
  const found = app.resultsHtml(rows, new Set(), 'solden', INDEX.generated_at);
  assert.match(found, /<h2>Results<\/h2><span>1 of 4<\/span>/);
  assert.match(app.resultsHtml(rows, new Set(), 'zzz', INDEX.generated_at), /No resort found/);
  const evil = app.rowHtml({ id: 'x"><script>', name: '<img src=x onerror=alert(1)>', state: 'open', lifts: null }, '<b>', false);
  assert.ok(!evil.includes('<img'));
  assert.ok(!evil.includes('<script>'));
  assert.ok(!evil.includes('<b>'));
});

const SOELDEN = {
  id: 'at-soelden',
  state: 'open',
  lifts: { open: 24, total: 31 },
  slopes: { open: 22, total: 58, open_km: 102.5, total_km: 147 },
  snow: {
    top_cm: 84,
    base_cm: 0,
    new_cm: 0,
    last_snowfall: '2026-11-19',
    condition: 'Powder - grippy',
    stations: [
      { name: 'Sölden', elevation_m: 1363, depth_cm: 0 },
      { name: 'Gaislachkogl', elevation_m: 2110, depth_cm: 14 },
      { name: 'Giggijoch', elevation_m: 2525, depth_cm: 32 },
      { name: 'Glacier', elevation_m: 3000, depth_cm: 84 },
    ],
  },
  checked_at: '2026-11-21T13:40:33+01:00',
  reported_at: '2026-11-21T13:33:55+01:00',
  source: {
    kind: 'liftradar',
    label: 'LiftRadar',
    url: 'https://liftradar.eu/resort?r=at/soelden',
    origin: [{ url: 'https://www.soelden.com/en/live-information/snow-report' }, { url: 'https://www.soelden.com/other' }, { url: 'https://winter.intermaps.com/soelden/data?lang=en' }, { url: 'javascript:alert(1)' }],
  },
  lifts_by_type: { carpet: { open: 2, total: 2 }, chairlift: { open: 10, total: 13 }, drag_lift: { open: 3, total: 7 }, funicular: { open: 1, total: 1 }, gondola: { open: 8, total: 8 }, zipline: { open: 0, total: 1 } },
  slopes_by_difficulty: { ski_route: { open: 0, total: 13, open_km: 0, total_km: 7 }, easy: { open: 12, total: 21, open_km: 62.2, total_km: 78 }, intermediate: { open: 6, total: 15, open_km: 24.3 }, difficult: { open: 4, total: 9, open_km: 16 } },
  season: { opens: '2026-10-09', ends: '2027-05-02', phase: 'running' },
};

test('bars come in a fixed order, unknown kinds last', () => {
  assert.deepEqual(app.liftBars(SOELDEN).map((b) => [b.label, b.open, b.total, b.pct]), [
    ['Gondola', 8, 8, 100],
    ['Chairlift', 10, 13, 77],
    ['Drag lift', 3, 7, 43],
    ['Funicular', 1, 1, 100],
    ['Carpet', 2, 2, 100],
    ['Zipline', 0, 1, 0],
  ]);
  assert.deepEqual(app.slopeBars(SOELDEN).map((b) => b.label), ['Easy', 'Intermediate', 'Difficult', 'Ski route']);
  assert.deepEqual(app.liftBars(null), []);
  assert.deepEqual(app.bars({ gondola: { open: 0, total: 0 } }, []), []);
});

test('the snow card puts the highest station on top', () => {
  const view = app.snowView(SOELDEN.snow);
  assert.equal(view.top_cm, 84);
  assert.equal(view.where, 'Glacier · 3000 m');
  assert.deepEqual(view.rest.map((s) => s.name), ['Giggijoch', 'Gaislachkogl', 'Sölden']);
  assert.equal(view.condition, 'Powder, grippy');
  const plain = app.snowView({ top_cm: 120, base_cm: 40 });
  assert.equal(plain.where, 'Top');
  assert.deepEqual(plain.rest, [{ name: 'Base', elevation_m: null, depth_cm: 40 }]);
  assert.equal(app.snowView({ top_cm: null }), null);
  assert.equal(app.snowView(null), null);
});

test('the source line names each origin once and never links to anything but the web', () => {
  const view = app.sourceView(SOELDEN);
  assert.match(view.text, /^LiftRadar · reported 21 Nov, \d\d:\d\d$/);
  assert.deepEqual(view.origins.map((o) => o.name), ['soelden.com', 'winter.intermaps.com']);
  assert.equal(view.action, 'Open report');
  const own = app.sourceView({ checked_at: '2026-11-21T15:00:11Z', reported_at: null, source: { kind: 'resort', label: 'banskoski.com', url: 'https://www.banskoski.com/en', origin: [{ url: 'https://www.banskoski.com/en' }] } });
  assert.match(own.text, /^banskoski\.com · checked 21 Nov, \d\d:\d\d$/);
  assert.deepEqual(own.origins, []);
  assert.equal(own.action, 'Open page');
  assert.equal(app.safeUrl('javascript:alert(1)'), '');
  assert.equal(app.safeUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(app.sourceView({}), null);
});

test('the Status tab by state', () => {
  const row = { id: 'at-soelden', name: 'Sölden', state: 'open', stale: false };
  const open = app.statusHtml(row, SOELDEN, NOW);
  assert.match(open, /<b>24<\/b><span>of 31<\/span>/);
  assert.match(open, /102\.5 of 147 km/);
  assert.ok(open.includes('<div class="label">Snow depth</div>'));
  assert.match(open, /12<\/b> of 21 · 62\.2 km/);
  const before = { ...SOELDEN, state: 'closed', lifts: { open: 0, total: 14 }, slopes: { open: 0, total: 17, open_km: null, total_km: null }, season: { opens: '2026-12-12', ends: '2027-04-11', phase: 'before' } };
  const closed = app.statusHtml({ ...row, state: 'closed' }, before, NOW);
  assert.match(closed, /<h2>Expected to open 12 Dec 2026<\/h2>/);
  assert.match(closed, /planned to end on 11 Apr 2027/);
  assert.ok(!closed.includes('<div class="label">Snow depth</div>')); // the card, not the sentence that mentions it
  assert.match(app.statusHtml({ ...row, state: 'closed' }, { ...before, season: { ...before.season, opens: '2026-11-20', phase: 'delayed' } }, NOW), /<h2>Opening was planned for 20 Nov 2026<\/h2>/);
  assert.match(app.statusHtml({ ...row, state: 'closed_today' }, { ...SOELDEN, state: 'closed_today' }, NOW), /<h2>Closed today<\/h2>/);
  const none = app.statusHtml({ id: 'bg-borovets', state: 'no_data', reason: 'no_source' }, null, NOW);
  assert.match(none, /No live data from the resort/);
  assert.match(none, /href="#\/resort\/bg-borovets\/forecast"/);
  const old = app.statusHtml({ ...row, stale: true }, { ...SOELDEN, checked_at: new Date(NOW.getTime() - 35 * HOUR).toISOString() }, NOW);
  assert.match(old, /Old data · last checked .* \(35 h ago\)/);
});

const DAY = (date, score, extra = {}) => ({ date, score, rating: score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : score >= 20 ? 'poor' : 'no_go', window: [12, 16], feels_c: -22, new_snow_cm: 7, wind_kmh: [30, 31], wind_kn: [16, 17], gust_kmh: 40, models: 5, confidence: 'medium', lifts_may_stop: 'low', causes: [], ...extra });
const FORECAST = {
  generated_at: NOW.toISOString(),
  timezone: 'Europe/Vienna',
  models: ['ECMWF IFS', 'DWD ICON', 'NOAA GFS', 'Météo-France', 'ICON-2I Italy'],
  levels: [
    { key: 'base', elevation_m: 1350, days: [DAY('2026-11-21', 90), DAY('2026-11-22', 50)] },
    { key: 'mid', elevation_m: 2300, days: [DAY('2026-11-21', 70), DAY('2026-11-22', 71)] },
    {
      key: 'top',
      elevation_m: 3340,
      days: [
        DAY('2026-11-21', 59, { lifts_may_stop: 'medium', causes: [{ kind: 'new_snow', level: 'low', cm: 7 }, { kind: 'gusts', level: 'medium', peak_kmh: 63, over_kmh: 50, models_over: 3, models: 5 }] }),
        DAY('2026-11-22', 97, { feels_c: -14, new_snow_cm: 0, wind_kmh: [18, 18], wind_kn: [10, 10], gust_kmh: 37 }),
        DAY('2026-11-23', 100, { lifts_may_stop: 'out_of_season' }),
        DAY('2026-11-24', 12, { lifts_may_stop: 'high', causes: [{ kind: 'wind', level: 'high', peak_kmh: 88 }] }),
      ],
    },
  ],
};

test('a forecast day in words', () => {
  assert.equal(app.scoreClass(80), 'hi');
  assert.equal(app.scoreClass(79), 'mid');
  assert.equal(app.scoreClass(60), 'mid');
  assert.equal(app.scoreClass(59), 'lo');
  assert.equal(app.ratingWord('no_go'), 'No go');
  assert.equal(app.ratingWord('excellent'), 'Excellent');
  const view = app.levelView(FORECAST, 'top');
  const [sat, sun, mon, tue] = view.days;
  assert.equal(sat.line1, '\u221222° feels · 7 cm new');
  assert.equal(sat.line2, '30–31 km/h (16–17 kn) · gusts 40');
  assert.deepEqual(sat.lifts, { kind: 'medium', text: 'Lifts may stop: medium chance', cause: 'gusts to 63 km/h' });
  assert.equal(sun.line1, '\u221214° feels · no new snow');
  assert.equal(sun.line2, '18 km/h (10 kn) · gusts 37');
  assert.deepEqual(sun.lifts, { kind: 'low', text: 'Lifts may stop: low chance', cause: '' });
  assert.deepEqual(mon.lifts, { kind: 'off', text: 'Out of season', cause: '' });
  assert.deepEqual(tue.lifts, { kind: 'high', text: 'Lifts may stop: high chance', cause: 'wind to 88 km/h' });
  assert.equal(tue.rating, 'No go');
  // The best day is the best one inside the season, not the 100 of the out-of-season Monday.
  assert.equal(view.best, 'Best: Sun 97');
  assert.equal(view.offDays, 1);
  assert.deepEqual(view.switches.map((s) => [s.name, s.metres, s.on]), [['Base', '1350 m', false], ['Mid', '2300 m', false], ['Top', '3340 m', true]]);
  assert.equal(app.levelView(FORECAST, 'base').best, 'Best: Sat 90');
  assert.equal(app.levelView(FORECAST, 'nonsense').key, 'top');
  assert.equal(app.levelView(null, 'top'), null);
  assert.equal(app.causeText({ kind: 'thunderstorms', level: 'medium' }), 'thunderstorms possible');
  assert.equal(app.causeText({ kind: 'thin_snow_cover', cm: 9 }), 'thin snow cover, 9 cm');
  assert.equal(app.causeText({ kind: 'something new' }), '');
});

test('the Forecast tab', () => {
  const html = app.forecastHtml(FORECAST, 'top', NOW.getTime());
  assert.match(html, /data-level="top" aria-pressed="true"/);
  assert.match(html, /data-level="base" aria-pressed="false"/);
  assert.match(html, /Median of 5 weather models/);
  assert.match(html, /Open-Meteo\.com<\/a>, CC BY 4\.0/);
  assert.match(html, /out of season the lifts are not expected to run/);
  assert.match(html, /lift-pill lift-medium">Lifts may stop: medium chance<\/span><span class="cause">Gusts to 63 km\/h/);
  assert.ok(!html.includes('Old forecast'));
  assert.match(app.forecastHtml({ ...FORECAST, generated_at: new Date(NOW.getTime() - 30 * HOUR).toISOString() }, 'top', NOW.getTime()), /Old forecast · made/);
  assert.match(app.forecastHtml(null, 'top'), /No forecast yet/);
});

test('addresses inside the app', () => {
  assert.deepEqual(app.parseRoute(''), { name: 'resorts' });
  assert.deepEqual(app.parseRoute('#/'), { name: 'resorts' });
  assert.deepEqual(app.parseRoute('#/resort/at-soelden'), { name: 'resort', id: 'at-soelden', tab: 'status' });
  assert.deepEqual(app.parseRoute('#/resort/at-soelden/forecast'), { name: 'resort', id: 'at-soelden', tab: 'forecast' });
  assert.deepEqual(app.parseRoute('#/resort/at-soelden/nonsense'), { name: 'resort', id: 'at-soelden', tab: 'status' });
  assert.deepEqual(app.parseRoute('#/resort/at-soelden/satellite'), { name: 'resort', id: 'at-soelden', tab: 'satellite' });
  assert.deepEqual(app.parseRoute('#/resort/at-soelden/satellite/full'), { name: 'resort', id: 'at-soelden', tab: 'satellite', full: true });
  assert.deepEqual(app.parseRoute('#/resort/at-soelden/forecast/full'), { name: 'resort', id: 'at-soelden', tab: 'forecast' });
  assert.deepEqual(app.parseRoute('#/favourites'), { name: 'favourites' });
  assert.deepEqual(app.parseRoute('#/about'), { name: 'about' });
  assert.deepEqual(app.parseRoute('#/resort/fr-val-thorens/avalanche'), { name: 'avalanche', id: 'fr-val-thorens' });
  assert.deepEqual(app.parseRoute('#/about/avalanche'), { name: 'about', page: 'avalanche' });
  assert.deepEqual(app.parseRoute('#/about/else'), { name: 'about' });
  assert.deepEqual(app.parseRoute('#/anything-else'), { name: 'resorts' });
});

test('text from the data is escaped before it reaches the page', () => {
  assert.equal(app.esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(app.esc(null), '');
  const html = app.resortHtml({ id: 'x', name: '<script>alert(1)</script>', state: 'open', country_name: 'A<b>', region: '' }, 'status', { ...SOELDEN, note: '<i>note</i>' }, null, false, 'top', '');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<i>note'));
  assert.ok(!html.includes('A<b>'));
});

test('the Favourites screen', () => {
  const rows = app.joinRows(RESORTS, INDEX, NOW.getTime());
  const favs = new Set(['at-soelden', 'bg-bansko', 'bg-borovets']);
  const files = { 'at-soelden': SOELDEN, 'bg-bansko': { state: 'closed', lifts: { open: 0, total: 14 }, slopes: { open: 0, total: 17 }, snow: { top_cm: 0 }, checked_at: NOW.toISOString() }, 'bg-borovets': null };
  const html = app.favouritesHtml(rows, favs, (id) => files[id]);
  assert.match(html, /<span>3 saved<\/span>/);
  assert.match(html, /<b>24 of 31<\/b><span>lifts<\/span>/);
  assert.match(html, /<b>22 of 58<\/b><span>slopes<\/span>/);
  assert.match(html, /<b>84 cm<\/b><span>snow, top<\/span>/);
  assert.match(html, /<b>0 of 17<\/b><span>slopes<\/span>/);
  assert.equal(html.split('snow, top').length - 1, 1); // a closed resort shows no snow depth
  assert.match(html, /No live data from the resort/);
  assert.match(html, /Austria · Tirol · checked 21 Nov, \d\d:\d\d/);
  // While a favourite's own file is loading the list's row is shown: lifts and snow, no slopes yet.
  const early = app.favouritesHtml(rows, new Set(['at-soelden']), () => undefined);
  assert.match(early, /<b>24 of 31<\/b><span>lifts<\/span>/);
  assert.ok(!early.includes('slopes'));
  assert.match(app.favouritesHtml(rows, new Set(), () => undefined), /No favourites yet/);
  assert.match(app.favouritesHtml(rows, favs, (id) => files[id], '2026-11-21T13:40:00Z'), /Offline · showing data saved 21 Nov/);
});

test('the About screen names every source the app shows data from', () => {
  const html = app.aboutHtml(app.joinRows(RESORTS, INDEX, NOW.getTime()));
  assert.match(html, /Lift and slope status for 2 resorts, and the avalanche bulletins it collects\./);
  assert.match(html, /<b>Avalanche warning services<\/b>.*SLF in Switzerland, Météo-France, AINEVA in Italy/s);
  assert.match(html, /<a class="entry entry-link" href="#\/about\/avalanche"><div class="entry-top"><b>Avalanche information\*<\/b>/);
  assert.match(html, /Weather data by Open-Meteo\.com, CC BY 4\.0\./);
  assert.match(html, /href="https:\/\/liftradar\.eu" target="_blank" rel="noopener"/);
  assert.match(html, /The ski score rates the weather only\./);
  assert.match(html, /an estimate from the forecast, not the resort’s decision/);
  assert.match(html, /<b>Copernicus Sentinel-2<\/b>/);
  assert.match(html, /Contains modified Copernicus Sentinel data\./);
  assert.match(html, /a 7-day forecast at three elevations, a satellite image and the official avalanche danger for 4 European ski resorts/);
  assert.ok(!html.includes('satellite image, resort photos'), 'the satellite image no longer comes "with later builds"');
  assert.ok(html.includes(`${app.VERSION} · early build`));
});

test('a resort’s About tab', () => {
  const row = { id: 'at-soelden', name: 'Sölden', country_name: 'Austria', region: 'Tirol', base_m: 1350, mid_m: 2300, top_m: 3340, season_opens: '2026-10-09', season_ends: '2027-05-02', about: null };
  const html = app.aboutTabHtml(row, { ...SOELDEN, website: 'https://www.soelden.com', size: { lifts: 31, slopes: 58, slopes_km: 147 } });
  assert.match(html, /<b>3340<\/b><span>Top · m<\/span>/);
  assert.match(html, /<span>Slopes<\/span><span class="v">147 km<\/span>/);
  assert.match(html, /<span>Season ends<\/span><span class="v">2 May 2027<\/span>/);
  assert.match(html, /class="cta cta-ink" href="https:\/\/www\.soelden\.com\/"[^>]*>soelden\.com</);
  assert.match(html, /come with a later build/);
  const withText = app.aboutTabHtml({ ...row, about: 'A glacier resort in the Ötztal.' }, null);
  assert.match(withText, /<p class="lead">A glacier resort in the Ötztal\.<\/p>/);
  assert.ok(!withText.includes('later build'));
  // A resort we read ourselves: its own page is its website.
  const own = app.aboutTabHtml(row, { website: null, source: { kind: 'resort', url: 'https://www.banskoski.com/en' } });
  assert.match(own, />banskoski\.com</);
});

test('offline: the banner, and where it stands', () => {
  assert.equal(app.offlineBanner(null), '');
  assert.match(app.offlineBanner('2026-11-21T13:40:00Z'), /Offline · showing data saved 21 Nov, \d\d:\d\d/);
  const rows = app.joinRows(RESORTS, INDEX, NOW.getTime());
  assert.match(app.resultsHtml(rows, new Set(), '', INDEX.generated_at, '2026-11-21T13:40:00Z'), /^<div class="banner banner-off">/);
  const row = { id: 'at-soelden', name: 'Sölden', state: 'open', country_name: 'Austria', region: 'Tirol' };
  const onStatus = app.resortHtml(row, 'status', SOELDEN, FORECAST, false, 'top', '', { status: '2026-11-21T13:40:00Z', forecast: null });
  assert.match(onStatus, /id="tab"><div class="banner banner-off">/);
  const onForecast = app.resortHtml(row, 'forecast', SOELDEN, FORECAST, false, 'top', '', { status: '2026-11-21T13:40:00Z', forecast: null });
  assert.ok(!onForecast.includes('banner-off'));
});

test('the version number is the same in index.html and sw.js', () => {
  const page = file('index.html');
  const versions = [...page.matchAll(/\?v=(\d+)/g)].map((m) => m[1]);
  assert.equal(versions.length, 2);
  assert.equal(versions[0], versions[1]);
  const worker = /const VERSION = '(\d+)';/.exec(file('sw.js'));
  assert.ok(worker, 'sw.js has a VERSION');
  assert.equal(worker[1], versions[0]);
  // Every file the service worker keeps for offline use exists.
  const list = /const SHELL_FILES = \[([\s\S]*?)\];/.exec(file('sw.js'))[1];
  for (const [, name] of list.matchAll(/['`]([^'`]+)['`]/g)) {
    if (name === './') continue;
    assert.doesNotThrow(() => readFileSync(new URL(`../${name.replace(/\?v=.*$/, '')}`, import.meta.url)), `${name} is missing`);
  }
  const manifest = JSON.parse(file('manifest.webmanifest'));
  for (const icon of manifest.icons) assert.doesNotThrow(() => readFileSync(new URL(`../${icon.src}`, import.meta.url)), `${icon.src} is missing`);
});

test('a resort that opened before its planned date has no out-of-season days until that date', () => {
  // The forecast file marks every day before the list's opening date, whatever the lifts do.
  const days = ['2026-11-21', '2026-11-22', '2026-11-28'].map((date, n) => DAY(date, 90 - n, { lifts_may_stop: n < 2 ? 'out_of_season' : 'low' }));
  const early = { ...FORECAST, levels: [{ key: 'top', elevation_m: 3000, days }] };
  const asListed = app.levelView(early, 'top');
  assert.deepEqual(asListed.days.map((d) => d.lifts.kind), ['off', 'off', 'low']);
  assert.equal(asListed.best, 'Best: Sat 88'); // 28 Nov, the only day inside the planned season
  const opened = app.levelView(early, 'top', '2026-11-28');
  assert.deepEqual(opened.days.map((d) => d.lifts.kind), ['early', 'early', 'low']);
  assert.equal(opened.days[0].lifts.text, 'Opened early · no lift estimate');
  assert.equal(opened.best, 'Best: Sat 90'); // 21 Nov now counts
  assert.equal(opened.offDays, 0);
  // A day after the season's end stays out of season even for a resort that is open.
  assert.equal(app.liftsView(DAY('2027-05-03', 80, { lifts_may_stop: 'out_of_season' }), '2026-11-28').kind, 'off');

  const row = { id: 'fr-tignes', name: 'Tignes', state: 'open', country_name: 'France', region: 'Savoie', season_opens: '2026-11-28', season_ends: '2027-05-02' };
  const status = { state: 'open', season: { opens: '2026-11-28', ends: '2027-05-02', phase: 'running' } };
  const open = app.resortHtml(row, 'forecast', status, early, false, 'top', '');
  assert.ok(open.includes('Opened early · no lift estimate'));
  assert.ok(!open.includes('Out of season'));
  assert.ok(!open.includes('score-off'));
  // Closed and not yet opened: the days stay out of season.
  const closed = app.resortHtml({ ...row, state: 'closed' }, 'forecast', { state: 'closed', season: { opens: '2026-11-28', ends: '2027-05-02', phase: 'before' } }, early, false, 'top', '');
  assert.ok(closed.includes('Out of season'));
  assert.ok(!closed.includes('Opened early'));
});

test('the main reason under a score below 80 (engine 0.2.3: limits)', () => {
  assert.equal(app.whyText({ score: 72, limits: ['cloud'] }), 'In cloud');
  assert.equal(app.whyText({ score: 55, limits: ['cold', 'wind'] }), 'Very cold · strong wind');
  assert.equal(app.whyText({ score: 0, limits: ['wind', 'gusts'] }), 'Strong wind', 'strong wind says it');
  assert.equal(app.whyText({ score: 40, limits: ['gusts', 'snowfall'] }), 'Gusts · heavy snowfall');
  assert.equal(app.whyText({ score: 85, limits: ['cloud'] }), '', 'only under 80');
  assert.equal(app.whyText({ score: 50 }), '', 'files from before 0.2.3 have no limits');
  assert.equal(app.whyText({ score: 50, limits: ['something new'] }), '', 'an unknown code is left out');
  const days = [DAY('2026-11-21', 72, { lifts_may_stop: 'low', limits: ['cloud'] }), DAY('2026-11-22', 100, { lifts_may_stop: 'low' })];
  const html = app.forecastHtml({ ...FORECAST, levels: [{ key: 'top', elevation_m: 3000, days }] }, 'top');
  assert.ok(html.includes('<div class="day-why">In cloud</div>'));
  assert.equal(html.split('day-why').length - 1, 1, 'none under the 100');
});

// ---------------------------------------------------------------- the satellite picture

const SATELLITE = {
  schema: 1,
  id: 'at-soelden',
  generated_at: '2026-11-16T02:14:09Z',
  image: { file: 'at-soelden.webp', taken_at: '2026-11-15T10:27:31Z', date: '2026-11-15', width: 1200, height: 1200, bytes: 178212, side_m: 12000, cloud: 0, cloud_shadow: 0, snow: 0.43, sun_elevation: 23.4, brightened: 1, scene: 'S2B_T32TPT_20261115T102731_L2A', tile: '32TPT', platform: 'sentinel-2b' },
  newest_pass: '2026-11-15',
  source: { label: 'Copernicus Sentinel-2', credit: 'Contains modified Copernicus Sentinel data 2026', url: 'https://dataspace.copernicus.eu', via: 'AWS Open Data' },
};
const SOELDEN_ROW = { id: 'at-soelden', name: 'Sölden', state: 'open', country_name: 'Austria', region: 'Tirol' };

test('days between two dates', () => {
  assert.equal(app.daysBetween('2026-11-15', '2026-11-21'), 6);
  assert.equal(app.daysBetween('2026-12-30', '2027-01-02'), 3);
  assert.equal(app.daysBetween('2026-03-28', '2026-03-30'), 2, 'the night the clocks change is a whole day too');
  assert.equal(app.daysBetween('2026-11-21', '2026-11-15'), -6);
  assert.equal(app.daysBetween('yesterday', '2026-11-15'), null);
});

test('the satellite picture: what the tab says', () => {
  const view = app.satelliteView(SATELLITE, 'Sölden', NOW);
  assert.equal(view.src, 'data/satellite/at-soelden.webp?d=20261115');
  assert.equal(view.alt, 'Satellite image of Sölden, 15 Nov 2026');
  assert.deepEqual([view.date, view.ago, view.note, view.low], ['15 Nov 2026', '6 days ago', '', false]);
  assert.equal(view.frame, 'True colour · 12 km across · north up');
  assert.equal(view.credit, 'Contains modified Copernicus Sentinel data 2026');
  assert.deepEqual([view.width, view.height], [1200, 1200]);
  assert.equal(app.satelliteView({ ...SATELLITE, image: { ...SATELLITE.image, date: '2026-11-21' } }, 'Sölden', NOW).ago, 'today');
  assert.equal(app.satelliteView({ ...SATELLITE, image: { ...SATELLITE.image, date: '2026-11-20' } }, 'Sölden', NOW).ago, 'yesterday');
  assert.equal(app.satelliteView({ ...SATELLITE, image: { ...SATELLITE.image, date: '2026-11-22' } }, 'Sölden', NOW).ago, '', 'a device whose clock is behind says nothing');
  // The credit comes from the file; without one it is built from the picture's own year.
  const lastYear = app.satelliteView({ ...SATELLITE, source: undefined, image: { ...SATELLITE.image, date: '2025-12-28' } }, 'Sölden', NOW);
  assert.equal(lastYear.credit, 'Contains modified Copernicus Sentinel data 2025');
});

test('the satellite picture: why it is not newer', () => {
  const cloudy = app.satelliteView({ ...SATELLITE, newest_pass: '2026-11-21' }, 'Sölden', NOW);
  assert.equal(cloudy.note, 'Newer passes of the satellite, the last on 21 Nov, were not clear over the resort.');
  // No pass at all for ten days and more: in the far north in midwinter the satellite does not record.
  const yllas = { ...SATELLITE, newest_pass: '2026-11-05', image: { ...SATELLITE.image, file: 'fi-yllas.webp', date: '2026-11-05', sun_elevation: 6.3, brightened: 2.36 } };
  const north = app.satelliteView(yllas, 'Ylläs', NOW);
  assert.equal(north.ago, '16 days ago');
  assert.equal(north.note, 'No pass since then: in midwinter the sun is too low this far north for the satellite to record.');
  assert.equal(north.low, true);
  // Ylläs as it was on 22.11.2026: the picture of the 5th, cloud on the 8th, and nothing after.
  const both = app.satelliteView({ ...yllas, newest_pass: '2026-11-08' }, 'Ylläs', NOW);
  assert.equal(both.note, 'Newer passes of the satellite, the last on 8 Nov, were not clear over the resort. No pass since then: in midwinter the sun is too low this far north for the satellite to record.');
  const gap = app.satelliteView({ ...SATELLITE, newest_pass: '2026-11-08', image: { ...SATELLITE.image, date: '2026-11-08' } }, 'Sölden', NOW);
  assert.equal(gap.note, 'No pass since then.');
  const nine = app.satelliteView({ ...SATELLITE, newest_pass: '2026-11-12', image: { ...SATELLITE.image, date: '2026-11-08' } }, 'Sölden', NOW);
  assert.equal(nine.note, 'Newer passes of the satellite, the last on 12 Nov, were not clear over the resort.', 'nine days without a pass say nothing yet');
  assert.equal(app.satelliteView({ ...SATELLITE, newest_pass: '2026-11-01' }, 'Sölden', NOW).note, '', 'a newest pass before the picture says nothing');
});

test('the satellite picture: files without one, and names that are not file names', () => {
  assert.equal(app.satelliteView(null, 'Sölden', NOW), null);
  assert.equal(app.satelliteView({ ...SATELLITE, image: null }, 'Sölden', NOW), null);
  assert.equal(app.satelliteView({ ...SATELLITE, image: { ...SATELLITE.image, date: 'soon' } }, 'Sölden', NOW), null);
  for (const name of ['../index.html', 'https://example.org/x.webp', 'a.webp?x=1', 'a b.webp', 'x.png', 7]) {
    assert.equal(app.satelliteView({ ...SATELLITE, image: { ...SATELLITE.image, file: name } }, 'Sölden', NOW), null, String(name));
  }
});

test('the Satellite tab', () => {
  const html = app.satelliteHtml(SOELDEN_ROW, SATELLITE, NOW);
  assert.match(html, /^<a class="sat-pic" href="#\/resort\/at-soelden\/satellite\/full" aria-label="Open the satellite image full screen">/);
  assert.match(html, /<img src="data\/satellite\/at-soelden\.webp\?d=20261115" alt="Satellite image of Sölden, 15 Nov 2026" width="1200" height="1200"/);
  assert.match(html, /<span>Image taken<\/span><span class="v">15 Nov 2026 · 6 days ago<\/span>/);
  assert.match(html, /<div class="fine">True colour · 12 km across · north up\. Contains modified Copernicus Sentinel data 2026\.<\/div>$/);
  assert.equal((html.match(/class="fine"/g) || []).length, 1, 'no second line when there is nothing to explain');
  const cloudy = app.satelliteHtml(SOELDEN_ROW, { ...SATELLITE, newest_pass: '2026-11-21' }, NOW);
  assert.match(cloudy, /<div class="fine">Newer passes of the satellite, the last on 21 Nov, were not clear over the resort\.<\/div>/);
  const low = app.satelliteHtml(SOELDEN_ROW, { ...SATELLITE, image: { ...SATELLITE.image, brightened: 2.36 } }, NOW);
  assert.match(low, /north up\. Taken with the sun low over the horizon and brightened\. Contains modified/);
  // No picture yet: the backend has no file for the resort, or the file says that no pass was clear.
  assert.match(app.satelliteHtml(SOELDEN_ROW, null, NOW), /<h2>No satellite image yet<\/h2>/);
  assert.match(app.satelliteHtml(SOELDEN_ROW, { ...SATELLITE, image: null, newest_pass: '2026-11-08' }, NOW), /<h2>No clear image yet<\/h2>/);
  assert.match(app.satelliteHtml(SOELDEN_ROW, { ...SATELLITE, image: null, newest_pass: null }, NOW), /<h2>No satellite image yet<\/h2>/);
  // Text from the file is escaped.
  const odd = app.satelliteHtml({ ...SOELDEN_ROW, name: 'A "B" <C>' }, { ...SATELLITE, source: { credit: '<b>x</b>' } }, NOW);
  assert.ok(odd.includes('alt="Satellite image of A &quot;B&quot; &lt;C&gt;, 15 Nov 2026"'));
  assert.ok(odd.includes('&lt;b&gt;x&lt;/b&gt;.'));
});

test('the Satellite tab inside the resort screen: loading, and offline', () => {
  const loading = app.resortHtml(SOELDEN_ROW, 'satellite', SOELDEN, FORECAST, false, 'top', '<p>Loading…</p>', {}, undefined);
  assert.match(loading, /id="tab"><p>Loading…<\/p>/);
  const shown = app.resortHtml(SOELDEN_ROW, 'satellite', SOELDEN, FORECAST, false, 'top', '', {}, SATELLITE);
  assert.match(shown, /id="tab"><a class="sat-pic"/);
  const none = app.resortHtml(SOELDEN_ROW, 'satellite', SOELDEN, FORECAST, false, 'top', '', {}, null);
  assert.match(none, /No satellite image yet/);
  const offline = app.resortHtml(SOELDEN_ROW, 'satellite', SOELDEN, FORECAST, false, 'top', '', { status: null, forecast: null, satellite: '2026-11-21T13:40:00Z' }, SATELLITE);
  assert.match(offline, /id="tab"><div class="banner banner-off">.*Offline · showing data saved 21 Nov.*<a class="sat-pic"/s);
  const elsewhere = app.resortHtml(SOELDEN_ROW, 'status', SOELDEN, FORECAST, false, 'top', '', { status: null, forecast: null, satellite: '2026-11-21T13:40:00Z' }, SATELLITE);
  assert.ok(!elsewhere.includes('banner-off'), 'the Status tab does not speak for the satellite file');
  assert.match(app.SAT_MISSING, /has not been loaded on this device yet/);
});

test('the satellite picture on the whole screen', () => {
  const fitted = app.viewerHtml(SOELDEN_ROW, SATELLITE, false, NOW);
  assert.match(fitted, /<a class="viewer-btn" href="#\/resort\/at-soelden\/satellite" data-close aria-label="Close the satellite image">/);
  assert.match(fitted, /<b>Sölden<\/b><span>Satellite image · 15 Nov 2026<\/span>/);
  assert.match(fitted, /<button type="button" class="viewer-btn" data-zoom aria-pressed="false">Full size<\/button>/);
  assert.match(fitted, /<div class="viewer-stage" id="stage"><img src="data\/satellite\/at-soelden\.webp\?d=20261115"/);
  assert.match(fitted, /Contains modified Copernicus Sentinel data 2026\./, 'the credit stays with the picture');
  const zoomed = app.viewerHtml(SOELDEN_ROW, SATELLITE, true, NOW);
  assert.match(zoomed, /aria-pressed="true">Fit<\/button>/);
  assert.match(zoomed, /<div class="viewer-stage zoomed" id="stage">/);
  assert.match(zoomed, /Drag to move/);
  assert.equal(app.viewerHtml(SOELDEN_ROW, { ...SATELLITE, image: null }, false, NOW), '');
});


// ---------------------------------------------------------------- avalanche danger (0.7)

const AT = new Date(2026, 10, 24, 10, 0, 0); // 24 Nov 2026, 10:00 on the device's clock
const local = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0, 0).toISOString();
const RATING = (level, lower = null, upper = null, period = 'all_day') => ({ level, name: ['', 'low', 'moderate', 'considerable', 'high', 'very_high'][level], lower_bound: lower, upper_bound: upper, period });
const BULLETIN = (level, ratings, extra = {}) => ({
  schema: 1, id: 'fr-val-thorens', level, ratings, problems: [], region: 'Vanoise', region_id: 'FR-10',
  issued_at: local(2026, 11, 23, 16), valid_from: local(2026, 11, 23, 16), valid_until: local(2026, 11, 24, 18),
  service: { name: 'Météo-France', url: 'https://meteofrance.com/meteo-montagne' },
  source: { kind: 'liftradar', label: 'LiftRadar', url: 'https://liftradar.eu/resort?r=fr/val-thorens', checked_at: local(2026, 11, 24, 8) },
  ...extra,
});
// Val Thorens as LiftRadar carried it on 23 Nov 2026: split by elevation and by the time of day.
const VAL_THORENS = BULLETIN(4, [RATING(3, null, 2800, 'later'), RATING(4, 2800, null, 'earlier'), RATING(3, 2800, null, 'later')]);
const VT_ROW = { id: 'fr-val-thorens', name: 'Val Thorens', state: 'open', country_name: 'France', region: 'Savoie', avalanche: { level: 4, valid_until: VAL_THORENS.valid_until } };
const SNOW_70 = [{ elevation_m: 3200, snow_cm: 70, snow_72h_cm: 70, reported: true }];
const WIND = [{ elevation_m: 3195, wind_kmh: 43, from_deg: 160, snow_72h_cm: 70 }, { elevation_m: 2800, wind_kmh: 39, from_deg: 152, snow_72h_cm: 64 }];
const SETTLING = { key: 'new_snow_settling', after: 'heavy_snowfall', since: '2026-11-23', levels: SNOW_70 };
const DRIFTED = { key: 'drifted_snow', after: 'wind_loading', since: '2026-11-25', lee: ['N', 'NW'], levels: WIND };
const SIGNS = {
  schema: 1, record_days: 3,
  days: [
    { date: '2026-11-23', signs: [{ key: 'heavy_snowfall', strength: 'strong', levels: SNOW_70 }] }, // before today: not shown
    { date: '2026-11-24', signs: [SETTLING] },
    { date: '2026-11-25', signs: [{ key: 'wind_loading', strength: 'strong', lee: ['N', 'NW'], levels: WIND }, SETTLING] },
    { date: '2026-11-26', signs: [DRIFTED, SETTLING] },
    { date: '2026-11-27', signs: [DRIFTED, SETTLING] },
    { date: '2026-11-28', signs: [DRIFTED, { key: 'a_sign_of_a_later_version', levels: [] }] },
  ],
};
const VT_DAYS = ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30'].map((date) => DAY(date, 90));
const VT_FORECAST = { generated_at: AT.toISOString(), timezone: 'Europe/Paris', models: ['ECMWF IFS'], levels: [{ key: 'top', elevation_m: 3195, days: VT_DAYS }], avalanche_signs: SIGNS };

test('the official bulletin: the highest level leads, split by elevation and by the time of day', () => {
  const view = app.bulletinView(VAL_THORENS, AT.getTime());
  assert.equal(view.level, 4);
  assert.equal(view.word, 'High');
  assert.equal(view.where, 'above 2800 m earlier in the day');
  assert.deepEqual(view.others, [{ level: 3, word: 'Considerable', text: 'later in the day' }], 'below and above 2800 m later in the day: every elevation');
  assert.deepEqual(view.groups, [
    { title: 'Earlier in the day', rows: [{ level: 4, word: 'High', where: 'above 2800 m' }] },
    { title: 'Later in the day', rows: [{ level: 3, word: 'Considerable', where: 'at all elevations' }] },
  ]);
  assert.equal(view.outOfDate, false);
  assert.equal(view.meta, 'Météo-France · Vanoise · issued 23 Nov, 16:00 · valid until 24 Nov, 18:00');
  assert.deepEqual(view.service, { name: 'Météo-France', url: 'https://meteofrance.com/meteo-montagne' });

  const avoriaz = app.bulletinView(BULLETIN(3, [RATING(2, null, 2000), RATING(3, 2000, null)]), AT.getTime());
  assert.equal(avoriaz.where, 'above 2000 m');
  assert.deepEqual(avoriaz.others, [{ level: 2, word: 'Moderate', text: 'below 2000 m' }]);
  assert.deepEqual(avoriaz.groups, [{ title: '', rows: [{ level: 3, word: 'Considerable', where: 'above 2000 m' }, { level: 2, word: 'Moderate', where: 'below 2000 m' }] }]);

  const whole = app.bulletinView(BULLETIN(4, [RATING(4)], { problems: ['new_snow', 'persistent_weak_layers', 'something_new'] }), AT.getTime());
  assert.equal(whole.where, '');
  assert.deepEqual(whole.others, []);
  assert.deepEqual(whole.problems, ['New snow', 'Persistent weak layers', 'Something new']);
  assert.equal(app.boundText('treeline', null), 'above the treeline');
  assert.equal(app.boundText(1800, 2400), 'between 1800 m and 2400 m');
  assert.equal(app.bulletinView(null), null);
});

test('the official level is never shown lower than the file holds', () => {
  // the source's own figure for the day is above every rating row: the higher one stands
  const higher = app.bulletinView(BULLETIN(4, [RATING(3)]), AT.getTime());
  assert.equal(higher.level, 4);
  assert.equal(higher.where, '', 'nothing is said about where: the rows do not tell');
  assert.deepEqual(higher.others, [{ level: 3, word: 'Considerable', text: '' }]);
  // and the other way round
  assert.equal(app.bulletinView(BULLETIN(2, [RATING(2, null, 1800), RATING(4, 1800, null)]), AT.getTime()).level, 4);
  // the short form of the list's row is enough for the level
  const short = app.bulletinView({ level: 3, valid_until: local(2026, 11, 24, 18) }, AT.getTime());
  assert.equal(short.level, 3);
  assert.equal(short.word, 'Considerable');
  // a level that is no level is no level, not a low one
  for (const odd of [0, 6, 2.5, '3', null, undefined]) assert.equal(app.bulletinView({ level: odd, valid_until: local(2026, 11, 24, 18) }, AT.getTime()).level, null);
});

test('a bulletin past its validity keeps its level and is marked out of date', () => {
  const late = new Date(2026, 10, 24, 19, 0, 0).getTime();
  const view = app.bulletinView(VAL_THORENS, late);
  assert.equal(view.level, 4);
  assert.equal(view.outOfDate, true);
  assert.equal(view.stamp, 'Bulletin of 23 Nov · out of date');
  const card = app.avalancheCardHtml(VT_ROW, { bulletin: VAL_THORENS, collected: true }, null, new Date(late));
  assert.match(card, /<span class="av av-4 av-big">/, 'the colour stays: a stale 4 must not look like a lower level');
  assert.match(card, /<span class="chip chip-old">Bulletin of 23 Nov · out of date<\/span>/);
  const strip = app.avalancheStripHtml(VT_ROW, { bulletin: VAL_THORENS }, new Date(late));
  assert.match(strip, /<b>Avalanche, official: High<\/b>/);
  assert.ok(!strip.includes('today'), 'an old bulletin is not called today’s');
  assert.match(strip, /Bulletin of 23 Nov · out of date/);
});

test('no rating for want of snow, and no bulletin at all', () => {
  const none = app.bulletinView(BULLETIN(null, [{ level: null, name: 'no_snow', lower_bound: null, upper_bound: null, period: 'all_day' }], { service: { name: 'Servei Meteorològic d’Andorra', url: 'https://www.meteo.ad/' } }), AT.getTime());
  assert.equal(none.level, null);
  assert.equal(none.unrated, 'No rating: not enough snow');
  assert.equal(app.bulletinView({ level: null, rating: 'no_snow', valid_until: local(2026, 11, 24, 18) }, AT.getTime()).unrated, 'No rating: not enough snow');
  assert.equal(app.bulletinView({ level: null, rating: 'no_rating' }, AT.getTime()).unrated, 'No rating in the current bulletin');

  const row = { id: 'bg-bansko', name: 'Bansko', state: 'closed', avalanche: null };
  const said = app.avalancheCardHtml(row, { bulletin: null, collected: true }, null, AT);
  assert.match(said, /<b>No official avalanche bulletin here<\/b><span>We have no official avalanche bulletin for this area, so the danger is not known\. Ask locally/);
  assert.ok(!said.includes('class="av '), 'never a level of our own');
  // data of a backend that does not collect bulletins yet: nothing is claimed either way
  assert.equal(app.avalancheCardHtml(row, { bulletin: null, collected: false }, null, AT), '');
  assert.equal(app.avalancheStripHtml(row, { bulletin: null, collected: true }, AT), '');
  assert.deepEqual(app.avalancheSummary(null, true), { level: null, text: 'No official avalanche bulletin', note: '', old: '' });
  assert.equal(app.avalancheSummary(null, false), null);
});

test('the signs from the weather as words', () => {
  const full = (sign) => app.signView(sign, '2026-11-24');
  const short = (sign) => app.signView(sign, '2026-11-24', true);
  const loading = { key: 'wind_loading', strength: 'strong', lee: ['N', 'NW'], levels: WIND };
  assert.deepEqual(full(loading), { key: 'wind_loading', name: 'Wind drifting snow', text: 'to 43 km/h at 3195 m and 39 km/h at 2800 m, from the south-south-east, on 70 cm of new snow', since: '', sinceDay: '' });
  assert.equal(short(loading).text, 'to 43 km/h from SSE, on fresh snow');
  assert.equal(full({ key: 'strong_wind', levels: [{ elevation_m: 2560, wind_kmh: 45, from_deg: 248 }] }).text, 'to 45 km/h at 2560 m, from the west-south-west, enough to drift loose snow');
  assert.equal(full({ key: 'strong_wind', levels: [{ elevation_m: 1300, wind_kmh: 40 }] }).text, 'to 40 km/h at 1300 m, enough to drift loose snow', 'below 1500 m the direction is not known');
  assert.equal(full({ key: 'heavy_snowfall', levels: [{ elevation_m: 3279, snow_cm: 24, snow_72h_cm: 30 }, { elevation_m: 2200, snow_cm: 18, snow_72h_cm: 20 }] }).text, '24 cm in 24 h at 3279 m');
  assert.equal(full({ key: 'heavy_snowfall', levels: [{ elevation_m: 3000, snow_cm: 12, snow_72h_cm: 55 }] }).text, '55 cm in 3 days at 3000 m');
  assert.equal(full({ key: 'heavy_snowfall', levels: SNOW_70 }).text, '70 cm reported at 3200 m');
  assert.deepEqual(full(SETTLING), { key: 'new_snow_settling', name: 'New snow settling', text: 'after 70 cm reported at 3200 m', since: 'Since Mon 23', sinceDay: '2026-11-23' });
  assert.equal(full(DRIFTED).text, 'may lie in terrain traps, mostly on slopes facing north to north-west');
  assert.equal(full(DRIFTED).since, 'Since Wed', 'a day of the list below needs no number');
  assert.equal(short(DRIFTED).text, 'in terrain traps, mostly on N to NW slopes');
  assert.equal(full({ key: 'drifted_snow', since: '2026-11-25', levels: [] }).text, 'may lie in terrain traps', 'no lee side without a wind direction');
  assert.equal(full({ key: 'rain_on_snow', levels: [{ elevation_m: 2200, rain_mm: 6 }] }).text, '6 mm of rain at 2200 m');
  assert.equal(full({ key: 'warming', first: true, levels: [{ elevation_m: 2200, t_max_c: 4, rise_c: 9, freezing_level_m: 3050 }] }).text, 'to 4° at 2200 m, 9° warmer than the day before, freezing level 3050 m, the first thaw in a month');
  assert.equal(full({ key: 'after_rain', since: '2026-11-26', levels: [] }).text, 'wet, weakened snow; an icy crust once it freezes');
  assert.equal(full({ key: 'recent_thaw', since: '2026-11-26', levels: [] }).text, 'wet snow by day; a crust once it freezes');
  assert.equal(full({ key: 'crust_below_new_snow', levels: [{ elevation_m: 2200, snow_cm: 15, thaw: '2026-11-26' }] }).text, '15 cm of new snow on an icy crust from the thaw of Thu 26');
  assert.match(full({ key: 'weak_layer_possible', levels: [{ elevation_m: 2200, dry_days: 7 }] }).text, /^new snow on a long cold, dry spell at 2200 m: a weak layer may lie under it$/);
  assert.equal(full({ key: 'a_sign_of_a_later_version', levels: [] }), null, 'a text is never made up');
  assert.equal(app.windFrom(0), 'the north');
  assert.equal(app.windFrom(359, true), 'N');
  assert.equal(app.windFrom(null), '');
});

test('the Status card: one line per sign, its days joined', () => {
  assert.deepEqual(app.signLines(VT_FORECAST, '2026-11-24'), [
    { when: 'Tue 24 – Fri 27', name: 'New snow settling', text: 'after 70 cm reported at 3200 m on Mon 23' },
    { when: 'Wed 25', name: 'Wind drifting snow', text: 'to 43 km/h at 3195 m and 39 km/h at 2800 m, from the south-south-east, on 70 cm of new snow' },
    { when: 'Thu 26 – Sat 28', name: 'Drifted snow', text: 'may lie in terrain traps, mostly on slopes facing north to north-west' },
  ]);
  assert.deepEqual(app.signLines(VT_FORECAST, '2026-11-29'), [], 'days that have passed are not shown');
  assert.deepEqual(app.signLines({ levels: [] }), []);
  assert.deepEqual(app.signLines(null), []);
  // a sign of the day on two days running: one line, the stronger day's numbers; after a gap, a new line
  const windy = (date, kmh) => ({ date, signs: [{ key: 'strong_wind', levels: [{ elevation_m: 2560, wind_kmh: kmh }] }] });
  const lines = app.signLines({ avalanche_signs: { days: [windy('2026-11-24', 40), windy('2026-11-25', 61), windy('2026-11-27', 38)] } }, '2026-11-24');
  assert.deepEqual(lines.map((line) => [line.when, line.text]), [['Tue 24 – Wed 25', 'to 61 km/h at 2560 m, enough to drift loose snow'], ['Fri 27', 'to 38 km/h at 2560 m, enough to drift loose snow']]);

  const card = app.avalancheCardHtml(VT_ROW, { bulletin: VAL_THORENS, collected: true }, VT_FORECAST, AT);
  assert.match(card, /<div class="label">Avalanche danger · off-piste<\/div><a class="av-details" href="#\/resort\/fr-val-thorens\/avalanche">Details/);
  assert.match(card, /<span class="av av-4 av-big"><span class="sr">Avalanche danger <\/span>4<\/span><div><span class="av-word">High<\/span><span class="av-where">above 2800 m earlier in the day<\/span><span class="av-other">3 Considerable later in the day<\/span>/);
  assert.match(card, /<div class="av-sub">From the weather\*<\/div><div class="sign">.*<b>Tue 24 – Fri 27 · New snow settling\*<\/b> <span class="sign-text">after 70 cm reported at 3200 m on Mon 23<\/span>/s);
  assert.ok(card.includes(app.PISTE_LINE) && card.includes(app.STAR_LINE), 'the two fixed lines close every avalanche block');
  // while the bulletin's file loads, the list's row gives the level
  assert.match(app.avalancheCardHtml(VT_ROW, { bulletin: undefined, collected: true }, null, AT), /<span class="av av-4 av-big">.*<span class="av-word">High<\/span>/s);
  // the signs alone, from a backend that does not collect bulletins yet
  const alone = app.avalancheCardHtml({ ...VT_ROW, avalanche: null }, { bulletin: null, collected: false }, VT_FORECAST, AT);
  assert.match(alone, /From the weather\*/);
  assert.ok(!alone.includes('class="av ') && !alone.includes('No official'));
});

test('the avalanche card is on the Status tab for every state, and not in the Resorts list', () => {
  const av = { bulletin: VAL_THORENS, collected: true };
  const tile = { lifts: { open: 3, total: 9 }, slopes: { open: 2, total: 9 }, checked_at: AT.toISOString(), source: { kind: 'liftradar', label: 'LiftRadar' } };
  for (const state of ['open', 'closed_today', 'closed']) {
    const html = app.statusHtml({ ...VT_ROW, state }, { ...tile, state, season: { phase: state === 'closed' ? 'before' : 'running', opens: '2026-11-21', ends: '2027-05-02' } }, AT, av, VT_FORECAST);
    assert.equal(html.split('class="panel av-card"').length, 2, `${state}: the card, once`);
  }
  const noData = app.statusHtml({ ...VT_ROW, state: 'no_data', reason: 'not_collected' }, null, AT, av, VT_FORECAST);
  assert.match(noData, /No live data from the resort.*class="panel av-card"/s, 'a resort without live data still has its bulletin (Engelberg)');
  assert.ok(!app.statusHtml(SOELDEN_ROW, SOELDEN, NOW).includes('av-card'), 'nothing known and nothing to say: no card');
  const rows = app.joinRows({ resorts: [{ id: 'fr-val-thorens', name: 'Val Thorens', country: 'FR', country_name: 'France' }] }, { resorts: [{ id: 'fr-val-thorens', state: 'open', avalanche: { level: 4, valid_until: VAL_THORENS.valid_until } }] }, AT.getTime());
  assert.deepEqual(rows[0].avalanche, { level: 4, valid_until: VAL_THORENS.valid_until });
  const list = app.resortsHtml(rows, new Set(['fr-val-thorens']), '', AT.toISOString());
  assert.ok(!list.includes('class="av') && !/avalanche/i.test(list), 'the Resorts tab carries no avalanche level');
});

test('the Forecast tab: today’s official level on top, the signs under their days', () => {
  const strip = app.avalancheStripHtml(VT_ROW, { bulletin: VAL_THORENS, collected: true }, AT);
  assert.match(strip, /^<a class="av-strip" href="#\/resort\/fr-val-thorens\/avalanche"><span class="av av-4">.*<b>Avalanche, official today: High<\/b><span>above 2800 m earlier in the day · Météo-France, 23 Nov<\/span>/s);
  const html = app.forecastHtml(VT_FORECAST, 'top', AT.getTime(), null, strip);
  assert.ok(html.indexOf('av-strip') < html.indexOf('fc-head'), 'the level stands above the days');
  const days = html.split(/<div class="day(?: off)?">/).slice(1);
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((d) => d.split('<div class="sign">').length - 1), [1, 2, 2, 2, 1, 0, 0], 'a day without a sign has no line');
  assert.match(days[1], /<div class="day-signs"><div class="sign">.*<b>Wind drifting snow\*<\/b> <span class="sign-text">to 43 km\/h from SSE, on fresh snow<\/span>.*<span class="since">Since Mon 23 ·<\/span> <b>New snow settling\*<\/b>/s);
  assert.match(days[2], /<span class="since">Since Wed ·<\/span> <b>Drifted snow\*<\/b> <span class="sign-text">in terrain traps, mostly on N to NW slopes<\/span>/);
  assert.ok(html.includes(app.STAR_LINE));
  const plain = app.forecastHtml({ ...VT_FORECAST, avalanche_signs: undefined }, 'top', AT.getTime());
  assert.ok(!plain.includes('day-signs') && !plain.includes(app.STAR_LINE) && !plain.includes('av-strip'), 'a forecast of an older engine looks as before');
  const inResort = app.resortHtml(VT_ROW, 'forecast', null, VT_FORECAST, false, 'top', '', {}, undefined, { bulletin: VAL_THORENS, collected: true });
  assert.match(inResort, /class="av-strip"/);
});

test('the Details screen and the Favourites card', () => {
  const html = app.avalancheDetailHtml(VT_ROW, { bulletin: VAL_THORENS, collected: true }, VT_FORECAST, AT);
  assert.match(html, /<a class="backline" href="#\/resort\/fr-val-thorens" data-up>.*<span>Val Thorens<\/span><\/a><h1>Avalanche danger<\/h1>/s);
  assert.match(html, /<div class="label">Earlier in the day<\/div><div class="av-row"><span class="av av-4">.*<b>High<\/b> above 2800 m<\/span><\/div>/s);
  assert.match(html, /<div class="label">Later in the day<\/div><div class="av-row"><span class="av av-3">.*<b>Considerable<\/b> at all elevations<\/span><\/div>/s);
  assert.match(html, /Not named in this bulletin’s data\. The full bulletin describes them\./);
  assert.match(html, /<a class="cta cta-ink" href="https:\/\/meteofrance\.com\/meteo-montagne" target="_blank" rel="noopener">Full bulletin at Météo-France/);
  assert.equal(html.split('<div class="av-day">').length - 1, 5, 'the five days that have a sign');
  assert.match(html, /Avalanche bulletin by Météo-France, read through LiftRadar\./);
  assert.match(html, /href="#\/about\/avalanche">How to read the avalanche information/);
  const withProblems = app.avalancheDetailHtml(VT_ROW, { bulletin: BULLETIN(4, [RATING(4)], { problems: ['new_snow', 'wind_slab'] }) }, null, AT);
  assert.match(withProblems, /<span class="pill">New snow<\/span><span class="pill">Wind slab<\/span>/);
  assert.ok(!withProblems.includes('From the weather'), 'no forecast signs: no such block, and no line saying so');

  const fav = app.favouriteHtml(VT_ROW, null, 0, { bulletin: VAL_THORENS, collected: true });
  assert.match(fav, /<a class="fav-av" href="#\/resort\/fr-val-thorens\/avalanche"><span class="av av-4">.*<b>High<\/b> <span>· avalanche danger off-piste<\/span>/s);
  assert.match(app.favouriteHtml({ ...VT_ROW, avalanche: null }, null, 0, { bulletin: null, collected: true }), /<b>No official avalanche bulletin<\/b>/);
  assert.ok(!app.favouriteHtml({ ...VT_ROW, avalanche: null }, null, 0, { bulletin: null, collected: false }).includes('fav-av'));
  assert.ok(!app.favouriteHtml(SOELDEN_ROW, SOELDEN).includes('fav-av'), 'as before for data without bulletins');
});

test('About › Avalanche information', () => {
  const html = app.avalancheInfoHtml();
  assert.match(html, /<h1>Avalanche information\*<\/h1><p class="av-star">\* For guidance only and in no way a permission to ride off-piste\.<\/p>/);
  assert.match(html, /<h2 class="strong">We use official warning levels, where available\.<\/h2>/);
  assert.match(html, /<b>Considerable\.<\/b> Weak bonds on many steep slopes; one skier can start an avalanche\. <b>Most fatal accidents happen at this level, as people tend to underestimate the danger!<\/b>/);
  assert.equal(html.split('<b>Most fatal').length, 2, 'level 3 alone carries the bold warning');
  for (const level of [1, 2, 3, 4, 5]) assert.ok(html.includes(`class="av av-${level}"`));
  assert.match(html, /<b>Terrain traps<\/b> are gullies, bowls, hollows and the foot of steep slopes\./);
  assert.match(html, /No sign does not mean safe: the danger is simply not known\./);
});

// Boris's rule of 23 Nov 2026: "our signs should never be more optimistic than the officials". Every
// combination of an official bulletin, its age and our signs is drawn on every screen that shows
// avalanche danger, and each drawing must (1) lead with the file's highest level in its colour,
// (2) use no word that plays the danger down, (3) say nothing at all about a day without signs.
test('nothing the app draws reads milder than the official level', () => {
  const SOOTHING = /\b(safe|safer|stable|calm|quiet|harmless|all[- ]clear|no danger|no risk|low risk|no signs?|no warning|nothing to report|good conditions|fine conditions|settled|secure to|ok to)\b/i;
  const tagless = (html) => html.replace(/<svg.*?<\/svg>/gs, ' ').replace(/<[^>]+>/g, ' ');
  const ratingSets = (level) => {
    const sets = [[RATING(level)], []]; // one rating for the whole day; the level alone (the list's short form has no rows)
    if (level > 1) {
      sets.push([RATING(level, 2000, null), RATING(level - 1, null, 2000)]); // lower below a height
      sets.push([RATING(level, null, null, 'later'), RATING(level - 1, null, null, 'earlier')]); // lower earlier in the day
      sets.push([RATING(1, null, 'treeline'), RATING(level, 'treeline', null)]);
      sets.push([RATING(level - 1)]); // the source's own figure above every row
    }
    return sets;
  };
  const signSets = [null, VT_FORECAST, { ...VT_FORECAST, avalanche_signs: { schema: 1, days: [], record_days: 0 } }, { ...VT_FORECAST, avalanche_signs: { schema: 1, days: [{ date: '2026-11-24', signs: [{ key: 'unknown_to_this_version' }] }] } }];
  const times = [AT, new Date(2026, 10, 25, 7, 0, 0)]; // while the bulletin holds, and the morning after
  let drawn = 0;
  for (const level of [1, 2, 3, 4, 5]) {
    for (const ratings of ratingSets(level)) {
      for (const forecast of signSets) {
        for (const now of times) {
          const bulletin = BULLETIN(level, ratings);
          const row = { ...VT_ROW, avalanche: { level, valid_until: bulletin.valid_until } };
          const av = { bulletin, collected: true };
          const screens = {
            card: app.avalancheCardHtml(row, av, forecast, now),
            cardWhileLoading: app.avalancheCardHtml(row, { bulletin: undefined, collected: true }, forecast, now),
            strip: app.avalancheStripHtml(row, av, now),
            detail: app.avalancheDetailHtml(row, av, forecast, now),
            favourite: app.favouriteHtml(row, null, 0, av),
          };
          for (const [name, html] of Object.entries(screens)) {
            const where = `${name}, level ${level}, ${JSON.stringify(ratings.map((r) => [r.level, r.lower_bound, r.upper_bound, r.period]))}, ${now.getDate()} Nov`;
            const first = /class="av av-(\d)/.exec(html);
            assert.ok(first, `${where}: the level is shown`);
            assert.equal(Number(first[1]), level, `${where}: the first level on screen is the highest of the day`);
            assert.ok(html.includes(app.AVALANCHE_WORDS[level]), `${where}: with its word`);
            const text = tagless(html);
            assert.ok(!SOOTHING.test(text), `${where}: "${(SOOTHING.exec(text) || [])[0]}" plays the danger down`);
            // "Low" is the name of level 1 and nothing else
            if (level > 1 && !ratings.some((r) => r.level === 1)) assert.ok(!/\blow\b/i.test(text), `${where}: "low" without a level 1`);
            if (now !== AT && name !== 'favourite') assert.match(html, /out of date/, `${where}: an old bulletin says so`);
            if (now !== AT) assert.ok(!/official today/.test(html), `${where}: an old bulletin is not today's`);
            drawn += 1;
          }
          // the signs are there whatever the level, and a forecast without signs adds no line at all
          const lines = app.signLines(forecast, app.today(now));
          const card = screens.card;
          assert.equal(card.split('<div class="sign">').length - 1, lines.length);
          assert.equal(card.includes('From the weather*'), lines.length > 0, 'no heading over nothing');
        }
      }
    }
  }
  assert.ok(drawn > 800, `${drawn} drawings checked`);
  // without a bulletin: never a badge, whatever the signs
  for (const forecast of signSets) {
    for (const collected of [true, false]) {
      const row = { ...VT_ROW, avalanche: null };
      const html = app.avalancheCardHtml(row, { bulletin: null, collected }, forecast, AT) + app.avalancheDetailHtml(row, { bulletin: null, collected }, forecast, AT) + app.avalancheStripHtml(row, { bulletin: null, collected }, AT);
      assert.ok(!html.includes('class="av '), 'no level of our own');
      assert.ok(!SOOTHING.test(tagless(html)));
    }
  }
  // the sign texts themselves, in both forms
  for (const day of SIGNS.days) for (const sign of day.signs) for (const short of [false, true]) {
    const view = app.signView(sign, '2026-11-24', short);
    if (view) assert.ok(!SOOTHING.test(`${view.name} ${view.text}`), `${sign.key}: ${view.text}`);
  }
});
