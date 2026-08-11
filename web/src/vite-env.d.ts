/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POCKETBASE_URL: string;
  readonly VITE_OAUTH_PROVIDER?: string;
  readonly VITE_AUTH_MODE?: string;
  readonly VITE_WECOM_CORP_ID?: string;
  readonly VITE_WECOM_AGENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
