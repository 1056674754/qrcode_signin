import { useState, useEffect } from 'react';
import { pb } from '@/lib/pb';

type CheckInRecord = {
  id: string;
  event: string;
  created: string;
  expand?: { event?: { name: string } };
};

export default function History() {
  const [records, setRecords] = useState<CheckInRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = pb.authStore.record?.id;
    if (!userId) return;
    pb.collection('check_ins')
      .getFullList<CheckInRecord>({
        filter: `user = "${userId}"`,
        sort: '-created',
        expand: 'event',
      })
      .then(setRecords)
      .catch((e) => {
        console.error(e);
        setRecords([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const formatTime = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `今天 ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' ' + time;
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">签到记录</h1>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', animation: 'pulse 1.5s infinite' }}>加载中…</p>
      ) : records.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: 15 }}>暂无签到记录</p>
          <p>扫描活动二维码即可完成签到</p>
        </div>
      ) : (
        <div className="history-list">
          {records.map((r) => (
            <div key={r.id} className="card history-item">
              <div className="history-event">{r.expand?.event?.name || r.event}</div>
              <div className="history-time">{formatTime(r.created)}</div>
            </div>
          ))}
        </div>
      )}

      <style>{`
.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.history-event {
  font-size: 15px;
  font-weight: 500;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-time {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}
      `}</style>
    </div>
  );
}
