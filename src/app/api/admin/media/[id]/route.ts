import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "fs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Chưa đăng nhập quyền Admin" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const item = await prisma.mediaItem.findUnique({
      where: { id },
    });

    if (!item) {
      return NextResponse.json({ error: "Không tìm thấy media" }, { status: 404 });
    }

    // Xoá file local nếu có
    if (item.localPath && fs.existsSync(item.localPath)) {
      try {
        await fs.promises.unlink(item.localPath);
      } catch (e) {
        console.warn("[DELETE_FILE_WARN]", e);
      }
    }

    await prisma.mediaItem.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Đã xoá media thành công" });
  } catch (err: any) {
    console.error("[DELETE_MEDIA_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi xoá media" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Chưa đăng nhập quyền Admin" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { tags, isLandscape, defaultRotate, title } = body;

    const updateData: any = {};
    if (typeof isLandscape === "boolean") updateData.isLandscape = isLandscape;
    if (typeof defaultRotate === "number") updateData.defaultRotate = defaultRotate;
    if (typeof title === "string") updateData.title = title;

    await prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.mediaItem.update({
          where: { id },
          data: updateData,
        });
      }

      if (Array.isArray(tags)) {
        // Xoá quan hệ tag cũ
        await tx.mediaItemTag.deleteMany({
          where: { mediaItemId: id },
        });

        // Tạo/liên kết tags mới
        for (const rawTag of tags) {
          const tagName = rawTag.trim().replace(/^#/, "");
          if (!tagName) continue;
          const slug = tagName.toLowerCase().replace(/\s+/g, "-");

          const tag = await tx.tag.upsert({
            where: { slug },
            update: {},
            create: { name: tagName, slug },
          });

          await tx.mediaItemTag.create({
            data: {
              mediaItemId: id,
              tagId: tag.id,
            },
          });
        }
      }
    });

    const updated = await prisma.mediaItem.findUnique({
      where: { id },
      include: { tags: { include: { tag: true } } },
    });

    return NextResponse.json({
      success: true,
      item: {
        ...updated,
        tags: updated?.tags.map((t) => t.tag.name) || [],
      },
    });
  } catch (err: any) {
    console.error("[UPDATE_MEDIA_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi cập nhật media" }, { status: 500 });
  }
}
