import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import { pb } from '@/lib/pb';
import { createServerQr, type QrState, type ServerProof } from '@/lib/serverQr';
import type { Event } from '@/lib/pb';
import { LanguageSwitch, useI18n } from '@/lib/i18n';

export default function Display() {
  const { t, localeTag } = useI18n();
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrState, setQrState] = useState<QrState>('loading');
  const [checkinCount, setCheckinCount] = useState(0);
  const [recentCheckins, setRecentCheckins] = useState<Array<{ id: string; name: string; time: string }>>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const qrWrapRef = useRef<HTMLDivElement>(null);
  const [qrSize, setQrSize] = useState(() =>
    typeof window === 'undefined'
      ? 280
      : Math.max(120, Math.min(window.innerWidth - 64, window.innerHeight * 0.5, 500)),
  );

  useEffect(() => {
    if (!eventId) return;
    pb.collection('events')
      .getOne<Event>(eventId, { fields: 'id,name,owner,created' })
      .then(setEvent)
      .catch((e) => setError(e.message || t('display.errLoad')));
  }, [eventId, t]);

  const fetchCheckins = useCallback(() => {
    if (!eventId) return;
    pb.collection('check_ins')
      .getFullList({ filter: `event = "${eventId}"`, sort: '-created', expand: 'user' })
      .then((items) => {
        const seen = new Set<string>();
        for (const item of items) {
          seen.add(item.user as string);
        }
        setCheckinCount(seen.size);
        setRecentCheckins(items.slice(0, 8).map((item: Record<string, unknown>) => {
          const user = (item.expand as Record<string, Record<string, string>> | undefined)?.user;
          return {
            id: item.id as string,
            name: (user?.name || user?.email || t('display.anonymous')) as string,
            time: new Date(item.created as string).toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          };
        }));
      })
      .catch(() => {});
  }, [eventId, t, localeTag]);

  useEffect(() => {
    fetchCheckins();
    const interval = setInterval(fetchCheckins, 5000);
    return () => clearInterval(interval);
  }, [fetchCheckins]);

  useEffect(() => {
    if (!event) return;
    const el = qrWrapRef.current;
    if (!el) return;

    const measure = () => {
      const style = getComputedStyle(el);
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const innerW = el.clientWidth - padX;
      const vw = window.innerWidth - 64;
      const vh = window.innerHeight * 0.5;
      const next = Math.max(120, Math.floor(Math.min(vw, vh, innerW, 500)));
      setQrSize((prev) => (prev === next ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [event]);

  useEffect(() => {
    if (!event || !eventId || !canvasRef.current) return;

    const qr = createServerQr({
      eventId,
      fetchProof: (signal) => pb.send<ServerProof>(
        `/api/qrcheck/events/${encodeURIComponent(eventId)}/proof`,
        { method: 'GET', signal, cache: 'no-store', requestKey: null },
      ),
      render: async (proof, isCurrent) => {
        const url = `${window.location.origin}/s/${eventId}?c=${proof.c}&m=${proof.m}&v=1`;
        const buffer = document.createElement('canvas');
        await QRCode.toCanvas(buffer, url, {
          width: qrSize,
          margin: 2,
          color: { dark: '#000', light: '#fff' },
        });
        const canvas = canvasRef.current;
        if (!canvas || !isCurrent()) return;
        canvas.width = buffer.width;
        canvas.height = buffer.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas is unavailable');
        ctx.drawImage(buffer, 0, 0);
      },
      clear: () => {
        const canvas = canvasRef.current;
        canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      },
      onState: setQrState,
    });
    const resume = () => {
      if (document.visibilityState === 'hidden' || !navigator.onLine) qr.suspend();
      else qr.refresh();
    };
    const suspend = () => qr.suspend();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', suspend);
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('pagehide', suspend);
    resume();
    return () => {
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', suspend);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('pagehide', suspend);
      qr.stop();
    };
  }, [event, eventId, qrSize]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen?.();
    }
  }, []);

  const goBack = () => navigate('/events');

  if (error) {
    return (
      <div className="display-error animate-in">
        <p className="alert alert-error">{error}</p>
        <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={goBack}>{t('display.backList')}</button>
      </div>
    );
  }

  if (!event) {
    return <p style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 80, animation: 'pulse 1.5s infinite' }}>{t('display.loading')}</p>;
  }

  return (
    <div className="display-page" ref={containerRef}>
      <div className="display-lang">
        <LanguageSwitch />
      </div>
      <button className="display-back-btn" onClick={goBack} title={t('display.back')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        <span>{t('display.back')}</span>
      </button>

      <h1 className="display-title">{event.name}</h1>
      <p className="display-hint">{t('display.scanHint')}</p>
      <div className="display-qr-wrap" ref={qrWrapRef} style={{ minHeight: qrSize + 32, minWidth: qrSize + 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <canvas ref={canvasRef} className="display-canvas" aria-label={t('display.qrLabel')} hidden={qrState !== 'ready'} style={{ display: qrState === 'ready' ? 'block' : 'none' }} />
        {qrState !== 'ready' && (
          <p role="status" style={{ maxWidth: qrSize, color: '#555' }}>
            {t(qrState === 'error' ? 'display.qrUnavailable' : 'display.qrLoading')}
          </p>
        )}
      </div>
      <div className="display-meta">
        <span className="display-count">{t('display.checkedInCount').replace('{count}', String(checkinCount))}</span>
        <button className="btn btn-ghost display-fs-btn" onClick={toggleFullscreen} title={t('display.fullscreen')}>⛶</button>
      </div>
      {recentCheckins.length > 0 && (
        <div className="display-recent">
          <div className="display-recent-title">{t('display.recent')}</div>
          {recentCheckins.map((c) => (
            <div key={c.id} className="display-recent-item">
              <span>{c.name}</span>
              <span className="display-recent-time">{c.time}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`
.display-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 12px;
  text-align: center;
  background: var(--bg);
  position: relative;
  padding: 20px;
}
.display-page:fullscreen {
  padding: 32px;
}
.display-lang {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 200;
}
.display-back-btn {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 40px;
  padding: 0 14px 0 10px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius);
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  font-size: 14px;
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
}
.display-back-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.display-page:fullscreen .display-back-btn,
.display-page:fullscreen .display-lang {
  display: none;
}
.display-title {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
}
.display-hint {
  color: var(--text-secondary);
  font-size: 14px;
}
.display-qr-wrap {
  background: #fff;
  border-radius: var(--radius-lg);
  padding: 16px;
  margin: 8px 0;
}
.display-canvas {
  display: block;
  border-radius: 8px;
}
.display-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 4px;
}
.display-count {
  font-size: 15px;
  color: var(--text-secondary);
  font-weight: 500;
}
.display-fs-btn {
  font-size: 22px;
  padding: 4px 8px;
}
.display-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg);
}
.display-recent {
  width: 100%;
  max-width: 400px;
  margin-top: 12px;
}
.display-recent-title {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.display-recent-item {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 14px;
  border-bottom: 1px solid var(--border);
  animation: slideUp 0.3s ease-out;
}
.display-recent-time {
  color: var(--text-secondary);
  font-size: 13px;
}
@media (min-width: 768px) {
  .display-title { font-size: 36px; }
}
      `}</style>
    </div>
  );
}
