/** 清除当前页面可读的、与 token 相关的 Cookie（HttpOnly 的 Cookie 无法由 JS 删除）。 */
export function clearTokenCookies(): void {
  if (typeof document === 'undefined') return;

  const expire = 'Thu, 01 Jan 1970 00:00:00 GMT';
  const path = '/';
  const host = window.location.hostname;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';

  const names = new Set<string>(['token', 'access_token', 'refresh_token', 'id_token', 'auth_token']);
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim();
    if (name && /token/i.test(name)) names.add(name);
  }

  const tryClear = (name: string, domain?: string) => {
    let c = `${name}=; expires=${expire}; path=${path}; Max-Age=0${secure}`;
    if (domain) c += `; domain=${domain}`;
    document.cookie = c;
  };

  for (const name of names) {
    tryClear(name);
    tryClear(name, host);
    if (!host.startsWith('.')) tryClear(name, `.${host}`);
  }
}
