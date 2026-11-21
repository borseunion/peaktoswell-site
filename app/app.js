// peaktoswell – the app. One module and no build step: the browser loads this file as it is.
//
// The functions in the first half are pure (text in, text out) and are exported for the
// tests in tests/app.test.mjs. The second half touches the page and runs only in a browser.
//
// The app reads four kinds of files, all written by the backend into data/:
//   data/resorts.json            the 130 resorts (name, country, elevations, season dates)
//   data/status/index.json       one row per resort for the list
//   data/status/<id>.json        lifts, slopes and snow of one resort (missing for some)
//   data/forecast/<id>.json      seven days at three elevations

export const VERSION = '0.2'; // shown on the About screen
export const DATA = 'data/';
export const STALE_HOURS = 24; // the backend's own rule (publish.py, STALE_AFTER_HOURS)
const HOUR = 3600 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MINUS = '−';

// ---------------------------------------------------------------- text and numbers

export function esc(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (c) => map[c]);
}

/** Lower case without accents, so that "solden" finds "Sölden" and "bialka" finds "Białka". */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[łŁ]/g, 'l')
    .replace(/[øØ]/g, 'o')
    .replace(/[đĐ]/g, 'd')
    .replace(/ß/g, 'ss')
    .replace(/[æÆ]/g, 'ae')
    .toLowerCase();
}

/** 'YYYY-MM-DD' as [year, month, day], or null. */
export function ymd(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text || '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** A calendar date as '12 Dec' or '12 Dec 2026'. year: 'always', 'never', or 'auto' (only when it is not this year). */
export function fmtDate(text, year = 'auto', now = new Date()) {
  const p = ymd(text);
  if (!p) return '';
  const base = `${p[2]} ${MONTHS[p[1] - 1]}`;
  const withYear = year === 'always' || (year === 'auto' && p[0] !== now.getFullYear());
  return withYear ? `${base} ${p[0]}` : base;
}

export function weekday(text) {
  const p = ymd(text);
  return p ? DAYS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] : '';
}

/** A moment (ISO text with an offset or Z) as '21 Nov, 15:01' on the device's own clock. */
export function fmtStamp(iso) {
  const t = new Date(iso);
  if (!iso || Number.isNaN(t.getTime())) return '';
  const two = (n) => String(n).padStart(2, '0');
  return `${t.getDate()} ${MONTHS[t.getMonth()]}, ${two(t.getHours())}:${two(t.getMinutes())}`;
}

export function hoursSince(iso, now = Date.now()) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : (now - t) / HOUR;
}

/** Today's date on the device as 'YYYY-MM-DD'. */
export function today(now = new Date()) {
  const two = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** 79.6 stays '79.6', 147.0 becomes '147'. */
export function num(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
  return String(Math.round(Number(value) * 10) / 10);
}

/** A temperature with a real minus sign: '−22°'. */
export function temp(value) {
  if (value === null || value === undefined) return '–';
  const n = Math.round(value);
  return `${n < 0 ? MINUS : ''}${Math.abs(n)}°`;
}

/** [30, 31] as '30–31', [8, 8] as '8'. */
export function span(pair) {
  if (!Array.isArray(pair) || pair.length < 2 || pair[0] === null || pair[1] === null) return '';
  return pair[0] === pair[1] ? String(pair[0]) : `${pair[0]}–${pair[1]}`;
}

export function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Only web addresses are ever put into a link. */
export function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

const isNumber = (v) => typeof v === 'number' && !Number.isNaN(v);
const capital = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '');

// ---------------------------------------------------------------- the list

/** A resort's report is old when it has a state and was last checked more than a day ago. */
export function isStale(row, now = Date.now()) {
  if (!row || row.state === 'no_data') return false;
  const age = hoursSince(row.checked_at, now);
  return age === null || age > STALE_HOURS;
}

/** The resort list joined with the status index: one row per resort, in the list's own order. */
export function joinRows(resorts, index, now = Date.now()) {
  const byId = new Map(((index && index.resorts) || []).map((r) => [r.id, r]));
  return ((resorts && resorts.resorts) || []).map((r) => {
    const s = byId.get(r.id) || { state: 'no_data', reason: 'not_collected' };
    return {
      ...r,
      state: s.state,
      reason: s.reason ?? null,
      lifts: s.lifts ?? null,
      snow_top_cm: s.snow_top_cm ?? null,
      checked_at: s.checked_at ?? null,
      source: s.source ?? null,
      stale: isStale(s, now),
    };
  });
}

export function summarize(rows) {
  const counts = { open: 0, closed_today: 0, closed: 0, no_data: 0 };
  for (const row of rows) if (row.state in counts) counts[row.state] += 1;
  return counts;
}

export function summaryText(counts) {
  const parts = [`${counts.open} open`];
  if (counts.closed_today) parts.push(`${counts.closed_today} closed today`);
  parts.push(`${counts.closed} closed`, `${counts.no_data} no data`);
  return parts.join(' · ');
}

/** Countries in the order they first appear in the list. */
export function byCountry(rows) {
  const groups = [];
  const seen = new Map();
  for (const row of rows) {
    let group = seen.get(row.country);
    if (!group) {
      group = { code: row.country, name: row.country_name, rows: [], open: 0 };
      seen.set(row.country, group);
      groups.push(group);
    }
    group.rows.push(row);
    if (row.state === 'open') group.open += 1;
  }
  return groups;
}

/** Every word of the search must occur in the resort's name, country or region. */
export function matches(row, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = fold(`${row.name} ${row.country_name || ''} ${row.region || ''}`);
  return words.every((word) => text.includes(word));
}

