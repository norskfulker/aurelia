import { useEffect, useState } from 'react';
import type { Settings } from '../lib/types';
import { fmt0 } from '../lib/types';
import { Icon, Modal } from '../ui/kit';

const KEY = 'aurelia.earnIntro.hide';
export const earnIntroHidden = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

export default function EarnDialog({ s, onClose }: { s: Settings; onClose: () => void }) {
  const steps = [
    { icon: 'share', tone: 'em', title: 'Share your link', body: 'Send your referral link, or place someone directly into an open spot in your tree. They join once they confirm their email.', visual: 'share' },
    { icon: 'zap', tone: 'gold', title: `${s.fast_start_pct * 100}% fast start`, body: `When one of your first ${s.fast_start_count} referrals buys their first academy pack, you earn ${s.fast_start_pct * 100}% of it straight away.`, visual: 'coin' },
    { icon: 'affiliate', tone: 'em', title: `${s.binary_pct * 100}% tree bonus`, body: `Pack sales on the left and right sides of your tree build volume. Each night the matched volume pays ${s.binary_pct * 100}%. Unlocks with ${s.qualify_directs} paid referrals.`, visual: 'tree' },
    { icon: 'users', tone: 'gold', title: `${s.matching_pct * 100}% matching`, body: `Earn ${s.matching_pct * 100}% of the tree bonuses your direct referrals earn, so helping your team succeed pays you too.`, visual: 'match' },
    { icon: 'trophy', tone: 'em', title: 'Ranks & leaderboard', body: 'Reach business and recruitment targets for one-time rank bonuses, and top the weekly leaderboard for extra prizes.', visual: 'trophy' },
    { icon: 'shield', tone: 'gold', title: 'Fair limits', body: `Tree bonus and matching are capped at ${s.cap_multiple}× your own pack purchases every ${s.cap_cycle_days} days (for example, ${fmt0(300)} gives a ${fmt0(900)} cap). Earnings depend on real sales and aren't guaranteed.`, visual: 'shield' },
  ];
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  const [hide, setHide] = useState(earnIntroHidden());
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => setI((x) => (x + 1) % steps.length), 3800);
    return () => clearTimeout(t);
  }, [i, auto, steps.length]);
  const close = () => { try { localStorage.setItem(KEY, hide ? '1' : '0'); } catch { /* ignore */ } onClose(); };
  const st = steps[i];

  return (
    <Modal title={<><span className="icon-box"><Icon name="coin" size={16} /></span>How you earn with Aurelia</>} onClose={close} wide>
      <div className="earn">
        <div className={`earn-visual v-${st.visual}`} key={st.visual}>
          <div className="orbit" />
          <span className={`earn-icon ${st.tone}`}><Icon name={st.icon} size={34} stroke={1.6} /></span>
          {st.visual === 'tree' && <><span className="leaf l1" /><span className="leaf l2" /><span className="leaf l3" /><span className="leaf l4" /></>}
          {st.visual === 'coin' && <><span className="spark s1">+10%</span><span className="spark s2">$</span></>}
          {st.visual === 'share' && <><span className="ping p1" /><span className="ping p2" /></>}
        </div>
        <div className="earn-copy" key={`c-${i}`}>
          <div className="eyebrow">Step {i + 1} of {steps.length}</div>
          <h3>{st.title}</h3>
          <p>{st.body}</p>
        </div>
        <div className="earn-dots" role="tablist">
          {steps.map((x, n) => (
            <button key={x.title} className={n === i ? 'on' : ''} aria-label={x.title} onClick={() => { setI(n); setAuto(false); }}>
              {n === i && auto && <i />}
            </button>
          ))}
        </div>
        <div className="row between wrap" style={{ marginTop: 18 }}>
          <label className="check" style={{ fontSize: 12.5 }}><input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />Don't show this again</label>
          <div className="row">
            {i > 0 && <button className="btn" onClick={() => { setI(i - 1); setAuto(false); }}><Icon name="chevronLeft" size={15} />Back</button>}
            {i < steps.length - 1
              ? <button className="btn primary" onClick={() => { setI(i + 1); setAuto(false); }}>Next<Icon name="chevronRight" size={15} /></button>
              : <button className="btn em" onClick={close}>Start growing<Icon name="arrowRight" size={15} /></button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
