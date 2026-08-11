onRecordCreateRequest((e) => {
  function asString(value) {
    if (value === undefined || value === null) {
      return "";
    }
    return String(value);
  }

  function getHeader(headers, name) {
    try {
      const req = e.request || e.Request;
      const reqHeaders = req?.header || req?.Header;
      const value = reqHeaders?.get ? reqHeaders.get(name) : "";
      if (value) {
        return asString(value);
      }
    } catch (_) {}
    try {
      const value = headers?.get ? headers.get(name) : "";
      if (value) {
        return asString(value);
      }
    } catch (_) {}
    if (!headers) {
      return "";
    }
    const snake = name.toLowerCase().replace(/-/g, "_");
    const canonical = name
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join("-");
    if (headers[name]) {
      return asString(headers[name]);
    }
    if (headers[canonical]) {
      return asString(headers[canonical]);
    }
    if (headers[snake]) {
      return asString(headers[snake]);
    }
    const expected = name.toLowerCase();
    const keys = Object.keys(headers);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key.toLowerCase() === expected) {
        return asString(headers[key]);
      }
    }
    return "";
  }

  function firstForwardedIp(value) {
    const raw = asString(value);
    if (!raw) {
      return "";
    }
    const parts = raw.split(",");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (part) {
        return part;
      }
    }
    return "";
  }

  function counterDelta(serverCounter, payloadCounter) {
    const parsed = Number(payloadCounter);
    if (parsed !== parsed || parsed === Infinity || parsed === -Infinity) {
      return undefined;
    }
    return serverCounter - parsed;
  }

  function safeRequestIp(methodName) {
    try {
      return asString(e[methodName]());
    } catch (_) {
      return "";
    }
  }

  function selectedHeaders(headers) {
    const req = e.request || e.Request;
    const forwardedHost = getHeader(headers, "x-forwarded-host");
    return {
      host: asString(req?.host || req?.Host) || getHeader(headers, "host") || forwardedHost,
      forwarded: getHeader(headers, "forwarded"),
      x_forwarded_for: getHeader(headers, "x-forwarded-for"),
      x_real_ip: getHeader(headers, "x-real-ip"),
      x_forwarded_host: forwardedHost,
      x_forwarded_proto: getHeader(headers, "x-forwarded-proto"),
      x_request_id: getHeader(headers, "x-request-id"),
      cf_connecting_ip: getHeader(headers, "cf-connecting-ip"),
      true_client_ip: getHeader(headers, "true-client-ip"),
      user_agent: getHeader(headers, "user-agent"),
      referer: getHeader(headers, "referer"),
      origin: getHeader(headers, "origin"),
    };
  }

  function createAttempt(info, body) {
    try {
      const col = $app.findCollectionByNameOrId("check_in_attempts");
      const headers = info?.headers || {};
      const picked = selectedHeaders(headers);
      const auth = info?.auth;
      const xff = picked.x_forwarded_for;
      const realIp = safeRequestIp("realIP");
      const remoteIp = safeRequestIp("remoteIP");
      const clientIpGuess =
        firstForwardedIp(xff) ||
        picked.x_real_ip ||
        picked.cf_connecting_ip ||
        picked.true_client_ip ||
        realIp ||
        remoteIp;

      const record = new Record(col);
      record.set("status", "received");
      const req = e.request || e.Request;
      record.set("method", asString(req?.method || req?.Method || info?.method || "POST"));
      record.set("path", "/api/collections/check_ins/records");
      record.set("event_id", asString(body?.event));
      record.set("user_id", asString(auth?.id));
      record.set("user_email", asString(auth?.get ? auth.get("email") : ""));
      record.set("remote_ip", remoteIp);
      record.set("real_ip", realIp);
      record.set("client_ip_guess", clientIpGuess);
      record.set("x_forwarded_for", xff);
      record.set("x_real_ip", picked.x_real_ip);
      record.set("x_forwarded_host", picked.x_forwarded_host);
      record.set("x_forwarded_proto", picked.x_forwarded_proto);
      record.set("host", picked.host);
      record.set("referer", picked.referer);
      record.set("origin", picked.origin);
      record.set("user_agent", picked.user_agent);
      record.set("headers", picked);
      $app.save(record);
      return record;
    } catch (err) {
      try {
        $app.logger().warn("[check_ins] attempt log create failed: " + err);
      } catch (_) {}
      return null;
    }
  }

  function updateAttempt(record, values) {
    if (!record) {
      return;
    }
    try {
      const keys = Object.keys(values);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = values[key];
        if (value !== undefined && value !== null) {
          record.set(key, value);
        }
      }
      $app.save(record);
    } catch (err) {
      try {
        $app.logger().warn("[check_ins] attempt log update failed: " + err);
      } catch (_) {}
    }
  }

  const info = e.requestInfo();
  const auth = info?.auth;
  if (auth?.id && !e.record.get("user")) {
    e.record.set("user", auth.id);
  }

  const body = e.requestInfo().body || {};
  const attempt = createAttempt(info, body);
  const eventId = e.record.get("event") || body.event;
  const proofRaw = e.record.get("proof") || body.proof;

  try {
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
    updateAttempt(attempt, {
      event_id: asString(eventId),
      proof_event_id: asString(proofEventId),
      proof_counter: asString(counter),
    });

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
      const delta = counterDelta(currentCounter, counter);
      const logLine =
        "[check_ins] HMAC fail event=" +
        eventId +
        " payloadC=" +
        counter +
        " serverC=" +
        currentCounter +
        " delta=" +
        asString(delta) +
        " nowSec=" +
        now;
      try {
        $app.logger().warn(logLine);
      } catch (_) {}
      updateAttempt(attempt, {
        status: "failed",
        http_status: 400,
        error: "invalid or expired code",
        server_counter: asString(currentCounter),
        counter_delta: delta,
      });
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

    const currentDelta = counterDelta(currentCounter, counter);
    updateAttempt(attempt, {
      status: "ok",
      http_status: 200,
      check_in_id: asString(e.record.id),
      server_counter: asString(currentCounter),
      matched_counter: asString(matchedCounter),
      counter_delta: currentDelta,
    });
  } catch (err) {
    updateAttempt(attempt, {
      status: "failed",
      http_status: 400,
      error: asString(err?.message || err),
    });
    throw err;
  }
}, "check_ins");
