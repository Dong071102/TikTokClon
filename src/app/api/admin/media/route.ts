import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { downloadMediaLocally } from "@/lib/downloader";

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Chưa đăng nhập quyền Admin" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const tag = searchParams.get("tag");
  const type = searchParams.get("type"); // "IMAGE" or "VIDEO"

  const skip = (page - 1) * limit;

  const where: any = {};
  if (type === "IMAGE" || type === "VIDEO") {
    where.type = type;
  }
  if (tag) {
    where.tags = {
      some: {
        tag: {
          slug: tag.toLowerCase(),
        },
      },
    };
  }

  try {
    const [total, items] = await Promise.all([
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
    ]);

    return NextResponse.json({
      success: true,
      items: items.map((item) => ({
        ...item,
        tags: item.tags.map((t) => t.tag.name),
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error("[GET_MEDIA_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi lấy danh sách media" }, { status: 500 });
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
  } = data;

  const initialMediaUrl =
    mediaUrl || (Array.isArray(galleryUrls) && galleryUrls.length > 0 ? galleryUrls[0] : null);

  if (!type || !initialMediaUrl) {
    throw new Error("Thiếu thông tin mediaUrl hoặc galleryUrls hoặc type");
  }

  let finalMediaUrl = initialMediaUrl;
  let finalGalleryUrls: string[] = Array.isArray(galleryUrls) ? [...galleryUrls] : [];
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
        type,
        sourceType: sourceType || "DIRECT_LINK",
        sourceUrl: sourceUrl || null,
        storageMode: storageMode === "LOCAL_STORAGE" ? "LOCAL_STORAGE" : "DIRECT_LINK",
        mediaUrl: finalMediaUrl,
        galleryUrls: finalGalleryUrls,
        localPath,
        thumbnailUrl: thumbnailUrl || null,
        title: title || null,
        isLandscape: Boolean(isLandscape),
        defaultRotate: Number(defaultRotate) || 0,
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
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Chưa đăng nhập quyền Admin" }, { status: 401 });
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
      return NextResponse.json({
        success: true,
        count: createdItems.length,
        items: createdItems,
      });
    }

    // Lưu 1 item đơn lẻ
    const createdItem = await createMediaRecord(body);
    return NextResponse.json({ success: true, item: createdItem });
  } catch (err: any) {
    console.error("[CREATE_MEDIA_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi lưu media vào cơ sở dữ liệu" }, { status: 500 });
  }
}