/** The grey line under a resort's name: 'Tirol · 24 of 31 lifts · 84 cm'. */
export function subline(row, place) {
  const parts = [place];
  const lifts = row.lifts;
  if (row.state !== 'no_data' && lifts && isNumber(lifts.open)) {
    parts.push(isNumber(lifts.total) && lifts.total > 0 ? `${lifts.open} of ${lifts.total} lifts` : `${lifts.open} lifts open`);
  }
  if (row.state === 'open' && isNumber(row.snow_top_cm)) parts.push(`${row.snow_top_cm} cm`);
  return parts.filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- the season line

/** Where today falls in the planned season: 'before', 'during', 'after', or null without dates. */
export function calendarPhase(opens, ends, now = new Date()) {
  const day = today(now);
  if (opens && day < opens) return 'before';
  if (ends && day > ends) return 'after';
  return opens || ends ? 'during' : null;
}

/**
 * The line under the status chip. Returns {lead, text}: lead is the reason of a closure
 * (shown darker), text the rest. Both can be empty: no dates, no line.
 */
export function seasonText(state, season, reason = '', now = new Date()) {
  const opens = (season && season.opens) || null;
  const ends = (season && season.ends) || null;
  const o = fmtDate(opens, 'auto', now);
  const e = fmtDate(ends, 'auto', now);
  const tail = e ? `season ends ${e}` : '';
  const line = (...parts) => ({ lead: '', text: capital(parts.filter(Boolean).join(' · ')) });

  if (state === 'open') return line(tail);
  if (state === 'closed_today') return reason ? { lead: reason, text: tail } : line(tail);

  const where = calendarPhase(opens, ends, now);
  // Without a report we cannot know whether the resort has opened: only the calendar speaks.
  const phase = state === 'no_data' ? null : season && season.phase;
  if (phase === 'ended' || where === 'after') return line(e ? `season ended ${e}` : '');
  if (phase === 'before' || (!phase && where === 'before')) return line(o ? `expected to open ${o}` : '', tail);
  if (phase === 'delayed') return line(o ? `opening was planned for ${o}` : '', tail);
  if (phase === 'running') return line(tail);
  if (o && e) return line(`planned season ${o} – ${e}`);
  return line(tail);
}

// ---------------------------------------------------------------- status

const LIFT_TYPES = [
  ['cable_car', 'Cable car'],
  ['gondola', 'Gondola'],
  ['chairlift', 'Chairlift'],
  ['drag_lift', 'Drag lift'],
  ['funicular', 'Funicular'],
  ['carpet', 'Carpet'],
  ['other', 'Other'],
];
const DIFFICULTIES = [
  ['easy', 'Easy'],
  ['intermediate', 'Intermediate'],
  ['difficult', 'Difficult'],
  ['ski_route', 'Ski route'],
  ['other', 'Other'],
];

/** Rows for the bar lists: known kinds in a fixed order, anything new after them. */
export function bars(counts, order) {
  if (!counts || typeof counts !== 'object') return [];
  const known = new Set(order.map(([key]) => key));
  const keys = [...order.filter(([key]) => key in counts), ...Object.keys(counts).filter((key) => !known.has(key)).sort().map((key) => [key, capital(key.replace(/_/g, ' '))])];
  return keys
    .map(([key, label]) => {
      const c = counts[key] || {};
      const open = isNumber(c.open) ? c.open : null;
      const total = isNumber(c.total) ? c.total : null;
      const pct = open !== null && total ? Math.max(0, Math.min(100, Math.round((open / total) * 100))) : 0;
      return { key, label, open, total, pct, open_km: isNumber(c.open_km) ? c.open_km : null };
    })
    .filter((bar) => bar.total !== null && bar.total > 0);
}

export const liftBars = (status) => bars(status && status.lifts_by_type, LIFT_TYPES);
export const slopeBars = (status) => bars(status && status.slopes_by_difficulty, DIFFICULTIES);

/** The snow card: the highest station on top, the others below it from high to low. */
export function snowView(snow) {
  if (!snow || !isNumber(snow.top_cm)) return null;
  const stations = (Array.isArray(snow.stations) ? snow.stations : []).filter((s) => s && isNumber(s.depth_cm)).sort((a, b) => (b.elevation_m || 0) - (a.elevation_m || 0));
  const top = stations.length && stations[0].depth_cm === snow.top_cm ? stations[0] : null;
  const rest = top ? stations.slice(1) : stations;
  if (!stations.length && isNumber(snow.base_cm)) rest.push({ name: 'Base', elevation_m: null, depth_cm: snow.base_cm });
  return {
    top_cm: snow.top_cm,
    where: top ? [top.name, top.elevation_m ? `${top.elevation_m} m` : ''].filter(Boolean).join(' · ') : 'Top',
    last: snow.last_snowfall ? `Last snowfall ${fmtDate(snow.last_snowfall, 'auto')}` : '',
    rest,
    condition: snow.condition ? String(snow.condition).replace(/\s+-\s+/g, ', ') : '',
  };
}

/** The line that names the source of a status, and the link to it. */
export function sourceView(status) {
  const source = status && status.source;
  if (!source) return null;
  const reported = status.reported_at ? `reported ${fmtStamp(status.reported_at)}` : status.checked_at ? `checked ${fmtStamp(status.checked_at)}` : '';
  const origins = [];
  const seen = new Set();
  for (const origin of Array.isArray(source.origin) ? source.origin : []) {
    const name = host(origin && origin.url);
    const url = safeUrl(origin && origin.url);
    if (!name || !url || seen.has(name)) continue;
    seen.add(name);
    origins.push({ name, url });
  }
  const own = source.kind === 'resort';
  return {
    text: [source.label || (own ? host(source.url) : 'LiftRadar'), reported].filter(Boolean).join(' · '),
    // A resort we read ourselves is its own origin: naming it twice says nothing.
    origins: own ? [] : origins,
    url: safeUrl(source.url),
    action: own ? 'Open page' : 'Open report',
  };
}

// ---------------------------------------------------------------- forecast

const RATINGS = { excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Poor', no_go: 'No go' };
const LEVEL_NAMES = { base: 'Base', mid: 'Mid', top: 'Top' };

/** The look of the score box: 80 and over filled, 60 and over light, below that an outline. */
export function scoreClass(score) {
  return score >= 80 ? 'hi' : score >= 60 ? 'mid' : 'lo';
}

export function ratingWord(rating) {
  return RATINGS[rating] || capital(String(rating || '').replace(/_/g, ' '));
}

/** What might stop the lifts, in a few words: 'gusts to 63 km/h'. */
export function causeText(cause) {
  if (!cause) return '';
  switch (cause.kind) {
    case 'gusts':
      return isNumber(cause.peak_kmh) ? `gusts to ${cause.peak_kmh} km/h` : 'strong gusts';
    case 'wind':
      return isNumber(cause.peak_kmh) ? `wind to ${cause.peak_kmh} km/h` : 'strong wind';
    case 'thunderstorms':
      return 'thunderstorms possible';
    case 'new_snow':
      return isNumber(cause.cm) ? `${cause.cm} cm of new snow` : 'heavy new snow';
    case 'thin_snow_cover':
      return isNumber(cause.cm) ? `thin snow cover, ${cause.cm} cm` : 'thin snow cover';
    case 'before_full_opening':
      return 'before the full opening';
    default:
      return '';
  }
}

/** The lift line of a day: kind is 'low', 'medium', 'high' or 'off' (outside the season). */
export function liftsView(day) {
  const chance = day && day.lifts_may_stop;
  if (chance === 'out_of_season') return { kind: 'off', text: 'Out of season', cause: '' };
  if (chance !== 'low' && chance !== 'medium' && chance !== 'high') return { kind: 'none', text: '', cause: '' };
  const causes = Array.isArray(day.causes) ? day.causes : [];
  const main = causes.find((c) => c && c.level === chance) || causes[0];
  return { kind: chance, text: `Lifts may stop: ${chance} chance`, cause: chance === 'low' ? '' : causeText(main) };
}

export function dayView(day) {
  const snow = day.new_snow_cm;
  const wind = span(day.wind_kmh);
  const knots = span(day.wind_kn);
  const line2 = [wind ? `${wind} km/h${knots ? ` (${knots} kn)` : ''}` : '', isNumber(day.gust_kmh) ? `gusts ${day.gust_kmh}` : ''].filter(Boolean).join(' · ');
  return {
    date: day.date,
    weekday: weekday(day.date),
    short: fmtDate(day.date, 'never'),
    score: isNumber(day.score) ? Math.round(day.score) : null,
    look: scoreClass(day.score),
    rating: ratingWord(day.rating),
    line1: `${temp(day.feels_c)} feels · ${isNumber(snow) && snow > 0 ? `${snow} cm new` : 'no new snow'}`,
    line2,
    lifts: liftsView(day),
  };
}

/** One elevation of a forecast file, ready to draw. best counts only days inside the season. */
export function levelView(forecast, key) {
  const levels = (forecast && forecast.levels) || [];
  const level = levels.find((l) => l.key === key) || levels[levels.length - 1];
  if (!level) return null;
  const days = (level.days || []).map(dayView);
  const inSeason = days.filter((d) => d.lifts.kind !== 'off' && d.score !== null);
  const best = inSeason.reduce((a, d) => (a && a.score >= d.score ? a : d), null);
  return {
    key: level.key,
    days,
    best: best ? `Best: ${best.weekday} ${best.score}` : '',
    offDays: days.filter((d) => d.lifts.kind === 'off').length,
    switches: levels.map((l) => ({ key: l.key, name: LEVEL_NAMES[l.key] || capital(l.key), metres: isNumber(l.elevation_m) ? `${l.elevation_m} m` : '', on: l.key === level.key })),
  };
}

// ---------------------------------------------------------------- pieces of HTML

const icon = (body, size = 22, extra = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;
const ICON = {
  search: icon('<circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path>', 20),
  star: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"></path></svg>',
  back: icon('<path d="M15 5l-7 7 7 7"></path>'),
  out: icon('<path d="M7 17 17 7M9 7h8v8"></path>', 14),
  next: icon('<path d="M9 5l7 7-7 7"></path>', 14),
  go: icon('<path d="M9 5l7 7-7 7"></path>', 16),
  clock: icon('<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>', 18),
  offline: icon('<path d="M3 3l18 18M5 12.5a10 10 0 0 1 3.5-2.3M2 8.8a15 15 0 0 1 4-2.5M12 5a15 15 0 0 1 10 3.8M15.5 10.4a10 10 0 0 1 3.5 2.1M8.5 16a5 5 0 0 1 7 0M12 19.5v.5"></path>', 18),
  navResorts: '<svg class="solid" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 19 9 8l4 6 3-4 5 9z"></path></svg>',
  navFavs: '<svg class="solid" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"></path></svg>',
  navAbout: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v6M12 7.5v.5"></path></svg>',
};

const CHIPS = { open: ['open', 'Open'], closed: ['closed', 'Closed'], closed_today: ['today', 'Closed today'], no_data: ['nodata', 'No data'] };

export function chipHtml(state) {
  const [look, label] = CHIPS[state] || CHIPS.no_data;
  return `<span class="chip chip-${look}">${label}</span>`;
}

export function starHtml(row, on, round = false) {
  const label = `${on ? 'Remove' : 'Add'} ${row.name} ${on ? 'from' : 'to'} favourites`;
  return `<button type="button" class="star${round ? ' round' : ''}" data-fav="${esc(row.id)}" aria-pressed="${on}" aria-label="${esc(label)}">${ICON.star}</button>`;
}

export function rowHtml(row, place, isFav) {
  const under = row.stale ? '<span class="chip-note old">Old data</span>' : '';
  const chip = under ? `<span class="chipcol">${chipHtml(row.state)}${under}</span>` : chipHtml(row.state);
  return `<div class="row"><a class="row-main" href="#/resort/${esc(row.id)}"><span class="row-name">${esc(row.name)}</span><span class="row-sub">${esc(subline(row, place))}</span></a>${chip}${starHtml(row, isFav)}</div>`;
}

/** Shown when the network could not be reached and the device's own copy of the data is on screen. */
export function offlineBanner(saved) {
  return saved ? `<div class="banner banner-off">${ICON.offline}<span>Offline · showing data saved ${esc(fmtStamp(saved))}</span></div>` : '';
}

const cardOf = (rows) => `<div class="card">${rows.join('<div class="hr"></div>')}</div>`;
const sectionHtml = (title, side, rows) => `<div class="sec"><h2>${esc(title)}</h2><span>${esc(side)}</span></div>${cardOf(rows)}`;

/** Everything under the search field: the summary line, favourites, then the countries. */
export function resultsHtml(rows, favs, query, generatedAt, saved = null) {
  const counts = summarize(rows);
  const updated = fmtStamp(generatedAt);
  const head = `${offlineBanner(saved)}<div class="summary">${esc(summaryText(counts))}${updated ? `<br>Updated ${esc(updated)}` : ''}</div>`;
  if (fold(query).trim()) {
    const found = rows.filter((row) => matches(row, query));
    if (!found.length) return `${head}<div class="panel note-card"><h2>No resort found</h2><p>Nothing in the list matches “${esc(query.trim())}”. Search looks at the resort’s name, country and region.</p></div>`;
    return head + sectionHtml('Results', `${found.length} of ${rows.length}`, found.map((row) => rowHtml(row, row.country_name, favs.has(row.id))));
  }
  const parts = [head];
  const starred = rows.filter((row) => favs.has(row.id));
  if (starred.length) parts.push(sectionHtml('Favourites', String(starred.length), starred.map((row) => rowHtml(row, row.country_name, true))));
  for (const group of byCountry(rows)) {
    const side = `${group.rows.length} ${group.rows.length === 1 ? 'resort' : 'resorts'}${group.open ? ` · ${group.open} open` : ''}`;
    parts.push(sectionHtml(group.name, side, group.rows.map((row) => rowHtml(row, row.region || '', favs.has(row.id)))));
  }
  return parts.join('');
}

export function navHtml(active) {
  const item = (key, href, label, svg) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${svg}${label}</a>`;
  return `<nav class="nav" aria-label="Main">${item('resorts', '#/', 'Resorts', ICON.navResorts)}${item('favourites', '#/favourites', 'Favourites', ICON.navFavs)}${item('about', '#/about', 'About', ICON.navAbout)}</nav>`;
}

export function resortsHtml(rows, favs, query, generatedAt, saved = null) {
  return `<header class="hero"><img src="app/img/peak.jpg" alt=""><div class="hero-top"><div class="brand">PEAKTOSWELL</div><div class="hero-count">${rows.length} resorts</div></div><h1>Resorts</h1></header>
<main class="list"><div class="search">${ICON.search}<label class="sr" for="q">Search resorts</label><input id="q" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Search ${rows.length} resorts" value="${esc(query)}"></div><div id="results">${resultsHtml(rows, favs, query, generatedAt, saved)}</div></main>${navHtml('resorts')}`;
}

// ---- one resort

const tile = (label, count, small = '') =>
  `<div class="tile"><div class="label">${label}</div><div class="count"><b>${esc(count.open)}</b>${isNumber(count.total) ? `<span>of ${esc(count.total)}</span>` : ''}</div>${small ? `<div class="small">${esc(small)}</div>` : ''}</div>`;

function tilesHtml(status) {
  const lifts = status.lifts || {};
  const slopes = status.slopes || {};
  const out = [];
  if (isNumber(lifts.open)) out.push(tile('Lifts', lifts));
  if (isNumber(slopes.open)) out.push(tile('Slopes', slopes, isNumber(slopes.open_km) && isNumber(slopes.total_km) ? `${num(slopes.open_km)} of ${num(slopes.total_km)} km` : ''));
  if (!out.length) return '';
  return out.length === 2 ? `<div class="tiles">${out.join('')}</div>` : out[0];
}

function snowHtml(status) {
  const view = snowView(status.snow);
  if (!view) return '';
  const rest = view.rest.map((s) => `<div class="kv"><span><b>${esc(s.name)}</b>${s.elevation_m ? ` <span>${esc(s.elevation_m)} m</span>` : ''}</span><span class="v">${esc(s.depth_cm)} cm</span></div>`).join('');
  const side = [view.where, view.last].filter(Boolean).map(esc).join('<br>');
  return `<div class="panel"><div class="label">Snow depth</div><div class="snow-top"><div class="snow-big"><b>${esc(view.top_cm)}</b><span>cm</span></div><div class="snow-side">${side}</div></div>${rest ? `<div class="line"></div>${rest}` : ''}${view.condition ? `<div class="pill">${esc(view.condition)}</div>` : ''}</div>`;
}

function barsHtml(label, list, withKm) {
  if (!list.length) return '';
  const rows = list
    .map((bar) => {
      const km = withKm && bar.open_km ? ` · ${num(bar.open_km)} km` : '';
      return `<div class="bar"><div class="bar-top"><span class="n">${esc(bar.label)}</span><span class="q"><b>${esc(bar.open ?? '–')}</b> of ${esc(bar.total)}${esc(km)}</span></div><div class="track"><i style="width:${bar.pct}%"></i></div></div>`;
    })
    .join('');
  return `<div class="panel bars"><div class="label">${label}</div>${rows}</div>`;
}

function sourceHtml(status) {
  const view = sourceView(status);
  if (!view) return '';
  const from = view.origins.length ? `<br>from ${view.origins.map((o) => `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.name)}</a>`).join(' and ')}` : '';
  const link = view.url ? `<a class="go" href="${esc(view.url)}" target="_blank" rel="noopener">${view.action}${ICON.out}</a>` : '';
  return `<div class="src"><div class="src-text">${esc(view.text)}${from}</div>${link}</div>`;
}

const noteCard = (title, text, more = '') => `<div class="panel note-card"><h2>${esc(title)}</h2><p>${esc(text)}</p>${more}</div>`;

/** The Status tab. row is the list's row; status is the resort's own file, or null when it has none. */
export function statusHtml(row, status, now = new Date()) {
  const forecastLink = `#/resort/${esc(row.id)}/forecast`;
  if (row.state === 'no_data' || !status) {
    const text =
      row.reason === 'no_report'
        ? 'The resort’s report has no current figures. That is usual before the season starts. The 7-day forecast is available.'
        : 'Lift and slope status is not available for this resort. The 7-day forecast is.';
    return `<div class="panel note-card big"><h2>No live data from the resort</h2><p>${esc(text)}</p></div><a class="cta" href="${forecastLink}">See the 7-day forecast<span>${ICON.go}</span></a>${status ? sourceHtml(status) : ''}`;
  }

  const parts = [];
  const season = status.season || { opens: row.season_opens, ends: row.season_ends };
  const ends = fmtDate(season.ends, 'always', now);
  const opens = fmtDate(season.opens, 'always', now);
  if (status.note) parts.push(`<div class="pill">${esc(status.note)}</div>`);
  if (row.stale) {
    const age = hoursSince(status.checked_at, now.getTime());
    parts.push(`<div class="banner banner-old">${ICON.clock}<span>Old data · last checked ${esc(fmtStamp(status.checked_at))}${age !== null ? ` (${Math.round(age)} h ago)` : ''}</span></div>`);
  }

  if (row.state === 'open') {
    parts.push(tilesHtml(status), snowHtml(status), barsHtml('Lifts by type', liftBars(status)), barsHtml('Slopes by difficulty', slopeBars(status), true));
  } else if (row.state === 'closed_today') {
    parts.push(noteCard('Closed today', 'No slopes are open today. The resort is in season and reopens when the weather allows.', `<a class="more" href="${forecastLink}">See the forecast for tomorrow${ICON.next}</a>`));
    parts.push(tilesHtml(status), snowHtml(status));
  } else {
    parts.push(tilesHtml(status));
    const phase = season.phase || null;
    const endLine = ends ? ` The season is planned to end on ${ends}.` : '';
    if (phase === 'ended' || calendarPhase(season.opens, season.ends, now) === 'after') {
      parts.push(noteCard(ends ? `Season ended ${ends}` : 'Season ended', 'Closed until the next season.'));
    } else if (phase === 'before') {
      parts.push(noteCard(opens ? `Expected to open ${opens}` : 'Closed', `Closed until the season starts.${endLine} Snow depths are shown when the resort opens.`));
    } else if (phase === 'delayed') {
      parts.push(noteCard(opens ? `Opening was planned for ${opens}` : 'Closed', `The resort has not reported an open slope yet.${endLine}`));
    } else {
      parts.push(noteCard('Closed', `No slope is reported open.${endLine}`));
      parts.push(snowHtml(status));
    }
  }
  parts.push(sourceHtml(status));
  return parts.filter(Boolean).join('');
}

function liftsHtml(lifts) {
  if (lifts.kind === 'none') return '';
  const cause = lifts.cause ? `<span class="cause">${esc(capital(lifts.cause))}</span>` : '';
  if (lifts.kind === 'low') return `<span class="lift">${esc(lifts.text)}</span>`;
  return `<span class="lift-wrap"><span class="lift-pill lift-${lifts.kind}">${esc(lifts.text)}</span>${cause}</span>`;
}

/** The Forecast tab. forecast is the resort's file, or null when it has none. */
export function forecastHtml(forecast, levelKey, now = Date.now()) {
  const view = levelView(forecast, levelKey);
  if (!view || !view.days.length) {
    return noteCard('No forecast yet', 'The forecast for this resort has not been computed yet. It is refreshed twice a day.');
  }
  const parts = [];
  const age = hoursSince(forecast.generated_at, now);
  if (age !== null && age > STALE_HOURS) parts.push(`<div class="banner banner-old">${ICON.clock}<span>Old forecast · made ${esc(fmtStamp(forecast.generated_at))}</span></div>`);
  parts.push(`<div class="seg" role="group" aria-label="Elevation">${view.switches.map((s) => `<button type="button" data-level="${esc(s.key)}" aria-pressed="${s.on}"><b>${esc(s.name)}</b><span>${esc(s.metres)}</span></button>`).join('')}</div>`);
  parts.push(`<div class="fc-head"><span>Ski score 0–100 · best 4 hours of the day</span>${view.best ? `<b>${esc(view.best)}</b>` : ''}</div>`);
  const days = view.days.map(
    (d) =>
      `<div class="day${d.lifts.kind === 'off' ? ' off' : ''}"><div class="day-date"><b>${esc(d.weekday)}</b><span>${esc(d.short)}</span></div><div class="day-score"><div class="score score-${d.lifts.kind === 'off' ? 'off' : d.look}">${esc(d.score ?? '–')}</div><span>${esc(d.rating)}</span></div><div class="day-main"><div class="day-l1">${esc(d.line1)}</div><div class="day-l2">${esc(d.line2)}</div>${liftsHtml(d.lifts)}</div></div>`,
  );
  parts.push(cardOf(days));
  const models = Array.isArray(forecast.models) ? forecast.models.length : 0;
  const made = fmtStamp(forecast.generated_at);
  const off = view.offDays ? ' On days marked out of season the lifts are not expected to run: the score rates the weather only.' : '';
  parts.push(`<div class="fine">${made ? `Updated ${esc(made)}. ` : ''}${models ? `Median of ${models} weather models. ` : ''}Weather data by <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo.com</a>, CC BY 4.0.${off}</div>`);
  return parts.join('');
}

/** The About tab: the text when the list has one, elevations, a few facts, the resort's website. */
export function aboutTabHtml(row, status) {
  const parts = [];
  if (row.about) parts.push(`<p class="lead">${esc(row.about)}</p>`);
  const levels = [['Base', row.base_m], ['Mid', row.mid_m], ['Top', row.top_m]].filter(([, metres]) => isNumber(metres));
  if (levels.length) parts.push(`<div class="panel"><div class="label">Elevations</div><div class="elev">${levels.map(([name, metres]) => `<div><b>${esc(metres)}</b><span>${name} · m</span></div>`).join('')}</div></div>`);

  const facts = [];
  const add = (key, value) => value && facts.push(`<div class="kv fact"><span>${key}</span><span class="v">${esc(value)}</span></div>`);
  const season = (status && status.season) || {};
  const opens = season.opens || row.season_opens;
  const ends = season.ends || row.season_ends;
  const size = (status && status.size) || {};
  add('Country', row.country_name);
  add('Region', row.region);
  add('Lifts', isNumber(size.lifts) ? String(size.lifts) : '');
  add('Slopes', isNumber(size.slopes_km) ? `${num(size.slopes_km)} km` : isNumber(size.slopes) ? String(size.slopes) : '');
  add(calendarPhase(opens, ends) === 'before' ? 'Expected opening' : 'Planned opening', fmtDate(opens, 'always'));
  add('Season ends', fmtDate(ends, 'always'));
  if (facts.length) parts.push(`<div class="panel">${facts.join('')}</div>`);

  // A resort we read ourselves has no separate website field: its own page is the website.
  const source = (status && status.source) || {};
  const site = safeUrl(status && status.website) || (source.kind === 'resort' ? safeUrl(source.url) : '');
  if (site) parts.push(`<a class="cta cta-ink" href="${esc(site)}" target="_blank" rel="noopener">${esc(host(site))}<span>${ICON.out}</span></a>`);
  if (!row.about) parts.push('<div class="fine">A short description, a photo of the resort and its ski map come with a later build.</div>');
  return parts.join('');
}

const satelliteHtml = () =>
  '<div class="sat" role="img" aria-label="The satellite image is not available yet"><b>Satellite image</b><span>The latest clear Sentinel-2 image of the resort, with its date, comes with a later build.</span></div>';

export function resortHtml(row, tab, status, forecast, isFav, level, loading, saved = {}) {
  const season = (status && status.season) || { opens: row.season_opens, ends: row.season_ends };
  const line = seasonText(row.state, season, '');
  const lineHtml = line.lead || line.text ? `<div class="season">${line.lead ? `<span class="lead">${esc(line.lead)}</span>${line.text ? ' · ' : ''}` : ''}${esc(line.text)}</div>` : '';
  const place = [row.country_name, row.region].filter(Boolean).join(' · ');
  const old = row.stale ? '<span class="chip chip-old">Old data</span>' : '';
  const tabs = ['status', 'forecast', 'satellite', 'about'].map((key) => `<a href="#/resort/${esc(row.id)}${key === 'status' ? '' : `/${key}`}"${key === tab ? ' aria-current="page"' : ''}>${capital(key)}</a>`).join('');
  let body;
  if (tab === 'forecast') body = forecast === undefined ? loading : forecastHtml(forecast, level);
  else if (tab === 'satellite') body = satelliteHtml();
  else if (tab === 'about') body = status === undefined ? loading : aboutTabHtml(row, status);
  else body = status === undefined ? loading : statusHtml(row, status);
  if (tab !== 'satellite') body = offlineBanner(tab === 'forecast' ? saved.forecast : saved.status) + body;
  return `<header class="band"><img src="app/img/slope.jpg" alt=""><div class="band-top"><a class="round" href="#/" data-back aria-label="Back to resorts">${ICON.back}</a>${starHtml(row, isFav, true)}</div></header>
<main><div class="head"><h1>${esc(row.name)}</h1><div class="head-meta">${chipHtml(row.state)}${old}<span class="place">${esc(place)}</span></div>${lineHtml}</div><div class="tabs" role="navigation" aria-label="Resort">${tabs}</div><div class="body" id="tab">${body}</div></main>${navHtml('resorts')}`;
}

const STRIPS = [['slope', '50% 30%'], ['peak', '50% 35%'], ['slope', '50% 62%']];

/** One favourite as a card. status is the resort's own file: undefined while it loads, null when it has none. */
export function favouriteHtml(row, status, n = 0) {
  const [image, position] = STRIPS[n % STRIPS.length];
  const own = status || null;
  const state = own ? own.state : row.state;
  const stale = own ? isStale(own) : row.stale;
  const checked = (own && own.checked_at) || row.checked_at;
  const place = [row.country_name, row.region, state !== 'no_data' && checked ? `checked ${fmtStamp(checked)}` : ''].filter(Boolean).join(' · ');
  const lifts = (own && own.lifts) || row.lifts || {};
  const slopes = (own && own.slopes) || {};
  const snowTop = own && own.snow ? own.snow.top_cm : row.snow_top_cm;
  const stats = [];
  const stat = (value, label) => stats.push(`<div><b>${esc(value)}</b><span>${label}</span></div>`);
  if (state !== 'no_data') {
    if (isNumber(lifts.open)) stat(isNumber(lifts.total) ? `${lifts.open} of ${lifts.total}` : String(lifts.open), 'lifts');
    if (isNumber(slopes.open)) stat(isNumber(slopes.total) ? `${slopes.open} of ${slopes.total}` : String(slopes.open), 'slopes');
    if (state === 'open' && isNumber(snowTop)) stat(`${snowTop} cm`, 'snow, top');
  }
  const under = stale ? '<span class="chip-note old">Old data</span>' : '';
  const chip = under ? `<span class="chipcol">${chipHtml(state)}${under}</span>` : chipHtml(state);
  const bottom = state === 'no_data' ? '<div class="fav-none">No live data from the resort</div>' : stats.length ? `<div class="fav-stats">${stats.join('')}</div>` : '';
  return `<div class="card"><div class="fav-strip"><img src="app/img/${image}.jpg" alt="" style="object-position:${position}"></div><div class="fav-body"><div class="fav-head"><a class="fav-main" href="#/resort/${esc(row.id)}"><span class="fav-name">${esc(row.name)}</span><span class="fav-sub">${esc(place)}</span></a>${chip}${starHtml(row, true)}</div>${bottom}</div></div>`;
}

/** The Favourites screen. statusOf(id) gives a resort's own file, undefined while it is loading. */
export function favouritesHtml(rows, favs, statusOf, saved = null) {
  const starred = rows.filter((row) => favs.has(row.id));
  const cards = starred.length
    ? `${starred.map((row, n) => favouriteHtml(row, statusOf(row.id), n)).join('')}<div class="fine">Favourites are kept on this device and work offline.</div>`
    : noteCard('No favourites yet', 'Tap the star next to a resort to keep it here and on top of the Resorts list.', '<a class="more" href="#/">See the resorts</a>');
  return `<div class="topline"><div class="brand">PEAKTOSWELL</div><span>${starred.length ? `${starred.length} saved` : ''}</span></div><main class="screen"><h1>Favourites</h1>${offlineBanner(saved)}${cards}</main>${navHtml('favourites')}`;
}

/** The About & data sources screen. */
export function aboutHtml(rows) {
  const viaLiftRadar = rows.filter((row) => row.source === 'liftradar').length;
  const entry = (name, link, text, line, small) =>
    `<div class="entry"><div class="entry-top"><b>${name}</b><a class="go" href="${link}"${link.startsWith('#') ? '' : ' target="_blank" rel="noopener"'}>${text}${ICON.out}</a></div><p>${line}</p><small>${small}</small></div>`;
  const sources = [
    entry('LiftRadar', 'https://liftradar.eu', 'liftradar.eu', `Lift and slope status for ${viaLiftRadar} resorts.`, 'Each resort page links to the report it came from.'),
    entry('Resort websites', '#/', 'See resorts', 'Status read from the resort’s own page where LiftRadar has none.', 'The source is named and linked on every resort page.'),
    entry('Open-Meteo', 'https://open-meteo.com', 'open-meteo.com', 'Weather model data for the forecast.', 'Weather data by Open-Meteo.com, CC BY 4.0.'),
  ];
  const reading = `<div class="panel note-card"><p>The ski score rates the weather only. It does not say whether the lifts run or how much snow lies on the slopes.</p><p>The chance that lifts stop is an estimate from the forecast, not the resort’s decision.</p></div>`;
  const fact = (key, value) => `<div class="kv fact"><span>${key}</span><span class="v">${esc(value)}</span></div>`;
  return `<div class="topline"><div class="brand">PEAKTOSWELL</div><span></span></div><main class="screen"><h1>About &amp; data sources</h1><p class="lead">Live lift and slope status and a 7-day forecast at three elevations for ${rows.length} European ski resorts. Free, no ads, no accounts.</p><div class="sec"><h2>Data sources</h2><span></span></div>${cardOf(sources)}<div class="sec"><h2>How to read it</h2><span></span></div>${reading}<div class="panel">${fact('Publisher', 'Boris Zarev')}${fact('Version', `${VERSION} · early build`)}</div><div class="fine">The satellite image, resort photos and ski maps come with later builds.</div></main>${navHtml('about')}`;
}

export function plainHtml(active, title, cards) {
  return `<main class="plain"><div class="brand">PEAKTOSWELL</div><h1>${esc(title)}</h1>${cards}</main>${navHtml(active)}`;
}

/** '#/resort/at-soelden/forecast' as {name: 'resort', id: 'at-soelden', tab: 'forecast'}. */
export function parseRoute(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'resort' && parts[1]) {
    const tab = ['status', 'forecast', 'satellite', 'about'].includes(parts[2]) ? parts[2] : 'status';
    return { name: 'resort', id: decodeURIComponent(parts[1]), tab };
  }
  if (parts[0] === 'favourites') return { name: 'favourites' };
  if (parts[0] === 'about') return { name: 'about' };
  return { name: 'resorts' };
}

