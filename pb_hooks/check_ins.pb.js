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
    try {
      $app.logger().warn(
        "[check_ins] event mismatch proofE=" +
          proofEventId +
          " recordEvent=" +
          eventId
      );
    } catch (_) {}
    throw new BadRequestError("invalid or expired code");
  }

  const eventRecord = $app.findRecordById("events", eventId);
  const secretKey = eventRecord.get("secret_key");
  if (!secretKey) {
    throw new BadRequestError("活动未配置密钥");
  }

  const now = Math.floor(Date.now() / 1000);
  const currentCounter = Math.floor(now / 3);
  // 容差：±1 仅约 9 秒；略放宽到 ±4（单方向约 12 秒时钟差），过期可重新扫码
  const WINDOW = 4;
  const candidates = [];
  for (let d = -WINDOW; d <= WINDOW; d++) {
    candidates.push(currentCounter + d);
  }
  let valid = false;
  let matchedCounter = null;
  for (const c of candidates) {
    const msg = c + "|" + eventId;
    const expected = $security.hs256(msg, secretKey);
    if (expected === submittedMac) {
      valid = true;
      matchedCounter = c;
      break;
    }
  }
  if (!valid) {
    const logLine =
      "[check_ins] HMAC fail event=" +
      eventId +
      " payloadC=" +
      counter +
      " serverC=" +
      currentCounter +
      " delta=" +
      (currentCounter - counter) +
      " nowSec=" +
      now;
    try {
      $app.logger().warn(logLine);
    } catch (_) {}
    throw new BadRequestError("invalid or expired code");
  }
  try {
    $app.logger().info(
      "[check_ins] ok event=" +
        eventId +
        " matchedC=" +
        matchedCounter +
        " payloadC=" +
        counter
    );
  } catch (_) {}

  e.record.set("proof", "");
  e.next();
}, "check_ins");
