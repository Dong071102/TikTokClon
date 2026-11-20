import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { downloadMediaLocally } from "@/lib/downloader";
import { extractMediaFromUrl } from "@/lib/extractor";
import fs from "fs";

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-token",
    },
  });
}

export async function GET(request: Request) {
  const admin = await getCurrentAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Chưa đăng nhập quyền Admin" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit === "all" ? 1000 : Math.max(1, parseInt(rawLimit || "24", 10));
  const tag = searchParams.get("tag");
  const format = searchParams.get("format") || searchParams.get("type"); // "ALL" | "IMAGE" | "GALLERY" | "VIDEO" | "SMALL_IMAGE"

  const skip = (page - 1) * limit;

  const baseWhere: any = {};
  if (tag) {
    baseWhere.tags = {
      some: {
        tag: {
          slug: tag.toLowerCase(),
        },
      },
    };
  }

  const where: any = { ...baseWhere };
  if (format === "VIDEO") {
    where.type = "VIDEO";
  } else if (format === "GALLERY") {
    where.type = "IMAGE";
    where.galleryUrls = { isEmpty: false };
  } else if (format === "IMAGE") {
    where.type = "IMAGE";
    where.galleryUrls = { isEmpty: true };
  } else if (format === "SMALL_IMAGE") {
    where.type = "IMAGE";
    where.OR = [
      { width: { lt: 400, not: null } },
      { height: { lt: 400, not: null } },
    ];
  }

  try {
    const [total, items, allCount, videoCount, galleryCount, imageCount, smallImageCount] = await Promise.all([
      prisma.mediaItem.count({ where }),
      prisma.mediaItem.findMany({
        where,
        include: {
          tags: {
            include: { tag: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.mediaItem.count({ where: baseWhere }),
      prisma.mediaItem.count({ where: { ...baseWhere, type: "VIDEO" } }),
      prisma.mediaItem.count({ where: { ...baseWhere, type: "IMAGE", galleryUrls: { isEmpty: false } } }),
      prisma.mediaItem.count({ where: { ...baseWhere, type: "IMAGE", galleryUrls: { isEmpty: true } } }),
      prisma.mediaItem.count({
        where: {
          ...baseWhere,
          type: "IMAGE",
          OR: [
            { width: { lt: 400, not: null } },
            { height: { lt: 400, not: null } },
          ],
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      items: items.map((item) => ({
        ...item,
        tags: item.tags.map((t) => t.tag.name),
      })),
      counts: {
        all: allCount,
        video: videoCount,
        gallery: galleryCount,
        image: imageCount,
        smallImage: smallImageCount,
      },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err: any) {
    console.error("[GET_MEDIA_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi lấy danh sách media" }, { status: 500 });
  }
}

// Xóa media hàng loạt (Bulk Delete)
export async function DELETE(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Chưa đăng nhập quyền Admin" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Vui lòng chọn ít nhất một mục để xóa" }, { status: 400 });
    }

    // Xóa file local nếu có
    const items = await prisma.mediaItem.findMany({
      where: { id: { in: ids } },
      select: { id: true, localPath: true },
    });

    for (const item of items) {
      if (item.localPath && fs.existsSync(item.localPath)) {
        try {
          await fs.promises.unlink(item.localPath);
        } catch (e) {
          console.warn("[BULK_DELETE_FILE_WARN]", e);
        }
      }
    }

    const deleteResult = await prisma.mediaItem.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({
      success: true,
      message: `Đã xóa thành công ${deleteResult.count} mục`,
      count: deleteResult.count,
    });
  } catch (err: any) {
    console.error("[BULK_DELETE_MEDIA_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi xóa media hàng loạt" }, { status: 500 });
  }
}

// Gán nhãn hàng loạt (Bulk Tag Assignment)
export async function PATCH(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Chưa đăng nhập quyền Admin" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { ids, tags = [], mode = "ADD" } = body; // mode: "ADD" | "REPLACE"

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Vui lòng chọn ít nhất một mục để gán nhãn" }, { status: 400 });
    }

    const tagNames: string[] = Array.isArray(tags)
      ? tags.map((t: string) => t.trim().replace(/^#/, "")).filter(Boolean)
      : [];

    if (tagNames.length === 0 && mode === "ADD") {
      return NextResponse.json({ error: "Vui lòng nhập ít nhất 1 nhãn (tag) hợp lệ" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Tạo hoặc lấy tag IDs
      const tagRecords = [];
      for (const tagName of tagNames) {
        const slug = tagName.toLowerCase().replace(/\s+/g, "-");
        const tag = await tx.tag.upsert({
          where: { slug },
          update: {},
          create: { name: tagName, slug },
        });
        tagRecords.push(tag);
      }

      // 2. Nếu chế độ REPLACE: xóa toàn bộ tag cũ của các media này
      if (mode === "REPLACE") {
        await tx.mediaItemTag.deleteMany({
          where: { mediaItemId: { in: ids } },
        });
      }

      // 3. Gán tag mới
      for (const mediaItemId of ids) {
        for (const tag of tagRecords) {
          await tx.mediaItemTag.upsert({
            where: {
              mediaItemId_tagId: {
                mediaItemId,
                tagId: tag.id,
              },
            },
            update: {},
            create: {
              mediaItemId,
              tagId: tag.id,
            },
          });
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: `Đã gán nhãn thành công cho ${ids.length} media`,
      count: ids.length,
    });
  } catch (err: any) {
    console.error("[BULK_TAG_MEDIA_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi gán nhãn hàng loạt" }, { status: 500 });
  }
}

// Hàm phụ trợ tạo 1 Media Item vào cơ sở dữ liệu
async function createMediaRecord(data: any) {
  const {
    type, // "IMAGE" | "VIDEO"
    sourceType, // "X_TWITTER" | "TIKTOK" | "INSTAGRAM" | "DIRECT_LINK" | "UPLOAD" | "WEB_SCRAPE"
    sourceUrl,
    mediaUrl,
    galleryUrls = [], // string[] cho Album / Gallery
    thumbnailUrl,
    title,
    storageMode = "DIRECT_LINK", // "DIRECT_LINK" | "LOCAL_STORAGE"
    tags = [], // string[]
    isLandscape = false,
    defaultRotate = 0,
    duration = null,
    width = null,
    height = null,
  } = data;

  let finalMediaUrl =
    mediaUrl || (Array.isArray(galleryUrls) && galleryUrls.length > 0 ? galleryUrls[0] : null);
  let finalGalleryUrls: string[] = Array.isArray(galleryUrls) ? [...galleryUrls] : [];
  let finalType = type;
  let finalThumbnailUrl = thumbnailUrl;
  let finalTitle = title;
  let finalIsLandscape = isLandscape;

  // Tự động phân tích bóc tách nếu mediaUrl rỗng hoặc là blob URL (phổ biến khi Twitter phát video)
  if ((!finalMediaUrl || finalMediaUrl.startsWith("blob:")) && sourceUrl) {
    try {
      const extracted = await extractMediaFromUrl(sourceUrl);
      if (extracted) {
        finalMediaUrl = extracted.mediaUrl;
        finalType = finalType || extracted.type;
        finalThumbnailUrl = finalThumbnailUrl || extracted.thumbnailUrl;
        finalTitle = finalTitle || extracted.title;
        finalIsLandscape = finalIsLandscape || extracted.isLandscape;
        if (extracted.allMedia && extracted.allMedia.length > 0) {
          finalGalleryUrls = extracted.allMedia.map((m) => m.mediaUrl);
        }
      }
    } catch (err) {
      console.warn("[AUTO_EXTRACT_WARN]", err);
    }
  }

  if (!finalType || !finalMediaUrl) {
    throw new Error("Thiếu thông tin mediaUrl hoặc galleryUrls hoặc type");
  }

  let localPath: string | null = null;

  // Nếu chọn phương án Tải về máy chủ cục bộ (LOCAL_STORAGE)
  if (storageMode === "LOCAL_STORAGE") {
    // 1. Tải ảnh/video đại diện chính
    if (!finalMediaUrl.startsWith("/uploads/")) {
      try {
        const downloaded = await downloadMediaLocally(finalMediaUrl, type);
        finalMediaUrl = downloaded.localUrl;
        localPath = downloaded.localPath;
      } catch (dlErr: any) {
        console.error("[DOWNLOAD_FAILED_FALLBACK_TO_DIRECT]", dlErr);
      }
    }

    // 2. Tải toàn bộ các ảnh trong gallery (nếu có)
    if (finalGalleryUrls.length > 0) {
      finalGalleryUrls = await Promise.all(
        finalGalleryUrls.map(async (imgUrl: string) => {
          if (imgUrl.startsWith("/uploads/")) return imgUrl;
          try {
            const dl = await downloadMediaLocally(imgUrl, "IMAGE");
            return dl.localUrl;
          } catch (err) {
            console.error("[DOWNLOAD_GALLERY_IMG_FAILED]", imgUrl, err);
            return imgUrl;
          }
        })
      );
    }
  }

  // Xử lý Tags
  const tagNames: string[] = Array.isArray(tags)
    ? tags.map((t: string) => t.trim().replace(/^#/, "")).filter(Boolean)
    : [];

  return await prisma.$transaction(async (tx) => {
    const item = await tx.mediaItem.create({
      data: {
        type: finalType,
        sourceType: sourceType || "DIRECT_LINK",
        sourceUrl: sourceUrl || null,
        storageMode: storageMode === "LOCAL_STORAGE" ? "LOCAL_STORAGE" : "DIRECT_LINK",
        mediaUrl: finalMediaUrl,
        galleryUrls: finalGalleryUrls,
        localPath,
        thumbnailUrl: finalThumbnailUrl || null,
        title: finalTitle || null,
        isLandscape: Boolean(finalIsLandscape),
        defaultRotate: Number(defaultRotate) || 0,
        duration: duration != null && !isNaN(Number(duration)) ? Number(duration) : null,
        width: width != null && !isNaN(Number(width)) ? Math.round(Number(width)) : null,
        height: height != null && !isNaN(Number(height)) ? Math.round(Number(height)) : null,
      },
    });

    // Liên kết Tags
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
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin(request);
  if (!admin) {
    return NextResponse.json(
      { error: "Chưa đăng nhập quyền Admin" },
      {
        status: 401,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }

  try {
    const body = await request.json();

    // Hỗ trợ lưu hàng loạt (Batch insert) khi truyền mảng items
    if (Array.isArray(body.items) && body.items.length > 0) {
      const createdItems = [];
      for (const itemData of body.items) {
        const item = await createMediaRecord(itemData);
        createdItems.push(item);
      }
      return NextResponse.json(
        {
          success: true,
          count: createdItems.length,
          items: createdItems,
        },
        { headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Lưu 1 item đơn lẻ
    const createdItem = await createMediaRecord(body);
    return NextResponse.json(
      { success: true, item: createdItem },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err: any) {
    console.error("[CREATE_MEDIA_ERROR]", err);
    return NextResponse.json(
      { error: err.message || "Lỗi lưu media vào cơ sở dữ liệu" },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
