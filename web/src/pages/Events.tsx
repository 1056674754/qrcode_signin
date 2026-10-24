import {reportCaught} from '@/monitoring/runtime';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { pb } from '@/lib/pb';
import { useI18n } from '@/lib/i18n';
import type { Event } from '@/lib/pb';

async function exportCSV(
  eventId: string,
  eventName: string,
  t: (k: string) => string,
  localeTag: string
) {
  const records = await pb.collection('check_ins').getFullList({
    filter: `event = "${eventId}"`,
    sort: '-created',
    expand: 'user',
  });
  const rows = [[t('events.csvUser'), t('events.csvEmail'), t('events.csvTime')]];
  for (const r of records) {
    const user = (r.expand as Record<string, Record<string, string>> | undefined)?.user;
    rows.push([
      user?.name || t('events.anonymous'),
      user?.email || '',
      r.created ? new Date(r.created as string).toLocaleString(localeTag) : '',
    ]);
  }
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${eventName}${t('events.fileSuffix')}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function CreateModal({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setError('');
      setCreating(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      await onCreate(name.trim());
      onClose();
    } catch (err) {
      reportCaught(err,'events.create','events.create');
      setError((err as Error).message || t('events.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal-content" onSubmit={handleSubmit}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t('events.modalTitle')}</h2>
        <input
          ref={inputRef}
          type="text"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('events.namePlaceholder')}
        />
        {error && <p className="alert alert-error" style={{ marginTop: 8 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('events.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={creating || !name.trim()}>
            {creating ? t('events.creating') : t('events.confirm')}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Events() {
  const { t, localeTag } = useI18n();
  const formatDate = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(localeTag, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExport = useCallback(async (ev: Event) => {
    setExporting(ev.id);
    try {
      await exportCSV(ev.id, ev.name, t, localeTag);
    } catch (e) {
      reportCaught(e,'events.export','checkins.list');
      console.error(e);
    } finally {
      setExporting(null);
    }
  }, [t, localeTag]);

  useEffect(() => {
    pb.collection('events')
      .getFullList<Event>({ sort: '-created' })
      .then(setEvents)
      .catch((e) => { reportCaught(e,'events.load','events.list'); console.error(e); setEvents([]); })
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (name: string) => {
    const created = await pb.collection('events').create<Event>({ name });
    setEvents((prev) => [created, ...prev]);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('events.title')}</h1>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>{t('events.create')}</button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', animation: 'pulse 1.5s infinite' }}>{t('events.loading')}</p>
      ) : events.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: 15 }}>{t('events.empty1')}</p>
          <p>{t('events.empty2')}</p>
        </div>
      ) : (
        <div className="events-list">
          {events.map((ev) => (
            <div key={ev.id} className="card event-card">
              <div className="event-info">
                <div className="event-name">{ev.name}</div>
                <div className="event-time">{formatDate(ev.created)}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  className="btn btn-ghost event-display-btn"
                  onClick={() => handleExport(ev)}
                  disabled={exporting === ev.id}
                  title={t('events.exportTitle')}
                >
                  {exporting === ev.id ? '…' : '↓'}
                </button>
                <Link to={`/display/${ev.id}`} className="btn btn-secondary event-display-btn">
                  {t('events.display')}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateModal open={modalOpen} onClose={() => setModalOpen(false)} onCreate={handleCreate} />

      <style>{`
.events-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.event-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.event-info {
  min-width: 0;
  flex: 1;
}
.event-name {
  font-size: 15px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.event-time {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
.event-display-btn {
  flex-shrink: 0;
  font-size: 13px;
  padding: 6px 14px;
  text-decoration: none;
}
      `}</style>
    </div>
  );
}
