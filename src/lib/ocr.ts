// Client-side document scan: Tesseract OCR + MRZ (machine readable zone) parsing for passports and ID cards.
// Images never leave the browser during the scan.

export interface ScanResult {
  fullName: string;
  docNumber: string;
  dob: string; // yyyy-mm-dd
  expiry: string;
  nationality: string;
  source: 'mrz' | 'text' | 'none';
  confidence: number; // 0..100
  raw: string;
}

export async function scanDocument(file: Blob, onProgress: (p: number, label: string) => void): Promise<ScanResult> {
  const { createWorker } = await import('tesseract.js');
  onProgress(0.05, 'Loading scanner');
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress(0.35 + m.progress * 0.6, 'Reading document');
      else if (m.status.includes('load')) onProgress(0.05 + m.progress * 0.3, 'Loading scanner');
    },
  });
  try {
    const { data } = await worker.recognize(await enhance(file));
    onProgress(1, 'Done');
    return parse(data.text, data.confidence);
  } finally {
    await worker.terminate();
  }
}

/** Grayscale + contrast boost improves OCR on phone photos. */
async function enhance(file: Blob): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const ctx = c.getContext('2d')!;
  ctx.filter = 'grayscale(1) contrast(1.4)';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function yymmdd(s: string, future: boolean) {
  if (!/^\d{6}$/.test(s)) return '';
  const yy = +s.slice(0, 2), mm = +s.slice(2, 4), dd = +s.slice(4, 6);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';
  const nowYY = new Date().getFullYear() % 100;
  const year = future ? 2000 + yy : yy > nowYY ? 1900 + yy : 2000 + yy;
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

const fixDigits = (s: string) => s.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
const nameFrom = (s: string) => {
  const [sur, given = ''] = s.replace(/^[<]+|[<]+$/g, '').split('<<');
  const clean = (x: string) => x.replace(/</g, ' ').replace(/[^A-Z ]/g, '').trim();
  return titleCase(`${clean(given)} ${clean(sur)}`.trim());
};
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, ' ');

export function parse(text: string, confidence: number): ScanResult {
  const base: ScanResult = { fullName: '', docNumber: '', dob: '', expiry: '', nationality: '', source: 'none', confidence: Math.round(confidence || 0), raw: text };
  const lines = text.toUpperCase().split('\n').map((l) => l.replace(/\s+/g, '').replace(/[«‹]/g, '<')).filter((l) => l.length >= 28 && /^[A-Z0-9<]+$/.test(l) && l.includes('<'));

  // TD3 (passport): 2 lines x 44
  const td3 = lines.findIndex((l, i) => /^P[A-Z<]/.test(l) && lines[i + 1] && lines[i + 1].length >= 40);
  if (td3 >= 0) {
    const l1 = lines[td3], l2 = lines[td3 + 1];
    return {
      ...base, source: 'mrz',
      fullName: nameFrom(l1.slice(5)),
      docNumber: l2.slice(0, 9).replace(/</g, ''),
      nationality: l2.slice(10, 13).replace(/</g, ''),
      dob: yymmdd(fixDigits(l2.slice(13, 19)), false),
      expiry: yymmdd(fixDigits(l2.slice(21, 27)), true),
    };
  }
  // TD1 (ID card): 3 lines x 30
  const td1 = lines.findIndex((l, i) => /^[IAC][A-Z<]/.test(l) && lines[i + 1] && lines[i + 2]);
  if (td1 >= 0) {
    const [l1, l2, l3] = [lines[td1], lines[td1 + 1], lines[td1 + 2]];
    return {
      ...base, source: 'mrz',
      docNumber: l1.slice(5, 14).replace(/</g, ''),
      dob: yymmdd(fixDigits(l2.slice(0, 6)), false),
      expiry: yymmdd(fixDigits(l2.slice(8, 14)), true),
      nationality: l2.slice(15, 18).replace(/</g, ''),
      fullName: nameFrom(l3),
    };
  }

  // Free-text fallback
  const T = text.toUpperCase();
  const dates: string[] = [];
  for (const m of T.matchAll(/\b(\d{1,2})[\s./-]+(\d{1,2}|[A-Z]{3})[A-Z/]*[\s./-]+(\d{4})\b/g)) {
    const mm = /\d/.test(m[2]) ? +m[2] : MONTHS.indexOf(m[2].slice(0, 3)) + 1;
    if (mm >= 1 && mm <= 12 && +m[1] <= 31) dates.push(`${m[3]}-${String(mm).padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  }
  dates.sort();
  const doc = T.match(/\b(?:NO|NUMBER|DOCUMENT|PASSPORT)[^A-Z0-9]{0,12}([A-Z]{0,2}\d[A-Z0-9]{5,10})\b/) || T.match(/\b([A-Z]{1,2}\d{6,9})\b/);
  const sur = T.match(/SURNAME[^\n]*\n\s*([A-Z][A-Z' -]{1,40})/);
  const giv = T.match(/GIVEN NAMES?[^\n]*\n\s*([A-Z][A-Z' -]{1,40})/);
  const fullName = titleCase([giv?.[1], sur?.[1]].filter(Boolean).join(' ').trim());
  const found = !!(doc || dates.length || fullName);
  return {
    ...base, source: found ? 'text' : 'none',
    fullName, docNumber: doc?.[1] || '',
    dob: dates[0] || '', expiry: dates.length > 1 ? dates[dates.length - 1] : '',
  };
}

/** Downscale + JPEG-compress before upload. */
export async function compressImage(file: Blob, max = 1800, quality = 0.86): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', quality));
}
