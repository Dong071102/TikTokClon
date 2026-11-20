(function () {
  if (window.__TK_EXTENSION_LOADED) return;
  window.__TK_EXTENSION_LOADED = true;

  const SERVER_URL = "http://localhost:6789";
  const DEFAULT_TAGS = ["Hot", "1080p", "Trending", "Video", "Cosplay", "Anime", "POV", "Asian"];
  let quickTags = DEFAULT_TAGS;

  // Lấy cấu hình tag từ server nếu có
  fetch(SERVER_URL + "/api/tags")
    .then((r) => r.json())
    .then((d) => {
      if (d.success && Array.isArray(d.tags) && d.tags.length > 0) {
        quickTags = d.tags.slice(0, 8).map((t) => t.name);
      }
    })
    .catch(() => {});

  // Tìm video hoặc tweet đang hiển thị
  function getActiveMedia() {
    const isTwitter = window.location.hostname.includes("x.com") || window.location.hostname.includes("twitter.com");

    if (isTwitter) {
      // 1. Nếu đang ở trang chi tiết tweet (/status/123)
      if (window.location.pathname.includes("/status/")) {
        return {
          type: "VIDEO",
          sourceType: "X_TWITTER",
          sourceUrl: window.location.href,
          title: document.title,
        };
      }

      // 2. Nếu đang lướt Newfeed: Tìm bài tweet gần nhất ở giữa màn hình
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      let targetArticle = null;
      let minDistance = Infinity;
      const centerY = window.innerHeight / 2;

      articles.forEach((art) => {
        const rect = art.getBoundingClientRect();
        if (rect.bottom > 100 && rect.top < window.innerHeight - 100) {
          const dist = Math.abs(rect.top + rect.height / 2 - centerY);
          if (dist < minDistance) {
            minDistance = dist;
            targetArticle = art;
          }
        }
      });

      if (targetArticle) {
        const statusLink = targetArticle.querySelector('a[href*="/status/"]');
        if (statusLink) {
          const tweetUrl = new URL(statusLink.getAttribute("href"), "https://x.com").toString();
          return {
            type: "VIDEO",
            sourceType: "X_TWITTER",
            sourceUrl: tweetUrl,
            title: targetArticle.innerText?.slice(0, 80) || document.title,
          };
        }
      }

      return {
        type: "VIDEO",
        sourceType: "X_TWITTER",
        sourceUrl: window.location.href,
        title: document.title,
      };
    }

    // Các trang web khác: tìm thẻ video đang phát hoặc lớn nhất
    const videos = document.querySelectorAll("video");
    for (const v of videos) {
      const src = v.currentSrc || v.src;
      if (src && !src.startsWith("blob:")) {
        return {
          type: "VIDEO",
          sourceType: "DIRECT_LINK",
          sourceUrl: window.location.href,
          mediaUrl: src,
          thumbnailUrl: v.poster || "",
          title: document.title,
        };
      }
    }

    // Nếu chỉ có ảnh
    const imgs = document.querySelectorAll("img");
    for (const img of imgs) {
      if ((img.naturalWidth > 400 || img.naturalHeight > 400) && img.src && !img.src.startsWith("data:")) {
        return {
          type: "IMAGE",
          sourceType: "DIRECT_LINK",
          sourceUrl: window.location.href,
          mediaUrl: img.src,
          thumbnailUrl: img.src,
          title: img.alt || document.title,
        };
      }
    }

    return {
      type: "VIDEO",
      sourceType: "DIRECT_LINK",
      sourceUrl: window.location.href,
      title: document.title,
    };
  }

  // Tạo UI Widget nổi
  const widget = document.createElement("div");
  widget.id = "tk-floating-radial-widget";
  widget.style.cssText = `
    position: fixed;
    bottom: 28px;
    right: 28px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  const btn = document.createElement("button");
  btn.style.cssText = `
    background: #0a0a0a;
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 9999px;
    padding: 10px 18px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    gap: 8px;
    user-select: none;
    touch-action: none;
    transition: transform 0.15s, background 0.15s;
  `;
  btn.innerHTML = `<span style="color:#f59e0b;">⚡</span><span>Lưu TikTokClone</span><span style="font-size:10px;opacity:0.6;">(Dí tag)</span>`;

  widget.appendChild(btn);
  document.body.appendChild(widget);

  // Toast thông báo
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #0a0a0a;
    color: #fff;
    border: 1px solid #10b981;
    border-radius: 12px;
    padding: 10px 20px;
    font-size: 13px;
    font-weight: 600;
    z-index: 2147483647;
    box-shadow: 0 10px 40px rgba(0,0,0,0.8);
    display: none;
    font-family: sans-serif;
  `;
  document.body.appendChild(toast);

  function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.style.borderColor = isError ? "#ef4444" : "#10b981";
    toast.style.display = "block";
    setTimeout(() => {
      toast.style.display = "none";
    }, 3500);
  }

  // Radial Tag Overlay
  const radialOverlay = document.createElement("div");
  radialOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    z-index: 2147483646;
    display: none;
    pointer-events: none;
  `;

  const radialCenter = document.createElement("div");
  radialCenter.style.cssText = "position: absolute;";
  radialOverlay.appendChild(radialCenter);
  document.body.appendChild(radialOverlay);

  const RADIUS = 96;
  let tagPills = [];

  function buildRadialTags() {
    radialCenter.innerHTML = "";
    tagPills = [];
    const n = quickTags.length;

    quickTags.forEach((tag, idx) => {
      const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / n;
      const x = Math.round(RADIUS * Math.cos(angle));
      const y = Math.round(RADIUS * Math.sin(angle));

      const pill = document.createElement("div");
      pill.style.cssText = `
        position: absolute;
        transform: translate(-50%, -50%);
        left: ${x}px;
        top: ${y}px;
        padding: 6px 14px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        white-space: nowrap;
        background: rgba(20, 20, 20, 0.95);
        color: #eee;
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        transition: transform 0.1s, background 0.1s, color 0.1s;
      `;
      pill.textContent = "#" + tag;
      radialCenter.appendChild(pill);
      tagPills.push({ pill, x, y, tag });
    });
  }

  buildRadialTags();

  // Tương tác dí ngón tay & kéo
  let isHolding = false;
  let holdTimer = null;
  let centerPos = { x: 0, y: 0 };
  let selectedIndex = null;

  btn.addEventListener("pointerdown", (e) => {
    buildRadialTags();
    const rect = btn.getBoundingClientRect();
    centerPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    radialCenter.style.left = `${centerPos.x}px`;
    radialCenter.style.top = `${centerPos.y}px`;

    holdTimer = setTimeout(() => {
      isHolding = true;
      selectedIndex = null;
      radialOverlay.style.display = "block";
      btn.style.transform = "scale(1.08)";
      if (navigator.vibrate) try { navigator.vibrate(25); } catch(e) {}
    }, 160);
  });

  window.addEventListener("pointermove", (e) => {
    if (!isHolding) return;
    const dx = e.clientX - centerPos.x;
    const dy = e.clientY - centerPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 35) {
      if (selectedIndex !== null) {
        tagPills[selectedIndex].pill.style.background = "rgba(20, 20, 20, 0.95)";
        tagPills[selectedIndex].pill.style.color = "#eee";
        tagPills[selectedIndex].pill.style.transform = "translate(-50%, -50%) scale(1)";
        selectedIndex = null;
      }
      return;
    }

    let closest = 0;
    let minD = Infinity;
    tagPills.forEach((item, idx) => {
      const d = Math.sqrt((dx - item.x) ** 2 + (dy - item.y) ** 2);
      if (d < minD) {
        minD = d;
        closest = idx;
      }
    });

    if (selectedIndex !== closest) {
      if (selectedIndex !== null) {
        tagPills[selectedIndex].pill.style.background = "rgba(20, 20, 20, 0.95)";
        tagPills[selectedIndex].pill.style.color = "#eee";
        tagPills[selectedIndex].pill.style.transform = "translate(-50%, -50%) scale(1)";
      }
      selectedIndex = closest;
      tagPills[closest].pill.style.background = "#fff";
      tagPills[closest].pill.style.color = "#000";
      tagPills[closest].pill.style.transform = "translate(-50%, -50%) scale(1.25)";
      if (navigator.vibrate) try { navigator.vibrate(10); } catch(e) {}
    }
  });

  window.addEventListener("pointerup", (e) => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }

    if (isHolding) {
      isHolding = false;
      radialOverlay.style.display = "none";
      btn.style.transform = "scale(1)";

      const chosen = selectedIndex;
      if (chosen !== null && tagPills[chosen]) {
        saveMedia(tagPills[chosen].tag);
      }
      selectedIndex = null;
    } else {
      // Tap nhanh
      saveMedia(quickTags[0]);
    }
  });

  function saveMedia(tag) {
    const media = getActiveMedia();
    btn.innerHTML = `<span>⏳ Đang lưu...</span>`;

    fetch(SERVER_URL + "/api/admin/media", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: media.type || "VIDEO",
        sourceType: media.sourceType || "DIRECT_LINK",
        sourceUrl: media.sourceUrl || window.location.href,
        mediaUrl: media.mediaUrl || "",
        thumbnailUrl: media.thumbnailUrl || null,
        title: media.title || document.title,
        storageMode: "DIRECT_LINK",
        tags: [tag],
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        btn.innerHTML = `<span style="color:#10b981;">✓ Đã lưu</span>`;
        setTimeout(() => {
          btn.innerHTML = `<span style="color:#f59e0b;">⚡</span><span>Lưu TikTokClone</span><span style="font-size:10px;opacity:0.6;">(Dí tag)</span>`;
        }, 3000);

        if (data.success) {
          showToast(`✓ Đã lưu thành công vào TikTokClone với tag #${tag}!`);
        } else {
          showToast(`Lỗi: ${data.error || "Không thể lưu"}`, true);
        }
      })
      .catch((err) => {
        btn.innerHTML = `<span>Lỗi kết nối</span>`;
        showToast(`Lỗi kết nối server: ${err.message}`, true);
      });
  }
})();
