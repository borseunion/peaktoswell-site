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
  assert.deepEqual(app.parseRoute('#/favourites'), { name: 'favourites' });
  assert.deepEqual(app.parseRoute('#/about'), { name: 'about' });
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
  assert.match(html, /Lift and slope status for 2 resorts\./);
  assert.match(html, /Weather data by Open-Meteo\.com, CC BY 4\.0\./);
  assert.match(html, /href="https:\/\/liftradar\.eu" target="_blank" rel="noopener"/);
  assert.match(html, /The ski score rates the weather only\./);
  assert.match(html, /an estimate from the forecast, not the resort’s decision/);
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