// ---------------------------------------------------------------- the page (browser only)

const FAV_KEY = 'peaktoswell.favourites';
const FRESH_MS = 5 * 60 * 1000; // how long a loaded file is shown before it is asked for again

function readFavourites() {
  try {
    const list = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    return new Set(Array.isArray(list) ? list.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeFavourites(favs) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));
  } catch {
    // Private mode or a full store: the stars then last until the page is closed.
  }
}

/**
 * A data file as {data, saved}. data is null when the backend has not published the file (404).
 * saved is set when the network could not be reached and the service worker (sw.js) answered
 * with the copy it keeps on the device: the time that copy was saved.
 */
async function getJson(path) {
  const response = await fetch(DATA + path, { cache: 'no-cache' });
  if (response.status === 404) return { data: null, saved: null };
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const saved = response.headers.get('x-from-cache') ? response.headers.get('x-saved-at') || new Date().toISOString() : null;
  return { data: await response.json(), saved };
}

function start() {
  const root = document.getElementById('app');
  const S = {
    resorts: null,
    index: null,
    rows: [],
    baseAt: 0,
    baseSaved: null, // set while the list on screen is the device's own copy
    baseError: false,
    status: new Map(), // id -> {at, data, saved}; data is null when the resort has no file
    forecast: new Map(),
    failed: new Set(), // ids whose files could not be loaded
    favs: readFavourites(),
    query: '',
    level: 'top',
    listScroll: 0,
    route: null,
    previous: null,
  };
  const LOADING = '<div class="panel note-card"><p>Loading…</p></div>';
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  const rowOf = (id) => S.rows.find((row) => row.id === id);
  const fresh = (entry) => entry && Date.now() - entry.at < FRESH_MS;
  const statusOf = (id) => {
    const entry = S.status.get(id);
    return entry ? entry.data : undefined;
  };

  async function loadBase() {
    try {
      const [resorts, index] = await Promise.all([getJson('resorts.json'), getJson('status/index.json')]);
      if (!resorts.data || !index.data) throw new Error('the resort list is missing');
      S.resorts = resorts.data;
      S.index = index.data;
      S.rows = joinRows(resorts.data, index.data);
      S.baseAt = Date.now();
      S.baseSaved = index.saved || resorts.saved;
      S.baseError = false;
    } catch (error) {
      console.warn('peaktoswell:', error);
      S.baseError = true;
    }
  }

  async function loadResort(id, force = false) {
    const row = rowOf(id);
    if (!row) return false;
    const jobs = [];
    const keep = (map) => (file) => map.set(id, { at: Date.now(), data: file.data, saved: file.saved });
    // A resort the backend has no source for has no status file; the list's row already says so.
    const hasFile = row.state !== 'no_data' || Boolean(row.checked_at);
    if (!hasFile) S.status.set(id, { at: Date.now(), data: null, saved: null });
    else if (force || !fresh(S.status.get(id))) jobs.push(getJson(`status/${encodeURIComponent(id)}.json`).then(keep(S.status)));
    if (force || !fresh(S.forecast.get(id))) jobs.push(getJson(`forecast/${encodeURIComponent(id)}.json`).then(keep(S.forecast)));
    if (!jobs.length) return false;
    const results = await Promise.allSettled(jobs);
    const failures = results.filter((result) => result.status === 'rejected');
    failures.forEach((result) => console.warn('peaktoswell:', result.reason));
    if (failures.length) S.failed.add(id);
    else S.failed.delete(id);
    return true;
  }

  function failedCard(id) {
    const text = navigator.onLine === false ? 'You are offline, and this resort has not been opened on this device before.' : 'Check the connection and try again.';
    return `<div class="panel note-card"><h2>Could not load the data</h2><p>${text}</p><button type="button" class="more" data-retry="${esc(id)}">Try again</button></div>`;
  }

  function drawResort(route, keepScroll) {
    const row = rowOf(route.id);
    if (!row) {
      root.innerHTML = plainHtml('resorts', 'Resort not found', `<div class="panel note-card"><p>This address does not match a resort in the list.</p><a class="more" href="#/">Back to the resorts</a></div>`);
      document.title = 'peaktoswell';
      return;
    }
    const status = S.status.get(row.id);
    const forecast = S.forecast.get(row.id);
    const waiting = S.failed.has(row.id) ? failedCard(row.id) : LOADING;
    // The resort's own file is newer than the list's row whenever the two differ.
    const own = status && status.data;
    const live = own ? { ...row, state: own.state, reason: own.reason ?? null, checked_at: own.checked_at ?? null, stale: isStale(own) } : row;
    const saved = { status: (status && status.saved) || (!own && S.baseSaved) || null, forecast: (forecast && forecast.saved) || null };
    root.innerHTML = resortHtml(live, route.tab, status ? status.data : undefined, forecast ? forecast.data : undefined, S.favs.has(row.id), S.level, waiting, saved);
    document.title = `${row.name} · peaktoswell`;
    if (!keepScroll) window.scrollTo(0, 0);
  }

  function drawResults() {
    const box = document.getElementById('results');
    if (box) box.innerHTML = resultsHtml(S.rows, S.favs, S.query, S.index && S.index.generated_at, S.baseSaved);
  }

  function draw(keepScroll = false) {
    const route = S.route;
    if (S.baseError && !S.resorts) {
      const text = navigator.onLine === false ? 'You are offline, and the app has not been opened on this device with a connection yet.' : 'Check the connection and try again.';
      root.innerHTML = plainHtml('resorts', 'No connection to the data', `<div class="panel note-card"><h2>The resort list could not be loaded</h2><p>${text}</p><button type="button" class="more" data-retry="">Try again</button></div>`);
      return;
    }
    if (!S.resorts) {
      root.innerHTML = '<p class="boot">Loading resorts…</p>';
      return;
    }
    if (route.name === 'resort') {
      drawResort(route, keepScroll);
      return;
    }
    if (route.name === 'favourites') {
      root.innerHTML = favouritesHtml(S.rows, S.favs, statusOf, S.baseSaved);
      document.title = 'Favourites · peaktoswell';
    } else if (route.name === 'about') {
      root.innerHTML = aboutHtml(S.rows);
      document.title = 'About · peaktoswell';
    } else {
      root.innerHTML = resortsHtml(S.rows, S.favs, S.query, S.index && S.index.generated_at, S.baseSaved);
      document.title = 'peaktoswell';
      if (!keepScroll) window.scrollTo(0, S.previous && S.previous.name === 'resort' ? S.listScroll : 0);
      return;
    }
    if (!keepScroll) window.scrollTo(0, 0);
  }

  async function refreshResort(id, force = false) {
    const changed = await loadResort(id, force);
    if (changed && S.route.name === 'resort' && S.route.id === id) draw(true);
  }

  /** The favourites' own files: asked for at every start, so that they are on the device without a connection too. */
  async function refreshFavourites(force = false) {
    for (const id of [...S.favs].slice(0, 40)) {
      const changed = await loadResort(id, force);
      if (changed && S.route.name === 'favourites') draw(true);
    }
  }

  async function refreshBase() {
    if (S.resorts && Date.now() - S.baseAt < FRESH_MS) return;
    const first = !S.resorts;
    await loadBase();
    if (first || S.baseError) {
      draw();
      if (S.resorts && S.route.name === 'resort') refreshResort(S.route.id);
      if (S.resorts) refreshFavourites();
    } else if (S.route.name === 'resorts') drawResults();
    else draw(true);
  }

  function go() {
    const next = parseRoute(location.hash);
    if (S.route && S.route.name === 'resorts' && next.name !== 'resorts') S.listScroll = window.scrollY;
    const sameResort = S.route && S.route.name === 'resort' && next.name === 'resort' && S.route.id === next.id;
    S.previous = S.route;
    S.route = next;
    draw(sameResort);
    if (S.resorts && next.name === 'resort') refreshResort(next.id);
    if (S.resorts && next.name === 'favourites') refreshFavourites();
    refreshBase();
  }

  root.addEventListener('click', (event) => {
    const fav = event.target.closest('[data-fav]');
    if (fav) {
      const id = fav.getAttribute('data-fav');
      if (S.favs.has(id)) S.favs.delete(id);
      else S.favs.add(id);
      writeFavourites(S.favs);
      if (S.route.name === 'resorts') drawResults();
      else draw(true);
      if (S.favs.has(id)) loadResort(id); // kept on the device from now on
      return;
    }
    const level = event.target.closest('[data-level]');
    if (level) {
      S.level = level.getAttribute('data-level');
      draw(true);
      return;
    }
    const back = event.target.closest('[data-back]');
    if (back && S.previous && S.previous.name === 'resorts') {
      event.preventDefault();
      history.back();
      return;
    }
    const retry = event.target.closest('[data-retry]');
    if (retry) {
      const id = retry.getAttribute('data-retry');
      if (id) {
        S.failed.delete(id);
        draw(true);
        refreshResort(id, true);
      } else {
        S.baseError = false;
        S.baseAt = 0;
        draw();
        refreshBase();
      }
    }
  });

  root.addEventListener('input', (event) => {
    if (event.target && event.target.id === 'q') {
      S.query = event.target.value;
      drawResults();
    }
  });

  window.addEventListener('hashchange', go);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !S.route) return;
    refreshBase();
    if (S.route.name === 'resort' && S.resorts) refreshResort(S.route.id);
  });
  // Back on the network: everything on screen is asked for again.
  window.addEventListener('online', () => {
    if (!S.route) return;
    S.baseAt = 0;
    refreshBase();
    if (S.resorts && S.route.name === 'resort') refreshResort(S.route.id, true);
    if (S.resorts) refreshFavourites(true);
  });

  // The service worker keeps the app and the data it has shown, for use without a connection.
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
    navigator.serviceWorker.register('sw.js').catch((error) => console.warn('peaktoswell: offline use is not available:', error));
  }

  go();
}

if (typeof document !== 'undefined') start();
