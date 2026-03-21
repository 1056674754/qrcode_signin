import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { pb } from '@/lib/pb';

export default function ScanLand() {
  const { eventId } = useParams<{ eventId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const c = searchParams.get('c');
    const m = searchParams.get('m');
    const v = searchParams.get('v');

    if (!eventId || !c || !m) {
      navigate('/checkin', { replace: true });
      return;
    }

    sessionStorage.setItem('pending_checkin', JSON.stringify({ eventId, c, m, v }));

    if (!pb.authStore.isValid) {
      navigate('/login', { replace: true });
    } else {
      navigate('/checkin', { replace: true });
    }
  }, [eventId, searchParams, navigate]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ animation: 'pulse 1.5s infinite' }}>正在跳转…</p>
    </div>
  );
}
