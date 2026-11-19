// Gold news from the last 24 hours with a simple keyword market-bias tag per headline.
// Public read-only proxy (no user data), cached in memory for 10 minutes.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

type Bias = 'bullish' | 'bearish' | 'neutral';
interface Item { title: string; url: string; source: string; published: string; bias: Bias }

const BULL = [/\brise[sn]?\b/, /\brising\b/, /\brall(y|ies|ied)\b/, /\bsurg(e|es|ed|ing)\b/, /\bgain(s|ed)?\b/, /\brecord\b/, /\ball[- ]time high\b/, /\bjump(s|ed)?\b/, /\bclimb(s|ed)?\b/, /\bsoar(s|ed)?\b/, /\bhigher\b/, /\bsafe[- ]haven\b/, /\brate cuts?\b/, /\bweak(er)? dollar\b/, /\bbull(ish)?\b/, /\brebound(s|ed)?\b/, /\bpositive\b/, /\bdemand\b/];
const BEAR = [/\bfall(s|en)?\b/, /\bfell\b/, /\bdrop(s|ped)?\b/, /\bslid(e|es)?\b/, /\bslump(s|ed)?\b/, /\bdeclin(e|es|ed)\b/, /\blower\b/, /\bloss(es)?\b/, /\bplung(e|es|ed)\b/, /\bretreat(s|ed)?\b/, /\bstrong(er)? dollar\b/, /\brate hikes?\b/, /\bsell[- ]?off\b/, /\bbear(ish)?\b/, /\btumbl(e|es|ed)\b/, /\bdip(s|ped)?\b/, /\bnegative\b/, /\bpressure\b/];

function biasOf(title: string): Bias {
  const t = title.toLowerCase();
  const b = BULL.filter((r) => r.test(t)).length;
  const s = BEAR.filter((r) => r.test(t)).length;
  return b > s ? 'bullish' : s > b ? 'bearish' : 'neutral';
}

const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).trim();
const tag = (xml: string, name: string) => decode((xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)) || [])[1] || '');

let cache: { at: number; body: string } | null = null;

async function fromGdelt(): Promise<Item[]> {
  const q = encodeURIComponent('("gold price" OR "gold prices" OR bullion OR "spot gold") sourcelang:english');
  const res = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=60&timespan=24h&format=json&sort=datedesc`);
  const text = await res.text();
  if (!res.ok || !text.trim().startsWith('{')) throw new Error('gdelt unavailable');
  const j = JSON.parse(text) as { articles?: { url: string; title: string; domain: string; seendate: string }[] };
  return (j.articles || []).map((a) => {
    const d = a.seendate.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z');
    return { title: decode(a.title), url: a.url, source: a.domain, published: new Date(d).toISOString(), bias: biasOf(a.title) };
  });
}

async function fromRss(url: string, onlyGold: boolean): Promise<Item[]> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AureliaNews/1.0)', Accept: 'application/rss+xml, application/xml, text/xml' } });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  const xml = await res.text();
  const host = new URL(url).host.replace(/^www\.|^feeds\./, '');
  const out: Item[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const raw = m[1];
    const source = tag(raw, 'source') || (host.includes('yahoo') ? 'Yahoo Finance' : host.includes('fxstreet') ? 'FXStreet' : host);
    let title = tag(raw, 'title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const published = new Date(tag(raw, 'pubDate'));
    const link = tag(raw, 'link');
    if (!title || !link || isNaN(published.getTime())) continue;
    if (onlyGold && !/\b(gold|xau|bullion)\b/i.test(title)) continue;
    out.push({ title, url: link, source, published: published.toISOString(), bias: biasOf(title) });
  }
  return out;
}

const fromGoogle = () => fromRss(`https://news.google.com/rss/search?q=${encodeURIComponent('(gold price OR gold prices OR bullion OR XAU) when:1d')}&hl=en-US&gl=US&ceid=US:en`, false);
const fromYahoo = () => fromRss('https://feeds.finance.yahoo.com/rss/2.0/headline?s=GC=F&region=US&lang=en-US', true);
const fromFxStreet = () => fromRss('https://www.fxstreet.com/rss/news', true);

async function load(): Promise<string> {
  const errors: string[] = [];
  const settled = await Promise.allSettled([fromFxStreet(), fromYahoo(), fromGdelt(), fromGoogle()]);
  const raw: Item[] = [];
  for (const r of settled) { if (r.status === 'fulfilled') raw.push(...r.value); else errors.push(String(r.reason)); }
  if (!raw.length) throw new Error(errors.join('; ') || 'no news');
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const it of raw) {
    if (new Date(it.published).getTime() < cutoff) continue;
    const key = it.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(it);
  }
  items.sort((a, b) => b.published.localeCompare(a.published));
  const top = items.slice(0, 24);
  const bull = top.filter((i) => i.bias === 'bullish').length;
  const bear = top.filter((i) => i.bias === 'bearish').length;
  const score = top.length ? (bull - bear) / top.length : 0;
  return JSON.stringify({
    updated: new Date().toISOString(),
    bias: score > 0.12 ? 'bullish' : score < -0.12 ? 'bearish' : 'neutral',
    counts: { bullish: bull, bearish: bear, neutral: top.length - bull - bear },
    items: top,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (!cache || Date.now() - cache.at > 10 * 60 * 1000) cache = { at: Date.now(), body: await load() };
    return new Response(cache.body, { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } });
  } catch (e) {
    if (cache) return new Response(cache.body, { headers: { ...CORS, 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ error: String(e), items: [] }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
