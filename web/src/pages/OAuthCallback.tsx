import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pb } from '@/lib/pb';

export default function OAuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (!code) {
      setError('缺少授权码（code），请重新登录');
      return;
    }

    const saved = sessionStorage.getItem('oauth2_provider');
    if (!saved) {
      setError('登录状态丢失，请重新登录');
      return;
    }

    const { name, codeVerifier } = JSON.parse(saved) as {
      name: string;
      codeVerifier: string;
    };
    sessionStorage.removeItem('oauth2_provider');

    const callbackUrl = window.location.origin + '/oauth-callback';

    pb.collection('users')
      .authWithOAuth2Code(name, code, codeVerifier, callbackUrl)
      .then(() => {
        if (sessionStorage.getItem('pending_checkin')) {
          navigate('/checkin', { replace: true });
          return;
        }
        navigate('/events', { replace: true });
      })
      .catch((err: Error) => {
        console.error(err);
        setError('登录失败: ' + (err.message || '未知错误'));
      });
  }, [navigate]);

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <p style={{ color: '#f87171' }}>{error}</p>
        <a href="/login" style={{ color: '#a78bfa' }}>返回登录</a>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <p>正在完成登录…</p>
    </div>
  );
}
