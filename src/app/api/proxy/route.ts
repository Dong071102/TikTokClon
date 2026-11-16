import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  try {
    const range = request.headers.get("range");
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    };
    if (range) {
      headers["Range"] = range;
    }

    const response = await fetch(url, { headers });

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", response.headers.get("content-type") || "video/mp4");
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");

    if (response.headers.get("content-range")) {
      responseHeaders.set("Content-Range", response.headers.get("content-range")!);
    }
    if (response.headers.get("accept-ranges")) {
      responseHeaders.set("Accept-Ranges", response.headers.get("accept-ranges")!);
    }
    if (response.headers.get("content-length")) {
      responseHeaders.set("Content-Length", response.headers.get("content-length")!);
    }

    return new NextResponse(response.body as any, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error("[PROXY_ERROR]", err);
    return new NextResponse("Error proxying media", { status: 500 });
  }
}
