import { extractTubeMediaFromText } from "./tubeExtractor";

export interface ScrapedMediaItem {
  id: string;
  url: string;
  type: "IMAGE" | "VIDEO";
  sourceUrl: string;
  pageTitle?: string;
  thumbnailUrl?: string;
}

export interface ScrapedPageSummary {
  url: string;
  title: string;
  imageCount: number;
  videoCount: number;
  error?: string;
}

export interface ScrapedWebResult {
  pages: ScrapedPageSummary[];
  items: ScrapedMediaItem[];
  images: string[]; // Danh sách URL ảnh (tương thích ngược)
  videos: string[]; // Danh sách URL video
  title: string;
  totalImages: number;
  totalVideos: number;
  totalFound: number;
}

// Hàm chuẩn hoá URL và unescape ký tự JSON (ví dụ \/ -> /)
function unescapeString(str: string): string {
  return str
    .replace(/\\\//g, "/")
    .replace(/\\u002F/gi, "/")
    .replace(/&amp;/g, "&");
}

// Cache Token cho LeakGallery để tối ưu tốc độ và không spam request
let cachedLeakGalleryToken: { token: string; expiresAt: number } | null = null;

async function getLeakGalleryAppToken(baseUrl: string): Promise<string | null> {
  const now = Date.now();
  if (cachedLeakGalleryToken && cachedLeakGalleryToken.expiresAt > now) {
    return cachedLeakGalleryToken.token;
  }

  try {
    const res = await fetch(baseUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<script id="ng-state" type="application\/json">([\s\S]*?)<\/script>/i);
    if (!m) return null;

    const data = JSON.parse(m[1]);
    const token = data["APP_TOKEN"];
    if (token && typeof token === "string") {
      cachedLeakGalleryToken = { token, expiresAt: now + 8 * 60 * 1000 };
      return token;
    }
  } catch {}
  return null;
}

// Bóc tách chuyên biệt cho LeakGallery (SPA Angular với private API và token)
async function scrapeLeakGallery(
  parsedUrl: URL,
  sourceUrl: string
): Promise<{ title: string; items: ScrapedMediaItem[]; error?: string } | null> {
  try {
    const parts = parsedUrl.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;

    const username = parts[0];
    const tab = parts[1] || "Photos";

    // Hỗ trợ cả ?page=, ?offset=, hoặc số trang trong path
    let pageNum = 1;
    if (parsedUrl.searchParams.has("page")) {
      pageNum = parseInt(parsedUrl.searchParams.get("page")!, 10) || 1;
    } else if (parsedUrl.searchParams.has("offset")) {
      const offset = parseInt(parsedUrl.searchParams.get("offset")!, 10) || 0;
      pageNum = Math.floor(offset / 40) + 1;
    } else if (parts[2] && !isNaN(Number(parts[2]))) {
      pageNum = parseInt(parts[2], 10);
    }

    const basePageUrl = `https://leakgallery.com/${username}/${tab}`;
    let medias: any[] = [];
    let pageTitle = `${username} - ${tab} (Trang ${pageNum})`;

    // Nếu là page 1, thử lấy trước từ state HTML ban đầu
    if (pageNum === 1) {
      try {
        const res = await fetch(basePageUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (res.ok) {
          const html = await res.text();
          const m = html.match(/<script id="ng-state" type="application\/json">([\s\S]*?)<\/script>/i);
          if (m) {
            const ngState = JSON.parse(m[1]);
            if (ngState["APP_TOKEN"]) {
              cachedLeakGalleryToken = { token: ngState["APP_TOKEN"], expiresAt: Date.now() + 8 * 60 * 1000 };
            }
            const stateKey = Object.keys(ngState).find(
              (k) => k.startsWith(`httpGet:profile/${username}`) || k.includes(`profile/${username}`)
            );
            if (stateKey && ngState[stateKey] && Array.isArray(ngState[stateKey].medias)) {
              medias = ngState[stateKey].medias;
              if (ngState[stateKey].profile?.seo_name) {
                pageTitle = `${ngState[stateKey].profile.seo_name} (${username}) - ${tab} (Trang 1)`;
              }
            }
          }
        }
      } catch {}
    }

    // Nếu pageNum > 1 hoặc state chưa có, gọi trực tiếp API kèm X-App-Token
    if (pageNum > 1 || medias.length === 0) {
      const appToken = await getLeakGalleryAppToken(basePageUrl);
      if (!appToken) {
        return {
          title: pageTitle,
          items: [],
          error: "Không thể lấy APP_TOKEN bảo mật từ LeakGallery",
        };
      }

      const apiUrl = `https://api.leakgallery.com/profile/${username}/${pageNum}?type=${tab}&sort=MostRecent&fake=true&tag=0`;
      const apiRes = await fetch(apiUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Origin: "https://leakgallery.com",
          Referer: basePageUrl,
          "X-App-Token": appToken,
          Accept: "application/json, text/plain, */*",
        },
        signal: AbortSignal.timeout(12000),
      });

      if (apiRes.ok) {
        const data = await apiRes.json();
        if (Array.isArray(data.medias)) {
          medias = data.medias;
        }
      } else {
        return {
          title: pageTitle,
          items: [],
          error: `API LeakGallery trả về HTTP ${apiRes.status}`,
        };
      }
    }

    const items: ScrapedMediaItem[] = medias.map((m, idx) => {
      const isVideo = Boolean(m.is_video);
      const cdnUrl = `https://cdn.leakgallery.com/${m.file_path}`;
      const thumbUrl = m.thumbnail_path ? `https://cdn.leakgallery.com/${m.thumbnail_path}` : undefined;
      return {
        id: `${isVideo ? "video" : "img"}-${pageNum}-${idx}-${m.id}`,
        url: cdnUrl,
        type: isVideo ? "VIDEO" : "IMAGE",
        sourceUrl,
        pageTitle: m.caption_title || pageTitle,
        thumbnailUrl: thumbUrl,
      };
    });

    return {
      title: pageTitle,
      items,
    };
  } catch (err: any) {
    return {
      title: "LeakGallery",
      items: [],
      error: err.message || "Lỗi tải dữ liệu LeakGallery",
    };
  }
}

