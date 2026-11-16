import { NextRequest } from "next/server";

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Range, Content-Type",
      "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
    },
  });
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return new Response("Missing url parameter", { status: 400 });
  }

  try {
    const range = request.headers.get("range");
    const reqHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    };
    if (range) {
      reqHeaders["Range"] = range;
    }

    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname.includes("twimg.com") || parsedUrl.hostname.includes("twitter.com")) {
        reqHeaders["Referer"] = "https://x.com/";
      } else {
        reqHeaders["Referer"] = parsedUrl.origin + "/";
      }
      reqHeaders["Origin"] = parsedUrl.origin;
    } catch {
      // Ignore URL parsing errors
    }

    const response = await fetch(url, {
      headers: reqHeaders,
      redirect: "follow",
    });

    let contentType = response.headers.get("content-type") || "video/mp4";
    const contentRange = response.headers.get("content-range");
    const acceptRanges = response.headers.get("accept-ranges") || "bytes";
    const contentLength = response.headers.get("content-length");

    // Xử lý đặc biệt cho file playlist HLS (.m3u8):
    // Viết lại toàn bộ URI phân đoạn (kể cả tương đối và tuyệt đối) để chạy qua proxy,
    // giải quyết triệt để lỗi 404 cho phân đoạn tương đối và vượt qua rào cản CORS của CDN
    const isM3u8 =
      url.includes(".m3u8") ||
      contentType.includes("mpegurl") ||
      contentType.includes("application/x-mpegurl");

    if (isM3u8) {
      const text = await response.text();
      const lines = text.split("\n");
      const rewritten = lines
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return line;

          // Dòng comment hoặc thẻ HLS
          if (trimmed.startsWith("#")) {
            // Viết lại URI trong EXT-X-KEY hoặc EXT-X-MAP
            if (trimmed.includes('URI="')) {
              return trimmed.replace(/URI="([^"]+)"/g, (_, uri) => {
                try {
                  const absolute = new URL(uri, url).toString();
                  return `URI="/api/proxy?url=${encodeURIComponent(absolute)}&_v=2"`;
                } catch {
                  return `URI="${uri}"`;
                }
              });
            }
            return line;
          }

          // Dòng chứa URL phân đoạn (.ts / .png) hoặc playlist con
          try {
            const absolute = new URL(trimmed, url).toString();
            return `/api/proxy?url=${encodeURIComponent(absolute)}&_v=2`;
          } catch {
            return line;
          }
        })
        .join("\n");

      return new Response(rewritten, {
        status: response.status,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Range, Content-Range, Content-Type",
          "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Accept-Ranges": "bytes",
        },
      });
    }

    // Nếu là phân đoạn video TS bị ngụy trang thành .png, .jpg (chuẩn các web phim sex/streaming)
    if (
      url.includes(".ts") ||
      /\bIMG_.*_\d+\.(png|jpg|bin)\b/i.test(url) ||
      (contentType.startsWith("image/") && url.includes(".png") && (url.includes("cdn-") || url.includes("_vid.")))
    ) {
      contentType = "video/mp2t";
    }

    const outHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Range, Content-Type",
      "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
      "Accept-Ranges": acceptRanges,
    };

    if (contentRange) {
      outHeaders["Content-Range"] = contentRange;
    }
    if (contentLength) {
      outHeaders["Content-Length"] = contentLength;
    }

    return new Response(response.body, {
      status: response.status,
      headers: outHeaders,
    });
  } catch (err: any) {
    console.error("[PROXY_ERROR]", err);
    return new Response("Error proxying media", { status: 500 });
  }
}
