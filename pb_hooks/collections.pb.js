/// 启动时自动创建 events / check_ins 集合（幂等，已存在则跳过）
onBootstrap((e) => {
  e.next();

  const usersId = "_pb_users_auth_";

  // --- events ---
  try {
    $app.findCollectionByNameOrId("events");
  } catch (_) {
    try {
      const col = new Collection({
        name: "events",
        type: "base",
        fields: [
          { name: "name",       type: "text",     required: true },
          { name: "owner",      type: "relation",  required: true, collectionId: usersId, maxSelect: 1 },
          { name: "secret_key", type: "text",     required: true },
          { name: "created",    type: "autodate",  onCreate: true, onUpdate: false },
          { name: "updated",    type: "autodate",  onCreate: true, onUpdate: true },
        ],
        listRule:   'owner = @request.auth.id',
        viewRule:   'owner = @request.auth.id',
        createRule: '@request.auth.id != ""',
        updateRule: 'owner = @request.auth.id',
        deleteRule: 'owner = @request.auth.id',
      });
      $app.save(col);
      console.log("[collections.pb.js] created: events");
    } catch (err) {
      console.log("[collections.pb.js] failed to create events: " + err);
    }
  }

  // --- check_ins ---
  try {
    $app.findCollectionByNameOrId("check_ins");
  } catch (_) {
    try {
      const eventsCol = $app.findCollectionByNameOrId("events");
      const col = new Collection({
        name: "check_ins",
        type: "base",
        fields: [
          { name: "user",  type: "relation", required: true, collectionId: usersId, maxSelect: 1 },
          { name: "event", type: "relation", required: true, collectionId: eventsCol.id, cascadeDelete: true, maxSelect: 1 },
          { name: "proof", type: "text",     required: false },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        listRule:   '@request.auth.id != ""',
        viewRule:   '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: null,
        deleteRule: null,
      });
      $app.save(col);
      console.log("[collections.pb.js] created: check_ins");
    } catch (err) {
      console.log("[collections.pb.js] failed to create check_ins: " + err);
    }
  }

  // --- check_in_attempts ---
  try {
    $app.findCollectionByNameOrId("check_in_attempts");
  } catch (_) {
    try {
      const col = new Collection({
        name: "check_in_attempts",
        type: "base",
        fields: [
          { name: "status",             type: "text",     required: false },
          { name: "http_status",        type: "number",   required: false },
          { name: "error",              type: "text",     required: false },
          { name: "method",             type: "text",     required: false },
          { name: "path",               type: "text",     required: false },
          { name: "event_id",           type: "text",     required: false },
          { name: "proof_event_id",     type: "text",     required: false },
          { name: "proof_counter",      type: "text",     required: false },
          { name: "server_counter",     type: "text",     required: false },
          { name: "matched_counter",    type: "text",     required: false },
          { name: "counter_delta",      type: "number",   required: false },
          { name: "user_id",            type: "text",     required: false },
          { name: "user_email",         type: "text",     required: false },
          { name: "check_in_id",        type: "text",     required: false },
          { name: "remote_ip",          type: "text",     required: false },
          { name: "real_ip",            type: "text",     required: false },
          { name: "client_ip_guess",    type: "text",     required: false },
          { name: "x_forwarded_for",    type: "text",     required: false },
          { name: "x_real_ip",          type: "text",     required: false },
          { name: "x_forwarded_host",   type: "text",     required: false },
          { name: "x_forwarded_proto",  type: "text",     required: false },
          { name: "host",               type: "text",     required: false },
          { name: "referer",            type: "text",     required: false },
          { name: "origin",             type: "text",     required: false },
          { name: "user_agent",         type: "text",     required: false },
          { name: "headers",            type: "json",     required: false },
          { name: "created",            type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated",            type: "autodate", onCreate: true, onUpdate: true },
        ],
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
      });
      $app.save(col);
      console.log("[collections.pb.js] created: check_in_attempts");
    } catch (err) {
      console.log("[collections.pb.js] failed to create check_in_attempts: " + err);
    }
  }
});
