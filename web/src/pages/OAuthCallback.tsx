import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pb } from '@/lib/pb';
import { useI18n } from '@/lib/i18n';

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

    const saved = sessionStorage.getItem('oauth2_provider');
    if (!saved) {
      setError(t('oauth.errState'));
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
        <a href="/login" style={{ color: '#a78bfa' }}>{t('oauth.backLogin')}</a>
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
