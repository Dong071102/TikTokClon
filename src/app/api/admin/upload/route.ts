import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { saveUploadedFile } from "@/lib/downloader";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Chưa đăng nhập quyền Admin" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const rawTags = (formData.get("tags") as string) || "";
    const title = (formData.get("title") as string) || "";
    const isLandscape = formData.get("isLandscape") === "true";
    const defaultRotate = parseInt((formData.get("defaultRotate") as string) || "0", 10);
    const rawDuration = formData.get("duration") as string | null;
    const rawWidth = formData.get("width") as string | null;
    const rawHeight = formData.get("height") as string | null;
    const duration = rawDuration ? parseFloat(rawDuration) : null;
    const width = rawWidth ? parseInt(rawWidth, 10) : null;
    const height = rawHeight ? parseInt(rawHeight, 10) : null;

    if (!file) {
      return NextResponse.json({ error: "Vui lòng chọn file tải lên" }, { status: 400 });
    }

    const mime = file.type;
    const isVideo = mime.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
    const isImage = mime.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(file.name);

    if (!isVideo && !isImage) {
      return NextResponse.json({ error: "Chỉ hỗ trợ file ảnh hoặc video" }, { status: 400 });
    }

    // Lưu file vào public/uploads
    const saved = await saveUploadedFile(file);

    const tagNames = rawTags
      .split(/[,;\s]+/)
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean);

    const mediaItem = await prisma.$transaction(async (tx) => {
      const item = await tx.mediaItem.create({
        data: {
          type: isVideo ? "VIDEO" : "IMAGE",
          sourceType: "UPLOAD",
          storageMode: "LOCAL_STORAGE",
          mediaUrl: saved.localUrl,
          localPath: saved.localPath,
          thumbnailUrl: isImage ? saved.localUrl : null,
          title: title || file.name,
          isLandscape,
          defaultRotate,
          duration: duration && !isNaN(duration) ? duration : null,
          width: width && !isNaN(width) ? Math.round(width) : null,
          height: height && !isNaN(height) ? Math.round(height) : null,
        },
      });

      for (const tagName of tagNames) {
        const slug = tagName.toLowerCase().replace(/\s+/g, "-");
        const tag = await tx.tag.upsert({
          where: { slug },
          update: {},
          create: { name: tagName, slug },
        });

        await tx.mediaItemTag.create({
          data: {
            mediaItemId: item.id,
            tagId: tag.id,
          },
        });
      }

      return item;
    });

    return NextResponse.json({
      success: true,
      item: mediaItem,
    });
  } catch (err: any) {
    console.error("[UPLOAD_FILE_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi tải file lên máy chủ" }, { status: 500 });
  }
}
