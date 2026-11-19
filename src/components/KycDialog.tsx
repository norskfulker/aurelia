import { useEffect, useRef, useState } from 'react';
import { useData, useToast } from '../lib/data';
import { compressImage, scanDocument, ScanResult } from '../lib/ocr';
import { errText, supabase } from '../lib/supabase';
import { Badge, Icon, Modal } from '../ui/kit';

type DocType = 'Passport' | 'National ID' | 'Driving licence';
interface Details { fullName: string; docNumber: string; dob: string; expiry: string; nationality: string }

export default function KycDialog({ onClose }: { onClose: () => void }) {
  const { me, refresh } = useData();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [docType, setDocType] = useState<DocType>('Passport');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docUrl, setDocUrl] = useState('');
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ p: 0, label: '' });
  const [details, setDetails] = useState<Details>({ fullName: me?.name || '', docNumber: '', dob: '', expiry: '', nationality: '' });
  const [selfie, setSelfie] = useState<File | null>(null);
  const [selfieUrl, setSelfieUrl] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => { if (docUrl) URL.revokeObjectURL(docUrl); if (selfieUrl) URL.revokeObjectURL(selfieUrl); }, [docUrl, selfieUrl]);

  const onDoc = async (f: File) => {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast('Upload a JPG, PNG or WebP photo', 'err');
    if (f.size > 15 * 1024 * 1024) return toast('Photo is too large (max 15 MB)', 'err');
    setDocFile(f);
    setDocUrl(URL.createObjectURL(f));
    setScan(null);
    setScanning(true);
    try {
      const r = await scanDocument(f, (p, label) => setProgress({ p, label }));
      setScan(r);
      setDetails((d) => ({
        fullName: r.fullName || d.fullName, docNumber: r.docNumber || d.docNumber,
        dob: r.dob || d.dob, expiry: r.expiry || d.expiry, nationality: r.nationality || d.nationality,
      }));
    } catch {
      setScan({ fullName: '', docNumber: '', dob: '', expiry: '', nationality: '', source: 'none', confidence: 0, raw: '' });
    } finally {
      setScanning(false);
    }
  };

  const age = details.dob ? (Date.now() - new Date(details.dob).getTime()) / (365.25 * 86400000) : null;
  const expired = details.expiry ? new Date(details.expiry) < new Date() : false;
  const detailsValid = details.fullName.trim().length >= 3 && details.docNumber.trim().length >= 4 && !!details.dob && (age ?? 0) >= 18 && !expired;

  const submit = async () => {
    if (!me || !docFile || !selfie) return;
    setBusy(true);
    try {
      const ts = Date.now();
      const docPath = `${me.id}/document-${ts}.jpg`;
      const selfiePath = `${me.id}/selfie-${ts}.jpg`;
      const [d, s] = await Promise.all([compressImage(docFile), compressImage(selfie)]);
      const up1 = await supabase.storage.from('kyc').upload(docPath, d, { contentType: 'image/jpeg' });
      if (up1.error) throw up1.error;
      const up2 = await supabase.storage.from('kyc').upload(selfiePath, s, { contentType: 'image/jpeg' });
      if (up2.error) throw up2.error;
      const { error } = await supabase.rpc('submit_kyc', {
        p_doc_type: docType, p_doc_number: details.docNumber, p_full_name: details.fullName, p_dob: details.dob || null,
        p_nationality: details.nationality, p_expiry: details.expiry || null, p_doc_path: docPath, p_selfie_path: selfiePath, p_ocr_raw: scan?.raw || '',
      });
      if (error) throw error;
      toast('Verification submitted. We\'ll notify you when it\'s reviewed.');
      await refresh(['me', 'kyc']);
      onClose();
    } catch (e) {
      toast(errText(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  const labels = ['Scan document', 'Confirm details', 'Selfie & finish'];
  return (
    <Modal title={<><span className="icon-box em"><Icon name="shield" size={16} /></span>Verify your identity</>} onClose={onClose} wide>
      <div className="stepper" aria-label={`Step ${step} of 3`}>
        {labels.map((l, i) => (
          <div key={l} style={{ display: 'contents' }}>
            <div className={`s ${step === i + 1 ? 'on' : ''} ${step > i + 1 ? 'done' : ''}`}><i>{step > i + 1 ? <Icon name="check" size={12} stroke={2.6} /> : i + 1}</i><span>{l}</span></div>
            {i < 2 && <div className={`bar ${step > i + 1 ? 'done' : ''}`} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="field"><label>Document type</label>
            <div className="method-grid">
              {(['Passport', 'National ID', 'Driving licence'] as DocType[]).map((t) => (
                <button key={t} type="button" className={`method ${docType === t ? 'on' : ''}`} onClick={() => setDocType(t)}>
                  <Icon name="id" size={20} /><b>{t}</b><span className="dim" style={{ fontSize: 11 }}>{t === 'Passport' ? 'Best auto-scan accuracy' : 'Front side with MRZ if present'}</span>
                </button>
              ))}
            </div>
          </div>
          {!docUrl ? <Dropzone label="Take or upload a photo of your document" hint="Flat surface, good light, all four corners visible" onFile={onDoc} capture="environment" />
            : (
              <div className="stack">
                <div className={scanning ? 'scan-overlay' : ''}><img src={docUrl} alt="Document preview" className="preview-img" /></div>
                {scanning ? (
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row between" style={{ fontSize: 12.5 }}><span className="row" style={{ gap: 8 }}><span className="spinner" />{progress.label || 'Scanning'}…</span><span className="mono dim">{Math.round(progress.p * 100)}%</span></div>
                    <div className="progress em"><i style={{ width: `${progress.p * 100}%` }} /></div>
                  </div>
                ) : scan && (
                  scan.source === 'none'
                    ? <div className="notice"><Icon name="info" size={16} />We couldn't read the document automatically. You can retake the photo or type the details in the next step.</div>
                    : <div className="notice em"><Icon name="check" size={16} />Scanned {scan.source === 'mrz' ? 'the machine-readable zone' : 'the document text'}. Detected {[scan.fullName && 'name', scan.docNumber && 'number', scan.dob && 'birth date', scan.expiry && 'expiry'].filter(Boolean).join(', ') || 'some fields'}.</div>
                )}
                <div className="row">
                  <label className="btn sm"><Icon name="camera" size={14} />Retake<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(e) => e.target.files?.[0] && onDoc(e.target.files[0])} /></label>
                </div>
              </div>
            )}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary" disabled={!docFile || scanning} onClick={() => setStep(2)}>Continue<Icon name="arrowRight" size={16} /></button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack" style={{ gap: 14 }}>
          <p className="muted" style={{ margin: 0 }}>Check everything matches your {docType.toLowerCase()} exactly, and edit anything the scanner got wrong.</p>
          <div className="grid g2" style={{ gap: 12 }}>
            <Field label="Full name (as on document)" auto={!!scan?.fullName} value={details.fullName} onChange={(v) => setDetails({ ...details, fullName: v })} />
            <Field label="Document number" auto={!!scan?.docNumber} value={details.docNumber} mono onChange={(v) => setDetails({ ...details, docNumber: v.toUpperCase() })} />
            <Field label="Date of birth" type="date" auto={!!scan?.dob} value={details.dob} onChange={(v) => setDetails({ ...details, dob: v })} error={age != null && age < 18 ? 'You must be 18 or older' : undefined} />
            <Field label="Expiry date" type="date" auto={!!scan?.expiry} value={details.expiry} onChange={(v) => setDetails({ ...details, expiry: v })} error={expired ? 'This document has expired' : undefined} />
            <Field label="Nationality (3-letter code)" auto={!!scan?.nationality} value={details.nationality} mono onChange={(v) => setDetails({ ...details, nationality: v.toUpperCase().slice(0, 3) })} />
          </div>
          <div className="row between">
            <button className="btn" onClick={() => setStep(1)}><Icon name="chevronLeft" size={16} />Back</button>
            <button className="btn primary" disabled={!detailsValid} onClick={() => setStep(3)}>Looks right<Icon name="arrowRight" size={16} /></button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="stack" style={{ gap: 16 }}>
          {!selfieUrl ? <Dropzone label="Take a selfie holding your document" hint="Face and document clearly visible, no glasses or hat" onFile={(f) => { setSelfie(f); setSelfieUrl(URL.createObjectURL(f)); }} capture="user" icon="camera" />
            : (
              <div className="grid g2" style={{ gap: 12 }}>
                <img src={docUrl} alt="Document" className="preview-img" style={{ maxHeight: 180 }} />
                <div style={{ position: 'relative' }}>
                  <img src={selfieUrl} alt="Selfie" className="preview-img" style={{ maxHeight: 180 }} />
                  <label className="btn sm" style={{ position: 'absolute', right: 8, bottom: 8 }}><Icon name="camera" size={14} />Retake<input type="file" accept="image/jpeg,image/png,image/webp" capture="user" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSelfie(f); setSelfieUrl(URL.createObjectURL(f)); } }} /></label>
                </div>
              </div>
            )}
          <div className="card flat" style={{ padding: 14 }}>
            <dl className="kv">
              <dt>Document</dt><dd>{docType}</dd>
              <dt>Name</dt><dd>{details.fullName}</dd>
              <dt>Number</dt><dd className="mono">{details.docNumber}</dd>
              <dt>Date of birth</dt><dd className="mono">{details.dob}</dd>
              {details.expiry && <><dt>Expires</dt><dd className="mono">{details.expiry}</dd></>}
            </dl>
          </div>
          <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I confirm these details are true and consent to Aurelia processing my ID images to verify my identity. Images are stored privately and only used for verification.</label>
          <div className="row between">
            <button className="btn" onClick={() => setStep(2)} disabled={busy}><Icon name="chevronLeft" size={16} />Back</button>
            <button className="btn em" disabled={!selfie || !consent || busy} onClick={submit}>{busy ? <span className="spinner" /> : <Icon name="shield" size={16} />}Submit for review</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, value, onChange, auto, type = 'text', mono, error }: { label: string; value: string; onChange: (v: string) => void; auto?: boolean; type?: string; mono?: boolean; error?: string }) {
  return (
    <div className="field">
      <label>{label}{auto && <Badge tone="ok">Scanned</Badge>}</label>
      <input className={`input ${mono ? 'mono' : ''} ${error ? 'invalid' : ''}`} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      {error && <span className="err">{error}</span>}
    </div>
  );
}

function Dropzone({ label, hint, onFile, capture, icon = 'scan' }: { label: string; hint: string; onFile: (f: File) => void; capture: 'user' | 'environment'; icon?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div className={`dropzone ${drag ? 'drag' : ''}`} role="button" tabIndex={0}
      onClick={() => ref.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}>
      <span className="icon-box em lg"><Icon name={icon} size={22} /></span>
      <div style={{ fontWeight: 620 }}>{label}</div>
      <div className="muted" style={{ fontSize: 12.5 }}>{hint}</div>
      <span className="btn sm"><Icon name="upload" size={14} />Choose photo</span>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" capture={capture} hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  );
}
