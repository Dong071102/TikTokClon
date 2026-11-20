(function () {
  if (window.__TK_LOADED) {
    if (window.__TK_TRIGGER) window.__TK_TRIGGER();
    return;
  }
  window.__TK_LOADED = true;

  var SERVER_URL = "http://localhost:6789";
  var QUICK_TAGS = ["Hot", "1080p", "Trending", "Video", "Cosplay", "Anime", "POV", "Asian"];

  // Quét tìm video hoặc ảnh lớn trên trang hiện tại
  function scanCurrentMedia() {
    var found = [];
    // 1. Thẻ video
    var videos = document.querySelectorAll("video");
    videos.forEach(function (v) {
      var src = v.currentSrc || v.src;
      if (!src) {
        var source = v.querySelector("source");
        if (source) src = source.src;
      }
      if (src) {
        found.push({
          type: "VIDEO",
          mediaUrl: src,
          thumbnailUrl: v.poster || "",
          title: document.title || "Video",
        });
      }
    });

    // 2. Tìm HLS m3u8 trong script
    var scripts = document.querySelectorAll("script");
    scripts.forEach(function (s) {
      var text = s.textContent || "";
      var matches = text.match(/https?:\\?\/\\?\/[^"'\\s]+\.m3u8[^"'\\s]*/g);
      if (matches) {
        matches.forEach(function (raw) {
          var clean = raw.replace(/\\/g, "");
          found.push({
            type: "VIDEO",
            mediaUrl: clean,
            title: document.title || "HLS Stream",
          });
        });
      }
    });

    // 3. Ảnh chất lượng cao (width/height > 350)
    var imgs = document.querySelectorAll("img");
    imgs.forEach(function (img) {
      if ((img.naturalWidth > 350 || img.naturalHeight > 350) && img.src && !img.src.startsWith("data:")) {
        found.push({
          type: "IMAGE",
          mediaUrl: img.src,
          thumbnailUrl: img.src,
          title: img.alt || document.title || "Ảnh",
        });
      }
    });

    return found;
  }

  // Tạo UI Widget nổi
  var container = document.createElement("div");
  container.id = "tk-floating-widget";
  container.style.cssText =
    "position:fixed;bottom:24px;right:24px;z-index:9999999;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;align-items:flex-end;gap:8px;";

  var button = document.createElement("button");
  button.style.cssText =
    "background:#000;color:#fff;border:1px solid rgba(255,255,255,0.25);border-radius:14px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 8px 30px rgba(0,0,0,0.6);display:flex;align-items:center;gap:8px;user-select:none;touch-action:none;transition:transform 0.1s;";
  button.innerHTML = "<span style='color:#f59e0b;'>⚡</span><span>Lưu TikTokClone</span><span style='font-size:11px;opacity:0.6;'>(Dí để chọn tag)</span>";

  container.appendChild(button);
  document.body.appendChild(container);

  var toast = document.createElement("div");
  toast.style.cssText =
    "position:fixed;top:24px;left:50%;transform:translateX(-50%);background:#111;color:#fff;border:1px solid #10b981;border-radius:12px;padding:10px 20px;font-size:14px;font-weight:600;z-index:10000000;box-shadow:0 10px 40px rgba(0,0,0,0.8);display:none;";
  document.body.appendChild(toast);

  function showToast(msg, isError) {
    toast.textContent = msg;
    toast.style.borderColor = isError ? "#ef4444" : "#10b981";
    toast.style.display = "block";
    setTimeout(function () {
      toast.style.display = "none";
    }, 4000);
  }

  // Radial Tag Menu Overlay
  var radialOverlay = document.createElement("div");
  radialOverlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999998;display:none;pointer-events:none;";
  var radialCenter = document.createElement("div");
  radialCenter.style.cssText = "position:absolute;";
  radialOverlay.appendChild(radialCenter);
  document.body.appendChild(radialOverlay);

  var RADIUS = 96;
  var tagPositions = QUICK_TAGS.map(function (_, idx) {
    var angle = -Math.PI / 2 + (idx * 2 * Math.PI) / QUICK_TAGS.length;
    return {
      x: Math.round(RADIUS * Math.cos(angle)),
      y: Math.round(RADIUS * Math.sin(angle)),
    };
  });

  var tagPills = [];
  QUICK_TAGS.forEach(function (tag, idx) {
    var pill = document.createElement("div");
    pill.style.cssText =
      "position:absolute;transform:translate(-50%,-50%);padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;background:rgba(20,20,20,0.95);color:#eee;border:1px solid rgba(255,255,255,0.2);box-shadow:0 4px 20px rgba(0,0,0,0.5);transition:all 0.1s;";
    pill.textContent = "#" + tag;
    pill.style.left = tagPositions[idx].x + "px";
    pill.style.top = tagPositions[idx].y + "px";
    radialCenter.appendChild(pill);
    tagPills.push(pill);
  });

  // Haptic feedback
  function vibrate(ms) {
    if (navigator.vibrate) try { navigator.vibrate(ms); } catch(e) {}
  }

  var isHolding = false;
  var holdTimer = null;
  var centerPos = { x: 0, y: 0 };
  var selectedIndex = null;

  button.addEventListener("pointerdown", function (e) {
    var rect = button.getBoundingClientRect();
    centerPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    radialCenter.style.left = centerPos.x + "px";
    radialCenter.style.top = centerPos.y + "px";

    holdTimer = setTimeout(function () {
      isHolding = true;
      selectedIndex = null;
      radialOverlay.style.display = "block";
      button.style.transform = "scale(1.05)";
      vibrate(30);
    }, 160);
  });

  window.addEventListener("pointermove", function (e) {
    if (!isHolding) return;
    var dx = e.clientX - centerPos.x;
    var dy = e.clientY - centerPos.y;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 35) {
      if (selectedIndex !== null) {
        tagPills[selectedIndex].style.background = "rgba(20,20,20,0.95)";
        tagPills[selectedIndex].style.color = "#eee";
        tagPills[selectedIndex].style.transform = "translate(-50%,-50%) scale(1)";
        selectedIndex = null;
      }
      return;
    }

    var closest = 0;
    var minD = Infinity;
    tagPositions.forEach(function (pos, idx) {
      var d = Math.sqrt((dx - pos.x) * (dx - pos.x) + (dy - pos.y) * (dy - pos.y));
      if (d < minD) {
        minD = d;
        closest = idx;
      }
    });

    if (selectedIndex !== closest) {
      if (selectedIndex !== null) {
        tagPills[selectedIndex].style.background = "rgba(20,20,20,0.95)";
        tagPills[selectedIndex].style.color = "#eee";
        tagPills[selectedIndex].style.transform = "translate(-50%,-50%) scale(1)";
      }
      selectedIndex = closest;
      tagPills[closest].style.background = "#fff";
      tagPills[closest].style.color = "#000";
      tagPills[closest].style.transform = "translate(-50%,-50%) scale(1.25)";
      vibrate(12);
    }
  });

  window.addEventListener("pointerup", function (e) {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }

    if (isHolding) {
      isHolding = false;
      radialOverlay.style.display = "none";
      button.style.transform = "scale(1)";

      var chosen = selectedIndex;
      if (chosen !== null) {
        tagPills[chosen].style.background = "rgba(20,20,20,0.95)";
        tagPills[chosen].style.color = "#eee";
        tagPills[chosen].style.transform = "translate(-50%,-50%) scale(1)";
        vibrate(40);
        saveMedia(QUICK_TAGS[chosen]);
      }
      selectedIndex = null;
    } else {
      // Tap nhanh
      saveMedia(QUICK_TAGS[0]);
    }
  });

  function saveMedia(tag) {
    var items = scanCurrentMedia();
    if (items.length === 0) {
      showToast("Không tìm thấy video hoặc ảnh lớn trên trang này", true);
      return;
    }

    // Ưu tiên video trước
    var target = items.find(function (m) { return m.type === "VIDEO"; }) || items[0];

    button.innerHTML = "<span>⏳ Đang lưu...</span>";

    var token = window.__TK_TOKEN || localStorage.getItem("tk_admin_token") || "";

    fetch(SERVER_URL + "/api/admin/media", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": token ? "Bearer " + token : "",
      },
      body: JSON.stringify({
        type: target.type,
        sourceType: "DIRECT_LINK",
        sourceUrl: window.location.href,
        mediaUrl: target.mediaUrl,
        thumbnailUrl: target.thumbnailUrl || null,
        title: target.title || document.title,
        storageMode: "DIRECT_LINK",
        tags: [tag],
      }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        button.innerHTML = "<span style='color:#10b981;'>✓ Đã lưu</span>";
        setTimeout(function () {
          button.innerHTML = "<span style='color:#f59e0b;'>⚡</span><span>Lưu TikTokClone</span>";
        }, 3000);
        if (data.success) {
          showToast("✓ Đã lưu " + target.type + " vào TikTokClone với tag #" + tag, false);
        } else {
          showToast("Lỗi: " + (data.error || "Không thể lưu"), true);
        }
      })
      .catch(function (err) {
        button.innerHTML = "<span>Lưu thất bại</span>";
        showToast("Lỗi kết nối server: " + err.message, true);
      });
  }

  showToast("⚡ Đã kích hoạt công cụ Lưu TikTokClone trên trang này!", false);
})();
