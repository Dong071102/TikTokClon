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

    const imageCandidates = new Set<string>();
    const videoCandidates = new Map<string, string | undefined>(); // videoUrl -> poster/thumbnailUrl

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

// Bóc tách media từ nhiều URL cùng lúc (Multi-page Web Scraper)
export async function scrapeMultipleWebUrls(
  targetUrls: string[]
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

  // Quét đồng thời tất cả các trang web
  const results = await Promise.allSettled(
    cleanUrls.map((url) => scrapeSingleWebUrl(url))
  );

  const pages: ScrapedPageSummary[] = [];
  const allItems: ScrapedMediaItem[] = [];
  const seenMediaUrls = new Set<string>();

  let mainTitle = "";

  cleanUrls.forEach((url, idx) => {
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
