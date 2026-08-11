/// 企业微信网页授权（自建应用）：用 code 换取成员身份并签发 PocketBase 用户 JWT。
/// 在企微后台为应用启用「网页授权」，可信域名与本站域名一致（含端口），回调页为前端 /oauth-callback。
routerAdd(
  "POST",
  "/api/qrcheck/wecom-auth",
  function (e) {
    const data = new DynamicModel({
      code: "",
    });
    e.bindBody(data);

    var code = (data.code || "").trim();
    if (!code) {
      throw new BadRequestError("缺少 code");
    }

    var corpid = ($os.getenv("PB_WECOM_CORP_ID") || "").trim();
    var corpsecret = ($os.getenv("PB_WECOM_AGENT_SECRET") || "").trim();

    if (!corpid || !corpsecret) {
      throw new BadRequestError(
        "服务器未配置企业微信（PB_WECOM_CORP_ID / PB_WECOM_AGENT_SECRET）"
      );
    }

    var tokenReqUrl =
      "https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=" +
      encodeURIComponent(corpid) +
      "&corpsecret=" +
      encodeURIComponent(corpsecret);

    var tRes;
    try {
      tRes = $http.send({
        url: tokenReqUrl,
        method: "GET",
        timeout: 90,
      });
    } catch (_) {
      throw new BadRequestError("无法连接企业微信 gettoken");
    }

    if (tRes.statusCode !== 200) {
      throw new BadRequestError("企业微信 gettoken HTTP " + String(tRes.statusCode));
    }

    var tJson = tRes.json || {};
    var tokErr = typeof tJson.errcode !== "undefined" ? Number(tJson.errcode) : 0;
    if (tokErr !== 0) {
      throw new BadRequestError("企业微信 gettoken：" + String(tJson.errmsg || "失败"));
    }

    var accessToken = String(tJson.access_token || "");
    if (!accessToken) {
      throw new BadRequestError("企业微信未返回 access_token");
    }

    var uiUrl =
      "https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=" +
      encodeURIComponent(accessToken) +
      "&code=" +
      encodeURIComponent(code);

    var uRes;
    try {
      uRes = $http.send({
        url: uiUrl,
        method: "GET",
        timeout: 90,
      });
    } catch (_) {
      throw new BadRequestError("无法连接企业微信 getuserinfo");
    }

    if (uRes.statusCode !== 200) {
      throw new BadRequestError("企业微信 getuserinfo HTTP " + String(uRes.statusCode));
    }

    var uj = uRes.json || {};
    var uiErr = typeof uj.errcode !== "undefined" ? Number(uj.errcode) : 0;
    if (uiErr !== 0) {
      throw new BadRequestError("企业微信登录失败：" + String(uj.errmsg || ""));
    }

    var memberUserId = "";
    if (uj.userid) {
      memberUserId = String(uj.userid);
    }
    var externalOpenId = "";
    if (uj.openid) {
      externalOpenId = String(uj.openid);
    }

    var stableKey = memberUserId;
    if (!stableKey && externalOpenId) {
      stableKey = externalOpenId;
    }
    if (!stableKey) {
      throw new BadRequestError("未取得企业微信用户标识");
    }

    function sanitizePart(s, maxLen) {
      var x = String(s || "");
      var cap = typeof maxLen === "number" && maxLen > 0 ? maxLen : 64;
      var out = "";
      var i = 0;
      var n = Math.min(x.length, cap + 40);
      for (i = 0; i < n && out.length < cap; i++) {
        var c = x.charAt(i);
        if (
          (c >= "a" && c <= "z") ||
          (c >= "A" && c <= "Z") ||
          (c >= "0" && c <= "9") ||
          c === "." ||
          c === "-" ||
          c === "_"
        ) {
          out += c;
        } else {
          out += "_";
        }
      }
      return out.length > 0 ? out : "u";
    }

    /* 每名成员映射为唯一占位邮箱（仅用于 PocketBase Auth，非真实邮箱） */
    var corpTag = sanitizePart(corpid + "_" + stableKey, 64);
    var email = "wecom+" + corpTag + "@wecom.qrcheckin.local";

    var displayName = memberUserId || stableKey || "WeCom User";

    var fetchRaw = String($os.getenv("PB_WECOM_FETCH_USER_DETAIL") || "").trim().toLowerCase();
    var fetchDetail =
      fetchRaw === "1" || fetchRaw === "true" || fetchRaw === "yes";
    if (fetchDetail && memberUserId) {
      var guUrl =
        "https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=" +
        encodeURIComponent(accessToken) +
        "&userid=" +
        encodeURIComponent(memberUserId);
      try {
        var gRes = $http.send({
          url: guUrl,
          method: "GET",
          timeout: 90,
        });
        if (gRes.statusCode === 200 && gRes.json && Number(gRes.json.errcode) === 0) {
          var nm = gRes.json.name;
          if (nm) {
            displayName = String(nm);
          }
        }
      } catch (_) {
        /* 忽略通讯录查询失败 */
      }
    }

    var record;
    try {
      record = e.app.findAuthRecordByEmail("users", email);
    } catch (_) {
      record = null;
    }

    if (!record) {
      var collection = $app.findCollectionByNameOrId("users");
      record = new Record(collection);
      record.setEmail(email);
      record.setVerified(true);
      record.setRandomPassword();
      try {
        record.set("name", displayName);
      } catch (_) {
        /* 若集合无 name 字段则跳过 */
      }
      e.app.save(record);
    }

    if (fetchDetail && memberUserId) {
      try {
        record.set("name", displayName);
        e.app.save(record);
      } catch (_) {
        /* 无 name 字段或无权更新时不阻断登录 */
      }
    }

    return $apis.recordAuthResponse(e, record, "wecom");
  },
  $apis.requireGuestOnly()
);
