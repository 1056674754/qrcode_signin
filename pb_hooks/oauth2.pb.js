/// 通用 OAuth2 / OIDC：启动时写入 users 集合的 Provider。
/// 企业微信不走此文件，请参阅 pb_hooks/wecom_auth.pb.js 与 docs/WECOM.md。
onBootstrap((e) => {
  e.next();

  const providerName = $os.getenv("PB_OAUTH2_PROVIDER_NAME");
  const clientId     = $os.getenv("PB_OAUTH2_CLIENT_ID");
  const clientSecret = $os.getenv("PB_OAUTH2_CLIENT_SECRET");

  if (!providerName || !clientId || !clientSecret) {
    return;
  }

  try {
    const collection = $app.findCollectionByNameOrId("users");

    collection.oauth2.enabled = true;

    const authUrl     = $os.getenv("PB_OAUTH2_AUTH_URL")  || "";
    const tokenUrl    = $os.getenv("PB_OAUTH2_TOKEN_URL") || "";
    const userInfoUrl = $os.getenv("PB_OAUTH2_USER_URL")  || "";
    const displayName = $os.getenv("PB_OAUTH2_DISPLAY_NAME") || providerName;

    const newProvider = {
      name:        providerName,
      clientId:    clientId,
      clientSecret: clientSecret,
      authURL:     authUrl,
      tokenURL:    tokenUrl,
      userInfoURL: userInfoUrl,
      displayName: displayName,
    };

    const providers = collection.oauth2.providers || [];
    let found = false;
    for (let i = 0; i < providers.length; i++) {
      if (providers[i].name === providerName) {
        providers[i] = newProvider;
        found = true;
        break;
      }
    }
    if (!found) {
      providers.push(newProvider);
    }

    collection.oauth2.providers = providers;
    $app.save(collection);

    console.log("[oauth2.pb.js] configured provider: " + providerName);
  } catch (err) {
    console.log("[oauth2.pb.js] auto-config failed: " + err);
  }
});
