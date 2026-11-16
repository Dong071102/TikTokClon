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

    const contentType = response.headers.get("content-type") || "video/mp4";
    const contentRange = response.headers.get("content-range");
    const acceptRanges = response.headers.get("accept-ranges") || "bytes";
    const contentLength = response.headers.get("content-length");

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
