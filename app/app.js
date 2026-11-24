// peaktoswell – the app. One module and no build step: the browser loads this file as it is.
//
// The functions in the first half are pure (text in, text out) and are exported for the
// tests in tests/app.test.mjs. The second half touches the page and runs only in a browser.
//
// The app reads these files, all written by the backend into data/:
//   data/resorts.json            the 130 resorts (name, country, elevations, season dates)
//   data/status/index.json       one row per resort for the list
//   data/status/<id>.json        lifts, slopes and snow of one resort (missing for some)
//   data/forecast/<id>.json      seven days at three elevations, and the avalanche warning signs from the weather
//   data/avalanche/<id>.json     the official avalanche bulletin of the resort's region, where there is one
//   data/satellite/<id>.json     when the resort's satellite picture was taken, and its credit
//   data/satellite/<id>.webp     the picture

export const VERSION = '0.7'; // shown on the About screen
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
      avalanche: s.avalanche ?? null, // the official avalanche level in short: {level, valid_until[, rating]}
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

const LIMIT_WORDS = {
  cloud: 'In cloud', cold: 'Very cold', warm: 'Warm', wind: 'Strong wind', gusts: 'Gusts', rain: 'Rain',
  snowfall: 'Heavy snowfall', thunderstorms: 'Thunderstorms', precipitation: 'Rain or snow', ice: 'Icy',
};

/**
 * Why a day scores lower, in a few words: 'In cloud' or 'Very cold · strong wind'. From the forecast file's
 * limits (the engine names at most two, the strongest first); '' for a score of 80 or more and for files without them.
 */
export function whyText(day) {
  if (!day || !isNumber(day.score) || day.score >= 80 || !Array.isArray(day.limits)) return '';
  let codes = day.limits.filter((code) => LIMIT_WORDS[code]);
  if (codes.includes('wind')) codes = codes.filter((code) => code !== 'gusts');   // strong wind says it
  return codes.slice(0, 2).map((code, n) => (n ? LIMIT_WORDS[code].toLowerCase() : LIMIT_WORDS[code])).join(' · ');
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

/**
 * The lift line of a day: kind is 'low', 'medium', 'high', 'off' (outside the season) or 'early'.
 * early: the resort has opened before the planned date in the list. The forecast file marks the
 * days until that date as out of season and carries no lift estimate for them; openedBefore is
 * that planned date, given only when the resort is open or its season is running.
 */
export function liftsView(day, openedBefore = null) {
  const chance = day && day.lifts_may_stop;
  if (chance === 'out_of_season' && openedBefore && day.date < openedBefore) return { kind: 'early', text: 'Opened early · no lift estimate', cause: '' };
  if (chance === 'out_of_season') return { kind: 'off', text: 'Out of season', cause: '' };
  if (chance !== 'low' && chance !== 'medium' && chance !== 'high') return { kind: 'none', text: '', cause: '' };
  const causes = Array.isArray(day.causes) ? day.causes : [];
  const main = causes.find((c) => c && c.level === chance) || causes[0];
  return { kind: chance, text: `Lifts may stop: ${chance} chance`, cause: chance === 'low' ? '' : causeText(main) };
}

export function dayView(day, openedBefore = null) {
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
    why: whyText(day),
    line1: `${temp(day.feels_c)} feels · ${isNumber(snow) && snow > 0 ? `${snow} cm new` : 'no new snow'}`,
    line2,
    lifts: liftsView(day, openedBefore),
  };
}

