export interface ScrapedWebImagesResult {
  title: string;
  images: string[];
  totalFound: number;
}

export async function scrapeImagesFromWebUrl(targetUrl: string): Promise<ScrapedWebImagesResult> {
  // Kiểm tra tính hợp lệ của URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl.trim());
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Chỉ hỗ trợ giao thức HTTP hoặc HTTPS");
    }
  } catch {
    throw new Error("Đường dẫn URL trang web không hợp lệ");
  }

  // Tải nội dung HTML của trang web
  const response = await fetch(parsedUrl.href, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000), // Timeout 15 giây
  });

  if (!response.ok) {
    throw new Error(`Không thể kết nối đến trang web (Mã phản hồi HTTP: ${response.status})`);
  }

  const html = await response.text();

  // 1. Trích xuất Tiêu đề trang web
  let title = "";
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  } else {
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (ogTitleMatch && ogTitleMatch[1]) {
      title = ogTitleMatch[1].trim();
    }
  }

  const imageCandidates = new Set<string>();

  // 2. Trích xuất OpenGraph & Twitter Card images (Ảnh đại diện bài viết chất lượng cao)
  const metaRegex = /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:url|twitter:image|twitter:image:src)["'][^>]+content=["']([^"']+)["']/gi;
  let metaMatch;
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    if (metaMatch[1]) imageCandidates.add(metaMatch[1]);
  }
  const metaReverseRegex = /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|og:image:url|twitter:image)["']/gi;
  let metaRevMatch;
  while ((metaRevMatch = metaReverseRegex.exec(html)) !== null) {
    if (metaRevMatch[1]) imageCandidates.add(metaRevMatch[1]);
  }

  // 3. Trích xuất các thẻ <img>
  const imgTagRegex = /<img\s+[^>]*>/gi;
  const imgTags = html.match(imgTagRegex) || [];

  for (const tag of imgTags) {
    // Thu thập các thuộc tính ảnh phổ biến (lazy-load, zoom, highres, src gốc)
    const attrRegex = /(?:data-original|data-highres|data-zoom-image|data-lazy-src|data-src|data-url|src)=["']([^"']+)["']/gi;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(tag)) !== null) {
      if (attrMatch[1]) {
        imageCandidates.add(attrMatch[1]);
      }
    }

    // Thu thập từ srcset (chọn ảnh phân giải cao nhất ở cuối)
    const srcsetMatch = tag.match(/srcset=["']([^"']+)["']/i);
    if (srcsetMatch && srcsetMatch[1]) {
      const parts = srcsetMatch[1].split(",");
      const lastPart = parts[parts.length - 1]?.trim().split(/\s+/)[0];
      if (lastPart) imageCandidates.add(lastPart);
    }
  }

  // 4. Trích xuất các liên kết <a> trực tiếp đến file ảnh gốc
  const aTagRegex = /<a\s+[^>]*href=["']([^"']+\.(?:jpe?g|png|webp|gif)(?:\?[^"']*)?)["']/gi;
  let aMatch;
  while ((aMatch = aTagRegex.exec(html)) !== null) {
    if (aMatch[1]) imageCandidates.add(aMatch[1]);
  }

  // 5. Chuẩn hoá sang URL tuyệt đối và loại bỏ các ảnh icon / tracking không liên quan
  const cleanImages: string[] = [];
  const seen = new Set<string>();

  for (const raw of imageCandidates) {
    const rawUrl = raw.trim();
    if (!rawUrl || rawUrl.length < 5) continue;

    // Bỏ qua tracking pixel base64 1x1 hoặc svg inline rác
    if (rawUrl.startsWith("data:image/svg") || rawUrl.startsWith("data:image/gif;base64,R0lGODlhAQAB")) {
      continue;
    }

    let absoluteUrl = "";
    try {
      absoluteUrl = new URL(rawUrl, parsedUrl.href).href;
    } catch {
      continue;
    }

    // Lọc bỏ tracking, pixel, favicon, analytics, badges, tiny icons
    const lower = absoluteUrl.toLowerCase();
    if (
      lower.includes("favicon") ||
      lower.includes("/pixel") ||
      lower.includes("analytics") ||
      lower.includes("spacer.gif") ||
      lower.includes("1x1.") ||
      lower.endsWith(".svg") ||
      lower.includes("avatar_default") ||
      lower.includes("track.")
    ) {
      continue;
    }

    if (!seen.has(absoluteUrl)) {
      seen.add(absoluteUrl);
      cleanImages.push(absoluteUrl);
    }
  }

  return {
    title,
    images: cleanImages,
    totalFound: cleanImages.length,
  };
}
