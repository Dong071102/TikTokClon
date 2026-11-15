import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { scrapeImagesFromWebUrl } from "@/lib/webScraper";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Chưa đăng nhập quyền Admin" }, { status: 401 });
  }

  try {
    const { url } = await request.json();
    if (!url || typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "Vui lòng nhập đường dẫn URL trang web" }, { status: 400 });
    }

    const result = await scrapeImagesFromWebUrl(url);

    if (result.images.length === 0) {
      return NextResponse.json(
        { error: "Không tìm thấy hình ảnh nào phù hợp trên trang web này." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    console.error("[SCRAPE_WEB_IMAGES_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi khi quét ảnh từ trang web" }, { status: 500 });
  }
}
