/// GET /WW_verify_{token}.txt → 响应正文为域名验证 token（如企业微信域名校验文件）
/// PocketBase >=0.23：middleware 签名为 (e) => { ...; return e.next() }
routerUse((e) => {
  const method = String(e.request?.method || "").toUpperCase();
  const path =
    e.request?.url && typeof e.request.url.path === "string"
      ? e.request.url.path
      : "";

  if (method === "GET") {
    const m = /^\/WW_verify_(.+)\.txt$/.exec(path);
    if (m) {
      return e.string(200, m[1]);
    }
  }

  return e.next();
});
