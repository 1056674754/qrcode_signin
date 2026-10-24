import {reportCaught} from '@/monitoring/runtime';
import { useRef, useState, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import { pb } from '@/lib/pb';
import { useI18n } from '@/lib/i18n';

type Payload = { v: number; e: string; c: number; m: string };

function parsePayload(raw: string): Payload | null {
  try {
    const p = JSON.parse(raw) as Payload;
    if (p?.v === 1 && p?.e && typeof p?.c === 'number' && p?.m) return p;
  } catch (_) {}

  try {
    const url = new URL(raw);
    const match = url.pathname.match(/^\/s\/(.+)$/);
    if (match) {
      const e = match[1];
      const c = Number(url.searchParams.get('c'));
      const m = url.searchParams.get('m');
      const v = Number(url.searchParams.get('v')) || 1;
      if (e && !isNaN(c) && m) return { v, e, c, m };
    }
  } catch (_) {}

  return null;
}

type BarcodeDetectorInstance = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>;
};

function createBarcodeDetector(): BarcodeDetectorInstance | null {
  try {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      const w = window as unknown as {
        BarcodeDetector: new (opts?: { formats?: string[] }) => BarcodeDetectorInstance;
      };
      return new w.BarcodeDetector({ formats: ['qr_code'] });
    }
  } catch (_) {}
  return null;
}

