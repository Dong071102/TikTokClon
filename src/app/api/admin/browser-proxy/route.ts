import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";

// Lưu trữ cookie phiên theo domain cho admin trong bộ nhớ server
const cookieStoreByDomain: Record<string, string> = {};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return new Response("Missing target url", { status: 400 });
  }

  let targetUrl = rawUrl.trim();
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = "https://" + targetUrl;
  }

  try {
    const parsedTarget = new URL(targetUrl);
    const domain = parsedTarget.hostname;

    // Chuẩn bị headers gửi tới web đích
    const reqHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
      Referer: parsedTarget.origin + "/",
      Origin: parsedTarget.origin,
    };

    // Forward cookies nếu có trong cookie store
    if (cookieStoreByDomain[domain]) {
      reqHeaders["Cookie"] = cookieStoreByDomain[domain];
    }

    // Range header nếu client yêu cầu stream video
    const range = request.headers.get("range");
    if (range) {
      reqHeaders["Range"] = range;
    }

    const response = await fetch(targetUrl, {
      headers: reqHeaders,
      redirect: "follow",
    });

    // Thu thập set-cookie từ response để duy trì đăng nhập
    const setCookieHeaders = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean) as string[];

    if (setCookieHeaders.length > 0) {
      const existingCookies = (cookieStoreByDomain[domain] || "")
        .split(";")
        .map((c) => c.trim())
        .filter(Boolean);
      const cookieMap = new Map<string, string>();
      for (const cookie of existingCookies) {
        const [k, v] = cookie.split("=");
        if (k) cookieMap.set(k.trim(), v ? v.trim() : "");
      }

      for (const sc of setCookieHeaders) {
        const firstPart = sc.split(";")[0];
        if (firstPart) {
          const [k, v] = firstPart.split("=");
          if (k) cookieMap.set(k.trim(), v ? v.trim() : "");
        }
      }

      cookieStoreByDomain[domain] = Array.from(cookieMap.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    }

    const contentType = response.headers.get("content-type") || "";

    // 1. Nếu là HTML, loại bỏ header cấm iframe và tiêm <base> cùng script hỗ trợ bắt media & link click
    if (contentType.includes("text/html")) {
      let html = await response.text();
      const finalUrl = response.url || targetUrl;
      const finalOrigin = new URL(finalUrl).origin;
      const finalBase = new URL(finalUrl).pathname.replace(/\/[^/]*$/, "/");
      const baseHref = finalOrigin + finalBase;

      // Injected script để bắt media và liên lạc với parent Admin iframe
      const injectedScript = `
<script>
(function() {
  var REAL_URL = ${JSON.stringify(finalUrl)};
  var REAL_ORIGIN = ${JSON.stringify(finalOrigin)};

  // Bắt tất cả liên kết <a> để giữ người dùng duyệt tiếp trong proxy
  document.addEventListener('click', function(e) {
    var target = e.target;
    while (target && target.tagName !== 'A') {
      target = target.parentElement;
    }
    if (target) {
      var hrefAttr = target.getAttribute('href');
      if (hrefAttr && !hrefAttr.startsWith('javascript:') && !hrefAttr.startsWith('#')) {
        e.preventDefault();
        try {
          var absoluteUrl = new URL(hrefAttr, REAL_URL).toString();
          window.parent.postMessage({ type: 'BROWSER_NAVIGATE', url: absoluteUrl }, '*');
        } catch(err) {
          window.parent.postMessage({ type: 'BROWSER_NAVIGATE', url: hrefAttr }, '*');
        }
      }
    }
  }, true);

  // Bắt form submit và điều hướng qua proxy
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (form) {
      try {
        var actionAttr = form.getAttribute('action') || '';
        var actionUrl = new URL(actionAttr, REAL_URL).toString();
        form.action = '/api/admin/browser-proxy?url=' + encodeURIComponent(actionUrl);
      } catch(err) {}
    }
  }, true);

  // Quét DOM tìm các video, HLS và ảnh chất lượng cao
  function scanMedia() {
    try {
      var found = [];
      // 1. Thẻ video
      var videos = document.querySelectorAll('video');
      videos.forEach(function(v) {
        var src = v.currentSrc || v.src;
        if (!src) {
          var source = v.querySelector('source');
          if (source) src = source.src;
        }
        if (src) {
          try {
            var fullMediaUrl = new URL(src, REAL_URL).toString();
            found.push({
              type: 'VIDEO',
              mediaUrl: fullMediaUrl,
              thumbnailUrl: v.poster ? new URL(v.poster, REAL_URL).toString() : '',
              title: document.title || 'Video'
            });
          } catch(e) {}
        }
      });

      // 2. Tìm trong script (flashvars hoặc m3u8)
      var scripts = document.querySelectorAll('script');
      scripts.forEach(function(s) {
        var text = s.textContent || '';
        var m3u8Matches = text.match(/https?:\\\\?\\\/\\\\?\\\/[^"\'\\s]+\\.m3u8[^"\'\\s]*/g);
        if (m3u8Matches) {
          m3u8Matches.forEach(function(raw) {
            var clean = raw.replace(/\\\\/g, '');
            found.push({
              type: 'VIDEO',
              mediaUrl: clean,
              title: document.title || 'HLS Stream'
            });
          });
        }
      });

      // 3. Ảnh chất lượng cao (width/height > 350)
      var imgs = document.querySelectorAll('img');
      imgs.forEach(function(img) {
        if ((img.naturalWidth > 350 || img.naturalHeight > 350 || img.width > 350) && img.src && !img.src.startsWith('data:')) {
          try {
            var fullImgUrl = new URL(img.src, REAL_URL).toString();
            found.push({
              type: 'IMAGE',
              mediaUrl: fullImgUrl,
              thumbnailUrl: fullImgUrl,
              title: img.alt || document.title || 'Ảnh'
            });
          } catch(e) {}
        }
      });

      if (found.length > 0) {
        window.parent.postMessage({
          type: 'MEDIA_DETECTED',
          url: REAL_URL,
          title: document.title,
          items: found
        }, '*');
      }
    } catch (err) {
      console.warn('[ProxyScanner] Error scanning:', err);
    }
  }

  // Chạy quét sau khi tải trang và khi DOM thay đổi
  window.addEventListener('load', scanMedia);
  setTimeout(scanMedia, 1500);
  setTimeout(scanMedia, 4000);

  // Quan sát DOM mutations (ví dụ player nạp ajax)
  var observer = new MutationObserver(function() {
    clearTimeout(window.__scanTimer);
    window.__scanTimer = setTimeout(scanMedia, 1000);
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Báo URL hiện tại (URL thật) về cho parent update thanh Address bar
  window.parent.postMessage({
    type: 'BROWSER_URL_CHANGED',
    url: REAL_URL,
    title: document.title
  }, '*');
})();
</script>
`;

      // Chèn <base> và injectedScript vào <head>
      if (html.includes("<head>")) {
        html = html.replace(
          "<head>",
          `<head><base href="${baseHref}">${injectedScript}`
        );
      } else if (html.includes("<html")) {
        html = html.replace(
          /<html[^>]*>/,
          `$&<head><base href="${baseHref}">${injectedScript}</head>`
        );
      } else {
        html = `<base href="${baseHref}">${injectedScript}` + html;
      }

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          // Đảm bảo loại bỏ hoàn toàn các rào cản iframe
          "X-Frame-Options": "ALLOWALL",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // 2. Với các tài nguyên khác (CSS, JS, Video, Audio, Ảnh), stream trực tiếp
    const resHeaders = new Headers();
    resHeaders.set("Content-Type", contentType);
    resHeaders.set("Access-Control-Allow-Origin", "*");
    if (response.headers.get("content-range")) {
      resHeaders.set("Content-Range", response.headers.get("content-range")!);
    }
    if (response.headers.get("accept-ranges")) {
      resHeaders.set("Accept-Ranges", response.headers.get("accept-ranges")!);
    }
    if (response.headers.get("content-length")) {
      resHeaders.set("Content-Length", response.headers.get("content-length")!);
    }

    return new Response(response.body, {
      status: response.status,
      headers: resHeaders,
    });
  } catch (err: any) {
    console.error("[BROWSER_PROXY_ERROR]", err);
    return new Response(
      `<html><body style="background:#111;color:#fff;font-family:sans-serif;padding:24px;">
        <h3>Không thể tải trang qua proxy</h3>
        <p style="color:#aaa;">Lỗi: ${err.message}</p>
        <p style="color:#666;font-size:12px;">Đích: ${targetUrl}</p>
      </body></html>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

export async function POST(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return new Response("Missing target url", { status: 400 });
  }

  let targetUrl = rawUrl.trim();
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = "https://" + targetUrl;
  }

  try {
    const parsedTarget = new URL(targetUrl);
    const domain = parsedTarget.hostname;
    const bodyBuffer = await request.arrayBuffer();
    const contentType = request.headers.get("content-type") || "application/x-www-form-urlencoded";

    const reqHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Content-Type": contentType,
      Referer: parsedTarget.origin + "/",
      Origin: parsedTarget.origin,
    };

    if (cookieStoreByDomain[domain]) {
      reqHeaders["Cookie"] = cookieStoreByDomain[domain];
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: reqHeaders,
      body: bodyBuffer,
      redirect: "follow",
    });

    const setCookieHeaders = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean) as string[];

    if (setCookieHeaders.length > 0) {
      const existingCookies = (cookieStoreByDomain[domain] || "")
        .split(";")
        .map((c) => c.trim())
        .filter(Boolean);
      const cookieMap = new Map<string, string>();
      for (const cookie of existingCookies) {
        const [k, v] = cookie.split("=");
        if (k) cookieMap.set(k.trim(), v ? v.trim() : "");
      }

      for (const sc of setCookieHeaders) {
        const firstPart = sc.split(";")[0];
        if (firstPart) {
          const [k, v] = firstPart.split("=");
          if (k) cookieMap.set(k.trim(), v ? v.trim() : "");
        }
      }

      cookieStoreByDomain[domain] = Array.from(cookieMap.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    }

    // Nếu trả về redirect hoặc HTML, chuyển hướng người dùng tiếp tục trong proxy
    const finalUrl = response.url || targetUrl;
    return NextResponse.redirect(
      new URL(`/api/admin/browser-proxy?url=${encodeURIComponent(finalUrl)}`, request.url)
    );
  } catch (err: any) {
    console.error("[BROWSER_PROXY_POST_ERROR]", err);
    return new Response(`Lỗi gửi form: ${err.message}`, { status: 500 });
  }
}

