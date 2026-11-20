import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET || "tiktok_clone_jwt_fallback_secret_key";
const TOKEN_COOKIE_NAME = "tiktok_admin_token";

export interface TokenPayload {
  userId: string;
  email: string;
  username: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export async function getCurrentAdmin(request?: Request): Promise<TokenPayload | null> {
  // 1. Hỗ trợ Authorization Bearer hoặc x-admin-token từ Bookmarklet hoặc API client
  if (request) {
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const payload = verifyToken(authHeader.substring(7).trim());
      if (payload) return payload;
    }
    const customToken = request.headers.get("x-admin-token");
    if (customToken) {
      const payload = verifyToken(customToken.trim());
      if (payload) return payload;
    }
  }

  // 2. Kiểm tra Cookie đăng nhập admin từ trình duyệt
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;
    if (token) {
      return verifyToken(token);
    }
  } catch {}

  return null;
}

export async function ensureDefaultAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || "vubadong071102@gmail.com";
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const defaultPassword = process.env.ADMIN_PASSWORD || "0711Vubadong02@";

  try {
    const existing = await prisma.adminUser.findFirst({
      where: {
        OR: [{ email: adminEmail }, { username: adminUsername }],
      },
    });

    if (!existing) {
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      await prisma.adminUser.create({
        data: {
          email: adminEmail,
          username: adminUsername,
          password: hashedPassword,
        },
      });
      console.log(`[AUTH] Initialized default admin: ${adminEmail}`);
    }
  } catch (err) {
    console.error("[AUTH] Error ensuring default admin:", err);
  }
}
