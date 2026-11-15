import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { extractMediaFromUrl } from "@/lib/extractor";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Chưa đăng nhập quyền Admin" }, { status: 401 });
  }

  try {
    const { url } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Vui lòng cung cấp URL hợp lệ" }, { status: 400 });
    }

    const result = await extractMediaFromUrl(url.trim());
    if (!result) {
      return NextResponse.json({ error: "Không thể trích xuất ảnh hoặc video từ đường link này" }, { status: 422 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error("[PARSE_URL_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi xử lý bóc tách link" }, { status: 500 });
  }
}
