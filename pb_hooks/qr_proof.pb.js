routerAdd("GET", "/api/qrcheck/events/{eventId}/proof", (e) => {
  const eventId = e.request.pathValue("eventId");
  const event = $app.findRecordById("events", eventId);
  if (!e.auth || event.get("owner") !== e.auth.id) {
    throw new ForbiddenError("Only the event host can display its QR code.");
  }

  const now = Date.now();
  const counter = Math.floor(now / 3000);
  const secret = event.get("secret_key");
  if (!secret) {
    throw new BadRequestError("Event signing is not configured.");
  }

  e.response.header().set("Cache-Control", "no-store, private, max-age=0");
  return e.json(200, {
    v: 1,
    e: eventId,
    c: counter,
    m: $security.hs256(counter + "|" + eventId, secret),
    server_time_ms: now,
    // The unchanged validator accepts counters within four 3-second steps.
    expires_at_ms: (counter + 5) * 3000,
  });
}, $apis.requireAuth());
