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
});