/** One elevation of a forecast file, ready to draw. best counts only days inside the season. */
export function levelView(forecast, key, openedBefore = null) {
  const levels = (forecast && forecast.levels) || [];
  const level = levels.find((l) => l.key === key) || levels[levels.length - 1];
  if (!level) return null;
  const days = (level.days || []).map((day) => dayView(day, openedBefore));
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

// ---------------------------------------------------------------- avalanche danger
//
// Two things, kept apart. The official danger level is the warning service's (data/avalanche/<id>.json,
// and in short in the list's row): the only thing here with a number and a colour. The warning signs
// from the weather are ours (avalanche_signs in the forecast file): words with a star, never a level.
// What every text made below keeps to:
//   - the signs only add to the official level; nothing here lowers or softens it;
//   - a day without a sign has no line, and nothing says calm, stable or safe;
//   - a bulletin past its validity keeps its level and colour and is marked out of date;
//   - without a bulletin the app says so and never makes up a level.

export const AVALANCHE_WORDS = { 1: 'Low', 2: 'Moderate', 3: 'Considerable', 4: 'High', 5: 'Very high' };
export const STAR_LINE = '* For guidance only and in no way a permission to ride off-piste.';
export const PISTE_LINE = 'Marked, open pistes are secured by the resort. On the spot also watch for whumpf sounds, shooting cracks and fresh avalanches.';
const UNRATED = { no_snow: 'No rating: not enough snow', no_rating: 'No rating in the current bulletin' };
const PERIODS = { earlier: 'earlier in the day', later: 'later in the day' };
const PROBLEMS = { new_snow: 'New snow', wind_slab: 'Wind slab', persistent_weak_layers: 'Persistent weak layers', wet_snow: 'Wet snow', gliding_snow: 'Gliding snow' };

const isLevel = (v) => Number.isInteger(v) && v >= 1 && v <= 5;
const isBound = (v) => v === 'treeline' || isNumber(v);
const boundWord = (v) => (v === 'treeline' ? 'the treeline' : `${v} m`);

/** Where a rating holds: 'above 2800 m', 'below the treeline', 'between 1800 m and 2400 m', or '' for every elevation. */
export function boundText(lower, upper) {
  if (isBound(lower) && isBound(upper)) return `between ${boundWord(lower)} and ${boundWord(upper)}`;
  if (isBound(lower)) return `above ${boundWord(lower)}`;
  if (isBound(upper)) return `below ${boundWord(upper)}`;
  return '';
}

/**
 * A bulletin's ratings as cells {level, where, period}, period being 'all_day', 'earlier' or 'later'.
 * Two rows of one level that meet at one height (below 2800 m and above 2800 m) are one cell for every
 * elevation; a cell that holds earlier and later alike is one for the whole day. Nothing is inferred
 * beyond that: a part of the day or of the mountain the bulletin's data does not rate stays unsaid.
 */
export function ratingCells(ratings) {
  const rows = (Array.isArray(ratings) ? ratings : []).filter((r) => r && isLevel(r.level));
  const cells = [];
  for (const period of ['all_day', 'earlier', 'later']) {
    for (const level of [5, 4, 3, 2, 1]) {
      const mine = rows.filter((r) => (r.period in PERIODS ? r.period : 'all_day') === period && r.level === level);
      if (!mine.length) continue;
      const open = mine.some((r) => !isBound(r.lower_bound) && !isBound(r.upper_bound));
      const meet = mine.some((a) => isBound(a.upper_bound) && !isBound(a.lower_bound) && mine.some((b) => b.lower_bound === a.upper_bound && !isBound(b.upper_bound)));
      const wheres = open || meet ? [''] : [...new Set(mine.map((r) => boundText(r.lower_bound, r.upper_bound)))];
      // above before below: the higher part of the mountain first
      wheres.sort((a, b) => Number(b.startsWith('above')) - Number(a.startsWith('above')));
      for (const where of wheres) cells.push({ level, where, period });
    }
  }
  const same = (a, b) => a.level === b.level && a.where === b.where;
  const whole = cells.filter((c) => c.period === 'earlier' && cells.some((d) => d.period === 'later' && same(c, d)));
  return cells
    .filter((c) => c.period === 'all_day' || !whole.some((w) => same(w, c)))
    .concat(whole.map((c) => ({ ...c, period: 'all_day' })))
    .sort((a, b) => b.level - a.level);
}

const cellText = (cell) => [cell.where, PERIODS[cell.period] || ''].filter(Boolean).join(' ');

/**
 * The official bulletin, ready to draw. Takes the resort's own file or the short form in the list's row
 * ({level, valid_until, rating}); null for none.
 *   level, word     the day's highest level (1–5) and its word; level null when the service gives no rating
 *   unrated         then: what to say instead ('No rating: not enough snow')
 *   where           where and when the highest level holds ('above 2800 m earlier in the day'); '' for everywhere, all day
 *   others          the lower levels of the day, each as {level, word, text}
 *   groups          for the Details screen: [{title, rows: [{level, word, where}]}], split by time of day when the bulletin is
 *   outOfDate, stamp   past valid_until: true and 'Bulletin of 22 Nov · out of date'. The level is shown all the same.
 */
export function bulletinView(doc, now = Date.now()) {
  if (!doc || typeof doc !== 'object') return null;
  const cells = ratingCells(doc.ratings);
  // The file's level is already the highest of the ratings and of the source's own figure; taking the
  // highest again here means that no way of reading the file can show a lower level than it holds.
  const levels = [doc.level, ...cells.map((c) => c.level)].filter(isLevel);
  const level = levels.length ? Math.max(...levels) : null;
  const until = Date.parse(doc.valid_until);
  const outOfDate = !Number.isNaN(until) && now > until;
  const day = (iso) => fmtStamp(iso).split(',')[0];
  const issued = doc.issued_at || doc.valid_from || '';
  const service = doc.service && doc.service.name ? { name: String(doc.service.name), url: safeUrl(doc.service.url) } : null;
  const top = cells.filter((c) => c.level === level).map(cellText);
  const lower = [...new Set(cells.filter((c) => c.level !== level).map((c) => c.level))];
  const split = cells.some((c) => c.period !== 'all_day');
  const group = (title, period) => ({ title, rows: cells.filter((c) => c.period === 'all_day' || c.period === period).map((c) => ({ level: c.level, word: AVALANCHE_WORDS[c.level], where: c.where || 'at all elevations' })) });
  const named = Array.isArray(doc.ratings) ? doc.ratings.map((r) => r && r.name).find((name) => UNRATED[name]) : null;
  return {
    level,
    word: level ? AVALANCHE_WORDS[level] : '',
    unrated: level ? '' : UNRATED[doc.rating] || UNRATED[named] || UNRATED.no_rating,
    where: top.includes('') ? '' : top.join(', '),
    others: lower.map((l) => ({ level: l, word: AVALANCHE_WORDS[l], text: cells.filter((c) => c.level === l).map(cellText).filter(Boolean).join(', ') })),
    groups: !cells.length ? [] : split ? [group('Earlier in the day', 'earlier'), group('Later in the day', 'later')].filter((g) => g.rows.length) : [group('', 'all_day')],
    problems: (Array.isArray(doc.problems) ? doc.problems : []).filter((p) => typeof p === 'string' && p).map((p) => PROBLEMS[p] || capital(p.replace(/_/g, ' '))),
    outOfDate,
    stamp: outOfDate ? `${day(issued) ? `Bulletin of ${day(issued)}` : 'Bulletin'} · out of date` : '',
    issuedDay: day(issued),
    meta: [service && service.name, doc.region, issued ? `issued ${fmtStamp(issued)}` : '', doc.valid_until ? `valid until ${fmtStamp(doc.valid_until)}` : ''].filter(Boolean).join(' · '),
    service,
    carrier: doc.source && doc.source.label ? String(doc.source.label) : '',
  };
}

// ---- the warning signs from the weather

const SIGN_NAMES = {
  wind_loading: 'Wind drifting snow', strong_wind: 'Strong wind', heavy_snowfall: 'Heavy snowfall', warming: 'Strong warming',
  rain_on_snow: 'Rain on snow', weak_layer_possible: 'Weak layer possible', crust_below_new_snow: 'Crust under new snow',
  drifted_snow: 'Drifted snow', new_snow_settling: 'New snow settling', after_rain: 'After rain', recent_thaw: 'Recent thaw',
};
const POINTS = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };
const POINTS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const WORDS16 = { N: 'north', E: 'east', S: 'south', W: 'west' };

/** Where the wind comes from, out of degrees: 'SSE', or 'the south-south-east'. */
export function windFrom(degrees, short = false) {
  if (!isNumber(degrees)) return '';
  const code = POINTS16[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];
  return short ? code : `the ${code.split('').map((letter) => WORDS16[letter]).join('-')}`;
}

const dayName = (iso, withNumber = true) => {
  const p = ymd(iso);
  return p ? `${weekday(iso)}${withNumber ? ` ${p[2]}` : ''}` : '';
};
const most = (levels, key) => levels.reduce((best, lv) => (isNumber(lv[key]) && (!best || lv[key] > best[key]) ? lv : best), null);

/**
 * One sign as words: {key, name, text, since}. short is the Forecast tab's form. null for a sign this
 * version does not know: a text is never made up. todayIso decides how "since" names its day: a day
 * before today carries its number ('Since Mon 23'), a day of the list below does not ('Since Wed').
 */
export function signView(sign, todayIso = '', short = false) {
  if (!sign || !SIGN_NAMES[sign.key]) return null;
  const levels = (Array.isArray(sign.levels) ? sign.levels : []).filter((lv) => lv && typeof lv === 'object');
  const lee = (Array.isArray(sign.lee) ? sign.lee : []).filter((p) => POINTS[p]);
  const at = (lv) => (isNumber(lv.elevation_m) ? ` at ${lv.elevation_m} m` : '');
  const windy = levels.filter((lv) => isNumber(lv.wind_kmh));
  const from = windy.length ? windFrom(windy[0].from_deg, short) : '';
  const wind = () => {
    if (!windy.length) return '';
    if (short) return `to ${windy[0].wind_kmh} km/h${from ? ` from ${from}` : ''}`;
    return `to ${windy.slice(0, 2).map((lv) => `${lv.wind_kmh} km/h${at(lv)}`).join(' and ')}${from ? `, from ${from}` : ''}`;
  };
  let text = '';
  switch (sign.key) {
    case 'wind_loading': {
      const snow = windy.length && isNumber(windy[0].snow_72h_cm) && !short ? `on ${windy[0].snow_72h_cm} cm of new snow` : 'on fresh snow';
      text = [wind(), snow].filter(Boolean).join(', ');
      break;
    }
    case 'strong_wind':
      text = [wind(), short ? '' : 'enough to drift loose snow'].filter(Boolean).join(', ');
      break;
    case 'heavy_snowfall':
    case 'new_snow_settling': {
      const lv = most(levels, 'snow_cm');
      if (!lv) break;
      const after = sign.key === 'new_snow_settling';
      if (lv.reported) text = `${lv.snow_cm} cm reported${at(lv)}`;
      else if (after || lv.snow_cm >= 20 || !isNumber(lv.snow_72h_cm) || lv.snow_72h_cm < 50) text = `${lv.snow_cm} cm${after ? '' : ' in 24 h'}${at(lv)}`;
      else text = `${lv.snow_72h_cm} cm in 3 days${at(lv)}`;
      if (after) text = `after ${text}`;
      break;
    }
    case 'rain_on_snow': {
      const lv = most(levels, 'rain_mm');
      if (lv) text = `${lv.rain_mm} mm of rain${at(lv)}`;
      break;
    }
    case 'warming': {
      const lv = levels[0];
      if (!lv || !isNumber(lv.t_max_c)) break;
      const bits = [`to ${temp(lv.t_max_c)}${at(lv)}`];
      if (!short && isNumber(lv.rise_c)) bits.push(`${lv.rise_c}° warmer than the day before`);
      if (!short && isNumber(lv.freezing_level_m)) bits.push(`freezing level ${lv.freezing_level_m} m`);
      if (sign.first) bits.push('the first thaw in a month');
      text = bits.join(', ');
      break;
    }
    case 'weak_layer_possible':
      text = short ? 'new snow on a long cold, dry spell' : `new snow on a long cold, dry spell${levels[0] ? at(levels[0]) : ''}: a weak layer may lie under it`;
      break;
    case 'crust_below_new_snow': {
      const lv = levels[0] || {};
      const thaw = dayName(lv.thaw);
      text = short ? 'new snow on an icy crust' : `${isNumber(lv.snow_cm) ? `${lv.snow_cm} cm of ` : ''}new snow on an icy crust${thaw ? ` from the thaw of ${thaw}` : ''}`;
      break;
    }
    case 'drifted_snow': {
      const side = !lee.length ? '' : short ? `mostly on ${lee.join(' to ')} slopes` : `mostly on slopes facing ${lee.map((p) => POINTS[p]).join(' to ')}`;
      text = [short ? 'in terrain traps' : 'may lie in terrain traps', side].filter(Boolean).join(', ');
      break;
    }
    case 'after_rain':
      text = 'wet, weakened snow; an icy crust once it freezes';
      break;
    case 'recent_thaw':
      text = 'wet snow by day; a crust once it freezes';
      break;
    default:
      break;
  }
  const since = ymd(sign.since) ? `Since ${dayName(sign.since, !todayIso || sign.since < todayIso)}` : '';
  return { key: sign.key, name: SIGN_NAMES[sign.key], text, since, sinceDay: ymd(sign.since) ? sign.since : '' };
}

