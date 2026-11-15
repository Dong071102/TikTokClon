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
    const { url, urls } = body;

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

    const result = await scrapeMultipleWebUrls(targetUrls);

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
