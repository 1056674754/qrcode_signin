onRecordCreateRequest((e) => {
  const info = e.requestInfo();
  const auth = info?.auth;
  if (auth?.id) {
    if (!e.record.get("owner")) {
      e.record.set("owner", auth.id);
    }
    if (!e.record.get("secret_key")) {
      e.record.set("secret_key", $security.randomString(32));
    }
  }
  e.next();
}, "events");