/** The days of a forecast file that have signs, from today on: [{date, signs: [...]}] with only the signs this version can word. */
export function signDays(forecast, todayIso = today()) {
  const days = forecast && forecast.avalanche_signs && Array.isArray(forecast.avalanche_signs.days) ? forecast.avalanche_signs.days : [];
  return days
    .filter((d) => d && ymd(d.date) && d.date >= todayIso && Array.isArray(d.signs))
    .map((d) => ({ date: d.date, signs: d.signs.filter((s) => s && SIGN_NAMES[s.key]) }))
    .filter((d) => d.signs.length)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

const nextDay = (iso) => {
  const p = ymd(iso);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1)).toISOString().slice(0, 10);
};
const weight = (sign) => Math.max(0, ...(Array.isArray(sign.levels) ? sign.levels : []).map((lv) => Math.max(lv.wind_kmh || 0, lv.snow_cm || 0, lv.rain_mm || 0, lv.t_max_c || 0)));

/**
 * The signs of the coming days as the Status card lists them: one line per sign, the days it runs
 * over joined ('Thu 26 – Sat 28'). A sign of the day that repeats on the next day is one line with the
 * stronger day's numbers. Lines are in the order of their first day.
 */
export function signLines(forecast, todayIso = today()) {
  const lines = [];
  const open = new Map(); // what a line is about -> the line, while it may still be continued
  for (const day of signDays(forecast, todayIso)) {
    for (const sign of day.signs) {
      const id = `${sign.key}|${sign.since || ''}`;
      const line = open.get(id);
      if (line && nextDay(line.to) === day.date) {
        line.to = day.date;
        if (!sign.since && weight(sign) > weight(line.sign)) line.sign = sign;
      } else {
        const fresh = { from: day.date, to: day.date, sign };
        open.set(id, fresh);
        lines.push(fresh);
      }
    }
  }
  return lines.map((line) => {
    const view = signView(line.sign, todayIso);
    const on = view.sinceDay ? dayName(view.sinceDay) : '';
    // in a line that names its days the "since" goes to the end: 'after 70 cm reported at 3200 m on Mon 23'
    const text = !on ? view.text : view.key === 'drifted_snow' ? view.text : view.key === 'new_snow_settling' ? `${view.text} on ${on}` : `${view.text} (since ${on})`;
    return { when: line.from === line.to ? dayName(line.from) : `${dayName(line.from)} – ${dayName(line.to)}`, name: view.name, text };
  });
}

/**
 * The line of a Favourites card: {level, text, note, old}. level null means no badge. collected says
 * whether the data on screen comes from a backend that collects bulletins at all; without it nothing
 * is said about a missing one.
 */
export function avalancheSummary(bulletin, collected, now = Date.now()) {
  const view = bulletinView(bulletin, now);
  if (!view) return collected ? { level: null, text: 'No official avalanche bulletin', note: '', old: '' } : null;
  if (!view.level) return { level: null, text: view.unrated, note: 'avalanche bulletin', old: view.stamp };
  return { level: view.level, text: view.word, note: 'avalanche danger off-piste', old: view.stamp };
}

// ---------------------------------------------------------------- pieces of HTML

// ---------------------------------------------------------------- the satellite picture

const DAY = 24 * HOUR;
const NO_PASS_DAYS = 10; // the satellites pass every two or three days: this long without one is not the weather
const LOW_SUN = 12; // degrees above the horizon in the picture: with no newer pass, the reason is midwinter in the north

/** Whole days from one 'YYYY-MM-DD' to another; null when either is not a date. */
export function daysBetween(from, to) {
  const a = ymd(from);
  const b = ymd(to);
  return a && b ? Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / DAY) : null;
}

