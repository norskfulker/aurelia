import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { navigate } from '../App';
import { useData, useToast } from '../lib/data';
import { errText, supabase } from '../lib/supabase';
import { CryptoMethod, EXPLORERS, Payout, WalletKind, fmt, fmt0, fmtDateTime, short } from '../lib/types';
import { Badge, Card, CoinIcon, CopyButton, Empty, Icon, Modal, Seg, useConfirm } from '../ui/kit';

export default function Wallet() {
  const { me, settings: s, products, orders, payouts, methods, rpc } = useData();
  const confirm = useConfirm();
  const [modal, setModal] = useState<null | 'deposit' | 'withdraw' | 'addMethod'>(() => (location.hash.includes('deposit=1') ? 'deposit' : null));
  useEffect(() => {
    const on = () => { if (location.hash.includes('deposit=1')) setModal('deposit'); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const [buying, setBuying] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState<number | undefined>(undefined);
  if (!me) return null;
  const mName = (code: string) => { const m = methods.find((x) => x.code === code); return m ? `${m.asset} · ${m.network}` : code; };
  const canRefund = (created: string) => Date.now() - new Date(created).getTime() < s.refund_days * 86400000;

  return (
    <div className="page">
      <div className="grid g2">
        <div className="card gold wallet-card">
          <div className="row between"><span className="eyebrow">Package wallet</span><span className="icon-box"><Icon name="wallet" size={16} /></span></div>
          <div className="balance mono">{fmt(me.wallet_package)}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>Funded by crypto deposits. Used to buy academy packs.</div>
          <div className="row mt wrap"><button className="btn primary" onClick={() => setModal('deposit')}><Icon name="download" size={16} />Deposit crypto</button></div>
        </div>
        <div className="card em wallet-card">
          <div className="row between"><span className="eyebrow">Free balance</span><span className="icon-box em"><Icon name="coin" size={16} /></span></div>
          <div className="balance mono em-text">{fmt(me.wallet_free)}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>Commissions and leaderboard rewards. Withdraw it or use it for packs.</div>
          <div className="row mt wrap">
            <button className="btn em" onClick={() => setModal('withdraw')}><Icon name="upload" size={16} />Withdraw</button>
            {me.kyc !== 'verified' && <button className="btn sm ghost" onClick={() => navigate('/app/profile')}><Icon name="shield" size={14} />Verify to withdraw</button>}
          </div>
        </div>
      </div>

      <Card title="Academy store" hint="One-time purchases. Your total purchases are your business volume and set your earnings cap.">
        <div className="grid g4">
          {products.map((p, i) => (
            <div key={p.id} className={`card product ${i === 1 ? 'feature' : 'flat'}`}>
              <div className="row between"><b>{p.name}</b>{i === 1 && <Badge tone="gold">Popular</Badge>}</div>
              <div className="price-tag">{fmt0(p.price)}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: -8 }}>{p.tagline} · {p.bv} BV</div>
              <ul>{p.includes.map((x) => <li key={x}><Icon name="check" size={14} stroke={2.2} />{x}</li>)}</ul>
              <div style={{ marginTop: 'auto' }}>
                <div className="dim" style={{ fontSize: 11.5, marginBottom: 8 }}>Raises your cap by {fmt0(p.price * s.cap_multiple)} per cycle</div>
                <button className={`btn block ${i === 1 ? 'primary' : ''}`} onClick={() => setBuying(p.id)}><Icon name="cart" size={15} />Buy</button>
              </div>
            </div>
          ))}
        </div>
        <div className="notice mt"><Icon name="info" size={16} />{s.refund_days}-day refund window on every pack. A refund reverses the pack's volume and any fast-start bonus it paid.</div>
      </Card>

      <PayoutMethods onAdd={() => setModal('addMethod')} />

      <div className="grid g2">
        <Card title="Deposits & withdrawals" hint="Status updates in real time">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Type</th><th>Method</th><th className="r">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="muted">{fmtDateTime(p.created_at)}</td>
                    <td>{p.kind === 'deposit' ? <span className="row" style={{ gap: 6 }}><Icon name="download" size={14} />Deposit</span> : <span className="row" style={{ gap: 6 }}><Icon name="upload" size={14} />Withdrawal</span>}</td>
                    <td className="muted">{mName(p.method_code)}{p.tx_hash && <> · <a href={EXPLORERS[p.method_code]?.(p.tx_hash)} target="_blank" rel="noreferrer" className="mono">{short(p.tx_hash, 5)}</a></>}</td>
                    <td className="r mono">{fmt(p.amount)}{p.fee > 0 && <div className="dim" style={{ fontSize: 11 }}>fee {fmt(p.fee)}</div>}</td>
                    <td>{p.status === 'pending' ? <Badge tone="gold">{p.kind === 'deposit' ? (p.tx_hash ? 'Confirming' : 'Awaiting payment') : 'Processing'}</Badge> : p.status === 'completed' ? <Badge tone="ok">Completed</Badge> : <Badge tone="bad">Rejected</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!payouts.length && <Empty icon="wallet">No deposits or withdrawals yet.</Empty>}
          </div>
        </Card>
        <Card title="My orders">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Pack</th><th className="r">Amount</th><th className="r"></th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="muted">{fmtDateTime(o.created_at)}</td>
                    <td>{products.find((p) => p.id === o.product_id)?.name}<div className="dim" style={{ fontSize: 11 }}>from {o.wallet === 'package' ? 'package wallet' : 'free balance'}</div></td>
                    <td className="r mono">{fmt(o.amount)}</td>
                    <td className="r">
                      {o.status === 'refunded' ? <Badge tone="bad">Refunded</Badge>
                        : canRefund(o.created_at) ? <button className="btn sm" onClick={async () => {
                          if (await confirm({ title: 'Refund this pack?', body: <>{fmt(o.amount)} returns to your {o.wallet === 'package' ? 'package wallet' : 'free balance'}. The pack's volume and any fast-start bonus it paid are reversed.</>, confirm: 'Refund pack', tone: 'danger' }))
                            rpc('refund_order', { p_order: o.id }, 'Pack refunded');
                        }}>Refund</button>
                        : <Badge tone="ok">Final</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!orders.length && <Empty icon="cart">No orders yet.</Empty>}
          </div>
        </Card>
      </div>

      {modal === 'deposit' && <DepositModal presetAmount={depositAmount} onClose={() => { setDepositAmount(undefined); setModal(null); if (location.hash.includes('deposit=1')) history.replaceState(null, '', location.pathname + '#/app/wallet'); }} />}
      {modal === 'withdraw' && <WithdrawModal onClose={() => setModal(null)} onAddMethod={() => setModal('addMethod')} />}
      {modal === 'addMethod' && <AddMethodModal onClose={() => setModal(null)} />}
      {buying && <BuyModal productId={buying} onClose={() => setBuying(null)} onDeposit={(amt) => { setBuying(null); setDepositAmount(amt); setModal('deposit'); }} />}
    </div>
  );
}

/** Two-step picker: choose the coin first, then the network it travels on. */
function CryptoNetworkPicker({ methods, isAvailable, value, onChange, mode }: {
  methods: CryptoMethod[]; isAvailable: (m: CryptoMethod) => boolean; value: string; onChange: (code: string) => void; mode: 'deposit' | 'withdraw';
}) {
  const assets = [...new Set(methods.map((m) => m.asset))];
  const current = methods.find((m) => m.code === value);
  const asset = current?.asset || assets.find((a) => methods.some((m) => m.asset === a && isAvailable(m))) || assets[0];
  const networks = methods.filter((m) => m.asset === asset).sort((a, b) => a.sort - b.sort);

  // Keep a valid selection when the coin changes or availability loads
  useEffect(() => {
    if (!current || !isAvailable(current)) {
      const first = methods.filter((m) => m.asset === asset).find(isAvailable);
      if (first && first.code !== value) onChange(first.code);
    }
  }, [asset, methods.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickAsset = (a: string) => {
    const first = methods.filter((m) => m.asset === a).sort((x, y) => x.sort - y.sort).find(isAvailable);
    if (first) onChange(first.code);
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="field">
        <label>1 · Choose crypto</label>
        <div className="coin-pick">
          {assets.map((a) => {
            const ok = methods.some((m) => m.asset === a && isAvailable(m));
            return (
              <button type="button" key={a} className={`coin-opt ${a === asset ? 'on' : ''}`} disabled={!ok} onClick={() => pickAsset(a)}>
                <CoinIcon asset={a} />
                <span><b>{a}</b><small>{a === 'USDT' ? 'Tether' : a === 'USDC' ? 'USD Coin' : a === 'SOL' ? 'Solana' : a}</small></span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="field">
        <label>2 · Choose network {networks.length === 1 && <span className="dim">only one for {asset}</span>}</label>
        <div className="net-pick" role="radiogroup">
          {networks.map((m) => {
            const ok = isAvailable(m);
            return (
              <button type="button" role="radio" aria-checked={m.code === value} key={m.code} className={`net-opt ${m.code === value ? 'on' : ''}`} disabled={!ok} onClick={() => onChange(m.code)}>
                <span className="net-dot" />
                <span className="net-name">{m.network.replace(/ \((.+)\)/, '')}<small>{(m.network.match(/\((.+)\)/) || [])[1] || (m.code === 'SOL' ? 'Native' : '')}</small></span>
                <span className="net-meta">{!ok ? 'Unavailable' : mode === 'deposit' ? `Min ${fmt0(m.min_deposit)} · ${m.eta}` : `Fee ${fmt0(m.withdraw_fee_flat)} + ${(m.withdraw_fee_pct * 100).toFixed(1)}%`}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Address / hash input with a one-tap Paste button. */
function PasteInput({ value, onChange, placeholder, invalid }: { value: string; onChange: (v: string) => void; placeholder?: string; invalid?: boolean }) {
  const toast = useToast();
  const paste = async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (!t) return toast('Your clipboard is empty', 'err');
      onChange(t);
    } catch {
      toast('Allow clipboard access, or long-press the field to paste', 'err');
    }
  };
  return (
    <div className={`paste-input ${invalid ? 'invalid' : ''}`}>
      <input className="mono" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} autoCapitalize="off" autoCorrect="off" />
      {value
        ? <button type="button" className="btn sm ghost" onClick={() => onChange('')} aria-label="Clear"><Icon name="x" size={14} /></button>
        : <button type="button" className="btn sm" onClick={paste}><Icon name="copy" size={14} />Paste</button>}
    </div>
  );
}

function PayoutMethods({ onAdd }: { onAdd: () => void }) {
  const { payoutMethods, methods, refresh } = useData();
  const confirm = useConfirm();
  return (
    <Card title="Payout methods" hint="Saved withdrawal addresses. Funds can only be sent to addresses saved here."
      action={<button className="btn sm" onClick={onAdd}><Icon name="plus" size={14} />Add address</button>}>
      {payoutMethods.length ? (
        <div className="grid g3">
          {payoutMethods.map((pm) => {
            const m = methods.find((x) => x.code === pm.method_code);
            return (
              <div key={pm.id} className="leg">
                <div className="row between">
                  <div className="row">{m && <CoinIcon asset={m.asset} />}<div><b>{pm.label || m?.asset}</b><div className="dim" style={{ fontSize: 11.5 }}>{m?.network}</div></div></div>
                  <button className="btn sm icon ghost" aria-label="Remove address" onClick={async () => {
                    if (!(await confirm({ title: 'Remove this payout address?', body: <span className="mono">{pm.address}</span>, confirm: 'Remove', tone: 'danger' }))) return;
                    await supabase.from('payout_methods').delete().eq('id', pm.id);
                    refresh(['payoutMethods']);
                  }}><Icon name="trash" size={15} /></button>
                </div>
                <div className="mono muted" style={{ fontSize: 12, marginTop: 10, wordBreak: 'break-all' }}>{pm.address}</div>
              </div>
            );
          })}
        </div>
      ) : <Empty icon="wallet" title="No payout addresses yet" action={<button className="btn sm em" onClick={onAdd}>Add your first address</button>}>Add a USDT, USDC or SOL address to receive withdrawals.</Empty>}
    </Card>
  );
}

function DepositModal({ onClose, presetAmount }: { onClose: () => void; presetAmount?: number }) {
  const { methods, payouts, refresh } = useData();
  const toast = useToast();
  const [available, setAvailable] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState(presetAmount ?? 300);
  const [intent, setIntent] = useState<{ id: string; address: string; expires_at: string; method: string; amount: number } | null>(null);
  const [hash, setHash] = useState('');
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc('available_deposit_methods').then(({ data, error }) => {
      // If the lookup fails, fall back to enabled networks; start_deposit still validates on the server
      const list = error ? methods.filter((x) => x.listed !== false && x.deposit_enabled).map((x) => x.code) : ((data as string[] | null) || []);
      setAvailable(list);
      if (list.length) setCode((c) => c || list[0]);
    });
    // Resume an unpaid reservation from the last 24h
    const open = payouts.find((p) => p.kind === 'deposit' && p.status === 'pending' && !p.tx_hash && (p as Payout & { expires_at?: string }).expires_at && new Date((p as Payout & { expires_at?: string }).expires_at!) > new Date());
    if (open) setIntent({ id: open.id, address: open.address, expires_at: (open as Payout & { expires_at?: string }).expires_at!, method: open.method_code, amount: open.amount });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (intent) QRCode.toDataURL(intent.address, { margin: 1, width: 440, color: { dark: '#04100b', light: '#ffffff' } }).then(setQr); }, [intent]);
  const m = methods.find((x) => x.code === (intent?.method || code));
  const listed = methods.filter((x) => x.listed !== false);

  const reserve = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('start_deposit', { p_method: code, p_amount: amount });
    setBusy(false);
    if (error) return toast(errText(error), 'err');
    const d = data as { id: string; address: string; expires_at: string };
    setIntent({ ...d, method: code, amount });
    refresh(['payouts']);
  };
  const submitHash = async () => {
    if (!intent) return;
    setBusy(true);
    const { error } = await supabase.rpc('submit_deposit_hash', { p_id: intent.id, p_tx_hash: hash });
    setBusy(false);
    if (error) return toast(errText(error), 'err');
    toast('Deposit submitted. We\'ll credit it once confirmed on-chain.');
    refresh(['payouts', 'txs']);
    onClose();
  };

  if (available && !available.length) return (
    <Modal title="Deposit crypto" onClose={onClose}>
      <Empty icon="info" title="Deposits are being set up">No deposit network is enabled yet. Please check back shortly.</Empty>
    </Modal>
  );

  return (
    <Modal title={<><span className="icon-box"><Icon name="download" size={16} /></span>Deposit crypto</>} onClose={onClose} wide>
      {!intent ? (
        <div className="stack" style={{ gap: 16 }}>
          {available ? <CryptoNetworkPicker methods={listed} isAvailable={(x) => available.includes(x.code)} value={code} onChange={setCode} mode="deposit" /> : <div className="skeleton" style={{ height: 120 }} />}
          <div className="field"><label>3 · Amount you'll send (USD value)</label><input className="input mono" type="number" min={m?.min_deposit} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            {m && <span className="help">Minimum {fmt(m.min_deposit)} · {m.confirmations} confirmations · {m.eta}</span>}
          </div>
          <button className="btn primary block" disabled={busy || !code || !m || amount < m.min_deposit} onClick={reserve}>{busy && <span className="spinner" />}Get my deposit address<Icon name="arrowRight" size={16} /></button>
        </div>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <div className="deposit-address">
            <div className="qr-frame">
              {qr ? <img src={qr} alt={`${m?.asset} deposit address QR code`} className="qr" /> : <div className="qr skeleton" />}
              {m && <span className="qr-coin"><CoinIcon asset={m.asset} /></span>}
            </div>
            <div className="stack" style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}>{m && <CoinIcon asset={m.asset} />}<div><b>{m?.asset}</b> <span className="muted">on {m?.network}</span></div></div>
              <div className="field"><label>Deposit address</label>
                <div className="addr-box"><span className="mono">{intent.address}</span></div>
                <CopyButton text={intent.address} label="Copy address" />
              </div>
              <div className="field"><label>Amount to send</label>
                <div className="row"><span className="mono" style={{ fontSize: 20, fontWeight: 700 }}>{fmt(intent.amount)}</span><span className="dim" style={{ fontSize: 12 }}>in {m?.asset}</span></div>
              </div>
              <dl className="kv">
                <dt>Reserved until</dt><dd>{new Date(intent.expires_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</dd>
                <dt>Confirmations</dt><dd className="mono">{m?.confirmations} · {m?.eta}</dd>
              </dl>
            </div>
          </div>
          <div className="notice bad"><Icon name="alert" size={16} />Send only {m?.asset} on {m?.network}. This address is assigned to this deposit, so don't reuse it for future deposits.</div>
          <div className="field"><label>4 · Paste the transaction hash after sending</label><PasteInput value={hash} onChange={(v) => setHash(v.trim())} placeholder="Transaction hash / ID from your wallet or exchange" /></div>
          <div className="row">
            <button className="btn" onClick={onClose}>I'll do it later</button>
            <button className="btn primary" style={{ flex: 1 }} disabled={busy || hash.length < 16} onClick={submitHash}>{busy && <span className="spinner" />}Submit deposit</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function AddMethodModal({ onClose }: { onClose: () => void }) {
  const { methods, rpc } = useData();
  const usable = methods.filter((m) => m.withdraw_enabled && m.listed !== false);
  const [code, setCode] = useState(usable[0]?.code || '');
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const m = methods.find((x) => x.code === code);
  const valid = m ? new RegExp(m.address_pattern).test(address.trim()) : false;
  return (
    <Modal title="Add payout address" onClose={onClose} wide>
      <div className="stack" style={{ gap: 16 }}>
        <CryptoNetworkPicker methods={methods.filter((x) => x.listed !== false)} isAvailable={(x) => x.withdraw_enabled} value={code} onChange={setCode} mode="withdraw" />
        <div className="field">
          <label>3 · Your {m?.asset} address on {m?.network}</label>
          <PasteInput value={address} onChange={setAddress} invalid={!!address && !valid} placeholder={m?.code.includes('TRC20') ? 'T… (Tron address)' : m?.code === 'SOL' ? 'Solana address' : '0x… address'} />
          {address && !valid && <span className="err">That doesn't look like a valid {m?.network} address</span>}
        </div>
        <div className="field"><label>Label <span className="dim">optional</span></label><input className="input" maxLength={30} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Binance, Ledger" /></div>
        <div className="notice"><Icon name="info" size={16} />Double-check the address. Payouts sent to a wrong address can't be reversed.</div>
        <button className="btn em block" disabled={!valid || busy} onClick={async () => {
          setBusy(true);
          const ok = await rpc('add_payout_method', { p_method: code, p_address: address.trim(), p_label: label }, 'Payout address saved');
          setBusy(false);
          if (ok) onClose();
        }}>{busy && <span className="spinner" />}Save address</button>
      </div>
    </Modal>
  );
}

function WithdrawModal({ onClose, onAddMethod }: { onClose: () => void; onAddMethod: () => void }) {
  const { me, payoutMethods, methods, rpc } = useData();
  const [pmId, setPmId] = useState(payoutMethods[0]?.id || '');
  const [amount, setAmount] = useState(Math.floor(me!.wallet_free));
  const [busy, setBusy] = useState(false);
  const pm = payoutMethods.find((p) => p.id === pmId);
  const m = methods.find((x) => x.code === pm?.method_code);
  const fee = m ? Math.round((m.withdraw_fee_flat + amount * m.withdraw_fee_pct) * 100) / 100 : 0;

  if (me!.kyc !== 'verified') return (
    <Modal title="Withdraw" onClose={onClose}>
      <Empty icon="shield" title="Verify your identity first" action={<button className="btn primary" onClick={() => { onClose(); navigate('/app/profile'); }}>Start verification</button>}>
        Withdrawals unlock after a quick KYC check. It takes about two minutes.
      </Empty>
    </Modal>
  );
  if (!payoutMethods.length) return (
    <Modal title="Withdraw" onClose={onClose}>
      <Empty icon="wallet" title="Add a payout address" action={<button className="btn em" onClick={onAddMethod}>Add address</button>}>Save at least one withdrawal address first.</Empty>
    </Modal>
  );

  return (
    <Modal title="Withdraw free balance" onClose={onClose}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="field"><label>Send to</label>
          <select className="input" value={pmId} onChange={(e) => setPmId(e.target.value)}>
            {payoutMethods.map((p) => { const mm = methods.find((x) => x.code === p.method_code); return <option key={p.id} value={p.id}>{p.label || mm?.asset} · {mm?.network} · {short(p.address)}</option>; })}
          </select>
        </div>
        <div className="field">
          <label>Amount <button type="button" className="btn sm ghost" onClick={() => setAmount(Math.floor(me!.wallet_free * 100) / 100)}>Max {fmt(me!.wallet_free)}</button></label>
          <input className="input mono" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </div>
        <dl className="kv">
          <dt>Minimum</dt><dd className="mono">{m ? fmt(m.min_withdraw) : '—'}</dd>
          <dt>Network fee</dt><dd className="mono">{fmt(fee)}</dd>
          <dt>You receive</dt><dd className="mono up" style={{ fontWeight: 650 }}>{fmt(Math.max(0, amount - fee))}</dd>
        </dl>
        <button className="btn em block" disabled={busy || !m || amount < m.min_withdraw || amount > me!.wallet_free || fee >= amount} onClick={async () => {
          setBusy(true);
          const ok = await rpc('request_withdrawal', { p_payout_method: pmId, p_amount: amount }, 'Withdrawal requested. You\'ll be notified when it\'s sent.');
          setBusy(false);
          if (ok) onClose();
        }}>{busy && <span className="spinner" />}Request withdrawal</button>
      </div>
    </Modal>
  );
}

function BuyModal({ productId, onClose, onDeposit }: { productId: string; onClose: () => void; onDeposit: (amount: number) => void }) {
  const { me, products, settings: s, rpc, methods } = useData();
  const p = products.find((x) => x.id === productId)!;
  const minDep = Math.min(...methods.filter((x) => x.listed !== false).map((x) => x.min_deposit), 20);
  const need = Math.max(Math.ceil(p.price - me!.wallet_package), minDep);
  const [wallet, setWallet] = useState<WalletKind>(me!.wallet_package >= p.price ? 'package' : me!.wallet_free >= p.price ? 'free' : 'package');
  const [busy, setBusy] = useState(false);
  const bal = wallet === 'package' ? me!.wallet_package : me!.wallet_free;
  return (
    <Modal title={`Buy ${p.name}`} onClose={onClose}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="row between"><span className="muted">Price</span><span className="price-tag" style={{ fontSize: 26 }}>{fmt(p.price)}</span></div>
        <div className="field"><label>Pay from</label>
          <Seg value={wallet} onChange={setWallet} options={[{ v: 'package', l: `Package · ${fmt(me!.wallet_package)}` }, { v: 'free', l: `Free · ${fmt(me!.wallet_free)}` }]} />
        </div>
        <dl className="kv">
          <dt>Business volume</dt><dd className="mono">+{p.bv} BV</dd>
          <dt>New earnings cap</dt><dd className="mono up">{fmt((me!.pv + p.price) * s.cap_multiple)} / cycle</dd>
          <dt>Refundable for</dt><dd>{s.refund_days} days</dd>
        </dl>
        {bal < p.price ? (
          <>
            <div className="notice"><Icon name="info" size={16} /><span>{wallet === 'free' ? <>Your free balance is {fmt(p.price - bal)} short. </> : null}Deposit <b style={{ color: 'var(--text)' }}>{fmt0(need)}</b> to your package wallet and you can finish buying {p.name} straight after it's confirmed.</span></div>
            <button className="btn primary block" onClick={() => onDeposit(need)}><Icon name="download" size={16} />Deposit {fmt0(need)} to buy {p.name}</button>
          </>
        ) : (
          <button className="btn primary block" disabled={busy} onClick={async () => {
            setBusy(true);
            const ok = await rpc('purchase', { p_product: p.id, p_wallet: wallet }, `${p.name} unlocked. Welcome to the academy!`);
            setBusy(false);
            if (ok) onClose();
          }}>{busy && <span className="spinner" />}Confirm purchase</button>
        )}
      </div>
    </Modal>
  );
}
