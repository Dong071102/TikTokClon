import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = parseInt(searchParams.get("limit") || "12", 10);
  const tag = searchParams.get("tag");
  const idsParam = searchParams.get("ids");
  const targetId = searchParams.get("id") || searchParams.get("mediaId");
  const sort = searchParams.get("sort") || "newest"; // "newest" | "oldest" | "random"
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const formatsParam = searchParams.get("formats") || searchParams.get("format") || searchParams.get("type");

  const where: any = {};

  // Lọc theo danh sách ID (dành cho mục Yêu thích)
  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    where.id = { in: ids };
  }

  // Lọc theo định dạng nội dung (VIDEO / GALLERY / IMAGE hoặc gộp nhiều định dạng)
  if (formatsParam) {
    const rawFormats = formatsParam
      .split(",")
      .map((f) => f.trim().toUpperCase())
      .filter((f) => ["VIDEO", "GALLERY", "IMAGE"].includes(f));

    // Nếu chọn cả 3 hoặc không có giá trị hợp lệ thì không áp dụng điều kiện type
    if (rawFormats.length > 0 && rawFormats.length < 3) {
      if (rawFormats.length === 1) {
        const fmt = rawFormats[0];
        if (fmt === "VIDEO") {
          where.type = "VIDEO";
        } else if (fmt === "GALLERY") {
          where.type = "IMAGE";
          where.galleryUrls = { isEmpty: false };
        } else if (fmt === "IMAGE") {
          where.type = "IMAGE";
          where.galleryUrls = { isEmpty: true };
        }
      } else if (rawFormats.length === 2) {
        const hasVideo = rawFormats.includes("VIDEO");
        const hasGallery = rawFormats.includes("GALLERY");
        const hasImage = rawFormats.includes("IMAGE");

        if (hasGallery && hasImage) {
          // Lấy tất cả ảnh (cả album và ảnh đơn), loại bỏ video
          where.type = "IMAGE";
        } else if (hasVideo && hasGallery) {
          // Gộp: Video và Album
          where.OR = [
            { type: "VIDEO" },
            { type: "IMAGE", galleryUrls: { isEmpty: false } },
          ];
        } else if (hasVideo && hasImage) {
          // Gộp: Video và Ảnh đơn
          where.OR = [
            { type: "VIDEO" },
            { type: "IMAGE", galleryUrls: { isEmpty: true } },
          ];
        }
      }
    }
  }

  // Lọc theo Tag
  if (tag) {
    where.tags = {
      some: {
        tag: {
          slug: tag.toLowerCase(),
        },
      },
    };
  }

  // Lọc theo ngày cụ thể hoặc khoảng ngày
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      where.createdAt.gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  try {
    const formatItem = (item: any) => ({
      id: item.id,
      type: item.type,
      mediaUrl: item.mediaUrl,
      galleryUrls: item.galleryUrls || [],
      thumbnailUrl: item.thumbnailUrl,
      title: item.title,
      isLandscape: item.isLandscape,
      defaultRotate: item.defaultRotate,
      duration: item.duration,
      width: item.width,
      height: item.height,
      createdAt: item.createdAt,
      tags: (item.tags || []).map((t: any) => t.tag?.name || t.name || t),
    });

    // Nếu người dùng yêu cầu mở đích danh 1 video (vd: từ link admin), ưu tiên đưa video đó lên đầu
    let initialItem: any = null;
    if (targetId && !cursor) {
      initialItem = await prisma.mediaItem.findUnique({
        where: { id: targetId },
        include: { tags: { include: { tag: true } } },
      });
    }

    // Chế độ Ngẫu nhiên (Random Mode)
    if (sort === "random") {
      const totalCount = await prisma.mediaItem.count({ where });
      if (totalCount === 0) {
        if (initialItem) {
          return NextResponse.json({
            success: true,
            items: [formatItem(initialItem)],
            nextCursor: null,
            totalCount: 1,
          });
        }
        return NextResponse.json({ success: true, items: [], nextCursor: null });
      }

      // Chọn ngẫu nhiên vị trí offset
      const maxSkip = Math.max(0, totalCount - limit);
      const randomSkip = Math.floor(Math.random() * (maxSkip + 1));

      const items = await prisma.mediaItem.findMany({
        where,
        take: limit,
        skip: randomSkip,
        include: {
          tags: {
            include: { tag: true },
          },
        },
      });

      // Xáo trộn ngẫu nhiên danh sách trả về
      const shuffled = items.sort(() => Math.random() - 0.5);
      const listToReturn = initialItem
        ? [initialItem, ...shuffled.filter((i) => i.id !== initialItem.id)]
        : shuffled;

      return NextResponse.json({
        success: true,
        items: listToReturn.map(formatItem),
        // nextCursor luôn có giá trị để cuộn vô tận không bao giờ hết
        nextCursor: "random-infinite",
        totalCount,
      });
    }

    // Chế độ Mới nhất (Newest) hoặc Cũ nhất (Oldest)
    const orderBy = sort === "oldest" ? { createdAt: "asc" as const } : { createdAt: "desc" as const };

    const items = await prisma.mediaItem.findMany({
      where,
      take: limit + 1,
      skip: cursor && cursor !== "random-infinite" ? 1 : 0,
      cursor: cursor && cursor !== "random-infinite" ? { id: cursor } : undefined,
      orderBy,
      include: {
        tags: {
          include: { tag: true },
        },
      },
    });

    let nextCursor: string | null = null;
    if (items.length > limit) {
      const nextItem = items.pop();
      nextCursor = nextItem ? nextItem.id : null;
    }

    const listToReturn = initialItem
      ? [initialItem, ...items.filter((i) => i.id !== initialItem.id)]
      : items;

    return NextResponse.json({
      success: true,
      items: listToReturn.map(formatItem),
      nextCursor,
    });
  } catch (err: any) {
    console.error("[FEED_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi tải dữ liệu feed" }, { status: 500 });
  }
}