// Bóc tách media từ 1 URL trang web đơn lẻ
export async function scrapeSingleWebUrl(targetUrl: string): Promise<{
  title: string;
  items: ScrapedMediaItem[];
  error?: string;
}> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl.trim());
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Chỉ hỗ trợ giao thức HTTP hoặc HTTPS");
    }
  } catch {
    return {
      title: "",
      items: [],
      error: "Đường dẫn URL không hợp lệ",
    };
  }

  // 0. Xử lý chuyên biệt cho các trang SPA bảo mật như leakgallery.com
  if (parsedUrl.hostname.includes("leakgallery.com")) {
    const leakResult = await scrapeLeakGallery(parsedUrl, targetUrl);
    if (leakResult) return leakResult;
  }

  try {
    const response = await fetch(parsedUrl.href, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,video/*,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000), // Timeout 15 giây mỗi trang
    });

    if (!response.ok) {
      return {
        title: "",
        items: [],
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const rawHtml = await response.text();
    const html = unescapeString(rawHtml);

    // 1. Trích xuất Tiêu đề trang web
    let title = "";
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    } else {
      const ogTitleMatch = html.match(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
      );
      if (ogTitleMatch && ogTitleMatch[1]) {
        title = ogTitleMatch[1].trim();
      }
    }

    // 1.1 Tìm thumbnail chính của trang (og:image) làm poster dự phòng cho video
    let defaultPoster: string | undefined = undefined;
    const ogImgMatch = html.match(
      /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:url|twitter:image)["'][^>]+content=["']([^"']+)["']/i
    ) || html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|og:image:url|twitter:image)["']/i
    );
    if (ogImgMatch && ogImgMatch[1]) {
      defaultPoster = ogImgMatch[1].trim();
    }

    const imageCandidates = new Set<string>();
    const videoCandidates = new Map<string, string | undefined>(); // videoUrl -> poster/thumbnailUrl

    // 1.2 Trích xuất VIDEO chuyên sâu từ flashvars / mediaDefinitions (Pornhub, YouPorn, RedTube, v.v.)
    const tubeMedia = extractTubeMediaFromText(rawHtml) || extractTubeMediaFromText(html);
    if (tubeMedia) {
      if (!title && tubeMedia.title) title = tubeMedia.title;
      if (!defaultPoster && tubeMedia.thumbnailUrl) defaultPoster = tubeMedia.thumbnailUrl;
      videoCandidates.set(tubeMedia.videoUrl, tubeMedia.thumbnailUrl || defaultPoster);
      for (const st of tubeMedia.allStreams) {
        if (!videoCandidates.has(st.videoUrl)) {
          videoCandidates.set(st.videoUrl, tubeMedia.thumbnailUrl || defaultPoster);
        }
      }
    }

    // 2. Trích xuất VIDEO: OpenGraph & Twitter Card video
    const ogVideoRegex =
      /<meta[^>]+(?:property|name)=["'](?:og:video|og:video:url|og:video:secure_url|twitter:player:stream)["'][^>]+content=["']([^"']+)["']/gi;
    let vMatch;
    while ((vMatch = ogVideoRegex.exec(html)) !== null) {
      if (vMatch[1]) videoCandidates.set(vMatch[1].trim(), undefined);
    }
    const ogVideoRevRegex =
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:video|og:video:url|og:video:secure_url|twitter:player:stream)["']/gi;
    let vRevMatch;
    while ((vRevMatch = ogVideoRevRegex.exec(html)) !== null) {
      if (vRevMatch[1]) videoCandidates.set(vRevMatch[1].trim(), undefined);
    }

    // 3. Trích xuất VIDEO: Thẻ <video> và <source>
    const videoTagRegex = /<video\s+[^>]*>([\s\S]*?)<\/video>|<video\s+[^>]*\/?>/gi;
    let videoBlockMatch;
    while ((videoBlockMatch = videoTagRegex.exec(html)) !== null) {
      const videoTag = videoBlockMatch[0];
      // Tìm poster nếu có
      const posterMatch = videoTag.match(/poster=["']([^"']+)["']/i);
      const poster = posterMatch ? posterMatch[1].trim() : undefined;

      // Tìm src trong thẻ video
      const srcMatch = videoTag.match(
        /(?:src|data-src|data-url|data-original)=["']([^"']+)["']/i
      );
      if (srcMatch && srcMatch[1]) {
        videoCandidates.set(srcMatch[1].trim(), poster);
      }

      // Tìm <source src="..."> bên trong <video>
      const sourceRegex = /<source\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
      let sMatch;
      while ((sMatch = sourceRegex.exec(videoTag)) !== null) {
        if (sMatch[1]) {
          videoCandidates.set(sMatch[1].trim(), poster);
        }
      }
    }

    // 4. Trích xuất VIDEO: Thẻ <a href="..."> liên kết trực tiếp tới file video
    const aVideoRegex =
      /<a\s+[^>]*href=["']([^"']+\.(?:mp4|webm|mov|m4v|m3u8)(?:\?[^"']*)?)["']/gi;
    let aVMatch;
    while ((aVMatch = aVideoRegex.exec(html)) !== null) {
      if (aVMatch[1]) videoCandidates.set(aVMatch[1].trim(), undefined);
    }

    // 5. Trích xuất VIDEO: Quét regex các URL video nhúng trong script/JSON
    const embeddedVideoRegex =
      /https?:\/\/[^\s"'<>\\]+?\.(?:mp4|webm|m4v|m3u8)(?:\?[^\s"'<>\\]*)?/gi;
    let embVMatch;
    while ((embVMatch = embeddedVideoRegex.exec(html)) !== null) {
      if (embVMatch[0]) videoCandidates.set(embVMatch[0].trim(), undefined);
    }

    // 5.5. Trích xuất VIDEO từ IFRAME Embed Player (Rất phổ biến ở các trang video nhúng bảo mật)
    const iframeUrls = new Set<string>();

    // 5.5.1 Thẻ <meta itemprop="embedURL" content="...">
    const embedUrlMetaRegex =
      /<meta[^>]+(?:itemprop|property|name)=["'](?:embedURL|embedUrl|twitter:player)["'][^>]+content=["']([^"']+)["']/gi;
    let euMatch;
    while ((euMatch = embedUrlMetaRegex.exec(html)) !== null) {
      if (euMatch[1]) iframeUrls.add(euMatch[1].trim());
    }

    // 5.5.2 Thẻ <iframe src="..." data-src="..."> (Hỗ trợ lazy-loading iframe)
    const iframeTagRegex = /<iframe\s+[^>]*>/gi;
    const iframeTags = html.match(iframeTagRegex) || [];
    for (const tag of iframeTags) {
      // Quét tất cả các thuộc tính chứa URL trong iframe (không bỏ sót lazy-load)
      const attrRegex = /(?:src|data-src|data-lazy-src|data-original|data-url)=["']([^"']+)["']/gi;
      let aMatch;
      while ((aMatch = attrRegex.exec(tag)) !== null) {
        const u = aMatch[1].trim();
        if (
          u &&
          !u.startsWith("about:") &&
          !u.startsWith("javascript:") &&
          (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("//") || u.startsWith("/"))
        ) {
          iframeUrls.add(u);
        }
      }
    }

    // Đào sâu vào từng iframe embed player nếu chưa tìm thấy video chính từ flashvars
    if (!tubeMedia) {
      for (const rawIframeUrl of Array.from(iframeUrls)) {
        try {
          let fullIframeUrl = rawIframeUrl;
          if (fullIframeUrl.startsWith("//")) {
            fullIframeUrl = `${parsedUrl.protocol}${fullIframeUrl}`;
          } else if (fullIframeUrl.startsWith("/")) {
            fullIframeUrl = `${parsedUrl.origin}${fullIframeUrl}`;
          }

          const iframeRes = await fetch(fullIframeUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              Referer: parsedUrl.href,
            },
            signal: AbortSignal.timeout(8000),
          });

          if (iframeRes.ok) {
            const iframeHtml = await iframeRes.text();

            // 1. Tìm video file trong JWPlayer setup: file: "https://...m3u8"
            const jwFileRegex = /(?:file|source|src)\s*:\s*["']([^"']+\.(?:mp4|webm|m3u8)(?:\?[^"']*)?)["']/gi;
            let jwMatch;
            while ((jwMatch = jwFileRegex.exec(iframeHtml)) !== null) {
              if (jwMatch[1]) videoCandidates.set(jwMatch[1].trim(), defaultPoster);
            }

            // 2. Quét regex các link .m3u8 hoặc .mp4 nhúng trong mã script của iframe
            const vidRegex =
              /https?:\/\/[^\s"'<>\\]+?\.(?:mp4|webm|m4v|m3u8)(?:\?[^\s"'<>\\]*)?/gi;
            let mMatch;
            while ((mMatch = vidRegex.exec(iframeHtml)) !== null) {
              if (mMatch[0]) videoCandidates.set(mMatch[0].trim(), defaultPoster);
            }
          }
        } catch (iframeErr) {
          // Bỏ qua nếu iframe không truy cập được
        }
      }
    }

    // 6. Trích xuất ẢNH: OpenGraph & Twitter Card images
    const metaRegex =
      /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:url|twitter:image|twitter:image:src)["'][^>]+content=["']([^"']+)["']/gi;
    let metaMatch;
    while ((metaMatch = metaRegex.exec(html)) !== null) {
      if (metaMatch[1]) imageCandidates.add(metaMatch[1].trim());
    }
    const metaReverseRegex =
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|og:image:url|twitter:image)["']/gi;
    let metaRevMatch;
    while ((metaRevMatch = metaReverseRegex.exec(html)) !== null) {
      if (metaRevMatch[1]) imageCandidates.add(metaRevMatch[1].trim());
    }

    // 7. Trích xuất ẢNH: Thẻ <img>
    const imgTagRegex = /<img\s+[^>]*>/gi;
    const imgTags = html.match(imgTagRegex) || [];

    for (const tag of imgTags) {
      const attrRegex =
        /(?:data-original|data-highres|data-zoom-image|data-lazy-src|data-src|data-url|src)=["']([^"']+)["']/gi;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(tag)) !== null) {
        if (attrMatch[1]) {
          imageCandidates.add(attrMatch[1].trim());
        }
      }

      // Thu thập từ srcset (lấy phân giải cao nhất ở cuối)
      const srcsetMatch = tag.match(/srcset=["']([^"']+)["']/i);
      if (srcsetMatch && srcsetMatch[1]) {
        const parts = srcsetMatch[1].split(",");
        const lastPart = parts[parts.length - 1]?.trim().split(/\s+/)[0];
        if (lastPart) imageCandidates.add(lastPart.trim());
      }
    }

    // 8. Trích xuất ẢNH: Thẻ <a href="..."> liên kết file ảnh gốc
    const aImgRegex =
      /<a\s+[^>]*href=["']([^"']+\.(?:jpe?g|png|webp|gif)(?:\?[^"']*)?)["']/gi;
    let aMatch;
    while ((aMatch = aImgRegex.exec(html)) !== null) {
      if (aMatch[1]) imageCandidates.add(aMatch[1].trim());
    }

    const items: ScrapedMediaItem[] = [];
    const seenUrls = new Set<string>();

    // 9. Xử lý & Chuẩn hoá URL Video
    for (const [rawVideoUrl, poster] of videoCandidates.entries()) {
      const trimmed = rawVideoUrl.trim();
      if (!trimmed || trimmed.length < 5) continue;

      let absoluteVideoUrl = "";
      try {
        absoluteVideoUrl = new URL(trimmed, parsedUrl.href).href;
      } catch {
        continue;
      }

      const lower = absoluteVideoUrl.toLowerCase();
      // Bỏ qua tracking, pixel, preview ngắn không hợp lệ
      if (
        lower.includes("analytics") ||
        lower.includes("track.") ||
        lower.includes("beacon")
      ) {
        continue;
      }

      if (!seenUrls.has(absoluteVideoUrl)) {
        seenUrls.add(absoluteVideoUrl);

        let absolutePoster: string | undefined = undefined;
        if (poster) {
          try {
            absolutePoster = new URL(poster, parsedUrl.href).href;
          } catch {}
        }

        items.push({
          id: `video-${items.length}-${Math.random().toString(36).substring(2, 7)}`,
          url: absoluteVideoUrl,
          type: "VIDEO",
          sourceUrl: parsedUrl.href,
          pageTitle: title,
          thumbnailUrl: absolutePoster,
        });
      }
    }

    // 10. Xử lý & Chuẩn hoá URL Ảnh
    for (const raw of imageCandidates) {
      const rawUrl = raw.trim();
      if (!rawUrl || rawUrl.length < 5) continue;

      // Bỏ qua tracking pixel base64 1x1 hoặc svg inline rác
      if (
        rawUrl.startsWith("data:image/svg") ||
        rawUrl.startsWith("data:image/gif;base64,R0lGODlhAQAB")
      ) {
        continue;
      }

      let absoluteUrl = "";
      try {
        absoluteUrl = new URL(rawUrl, parsedUrl.href).href;
      } catch {
        continue;
      }

      const lower = absoluteUrl.toLowerCase();
      if (
        lower.includes("favicon") ||
        lower.includes("/pixel") ||
        lower.includes("analytics") ||
        lower.includes("spacer.gif") ||
        lower.includes("1x1.") ||
        lower.endsWith(".svg") ||
        lower.includes("avatar_default") ||
        lower.includes("track.") ||
        seenUrls.has(absoluteUrl)
      ) {
        continue;
      }

      seenUrls.add(absoluteUrl);
      items.push({
        id: `img-${items.length}-${Math.random().toString(36).substring(2, 7)}`,
        url: absoluteUrl,
        type: "IMAGE",
        sourceUrl: parsedUrl.href,
        pageTitle: title,
      });
    }

    return {
      title,
      items,
    };
  } catch (err: any) {
    return {
      title: "",
      items: [],
      error: err.message || "Lỗi tải trang web",
    };
  }
}

// Trích xuất các liên kết bài viết chi tiết từ trang danh mục / danh sách (Loại bỏ 100% link quảng cáo & menu điều hướng)
export function extractInternalDetailLinks(html: string, baseUrl: string): string[] {
  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    return [];
  }

  // Loại bỏ các khối thanh điều hướng header/nav để không quét nhầm link danh mục trên cùng của trang
  const contentOnlyHtml = html
    .replace(/<header\b[\s\S]*?<\/header>/gi, "")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, "")
    .replace(/<div\s+[^>]*(?:navbar|header-nav|menu-top|navigation)[^>]*>[\s\S]*?<\/div>/gi, "");

  // Quét cả thẻ <a>, <div>, <article>, <li> có chứa href, data-href, data-url theo đúng thứ tự DOM
  const aRegex = /<(?:a|div|article|li)\s+[^>]*(?:href|data-href|data-url)=["']([^"']+)["'][^>]*>/gi;
  const detailUrls = new Set<string>();
  let match;

  while ((match = aRegex.exec(contentOnlyHtml)) !== null) {
    const raw = match[1].trim();
    if (
      !raw ||
      raw.startsWith("#") ||
      raw.startsWith("javascript:") ||
      raw.startsWith("mailto:") ||
      raw.startsWith("tel:")
    ) {
      continue;
    }

    try {
      const u = new URL(raw, parsedBase.href);
      // Chỉ lấy link cùng domain (loại bỏ 100% link quảng cáo, redirect ngoài)
      if (u.hostname !== parsedBase.hostname) continue;

      const path = u.pathname.toLowerCase();

      // Bỏ qua file tĩnh
      if (path.match(/\.(css|js|json|xml|ico|svg|png|jpe?g|webp|gif|woff2?|ttf|map)$/i)) {
        continue;
      }

      // Bỏ qua trang hệ thống tĩnh, đăng nhập, điều khoản
      if (
        path === "/" ||
        path === "/login" ||
        path === "/register" ||
        path.startsWith("/wp-admin") ||
        path.startsWith("/wp-login") ||
        path.startsWith("/category/") ||
        path.startsWith("/chuyen-muc/") ||
        path.startsWith("/the-loai/") ||
        path.startsWith("/tag/") ||
        path.startsWith("/tags/") ||
        path.startsWith("/author/") ||
        path.startsWith("/search/") ||
        path.includes("/cart") ||
        path.includes("/checkout") ||
        path.includes("/privacy-policy") ||
        path.includes("/terms") ||
        path.includes("/contact") ||
        path.includes("/about-us")
      ) {
        continue;
      }

      // Bỏ qua link phân trang thuần túy của chính danh mục đang xem (ví dụ /page/2/ hoặc ?page=2)
      const isPurePagination =
        /^\/page\/\d+\/?$/.test(path) ||
        (path === parsedBase.pathname && u.searchParams.has("page"));

      if (isPurePagination) {
        continue;
      }

      // Nhận diện link bài viết chi tiết / video item:
      // 1. Kết thúc bằng số ID bài viết: /\d{2,}\/?$/ (như /.../53440/)
      // 2. Chứa từ khóa bài viết/video theo cấu trúc subpath: /video/, /clip/, /watch/, /album/, /post/, /detail/
      // 3. Có đuôi file bài viết: .html, .htm, .php với tên bài
      // 4. Có query bài viết/video: ?v=, ?id=, ?viewkey=
      // 5. Đường dẫn có từ 2 cấp trở lên chứa số ID
      const hasId = /\/\d{2,}\/?$/.test(path);
      const hasVideoSubpath = /\/(?:video|clip|watch|post|detail|film|album)\/[^\/]+/i.test(path);
      const hasPostExt = /\/[a-z0-9_-]+\.(?:html?|php)$/i.test(path);
      const hasVideoQuery =
        u.searchParams.has("v") || u.searchParams.has("id") || u.searchParams.has("viewkey");

      const slugParts = path.split("/").filter(Boolean);
      const isMultiSegmentPost = slugParts.length >= 2 && /\d+/.test(path);

      const isPost = hasId || hasVideoSubpath || hasPostExt || hasVideoQuery || isMultiSegmentPost;

      if (isPost && u.href !== parsedBase.href) {
        detailUrls.add(u.href);
      }
    } catch {
      // bỏ qua URL lỗi
    }
  }

  return Array.from(detailUrls);
}

// Hàm sleep giúp tạo độ trễ giữa các request cào (chống quá tải & tránh bị máy chủ đích chặn bot)
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Bóc tách media từ nhiều URL cùng lúc (Multi-page Web Scraper có kiểm soát tốc độ & chống chặn)
export async function scrapeMultipleWebUrls(
  targetUrls: string[],
  options?: {
    deepCrawl?: boolean;
    maxDeepPerUrl?: number;
    delayMs?: number;
    concurrency?: number;
  }
): Promise<ScrapedWebResult> {
  // Lọc danh sách URL hợp lệ và loại bỏ trùng lặp URL đầu vào
  const cleanUrls = Array.from(
    new Set(
      targetUrls
        .map((u) => u.trim())
        .filter((u) => u.length > 5 && (u.startsWith("http://") || u.startsWith("https://")))
    )
  );

  if (cleanUrls.length === 0) {
    throw new Error("Không tìm thấy đường dẫn URL hợp lệ nào để quét");
  }

  const deepCrawl = Boolean(options?.deepCrawl);
  const maxDeepPerUrl = options?.maxDeepPerUrl || 20;
  // Cấu hình kiểm soát tốc độ cào (Rate-limiting / Throttle)
  const delayMs = typeof options?.delayMs === "number" ? options.delayMs : 1000;
  const concurrency = Math.max(1, typeof options?.concurrency === "number" ? options.concurrency : 2);

  // Danh sách các URL thực tế sẽ quét (bảo đảm thứ tự hiển thị chuẩn của trang web)
  let finalUrlsToScrape: string[] = [];
  let detectedPageTitle = "";

  if (deepCrawl) {
    for (let cIdx = 0; cIdx < cleanUrls.length; cIdx++) {
      const url = cleanUrls[cIdx];
      // Nếu có nhiều trang danh mục, nghỉ nhẹ giữa các trang để tránh bị phát hiện spam
      if (cIdx > 0 && delayMs > 0) {
        await sleep(Math.min(delayMs, 800));
      }

      try {
        let parsedU: URL;
        try {
          parsedU = new URL(url);
        } catch {
          finalUrlsToScrape.push(url);
          continue;
        }

        // Hỗ trợ đặc biệt cho LeakGallery: tự động sinh các trang API ngầm (?page=1, ?page=2...)
        if (parsedU.hostname.includes("leakgallery.com")) {
          const totalPages = Math.max(1, Math.min(8, Math.ceil(maxDeepPerUrl / 20)));
          for (let p = 1; p <= totalPages; p++) {
            const sep = url.includes("?") ? "&" : "?";
            const pUrl = url.includes("page=") || url.includes("offset=") ? url : `${url}${sep}page=${p}`;
            if (!finalUrlsToScrape.includes(pUrl)) {
              finalUrlsToScrape.push(pUrl);
            }
            if (url.includes("page=") || url.includes("offset=")) break;
          }
          continue;
        }

        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (res.ok) {
          const html = await res.text();

          // Lấy tiêu đề trang danh mục làm fallback
          const tMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (tMatch && tMatch[1] && !detectedPageTitle) {
            detectedPageTitle = tMatch[1].trim();
          }

          const detailLinks = extractInternalDetailLinks(html, url);

          // Kiểm tra xem chính URL này có phải là 1 bài viết chi tiết chứa video player hay không
          // (Ví dụ user dán trực tiếp link bài viết vào và bật cào sâu)
          const hasDirectMedia =
            /<(?:video\b)/i.test(html) ||
            /<meta[^>]+(?:property|name)=["'](?:og:video|twitter:player:stream)["']/i.test(html) ||
            /itemprop=["'](?:embedURL|embedUrl)["']/i.test(html) ||
            /\/\d{3,}\/?$/.test(new URL(url).pathname);

          // Nếu chính trang này có video, luôn đưa chính nó vào vị trí đầu tiên
          if (hasDirectMedia) {
            if (!finalUrlsToScrape.includes(url)) {
              finalUrlsToScrape.push(url);
            }
          }

          if (detailLinks.length > 0) {
            // Lấy các bài viết chi tiết con theo đúng thứ tự DOM (bài đầu tiên trên web sẽ đứng đầu)
            const sliced = detailLinks.slice(0, maxDeepPerUrl);
            for (const dUrl of sliced) {
              if (!finalUrlsToScrape.includes(dUrl)) {
                finalUrlsToScrape.push(dUrl);
              }
            }
          } else if (!finalUrlsToScrape.includes(url)) {
            finalUrlsToScrape.push(url);
          }
        } else {
          if (!finalUrlsToScrape.includes(url)) {
            finalUrlsToScrape.push(url);
          }
        }
      } catch {
        if (!finalUrlsToScrape.includes(url)) {
          finalUrlsToScrape.push(url);
        }
      }
    }
  } else {
    finalUrlsToScrape = cleanUrls;
  }

  // Quét theo từng đợt (chunks) có kiểm soát số luồng đồng thời và khoảng nghỉ (delay) chống chặn
  const results: PromiseSettledResult<{
    title: string;
    items: ScrapedMediaItem[];
    error?: string;
  }>[] = [];

  for (let i = 0; i < finalUrlsToScrape.length; i += concurrency) {
    const chunk = finalUrlsToScrape.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(
      chunk.map((url) => scrapeSingleWebUrl(url))
    );
    results.push(...chunkResults);

    // Nếu còn các link tiếp theo và có đặt độ trễ thì tạm nghỉ để server không chặn
    if (i + concurrency < finalUrlsToScrape.length && delayMs > 0) {
      const jitter = Math.floor(Math.random() * 200); // Thêm độ ngẫu nhiên tự nhiên
      await sleep(delayMs + jitter);
    }
  }

  const pages: ScrapedPageSummary[] = [];
  const allItems: ScrapedMediaItem[] = [];
  const seenMediaUrls = new Set<string>();

  let mainTitle = detectedPageTitle;

  // LƯỢT QUÉT QUA TOÀN BỘ finalUrlsToScrape (KHÔNG BỎ SÓT BẤT KỲ BÀI VIẾT NÀO)
  finalUrlsToScrape.forEach((url, idx) => {
    const res = results[idx];
    if (res.status === "fulfilled") {
      const pageData = res.value;
      if (!mainTitle && pageData.title) {
        mainTitle = pageData.title;
      }

      let pageImageCount = 0;
      let pageVideoCount = 0;

      for (const item of pageData.items) {
        if (!seenMediaUrls.has(item.url)) {
          seenMediaUrls.add(item.url);
          allItems.push(item);
          if (item.type === "IMAGE") pageImageCount++;
          if (item.type === "VIDEO") pageVideoCount++;
        }
      }

      pages.push({
        url,
        title: pageData.title || url,
        imageCount: pageImageCount,
        videoCount: pageVideoCount,
        error: pageData.error,
      });
    } else {
      pages.push({
        url,
        title: url,
        imageCount: 0,
        videoCount: 0,
        error: res.reason?.message || "Lỗi kết nối",
      });
    }
  });

  const images = allItems.filter((m) => m.type === "IMAGE").map((m) => m.url);
  const videos = allItems.filter((m) => m.type === "VIDEO").map((m) => m.url);

  return {
    pages,
    items: allItems,
    images,
    videos,
    title: mainTitle,
    totalImages: images.length,
    totalVideos: videos.length,
    totalFound: allItems.length,
  };
}

// Hàm tương thích ngược với API cũ
export async function scrapeImagesFromWebUrl(targetUrl: string) {
  const result = await scrapeMultipleWebUrls([targetUrl]);
  return {
    title: result.title,
    images: result.images,
    videos: result.videos,
    items: result.items,
    pages: result.pages,
    totalFound: result.totalFound,
  };
}
