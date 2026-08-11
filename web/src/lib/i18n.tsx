import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Locale = 'zh' | 'en';

const STORAGE_KEY = 'qrcheckin_locale';

const messages: Record<
  Locale,
  Record<string, string | Record<string, string>>
> = {
  zh: {
    meta: { title: '扫码签到' },
    login: {
      title: '扫码签到',
      subtitle: '活动签到管理平台',
      subtitleWecom: '使用企业微信账号登录后即可创建活动或扫码签到',
      signIn: '登录',
      signInWecom: '企业微信登录',
      redirecting: '正在跳转…',
      hint: '使用组织账号登录即可创建活动或扫码签到',
      hintWecom: '请将应用「网页授权回调域」设为当前站点域名，并在「可信域名」中登记同源地址（含端口）',
      errNoProvider: '未找到登录方式，请联系管理员',
      errFailed: '登录失败',
      errWecomEnv: '未配置企业微信前台参数（VITE_WECOM_CORP_ID / VITE_WECOM_AGENT_ID）',
    },
    layout: {
      brand: '扫码签到',
      events: '活动',
      scan: '扫码',
      history: '记录',
      logout: '退出',
      logoutDesktop: '退出登录',
    },
    events: {
      title: '我的活动',
      create: '+ 创建',
      loading: '加载中…',
      empty1: '还没有活动',
      empty2: '点击上方「创建」开始',
      modalTitle: '创建活动',
      namePlaceholder: '输入活动名称',
      cancel: '取消',
      confirm: '确认',
      creating: '创建中…',
      createFailed: '创建失败',
      exportTitle: '导出签到记录',
      display: '大屏',
      csvUser: '用户',
      csvEmail: '邮箱',
      csvTime: '签到时间',
      anonymous: '匿名',
      fileSuffix: '_签到记录.csv',
    },
    checkin: {
      title: '扫码签到',
      success: '签到成功',
      continue: '继续扫码',
      cameraError: '无法访问摄像头',
      starting: '正在启动摄像头…',
      upload: '上传二维码图片',
      toastExpired: '二维码已过期，请重新扫码',
      toastInvalid: '未识别到有效签到码',
    },
    history: {
      title: '签到记录',
      loading: '加载中…',
      empty1: '暂无签到记录',
      empty2: '扫描活动二维码即可完成签到',
      today: '今天',
      yesterday: '昨天',
    },
    display: {
      loading: '加载中…',
      errSecret: '无法读取活动密钥，请确认使用主办账号登录。',
      errLoad: '加载活动失败',
      backList: '返回活动列表',
      back: '返回',
      scanHint: '扫描二维码签到（每 3 秒更新）',
      checkedInCount: '{count} 人已签到',
      recent: '最近签到',
      anonymous: '匿名用户',
      fullscreen: '全屏',
    },
    oauth: {
      errCode: '缺少授权码（code），请重新登录',
      errState: '登录状态丢失，请重新登录',
      errFailed: '登录失败',
      errUnknown: '未知错误',
      backLogin: '返回登录',
      completing: '正在完成登录…',
    },
    scanLand: { redirecting: '正在跳转…' },
    lang: { zh: '中文', en: 'English', switch: '语言', zhShort: 'ZH', enShort: 'EN' },
  },
  en: {
    meta: { title: 'QR Check-in' },
    login: {
      title: 'QR Check-in',
      subtitle: 'Event check-in management',
      subtitleWecom: 'Sign in with WeCom to manage events or check in.',
      signIn: 'Sign in',
      signInWecom: 'Sign in with WeCom',
      redirecting: 'Redirecting…',
      hint: 'Sign in with your organization account to manage events or check in.',
      hintWecom:
        'Set trusted domains and OAuth callback domain in WeCom admin so they match this site.',
      errNoProvider: 'No sign-in method found. Please contact an administrator.',
      errFailed: 'Sign-in failed',
      errWecomEnv: 'Missing VITE_WECOM_CORP_ID or VITE_WECOM_AGENT_ID in frontend env.',
    },
    layout: {
      brand: 'QR Check-in',
      events: 'Events',
      scan: 'Scan',
      history: 'History',
      logout: 'Log out',
      logoutDesktop: 'Log out',
    },
    events: {
      title: 'My events',
      create: '+ New',
      loading: 'Loading…',
      empty1: 'No events yet',
      empty2: 'Tap “New” above to create one',
      modalTitle: 'Create event',
      namePlaceholder: 'Event name',
      cancel: 'Cancel',
      confirm: 'Create',
      creating: 'Creating…',
      createFailed: 'Could not create',
      exportTitle: 'Export check-ins',
      display: 'Display',
      csvUser: 'User',
      csvEmail: 'Email',
      csvTime: 'Check-in time',
      anonymous: 'Anonymous',
      fileSuffix: '_checkins.csv',
    },
    checkin: {
      title: 'Scan to check in',
      success: 'Checked in',
      continue: 'Scan again',
      cameraError: 'Cannot access camera',
      starting: 'Starting camera…',
      upload: 'Upload QR image',
      toastExpired: 'QR code expired. Please scan again.',
      toastInvalid: 'No valid check-in code found',
    },
    history: {
      title: 'Check-in history',
      loading: 'Loading…',
      empty1: 'No check-ins yet',
      empty2: 'Scan an event QR code to check in',
      today: 'Today',
      yesterday: 'Yesterday',
    },
    display: {
      loading: 'Loading…',
      errSecret: 'Could not read event secret. Make sure you are signed in as the host.',
      errLoad: 'Failed to load event',
      backList: 'Back to events',
      back: 'Back',
      scanHint: 'Scan the QR to check in (refreshes every 3 seconds)',
      checkedInCount: '{count} checked in',
      recent: 'Recent',
      anonymous: 'Anonymous',
      fullscreen: 'Fullscreen',
    },
    oauth: {
      errCode: 'Missing authorization code. Please sign in again.',
      errState: 'Sign-in state lost. Please try again.',
      errFailed: 'Sign-in failed',
      errUnknown: 'Unknown error',
      backLogin: 'Back to sign-in',
      completing: 'Completing sign-in…',
    },
    scanLand: { redirecting: 'Redirecting…' },
    lang: { zh: '中文', en: 'English', switch: 'Language', zhShort: 'ZH', enShort: 'EN' },
  },
};

