import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { scrapeMultipleWebUrls } from "@/lib/webScraper";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Chưa đăng nhập quyền Admin" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { url, urls, deepCrawl, maxDeepPerUrl, delayMs, concurrency } = body;

    let targetUrls: string[] = [];

    if (Array.isArray(urls)) {
      targetUrls = urls.map((u) => String(u).trim()).filter(Boolean);
    } else if (typeof url === "string" && url.trim()) {
      // Tách chuỗi theo dấu xuống dòng, dấu phẩy hoặc khoảng trắng
      targetUrls = url
        .split(/[\r\n,]+/)
        .map((u) => u.trim())
        .filter(Boolean);
    }

    if (targetUrls.length === 0) {
      return NextResponse.json(
        { error: "Vui lòng nhập ít nhất 1 đường dẫn URL trang web" },
        { status: 400 }
      );
    }

    const wantsStream = request.headers.get("accept")?.includes("text/event-stream");

    if (wantsStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const sendEvent = (event: string, data: any) => {
            try {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            } catch (e) {
              console.error("[SSE_SEND_ERROR]", e);
            }
          };

          try {
            sendEvent("progress", {
              stage: "init",
              current: 0,
              total: targetUrls.length,
              percent: 0,
              currentUrl: targetUrls[0],
              foundImages: 0,
              foundVideos: 0,
              message: "Bắt đầu khởi tạo phiên quét media...",
            });

            const result = await scrapeMultipleWebUrls(targetUrls, {
              deepCrawl: Boolean(deepCrawl),
              maxDeepPerUrl: typeof maxDeepPerUrl === "number" ? maxDeepPerUrl : 20,
              delayMs: typeof delayMs === "number" ? delayMs : 1000,
              concurrency: typeof concurrency === "number" ? concurrency : 2,
              onProgress: (progress) => {
                sendEvent("progress", progress);
              },
            });

            if (result.totalFound === 0) {
              sendEvent("error", {
                error:
                  "Không tìm thấy hình ảnh hoặc video nào trên các trang web đã nhập. Vui lòng kiểm tra lại link hoặc trang có thể yêu cầu đăng nhập/chặn bot.",
              });
            } else {
              sendEvent("complete", { success: true, data: result });
            }
          } catch (err: any) {
            console.error("[SCRAPE_WEB_MEDIA_STREAM_ERROR]", err);
            sendEvent("error", { error: err.message || "Lỗi khi quét media từ các trang web" });
          } finally {
            try {
              controller.close();
            } catch {}
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
      });
    }

    const result = await scrapeMultipleWebUrls(targetUrls, {
      deepCrawl: Boolean(deepCrawl),
      maxDeepPerUrl: typeof maxDeepPerUrl === "number" ? maxDeepPerUrl : 20,
      delayMs: typeof delayMs === "number" ? delayMs : 1000,
      concurrency: typeof concurrency === "number" ? concurrency : 2,
    });

    if (result.totalFound === 0) {
      return NextResponse.json(
        {
          error:
            "Không tìm thấy hình ảnh hoặc video nào trên các trang web đã nhập. Vui lòng kiểm tra lại link hoặc trang có thể yêu cầu đăng nhập/chặn bot.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    console.error("[SCRAPE_WEB_MEDIA_ERROR]", err);
    return NextResponse.json(
      { error: err.message || "Lỗi khi quét media từ các trang web" },
      { status: 500 }
    );
  }
}
