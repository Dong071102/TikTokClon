import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken, ensureDefaultAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { identifier, password } = await request.json();

    if (!identifier || !password) {
      return NextResponse.json({ error: "Vui lòng nhập tài khoản và mật khẩu" }, { status: 400 });
    }

    // Đảm bảo admin mặc định đã tồn tại
    await ensureDefaultAdmin();

    const admin = await prisma.adminUser.findFirst({
      where: {
        OR: [{ email: identifier.trim() }, { username: identifier.trim() }],
      },
    });

    if (!admin) {
      return NextResponse.json({ error: "Tài khoản hoặc mật khẩu không chính xác" }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      return NextResponse.json({ error: "Tài khoản hoặc mật khẩu không chính xác" }, { status: 401 });
    }

    const token = signToken({
      userId: admin.id,
      email: admin.email,
      username: admin.username,
    });

    const response = NextResponse.json({
      success: true,
      user: { id: admin.id, email: admin.email, username: admin.username },
    });

    const isHttps =
      request.headers.get("x-forwarded-proto") === "https" ||
      request.url.startsWith("https://");

    // Set Cookie: Chỉ bật Secure khi thực sự chạy trên HTTPS
    // Giúp điện thoại truy cập qua mạng LAN/IP (HTTP) lưu được cookie mà không bị trình duyệt mobile từ chối
    response.cookies.set("tiktok_admin_token", token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch (err: any) {
    console.error("[AUTH_LOGIN_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi máy chủ nội bộ" }, { status: 500 });
  }
}
