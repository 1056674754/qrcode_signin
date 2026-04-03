import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pb } from '@/lib/pb';
import { LanguageSwitch, useI18n } from '@/lib/i18n';

const PROVIDER = import.meta.env.VITE_OAUTH_PROVIDER || 'oidc';

export default function Login() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (pb.authStore.isValid) {
      navigate('/events', { replace: true });
    }
  }, [navigate]);

  const handleOAuth2 = async () => {
    setLoading(true);
    setError('');
    try {
      const methods = await pb.collection('users').listAuthMethods();
      const provider = methods.oauth2?.providers?.find(
        (p: { name: string }) => p.name === PROVIDER
      );
      if (!provider) {
        setError(t('login.errNoProvider'));
        setLoading(false);
        return;
      }

      sessionStorage.setItem('oauth2_provider', JSON.stringify({
        name: provider.name,
        codeVerifier: provider.codeVerifier,
        codeChallenge: provider.codeChallenge,
        codeChallengeMethod: provider.codeChallengeMethod,
        state: provider.state,
      }));

      const callbackUrl = window.location.origin + '/oauth-callback';
      window.location.href = provider.authURL + encodeURIComponent(callbackUrl);
    } catch (err) {
      setError((err as Error).message || t('login.errFailed'));
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-lang">
        <LanguageSwitch />
      </div>
      <div className="login-card animate-in">
        <div className="login-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
          </svg>
        </div>
        <h1 className="login-title">{t('login.title')}</h1>
        <p className="login-desc">{t('login.subtitle')}</p>

        {error && <p className="alert alert-error" style={{ width: '100%', textAlign: 'center' }}>{error}</p>}

        <button
          className="btn btn-primary login-btn"
          onClick={handleOAuth2}
          disabled={loading}
        >
          {loading ? t('login.redirecting') : t('login.signIn')}
        </button>

        <p className="login-hint">{t('login.hint')}</p>
      </div>

      <style>{`
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  position: relative;
}
.login-lang {
  position: absolute;
  top: 16px;
  right: 16px;
}
.login-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 360px;
  max-width: 100%;
}
.login-icon {
  font-size: 48px;
  margin-bottom: 4px;
}
.login-title {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
}
.login-desc {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0;
}
.login-btn {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  margin-top: 12px;
}
.login-hint {
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}
      `}</style>
    </div>
  );
}
