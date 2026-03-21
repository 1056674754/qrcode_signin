/// 启动时自动配置 OAuth2 Provider（从环境变量读取，无需手动在 Admin 里添加）
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
