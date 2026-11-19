import { useEffect, useState } from 'react';
import { Card, Empty, Icon } from '../ui/kit';

type Bias = 'bullish' | 'bearish' | 'neutral';
interface NewsItem { title: string; url: string; source: string; published: string; bias: Bias }
interface News { updated: string; bias: Bias; counts: Record<Bias, number>; items: NewsItem[] }

const URL_BASE = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function ago(iso: string) {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

const BIAS_META: Record<Bias, { label: string; icon: string; cls: string }> = {
  bullish: { label: 'Bullish', icon: 'trendUp', cls: 'ok' },
  bearish: { label: 'Bearish', icon: 'trendDown', cls: 'bad' },
  neutral: { label: 'Neutral', icon: 'minus', cls: 'mute' },
};

export default function NewsBoard({ limit = 10 }: { limit?: number }) {
  const [news, setNews] = useState<News | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!URL_BASE) { setState('error'); return; }
    let alive = true;
    const load = () => fetch(`${URL_BASE}/functions/v1/gold-news`, { headers: KEY ? { apikey: KEY } : {} })
      .then((r) => r.json())
      .then((j: News) => { if (alive) { if (j.items?.length) { setNews(j); setState('ready'); } else setState('error'); } })
      .catch(() => alive && setState('error'));
    load();
    const t = setInterval(load, 10 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const total = news ? news.counts.bullish + news.counts.bearish + news.counts.neutral : 0;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  const overall = news ? BIAS_META[news.bias] : null;

  return (
    <Card
      title={<><span className="icon-box"><Icon name="news" size={16} /></span>Gold news · 24h bias</>}
      hint="Headline sentiment from the last 24 hours. Opens the source article."
      action={overall && <span className={`badge ${overall.cls} bias-badge`}><Icon name={overall.icon} size={13} />{overall.label}</span>}
    >
      {state === 'loading' && <div className="stack">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44 }} />)}</div>}
      {state === 'error' && <Empty icon="news">News is unavailable right now. It refreshes automatically.</Empty>}
      {state === 'ready' && news && (
        <>
          <div className="bias-bar" role="img" aria-label={`${news.counts.bullish} bullish, ${news.counts.neutral} neutral, ${news.counts.bearish} bearish headlines`}>
            <i className="b-up" style={{ width: `${pct(news.counts.bullish)}%` }} />
            <i className="b-flat" style={{ width: `${pct(news.counts.neutral)}%` }} />
            <i className="b-down" style={{ width: `${pct(news.counts.bearish)}%` }} />
          </div>
          <div className="row between dim" style={{ fontSize: 11.5, margin: '6px 0 12px' }}>
            <span className="up">{news.counts.bullish} bullish</span><span>{news.counts.neutral} neutral</span><span className="down">{news.counts.bearish} bearish</span>
          </div>
          <ul className="news-list">
            {news.items.slice(0, limit).map((n) => {
              const b = BIAS_META[n.bias];
              return (
                <li key={n.url}>
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className="news-item">
                    <span className={`news-bias ${b.cls}`} title={b.label}><Icon name={b.icon} size={14} /></span>
                    <span className="news-body">
                      <span className="news-title">{n.title}</span>
                      <span className="news-meta">{n.source} · {ago(n.published)}</span>
                    </span>
                    <Icon name="external" size={14} />
                  </a>
                </li>
              );
            })}
          </ul>
          <div className="dim" style={{ fontSize: 11, marginTop: 10 }}>Sentiment is keyword-based and for context only, not trading advice.</div>
        </>
      )}
    </Card>
  );
}
