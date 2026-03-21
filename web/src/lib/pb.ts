import PocketBase from 'pocketbase';

// 空字符串 = 同源，使用当前页面 origin（OAuth2 redirect_uri 需要绝对 URL）
const url = import.meta.env.VITE_POCKETBASE_URL || window.location.origin;

export const pb = new PocketBase(url);

export type User = {
  id: string;
  email?: string;
  name?: string;
  [k: string]: unknown;
};

export type Event = {
  id: string;
  name: string;
  owner: string;
  secret_key?: string;
  created: string;
  [k: string]: unknown;
};

export type CheckIn = {
  id: string;
  user: string;
  event: string;
  created: string;
  [k: string]: unknown;
};