function getNested(obj: unknown, path: string): string {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return path;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : path;
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
  localeTag: string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readInitialLocale(): Locale {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === 'zh' || s === 'en') return s;
  } catch (_) {}
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh')) {
    return 'zh';
  }
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch (_) {}
  }, []);

  const t = useCallback(
    (key: string) => getNested(messages[locale], key),
    [locale]
  );

  const localeTag = locale === 'zh' ? 'zh-CN' : 'en-US';

  const value = useMemo(
    () => ({ locale, setLocale, t, localeTag }),
    [locale, setLocale, t, localeTag]
  );

  useEffect(() => {
    document.documentElement.lang = localeTag;
    document.title = getNested(messages[locale], 'meta.title');
  }, [locale, localeTag]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/** Segmented ZH / EN switch — horizontal only, fits narrow sidebars */
export function LanguageSwitch({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className={`lang-switch ${className}`} role="group" aria-label={t('lang.switch')}>
      <button
        type="button"
        className={locale === 'zh' ? 'active' : ''}
        onClick={() => setLocale('zh')}
      >
        {t('lang.zhShort')}
      </button>
      <button
        type="button"
        className={locale === 'en' ? 'active' : ''}
        onClick={() => setLocale('en')}
      >
        {t('lang.enShort')}
      </button>
      <style>{`
        .lang-switch {
          display: inline-flex;
          flex-shrink: 0;
          align-items: center;
          padding: 3px;
          border-radius: var(--radius-sm);
          background: var(--bg-hover);
          border: 1px solid var(--border);
          gap: 2px;
        }
        .lang-switch button {
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.04em;
          line-height: 1;
          border: none;
          border-radius: 4px;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          white-space: nowrap;
          font-family: inherit;
          transition: color 0.15s, background 0.15s;
        }
        .lang-switch button:hover:not(.active) {
          color: var(--text-secondary);
        }
        .lang-switch button.active {
          background: var(--bg-elevated);
          color: var(--accent);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
        }
      `}</style>
    </div>
  );
}
