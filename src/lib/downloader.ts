import fs from "fs";
import path from "path";
import crypto from "crypto";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

// Đảm bảo thư mục public/uploads luôn tồn tại
export function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

// Tải file từ internet về lưu vào public/uploads
export async function downloadMediaLocally(url: string, fileType: "IMAGE" | "VIDEO"): Promise<{ localUrl: string; localPath: string }> {
  ensureUploadsDir();

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch media from ${url}: ${response.statusText}`);
  }

  // Xác định phần mở rộng file
  const contentType = response.headers.get("content-type") || "";
  let ext = fileType === "VIDEO" ? ".mp4" : ".jpg";

  if (contentType.includes("video/mp4")) ext = ".mp4";
  else if (contentType.includes("video/webm")) ext = ".webm";
  else if (contentType.includes("image/jpeg")) ext = ".jpg";
  else if (contentType.includes("image/png")) ext = ".png";
  else if (contentType.includes("image/webp")) ext = ".webp";
  else if (contentType.includes("image/gif")) ext = ".gif";

  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  const filePath = path.join(UPLOADS_DIR, fileName);

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await fs.promises.writeFile(filePath, buffer);

  return {
    localUrl: `/uploads/${fileName}`,
    localPath: filePath,
  };
}

// Lưu file được upload trực tiếp từ máy người dùng
export async function saveUploadedFile(file: File): Promise<{ localUrl: string; localPath: string }> {
  ensureUploadsDir();

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const originalExt = path.extname(file.name) || ".bin";
  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${originalExt}`;
  const filePath = path.join(UPLOADS_DIR, fileName);

  await fs.promises.writeFile(filePath, buffer);

  return {
    localUrl: `/uploads/${fileName}`,
    localPath: filePath,
  };
}