/** What the Satellite tab shows for a resort's file (data/satellite/<id>.json); null when it holds no picture. */
export function satelliteView(sat, name, now = new Date()) {
  const image = sat && sat.image;
  if (!image || typeof image.file !== 'string' || !/^[a-z0-9-]+\.webp$/.test(image.file) || !ymd(image.date)) return null;
  const age = daysBetween(image.date, today(now));
  const ago = age === null || age < 0 ? '' : age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`;
  const date = fmtDate(image.date, 'always');
  const newest = ymd(sat.newest_pass) && sat.newest_pass > image.date ? sat.newest_pass : '';
  const notes = [];
  if (newest) notes.push(`Newer passes of the satellite, the last on ${fmtDate(newest, 'auto', now)}, were not clear over the resort.`);
  const quiet = daysBetween(newest || image.date, today(now)); // days since the satellite last passed at all
  if (quiet !== null && quiet >= NO_PASS_DAYS) {
    const why = isNumber(image.sun_elevation) && image.sun_elevation < LOW_SUN ? ': in midwinter the sun is too low this far north for the satellite to record' : '';
    notes.push(`No pass since then${why}.`);
  }
  const note = notes.join(' ');
  const across = isNumber(image.side_m) ? `${num(image.side_m / 1000)} km across` : '';
  const credit = sat.source && typeof sat.source.credit === 'string' && sat.source.credit ? sat.source.credit : `Contains modified Copernicus Sentinel data ${image.date.slice(0, 4)}`;
  return {
    // The day in the address makes a browser fetch a newer picture at once; the service worker keeps it under the path alone.
    src: `${DATA}satellite/${image.file}?d=${image.date.replace(/-/g, '')}`,
    alt: `Satellite image of ${name}, ${date}`,
    date,
    ago,
    note,
    frame: ['True colour', across, 'north up'].filter(Boolean).join(' · '),
    low: isNumber(image.brightened) && image.brightened > 1,
    credit: credit.replace(/\.$/, ''),
    width: isNumber(image.width) ? image.width : 1200,
    height: isNumber(image.height) ? image.height : 1200,
  };
}

const icon = (body, size = 22, extra = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;
const ICON = {
  search: icon('<circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path>', 20),
  star: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"></path></svg>',
  back: icon('<path d="M15 5l-7 7 7 7"></path>'),
  out: icon('<path d="M7 17 17 7M9 7h8v8"></path>', 14),
  next: icon('<path d="M9 5l7 7-7 7"></path>', 14),
  go: icon('<path d="M9 5l7 7-7 7"></path>', 16),
  clock: icon('<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>', 18),
  expand: icon('<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"></path>', 18),
  close: icon('<path d="M6 6l12 12M18 6 6 18"></path>', 20),
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

// ---- avalanche danger: the pieces

const triangle = (size) => `<svg class="tri" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 2.5 20h19z"></path><path d="M12 10v4.5M12 17.5v.3"></path></svg>`;

/** The official level as its coloured box with the number in it. size: '' (26 px), 'big' (56 px). Only ever for an official level. */
export function badgeHtml(level, size = '') {
  if (!isLevel(level)) return '';
  return `<span class="av av-${level}${size ? ` av-${size}` : ''}"><span class="sr">Avalanche danger </span>${level === 5 ? '<i>5</i>' : level}</span>`;
}

/** One sign as a line: the outline triangle, the name in bold with its star, the numbers after it. */
function signHtml(view, when = '') {
  const lead = view.since && !when ? `<span class="since">${esc(view.since)} ·</span> ` : '';
  return `<div class="sign">${triangle(16)}<span>${lead}<b>${when ? `${esc(when)} · ` : ''}${esc(view.name)}*</b>${view.text ? ` <span class="sign-text">${esc(view.text)}</span>` : ''}</span></div>`;
}

const INFO_LINK = `<a class="more" href="#/about/avalanche">How to read the avalanche information${ICON.next}</a>`;
const fixedLines = () => `<p class="av-fixed">${esc(PISTE_LINE)}</p><p class="av-star">${esc(STAR_LINE)}</p>`;
const oldPill = (view) => (view.outOfDate ? `<span class="chip chip-old">${esc(view.stamp)}</span>` : '');

/**
 * The avalanche card of the Status tab. av.bulletin is the resort's bulletin file (undefined while it
 * loads, null for none); until it is there the short form in the list's row stands in. av.collected:
 * the data comes from a backend that collects bulletins, so a missing one can be said to be missing.
 * '' when there is nothing to say: no bulletin known either way and no sign in the forecast.
 */
export function avalancheCardHtml(row, av = {}, forecast = null, now = new Date()) {
  const view = bulletinView(av.bulletin || row.avalanche || null, now.getTime());
  const lines = signLines(forecast, today(now));
  if (!view && !av.collected && !lines.length) return '';
  const parts = [`<div class="av-top"><div class="label">Avalanche danger · off-piste</div><a class="av-details" href="#/resort/${esc(row.id)}/avalanche">Details${ICON.next}</a></div>`];
  if (view && view.level) {
    const others = view.others.map((o) => `<span class="av-other">${o.level} ${esc(o.word)}${o.text ? ` ${esc(o.text)}` : ''}</span>`).join('');
    parts.push(`<div class="av-head">${badgeHtml(view.level, 'big')}<div><span class="av-word">${esc(view.word)}</span>${view.where ? `<span class="av-where">${esc(view.where)}</span>` : ''}${others}</div></div>`);
    if (view.outOfDate) parts.push(oldPill(view));
    if (view.meta) parts.push(`<div class="av-meta">${esc(view.meta)}</div>`);
  } else if (view) {
    parts.push(`<div class="av-none"><b>${esc(view.unrated)}</b>${view.meta ? `<span>${esc(view.meta)}</span>` : ''}</div>`);
    if (view.outOfDate) parts.push(oldPill(view));
  } else if (av.collected) {
    parts.push('<div class="av-none"><b>No official avalanche bulletin here</b><span>We have no official avalanche bulletin for this area, so the danger is not known. Ask locally before going off-piste: the mountain rescue service or a mountain guide.</span></div>');
  }
  if (lines.length) {
    if (parts.length > 1) parts.push('<div class="line"></div>');
    parts.push(`<div class="av-sub">From the weather*</div>${lines.map((line) => signHtml(line, line.when)).join('')}`);
  }
  parts.push('<div class="line"></div>', fixedLines());
  return `<div class="panel av-card">${parts.join('')}</div>`;
}

/** Today's official level above the Forecast tab's days; '' without a bulletin. */
export function avalancheStripHtml(row, av = {}, now = new Date()) {
  const view = bulletinView(av.bulletin || row.avalanche || null, now.getTime());
  if (!view) return '';
  const by = [view.service && view.service.name, view.outOfDate ? '' : view.issuedDay].filter(Boolean).join(', ');
  const head = view.level ? `Avalanche, official${view.outOfDate ? '' : ' today'}: ${view.word}` : `Avalanche, official: ${view.unrated.charAt(0).toLowerCase()}${view.unrated.slice(1)}`;
  const under = [view.level ? view.where : '', by].filter(Boolean).join(' · ');
  return `<a class="av-strip" href="#/resort/${esc(row.id)}/avalanche">${badgeHtml(view.level)}<span class="av-strip-text"><b>${esc(head)}</b>${under ? `<span>${esc(under)}</span>` : ''}${view.outOfDate ? `<span class="chip-note old">${esc(view.stamp)}</span>` : ''}</span>${ICON.next}</a>`;
}

/** The screen the card's Details opens: the bulletin in full, and the signs day by day. */
export function avalancheDetailHtml(row, av = {}, forecast = null, now = new Date()) {
  const view = bulletinView(av.bulletin || row.avalanche || null, now.getTime());
  const todayIso = today(now);
  const days = signDays(forecast, todayIso);
  const parts = [];
  if (view && view.level) {
    const official = [`<div class="label">Official bulletin</div><div class="av-head">${badgeHtml(view.level, 'big')}<div><span class="av-word">${esc(view.word)}</span><span class="av-where">the highest level of the day</span></div></div>`];
    if (view.outOfDate) official.push(oldPill(view));
    for (const group of view.groups) {
      const rows = group.rows.map((r) => `<div class="av-row">${badgeHtml(r.level)}<span><b>${esc(r.word)}</b> ${esc(r.where)}</span></div>`).join('');
      official.push(`${group.title ? `<div class="label">${esc(group.title)}</div>` : ''}${rows}`);
    }
    official.push('<div class="line"></div>');
    official.push(view.problems.length
      ? `<div class="av-sub">Avalanche problems</div><div class="av-chips">${view.problems.map((p) => `<span class="pill">${esc(p)}</span>`).join('')}</div>`
      : '<div class="av-sub">Avalanche problems</div><div class="av-meta">Not named in this bulletin’s data. The full bulletin describes them.</div>');
    official.push('<div class="line"></div>');
    if (view.meta) official.push(`<div class="av-meta">${esc(view.meta)}</div>`);
    if (view.service && view.service.url) official.push(`<a class="cta cta-ink" href="${esc(view.service.url)}" target="_blank" rel="noopener">Full bulletin at ${esc(view.service.name)}<span>${ICON.out}</span></a>`);
    parts.push(`<div class="panel av-card">${official.join('')}</div>`);
  } else if (view) {
    const link = view.service && view.service.url ? `<a class="more" href="${esc(view.service.url)}" target="_blank" rel="noopener">Bulletin at ${esc(view.service.name)}${ICON.out}</a>` : '';
    parts.push(`<div class="panel av-card"><div class="label">Official bulletin</div><div class="av-none"><b>${esc(view.unrated)}</b>${view.meta ? `<span>${esc(view.meta)}</span>` : ''}</div>${view.outOfDate ? oldPill(view) : ''}${link}</div>`);
  } else if (av.collected) {
    parts.push('<div class="panel av-card"><div class="label">Official bulletin</div><div class="av-none"><b>No official avalanche bulletin here</b><span>We have no official avalanche bulletin for this area, so the danger is not known. Ask locally before going off-piste: the mountain rescue service or a mountain guide.</span></div></div>');
  }
  if (days.length) {
    const list = days
      .map((d) => `<div class="av-day"><div class="day-date"><b>${esc(weekday(d.date))}</b><span>${esc(fmtDate(d.date, 'never'))}</span></div><div class="av-day-signs">${d.signs.map((s) => signHtml(signView(s, todayIso))).join('')}</div></div>`)
      .join('<div class="line"></div>');
    parts.push(`<div class="panel av-card"><div class="label">From the weather*</div><div class="av-meta">Next 7 days · mid and top elevation</div>${list}</div>`);
  }
  parts.push(`<div class="panel av-card">${fixedLines()}${INFO_LINK}</div>`);
  const credit = [view && view.service ? `Avalanche bulletin by ${esc(view.service.name)}${view.carrier ? `, read through ${esc(view.carrier)}` : ''}.` : '', days.length ? 'Weather data by <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo.com</a>, CC BY 4.0.' : ''].filter(Boolean).join(' ');
  if (credit) parts.push(`<div class="fine">${credit}</div>`);
  return `<main class="plain"><a class="backline" href="#/resort/${esc(row.id)}" data-up>${ICON.back}<span>${esc(row.name)}</span></a><h1>Avalanche danger</h1><p class="lead">Off-piste · the official bulletin and signs from the weather</p>${parts.join('')}</main>${navHtml('resorts')}`;
}

const LEVEL_LINES = [
  [1, 'Low.', 'Mostly stable snow. Avalanches mainly on extremely steep slopes.', ''],
  [2, 'Moderate.', 'Mostly well bonded, but take care on the very steep slopes the bulletin names.', ''],
  [3, 'Considerable.', 'Weak bonds on many steep slopes; one skier can start an avalanche.', 'Most fatal accidents happen at this level, as people tend to underestimate the danger!'],
  [4, 'High.', 'Weak bonds on most steep slopes. Avalanches are likely, also by themselves.', ''],
  [5, 'Very high.', 'Widespread instability; many large avalanches, also in moderately steep terrain.', ''],
];

/** About › Avalanche information: what the level is, what our signs are, and what neither can see. */
export function avalancheInfoHtml() {
  const card = (title, body, bold = false) => `<div class="panel note-card av-info"><h2${bold ? ' class="strong"' : ''}>${title}</h2>${body}</div>`;
  const levels = LEVEL_LINES.map(([level, word, text, warn]) => `<div class="av-row">${badgeHtml(level)}<span><b>${word}</b> ${text}${warn ? ` <b>${warn}</b>` : ''}</span></div>`).join('');
  const names = ['Wind drifting snow', 'Strong wind', 'Heavy snowfall', 'Strong warming', 'Rain on snow', 'Weak layer possible', 'Crust under new snow', 'Recent thaw'].map((n) => `<span class="pill">${n}</span>`).join('');
  const parts = [
    `<p class="av-star">${esc(STAR_LINE)}</p>`,
    card('The official level', `<p>Each mountain region has an avalanche warning service. It rates the danger off the pistes on the European scale from 1 to 5, often split by elevation and sometimes by the time of day. We show the level with the service’s name, when it was issued, and a link to the full bulletin, which says where and why.</p>${levels}`),
    card('Our signs from the weather*', `<p>We read our forecast at the middle and top elevation, and the days before it, for the warning signs mountain guides teach: wind on fresh snow, heavy snowfall, strong warming and rain, and long cold dry spells before new snow.</p><div class="av-chips">${names}</div><p>A sign carries over into the next days: for 3 days, and up to 5 while it stays at ${MINUS}5 °C or colder at mid-mountain. After wind, drifted snow may lie in terrain traps, mostly on the lee side, which we name from the forecast wind. After heavy snowfall the new snow is still settling; after rain or a thaw the snow is wet and weak, and turns to an icy crust once it freezes.</p><p><b>Terrain traps</b> are gullies, bowls, hollows and the foot of steep slopes. Wind fills them with drifted snow, and even a small avalanche buries deep there.</p><p>What they cannot see: the layers inside the snow, the slope in front of you, and the work of the resort’s patrol. That is why they never carry a number or a colour.</p>`),
    card('We use official warning levels, where available.', '<p>Where an avalanche warning service publishes a level, that is the level we show. Our signs from the weather can only add to it, never lower it. A day without a sign says nothing about avalanches.</p><p>The level is the one the service last published as we read it, with the time it holds until. Past that time it stays on screen, marked out of date, until the next one arrives.</p>', true),
    card('Where there is no official bulletin', '<p>Some of our resorts have no bulletin we can show. There we give the signs alone, in words, with no number and no colour. No sign does not mean safe: the danger is simply not known. Ask locally, at the mountain rescue service or a mountain guide.</p>'),
    card('On the pistes and off them', '<p>Marked, open pistes are secured by the resort. Everything else is avalanche terrain at your own judgment: carry a transceiver, shovel and probe and know how to use them, read the full bulletin, and go with someone who knows the area.</p>'),
    card('On the spot', '<p>Turn back at whumpf sounds, shooting cracks or fresh avalanches, even small ones. They are the clearest signs there are, and no app can see them.</p>'),
    '<div class="fine">Official levels: the European avalanche warning services, read through <a href="https://liftradar.eu" target="_blank" rel="noopener">LiftRadar</a>. Weather: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo.com</a>, CC BY 4.0.</div>',
  ];
  return `<main class="plain"><a class="backline" href="#/about" data-up>${ICON.back}<span>About</span></a><h1>Avalanche information*</h1>${parts.join('')}</main>${navHtml('about')}`;
}

/**
 * The Status tab. row is the list's row; status is the resort's own file, or null when it has none.
 * av and forecast are for the avalanche card (see avalancheCardHtml); the card is there for every state.
 */
export function statusHtml(row, status, now = new Date(), av = {}, forecast = null) {
  const forecastLink = `#/resort/${esc(row.id)}/forecast`;
  const avalanche = avalancheCardHtml(row, av, forecast, now);
  if (row.state === 'no_data' || !status) {
    const text =
      row.reason === 'no_report'
        ? 'The resort’s report has no current figures. That is usual before the season starts. The 7-day forecast is available.'
        : 'Lift and slope status is not available for this resort. The 7-day forecast is.';
    return `<div class="panel note-card big"><h2>No live data from the resort</h2><p>${esc(text)}</p></div><a class="cta" href="${forecastLink}">See the 7-day forecast<span>${ICON.go}</span></a>${avalanche}${status ? sourceHtml(status) : ''}`;
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
    parts.push(tilesHtml(status), snowHtml(status), avalanche, barsHtml('Lifts by type', liftBars(status)), barsHtml('Slopes by difficulty', slopeBars(status), true));
  } else if (row.state === 'closed_today') {
    parts.push(noteCard('Closed today', 'No slopes are open today. The resort is in season and reopens when the weather allows.', `<a class="more" href="${forecastLink}">See the forecast for tomorrow${ICON.next}</a>`));
    parts.push(tilesHtml(status), snowHtml(status), avalanche);
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
    parts.push(avalanche);
  }
  parts.push(sourceHtml(status));
  return parts.filter(Boolean).join('');
}

function liftsHtml(lifts) {
  if (lifts.kind === 'none') return '';
  const cause = lifts.cause ? `<span class="cause">${esc(capital(lifts.cause))}</span>` : '';
  if (lifts.kind === 'low' || lifts.kind === 'early') return `<span class="lift">${esc(lifts.text)}</span>`;
  return `<span class="lift-wrap"><span class="lift-pill lift-${lifts.kind}">${esc(lifts.text)}</span>${cause}</span>`;
}

/** The Forecast tab. forecast is the resort's file, or null when it has none. */
export function forecastHtml(forecast, levelKey, now = Date.now(), openedBefore = null, strip = '') {
  const view = levelView(forecast, levelKey, openedBefore);
  if (!view || !view.days.length) {
    return noteCard('No forecast yet', 'The forecast for this resort has not been computed yet. It is refreshed twice a day.');
  }
  const parts = [];
  const age = hoursSince(forecast.generated_at, now);
  if (age !== null && age > STALE_HOURS) parts.push(`<div class="banner banner-old">${ICON.clock}<span>Old forecast · made ${esc(fmtStamp(forecast.generated_at))}</span></div>`);
  parts.push(`<div class="seg" role="group" aria-label="Elevation">${view.switches.map((s) => `<button type="button" data-level="${esc(s.key)}" aria-pressed="${s.on}"><b>${esc(s.name)}</b><span>${esc(s.metres)}</span></button>`).join('')}</div>`);
  if (strip) parts.push(strip); // today's official avalanche level
  const todayIso = today(new Date(now));
  const signs = new Map(signDays(forecast, todayIso).map((d) => [d.date, d.signs.map((s) => signHtml(signView(s, todayIso, true))).join('')]));
  parts.push(`<div class="fc-head"><span>Ski score 0–100 · best 4 hours of the day</span>${view.best ? `<b>${esc(view.best)}</b>` : ''}</div>`);
  const days = view.days.map(
    (d) =>
      `<div class="day${d.lifts.kind === 'off' ? ' off' : ''}"><div class="day-date"><b>${esc(d.weekday)}</b><span>${esc(d.short)}</span></div><div class="day-score"><div class="score score-${d.lifts.kind === 'off' ? 'off' : d.look}">${esc(d.score ?? '–')}</div><span>${esc(d.rating)}</span></div><div class="day-main">${d.why ? `<div class="day-why">${esc(d.why)}</div>` : ''}<div class="day-l1">${esc(d.line1)}</div><div class="day-l2">${esc(d.line2)}</div>${liftsHtml(d.lifts)}${signs.has(d.date) ? `<div class="day-signs">${signs.get(d.date)}</div>` : ''}</div></div>`,
  );
  parts.push(cardOf(days));
  const models = Array.isArray(forecast.models) ? forecast.models.length : 0;
  const made = fmtStamp(forecast.generated_at);
  const off = view.offDays ? ' On days marked out of season the lifts are not expected to run: the score rates the weather only.' : '';
  parts.push(`<div class="fine">${made ? `Updated ${esc(made)}. ` : ''}${models ? `Median of ${models} weather models. ` : ''}Weather data by <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo.com</a>, CC BY 4.0.${off}</div>`);
  if (signs.size) parts.push(`<div class="fine"><b>${esc(STAR_LINE)}</b> The signs with a star are read from the weather at the middle and top elevation; they are not a danger level. <a href="#/about/avalanche">How to read them</a></div>`);
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

/** The Satellite tab. sat is the resort's file, or null when the backend has none for it. */
export function satelliteHtml(row, sat, now = new Date()) {
  const view = satelliteView(sat, row.name, now);
  if (!view) {
    if (sat && ymd(sat.newest_pass)) return noteCard('No clear image yet', 'No pass of the satellite in the last four months was clear over this resort. New passes are checked every night.');
    return noteCard('No satellite image yet', 'The image of this resort has not been made yet. New passes of the satellite are checked every night.');
  }
  const picture = `<a class="sat-pic" href="#/resort/${esc(row.id)}/satellite/full" aria-label="Open the satellite image full screen"><img src="${esc(view.src)}" alt="${esc(view.alt)}" width="${esc(view.width)}" height="${esc(view.height)}" decoding="async" data-sat><span class="sat-open">${ICON.expand}</span></a>`;
  const taken = `<div class="kv sat-kv"><span>Image taken</span><span class="v">${esc(view.date)}${view.ago ? ` · ${esc(view.ago)}` : ''}</span></div>`;
  const note = view.note ? `<div class="fine">${esc(view.note)}</div>` : '';
  return `${picture}${taken}${note}<div class="fine">${esc(view.frame)}.${view.low ? ' Taken with the sun low over the horizon and brightened.' : ''} ${esc(view.credit)}.</div>`;
}

/** Shown in place of a picture that could not be loaded: no connection, and the device has not kept it. */
export const SAT_MISSING =
  '<div class="sat" role="img" aria-label="The satellite image could not be loaded"><b>The image could not be loaded</b><span>Without a connection the app shows the image it last loaded for this resort. This one has not been loaded on this device yet.</span></div>';

/** The picture on the whole screen: fitted to it, or at full size to drag around. */
export function viewerHtml(row, sat, zoomed, now = new Date()) {
  const view = satelliteView(sat, row.name, now);
  if (!view) return '';
  const hint = zoomed ? 'Drag to move · 10 m a pixel' : 'Pinch to zoom, or tap Full size';
  return `<div class="viewer"><div class="viewer-top"><a class="viewer-btn" href="#/resort/${esc(row.id)}/satellite" data-close aria-label="Close the satellite image">${ICON.close}</a><div class="viewer-title"><b>${esc(row.name)}</b><span>Satellite image · ${esc(view.date)}</span></div><button type="button" class="viewer-btn" data-zoom aria-pressed="${zoomed ? 'true' : 'false'}">${zoomed ? 'Fit' : 'Full size'}</button></div><div class="viewer-stage${zoomed ? ' zoomed' : ''}" id="stage"><img src="${esc(view.src)}" alt="${esc(view.alt)}" width="${esc(view.width)}" height="${esc(view.height)}" data-sat></div><div class="viewer-foot"><b>${hint}</b><span>${esc(view.frame)}. ${esc(view.credit)}.</span></div></div>`;
}

export function resortHtml(row, tab, status, forecast, isFav, level, loading, saved = {}, satellite = undefined, av = {}) {
  const season = (status && status.season) || { opens: row.season_opens, ends: row.season_ends };
  const line = seasonText(row.state, season, '');
  const lineHtml = line.lead || line.text ? `<div class="season">${line.lead ? `<span class="lead">${esc(line.lead)}</span>${line.text ? ' · ' : ''}` : ''}${esc(line.text)}</div>` : '';
  const place = [row.country_name, row.region].filter(Boolean).join(' · ');
  const old = row.stale ? '<span class="chip chip-old">Old data</span>' : '';
  const tabs = ['status', 'forecast', 'satellite', 'about'].map((key) => `<a href="#/resort/${esc(row.id)}${key === 'status' ? '' : `/${key}`}"${key === tab ? ' aria-current="page"' : ''}>${capital(key)}</a>`).join('');
  // Open, or seen open this season, before the planned date: the days until then are not "out of season".
  const running = row.state === 'open' || row.state === 'closed_today' || (status && status.season && status.season.phase === 'running');
  const openedBefore = running && season.opens ? season.opens : null;
  let body;
  if (tab === 'forecast') body = forecast === undefined ? loading : forecastHtml(forecast, level, Date.now(), openedBefore, avalancheStripHtml(row, av));
  else if (tab === 'satellite') body = satellite === undefined ? loading : satelliteHtml(row, satellite);
  else if (tab === 'about') body = status === undefined ? loading : aboutTabHtml(row, status);
  else body = status === undefined ? loading : statusHtml(row, status, new Date(), av, forecast || null);
  body = offlineBanner(tab === 'forecast' ? saved.forecast : tab === 'satellite' ? saved.satellite : saved.status) + body;
  return `<header class="band"><img src="app/img/slope.jpg" alt=""><div class="band-top"><a class="round" href="#/" data-back aria-label="Back to resorts">${ICON.back}</a>${starHtml(row, isFav, true)}</div></header>
<main><div class="head"><h1>${esc(row.name)}</h1><div class="head-meta">${chipHtml(row.state)}${old}<span class="place">${esc(place)}</span></div>${lineHtml}</div><div class="tabs" role="navigation" aria-label="Resort">${tabs}</div><div class="body" id="tab">${body}</div></main>${navHtml('resorts')}`;
}

const STRIPS = [['slope', '50% 30%'], ['peak', '50% 35%'], ['slope', '50% 62%']];

/** One favourite as a card. status is the resort's own file: undefined while it loads, null when it has none. */
export function favouriteHtml(row, status, n = 0, av = {}) {
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
  // The official avalanche level of the day, or that there is none. The signs from the weather are on the resort's own screens.
  const danger = avalancheSummary(av.bulletin || row.avalanche || null, av.collected);
  const dangerHtml = danger ? `<a class="fav-av" href="#/resort/${esc(row.id)}/avalanche">${badgeHtml(danger.level)}<span><b>${esc(danger.text)}</b>${danger.note ? ` <span>· ${esc(danger.note)}</span>` : ''}${danger.old ? `<span class="chip-note old">${esc(danger.old)}</span>` : ''}</span></a>` : '';
  return `<div class="card"><div class="fav-strip"><img src="app/img/${image}.jpg" alt="" style="object-position:${position}"></div><div class="fav-body"><div class="fav-head"><a class="fav-main" href="#/resort/${esc(row.id)}"><span class="fav-name">${esc(row.name)}</span><span class="fav-sub">${esc(place)}</span></a>${chip}${starHtml(row, true)}</div>${bottom}${dangerHtml}</div></div>`;
}

/** The Favourites screen. statusOf(id) gives a resort's own file, undefined while it is loading. */
export function favouritesHtml(rows, favs, statusOf, saved = null, avOf = () => ({})) {
  const starred = rows.filter((row) => favs.has(row.id));
  const cards = starred.length
    ? `${starred.map((row, n) => favouriteHtml(row, statusOf(row.id), n, avOf(row.id))).join('')}<div class="fine">Favourites are kept on this device and work offline.</div>`
    : noteCard('No favourites yet', 'Tap the star next to a resort to keep it here and on top of the Resorts list.', '<a class="more" href="#/">See the resorts</a>');
  return `<div class="topline"><div class="brand">PEAKTOSWELL</div><span>${starred.length ? `${starred.length} saved` : ''}</span></div><main class="screen"><h1>Favourites</h1>${offlineBanner(saved)}${cards}</main>${navHtml('favourites')}`;
}

/** The About & data sources screen. */
export function aboutHtml(rows) {
  const viaLiftRadar = rows.filter((row) => row.source === 'liftradar').length;
  const entry = (name, link, text, line, small) =>
    `<div class="entry"><div class="entry-top"><b>${name}</b><a class="go" href="${link}"${link.startsWith('#') ? '' : ' target="_blank" rel="noopener"'}>${text}${ICON.out}</a></div><p>${line}</p><small>${small}</small></div>`;
  const sources = [
    entry('LiftRadar', 'https://liftradar.eu', 'liftradar.eu', `Lift and slope status for ${viaLiftRadar} resorts, and the avalanche bulletins it collects.`, 'Each resort page links to the report it came from.'),
    entry('Avalanche warning services', 'https://www.avalanches.org', 'avalanches.org', 'The official danger levels: SLF in Switzerland, Météo-France, AINEVA in Italy and the other European services.', 'Every resort names its service and links to the full bulletin.'),
    entry('Resort websites', '#/', 'See resorts', 'Status read from the resort’s own page where LiftRadar has none.', 'The source is named and linked on every resort page.'),
    entry('Open-Meteo', 'https://open-meteo.com', 'open-meteo.com', 'Weather model data for the forecast and the avalanche signs.', 'Weather data by Open-Meteo.com, CC BY 4.0.'),
    entry('Copernicus Sentinel-2', 'https://dataspace.copernicus.eu', 'copernicus.eu', 'The satellite image of each resort: the newest clear one.', 'Contains modified Copernicus Sentinel data.'),
  ];
  const reading = `<div class="panel note-card"><p>The ski score rates the weather only. It does not say whether the lifts run or how much snow lies on the slopes. Under 80, the main reason is named: in cloud, very cold, strong wind, heavy snowfall.</p><p>The chance that lifts stop is an estimate from the forecast, not the resort’s decision.</p></div>`;
  const fact = (key, value) => `<div class="kv fact"><span>${key}</span><span class="v">${esc(value)}</span></div>`;
  return `<div class="topline"><div class="brand">PEAKTOSWELL</div><span></span></div><main class="screen"><h1>About &amp; data sources</h1><p class="lead">Live lift and slope status, a 7-day forecast at three elevations, a satellite image and the official avalanche danger for ${rows.length} European ski resorts. Free, no ads, no accounts.</p><div class="sec"><h2>Read more</h2><span></span></div><div class="card"><a class="entry entry-link" href="#/about/avalanche"><div class="entry-top"><b>Avalanche information*</b>${ICON.go}</div><p>The official level, our signs, what they cannot see</p></a></div><div class="sec"><h2>Data sources</h2><span></span></div>${cardOf(sources)}<div class="sec"><h2>How to read it</h2><span></span></div>${reading}<div class="panel">${fact('Publisher', 'Boris Zarev')}${fact('Version', `${VERSION} · early build`)}</div><div class="fine">Resort photos and ski maps come with later builds.</div></main>${navHtml('about')}`;
}

export function plainHtml(active, title, cards) {
  return `<main class="plain"><div class="brand">PEAKTOSWELL</div><h1>${esc(title)}</h1>${cards}</main>${navHtml(active)}`;
}

/** '#/resort/at-soelden/forecast' as {name: 'resort', id: 'at-soelden', tab: 'forecast'}. */
export function parseRoute(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'resort' && parts[1] && parts[2] === 'avalanche') return { name: 'avalanche', id: decodeURIComponent(parts[1]) }; // the avalanche card's Details
  if (parts[0] === 'resort' && parts[1]) {
    const tab = ['status', 'forecast', 'satellite', 'about'].includes(parts[2]) ? parts[2] : 'status';
    const route = { name: 'resort', id: decodeURIComponent(parts[1]), tab };
    if (tab === 'satellite' && parts[3] === 'full') route.full = true; // the picture on the whole screen
    return route;
  }
  if (parts[0] === 'favourites') return { name: 'favourites' };
  if (parts[0] === 'about') return parts[1] === 'avalanche' ? { name: 'about', page: 'avalanche' } : { name: 'about' };
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
    satellite: new Map(),
    avalanche: new Map(), // the official bulletin's file; asked for only where the list says there is one
    warmed: new Set(), // ids whose satellite picture has been asked for, so that the device keeps it
    zoomed: false, // the full-screen picture: at full size instead of fitted
    viewer: '', // the full-screen picture as it is on screen
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
  /** What the avalanche pieces need: the resort's bulletin file, and whether this data's backend collects bulletins at all. */
  const avOf = (id) => {
    const entry = S.avalanche.get(id);
    return { bulletin: entry ? entry.data : undefined, collected: Boolean(S.index && S.index.avalanche_bulletins) };
  };
  const onResort = (route) => Boolean(route) && (route.name === 'resort' || route.name === 'avalanche');

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
    if (force || !fresh(S.satellite.get(id))) jobs.push(getJson(`satellite/${encodeURIComponent(id)}.json`).then(keep(S.satellite)));
    // The list's row says whether the resort has a bulletin; without one there is no file to ask for.
    if (!row.avalanche) S.avalanche.set(id, { at: Date.now(), data: null, saved: null });
    else if (force || !fresh(S.avalanche.get(id))) jobs.push(getJson(`avalanche/${encodeURIComponent(id)}.json`).then(keep(S.avalanche)));
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
    const satellite = S.satellite.get(row.id);
    const waiting = S.failed.has(row.id) ? failedCard(row.id) : LOADING;
    if (route.name === 'avalanche') {
      S.viewer = '';
      root.innerHTML = avalancheDetailHtml(row, avOf(row.id), forecast ? forecast.data : null);
      document.title = `${row.name} · avalanche danger · peaktoswell`;
      if (!keepScroll) window.scrollTo(0, 0);
      return;
    }
    const whole = route.full && satellite ? viewerHtml(row, satellite.data, S.zoomed) : '';
    if (whole && whole === S.viewer && root.querySelector('.viewer')) return; // already on screen: a redraw would lose the place
    S.viewer = whole;
    if (whole) {
      root.innerHTML = whole;
      document.title = `${row.name} · satellite image · peaktoswell`;
      const stage = document.getElementById('stage');
      if (stage && S.zoomed) stage.scrollTo((stage.scrollWidth - stage.clientWidth) / 2, (stage.scrollHeight - stage.clientHeight) / 2);
      return;
    }
    // The resort's own file is newer than the list's row whenever the two differ.
    const own = status && status.data;
    const live = own ? { ...row, state: own.state, reason: own.reason ?? null, checked_at: own.checked_at ?? null, stale: isStale(own) } : row;
    const saved = { status: (status && status.saved) || (!own && S.baseSaved) || null, forecast: (forecast && forecast.saved) || null, satellite: (satellite && satellite.saved) || null };
    root.innerHTML = resortHtml(live, route.tab, status ? status.data : undefined, forecast ? forecast.data : undefined, S.favs.has(row.id), S.level, waiting, saved, satellite ? satellite.data : undefined, avOf(row.id));
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
    if (onResort(route)) {
      drawResort(route, keepScroll);
      return;
    }
    if (route.name === 'favourites') {
      root.innerHTML = favouritesHtml(S.rows, S.favs, statusOf, S.baseSaved, avOf);
      document.title = 'Favourites · peaktoswell';
    } else if (route.name === 'about') {
      root.innerHTML = route.page === 'avalanche' ? avalancheInfoHtml() : aboutHtml(S.rows);
      document.title = route.page === 'avalanche' ? 'Avalanche information · peaktoswell' : 'About · peaktoswell';
    } else {
      root.innerHTML = resortsHtml(S.rows, S.favs, S.query, S.index && S.index.generated_at, S.baseSaved);
      document.title = 'peaktoswell';
      if (!keepScroll) window.scrollTo(0, S.previous && S.previous.name === 'resort' ? S.listScroll : 0);
      return;
    }
    if (!keepScroll) window.scrollTo(0, 0);
  }

  /** A resort that has been opened is to be seen without a connection too, picture included: ask for it once, quietly. */
  function keepPicture(id) {
    const entry = S.satellite.get(id);
    const row = rowOf(id);
    const view = entry && row ? satelliteView(entry.data, row.name) : null;
    if (!view || S.warmed.has(view.src) || entry.saved || (navigator.connection && navigator.connection.saveData)) return;
    S.warmed.add(view.src);
    fetch(view.src).catch(() => S.warmed.delete(view.src));
  }

  async function refreshResort(id, force = false) {
    const changed = await loadResort(id, force);
    if (changed && onResort(S.route) && S.route.id === id) draw(true);
    keepPicture(id);
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
      if (S.resorts && onResort(S.route)) refreshResort(S.route.id);
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
    S.zoomed = false;
    draw(sameResort && !next.full && !(S.previous && S.previous.full));
    if (S.resorts && onResort(next)) refreshResort(next.id);
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
    if (event.target.closest('[data-zoom]')) {
      S.zoomed = !S.zoomed;
      draw(true);
      return;
    }
    // Closing the picture goes back to the tab it was opened from, so that the phone's own back button does not open it again.
    const close = event.target.closest('[data-close]');
    if (close && S.previous && S.previous.name === 'resort' && S.previous.id === S.route.id && S.previous.tab === 'satellite' && !S.previous.full) {
      event.preventDefault();
      history.back();
      return;
    }
    const back = event.target.closest('[data-back]');
    if (back && S.previous && S.previous.name === 'resorts') {
      event.preventDefault();
      history.back();
      return;
    }
    // "Up" from a screen that was opened from its parent goes back to it, so that the phone's back button does not return here.
    const up = event.target.closest('[data-up]');
    const fromResort = S.route.name === 'avalanche' && S.previous && S.previous.name === 'resort' && S.previous.id === S.route.id && !S.previous.full;
    const fromAbout = S.route.name === 'about' && S.route.page && S.previous && S.previous.name === 'about' && !S.previous.page;
    if (up && (fromResort || fromAbout)) {
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

  // A picture that cannot be loaded (no connection, and never kept on this device) gives way to a few words.
  root.addEventListener(
    'error',
    (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.hasAttribute('data-sat')) return;
      const holder = image.closest('.sat-pic') || image.closest('.viewer-stage');
      if (holder) holder.outerHTML = SAT_MISSING;
    },
    true,
  );

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
    if (onResort(S.route) && S.resorts) refreshResort(S.route.id);
  });
  /** Everything on screen, and the favourites, asked for once more. */
  function askAgain() {
    if (!S.route) return;
    S.baseAt = 0;
    refreshBase();
    if (S.resorts && onResort(S.route)) refreshResort(S.route.id, true);
    if (S.resorts) refreshFavourites(true);
  }
  // Back on the network.
  window.addEventListener('online', askAgain);

  // The service worker keeps the app and the data it has shown, for use without a connection.
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
    navigator.serviceWorker.register('sw.js').catch((error) => console.warn('peaktoswell: offline use is not available:', error));
    // On the very first visit the list was loaded before the worker took over, so it has kept
    // nothing yet. When it takes over (then, and after every new version) the files are asked
    // for again through it: one visit is enough to open the app without a connection.
    navigator.serviceWorker.addEventListener('controllerchange', askAgain);
  }

  go();
}

if (typeof document !== 'undefined') start();
