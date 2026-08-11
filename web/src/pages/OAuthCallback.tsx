import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pb } from '@/lib/pb';
import { useI18n } from '@/lib/i18n';

const AUTH_MODE = String(import.meta.env.VITE_AUTH_MODE || 'wecom')
  .toLowerCase()
  .trim();

/** 与后端 pb_hooks/wecom_auth.pb.js 注册的自定义路由一致 */
const WECOM_AUTH_API = '/api/qrcheck/wecom-auth';

export default function OAuthCallback() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (!code) {
      setError(t('oauth.errCode'));
      return;
    }

    if (AUTH_MODE !== 'oauth2') {
      const state = params.get('state');
      const saved = sessionStorage.getItem('wecom_oauth_state');
      sessionStorage.removeItem('wecom_oauth_state');
      if (!state || !saved || state !== saved) {
        setError(t('oauth.errState'));
        return;
      }

      pb.send(WECOM_AUTH_API, {
        method: 'POST',
        body: { code },
      })
        .then((authData) => {
          const d = authData as { token: string; record: object };
          pb.authStore.save(d.token, d.record as Parameters<typeof pb.authStore.save>[1]);
          if (sessionStorage.getItem('pending_checkin')) {
            navigate('/checkin', { replace: true });
            return;
          }
          navigate('/events', { replace: true });
        })
        .catch((err: unknown) => {
          console.error(err);
          let msg = t('oauth.errUnknown');
          if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
            msg = (err as { message: string }).message;
          }
          setError(t('oauth.errFailed') + ': ' + msg);
        });

      return;
    }

    const saved = sessionStorage.getItem('oauth2_provider');
    if (!saved) {
      setError(t('oauth.errState'));
      return;
    }

    const parsed = JSON.parse(saved) as { name: string; codeVerifier: string };
    sessionStorage.removeItem('oauth2_provider');

    const name = parsed.name;
    const codeVerifier = parsed.codeVerifier;

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
        setError(t('oauth.errFailed') + ': ' + (err.message || t('oauth.errUnknown')));
      });
  }, [navigate, t]);

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
        <a href="/login" style={{ color: '#a78bfa' }}>
          {t('oauth.backLogin')}
        </a>
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
      <p>{t('oauth.completing')}</p>
    </div>
  );
}