export default function CheckIn() {
  const { t, localeTag } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const submittedRef = useRef(false);
  const scanningRef = useRef(false);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const [phase, setPhase] = useState<'camera' | 'success'>('camera');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [toast, setToast] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [eventName, setEventName] = useState('');
  const [successTime, setSuccessTime] = useState('');

  const showToast = useCallback((type: 'error' | 'info', text: string) => {
    clearTimeout(toastTimerRef.current);
    setToast({ type, text });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const submitCheckIn = useCallback(async (payload: Payload) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    try {
      await pb.collection('check_ins').create({
        user: pb.authStore.record?.id,
        event: payload.e,
        proof: JSON.stringify(payload),
      });
      stopCamera();
      let name = payload.e;
      try {
        const ev = await pb.collection('events').getOne(payload.e);
        name = ev.name as string;
      } catch (e) {reportCaught(e,'checkin.event','events.read');}
      setEventName(name);
      setSuccessTime(new Date().toLocaleString(localeTag));
      setPhase('success');
    } catch (e) {
      submittedRef.current = false;
      reportCaught(e,'checkin.submit','checkins.create');
      console.warn('check-in failed', e);
      // ClientResponseError 会把 PocketBase 返回的 message 写在 Error.message 上
      const display =
        e instanceof Error && e.message && e.message !== 'Something went wrong.'
          ? e.message
          : t('checkin.toastExpired');
      showToast('error', display);
    }
  }, [stopCamera, showToast, t]);

  const decode = useCallback(async (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Promise<string | null> => {
    if (!detectorRef.current) {
      detectorRef.current = createBarcodeDetector();
    }
    if (detectorRef.current) {
      try {
        const results = await detectorRef.current.detect(canvas);
        if (results[0]?.rawValue) return results[0].rawValue;
      } catch (_) {}
    }
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    return result?.data || null;
  }, []);

  // Camera + scan loop
  useEffect(() => {
    if (phase !== 'camera') return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let cancelled = false;
    submittedRef.current = false;
    scanningRef.current = true;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.play().then(() => setCameraReady(true));
      })
      .catch((e) => {reportCaught(e,'checkin.camera');setCameraError(t('checkin.cameraError'));});

    const tick = async () => {
      if (cancelled || submittedRef.current || !scanningRef.current) return;
      if (video.readyState >= 2) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const raw = await decode(canvas, ctx);
        if (raw) {
          const payload = parsePayload(raw);
          if (payload) { submitCheckIn(payload); return; }
        }
      }
      requestAnimationFrame(tick);
    };

    video.onloadedmetadata = () => requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      scanningRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [phase, decode, submitCheckIn, t]);

  // Auto-submit pending checkin from external scan → login flow
  useEffect(() => {
    const raw = sessionStorage.getItem('pending_checkin');
    if (!raw) return;
    sessionStorage.removeItem('pending_checkin');
    try {
      const { eventId, c, m, v } = JSON.parse(raw);
      if (eventId && c && m) {
        const payload: Payload = { v: Number(v) || 1, e: eventId, c: Number(c), m };
        submitCheckIn(payload);
      }
    } catch (_) {}
  }, [submitCheckIn]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      c.width = img.width;
      c.height = img.height;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const data = ctx.getImageData(0, 0, img.width, img.height);
      const result = jsQR(data.data, data.width, data.height);
      if (result?.data) {
        const payload = parsePayload(result.data);
        if (payload) { submitCheckIn(payload); return; }
      }
      showToast('error', t('checkin.toastInvalid'));
    };
    img.src = url;
  };

  const reset = () => {
    submittedRef.current = false;
    setCameraReady(false);
    setCameraError('');
    setToast(null);
    setEventName('');
    setPhase('camera');
  };

  if (phase === 'success') {
    return (
      <div className="checkin-result animate-in">
        <div className="checkin-result-icon success-icon">✓</div>
        <h2>{t('checkin.success')}</h2>
        <p className="checkin-event-name">{eventName}</p>
        <p className="checkin-time">{successTime}</p>
        <button className="btn btn-primary" onClick={reset} style={{ marginTop: 24 }}>{t('checkin.continue')}</button>
        <style>{resultCSS}</style>
      </div>
    );
  }

  return (
    <div className="checkin-page">
      <div className="page-header">
        <h1 className="page-title">{t('checkin.title')}</h1>
      </div>

      {toast && (
        <div className={`checkin-toast checkin-toast-${toast.type}`} onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}

      <div className="scanner-container">
        <video
          ref={videoRef}
          className="scanner-video"
          muted
          playsInline
          style={{ display: cameraReady ? 'block' : 'none' }}
        />
        {cameraReady && <div className="scanner-overlay"><div className="scanner-frame" /></div>}
        {!cameraReady && (
          <div className="scanner-placeholder">
            {cameraError ? <p style={{ color: 'var(--error)' }}>{cameraError}</p> : <p>{t('checkin.starting')}</p>}
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <label className="btn btn-secondary">
          {t('checkin.upload')}
          <input type="file" accept="image/*" onChange={handleFile} className="sr-only" />
        </label>
      </div>

      <style>{scannerCSS}</style>
    </div>
  );
}

const scannerCSS = `
.checkin-page {
  display: flex;
  flex-direction: column;
}
.checkin-toast {
  text-align: center;
  padding: 10px 16px;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 12px;
  cursor: pointer;
  animation: slideUp 0.3s ease-out;
}
.checkin-toast-error {
  background: var(--error-bg);
  color: var(--error);
}
.checkin-toast-info {
  background: var(--surface);
  color: var(--text-secondary);
}
.scanner-container {
  position: relative;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: #000;
  aspect-ratio: 4/3;
}
.scanner-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.scanner-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.scanner-frame {
  width: 65%;
  aspect-ratio: 1;
  border: 2px solid rgba(124, 92, 252, 0.7);
  border-radius: 16px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
}
.scanner-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 15px;
}
`;

const resultCSS = `
.checkin-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 50vh;
  gap: 8px;
}
.checkin-result h2 {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
}
.checkin-result-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  font-weight: 700;
  margin-bottom: 8px;
}
.success-icon {
  background: var(--success-bg);
  color: var(--success);
}
.checkin-event-name {
  font-size: 18px;
  color: var(--text);
  font-weight: 500;
}
.checkin-time {
  font-size: 14px;
  color: var(--text-secondary);
}
`;
