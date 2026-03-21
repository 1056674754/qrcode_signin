onRecordCreateRequest((e) => {
  const info = e.requestInfo();
  const auth = info?.auth;
  if (auth?.id && !e.record.get("user")) {
    e.record.set("user", auth.id);
  }

  const body = e.requestInfo().body || {};
  const eventId = e.record.get("event") || body.event;
  const proofRaw = e.record.get("proof") || body.proof;
  if (!eventId || !proofRaw) {
    throw new BadRequestError("缺少 event 或 proof");
  }

  let payload;
  try {
    payload = JSON.parse(proofRaw);
  } catch (_) {
    throw new BadRequestError("proof 格式无效");
  }

  const { e: proofEventId, c: counter, m: submittedMac } = payload;
  if (!proofEventId || counter === undefined || !submittedMac) {
    throw new BadRequestError("proof 缺少 e/c/m");
  }
  if (proofEventId !== eventId) {
    throw new BadRequestError("invalid or expired code");
  }

  const eventRecord = $app.findRecordById("events", eventId);
  const secretKey = eventRecord.get("secret_key");
  if (!secretKey) {
    throw new BadRequestError("活动未配置密钥");
  }

  const now = Math.floor(Date.now() / 1000);
  const currentCounter = Math.floor(now / 3);
  const candidates = [currentCounter - 1, currentCounter, currentCounter + 1];
  let valid = false;
  for (const c of candidates) {
    const msg = c + "|" + eventId;
    const expected = $security.hs256(msg, secretKey);
    if (expected === submittedMac) {
      valid = true;
      break;
    }
  }
  if (!valid) {
    throw new BadRequestError("invalid or expired code");
  }

  e.record.set("proof", "");
  e.next();
}, "check_ins");
