import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = parseInt(searchParams.get("limit") || "12", 10);
  const tag = searchParams.get("tag");
  const idsParam = searchParams.get("ids");
  const sort = searchParams.get("sort") || "newest"; // "newest" | "oldest" | "random"
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const where: any = {};

  // Lọc theo danh sách ID (dành cho mục Yêu thích)
  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    where.id = { in: ids };
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
    // Chế độ Ngẫu nhiên (Random Mode)
    if (sort === "random") {
      const totalCount = await prisma.mediaItem.count({ where });
      if (totalCount === 0) {
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

      return NextResponse.json({
        success: true,
        items: shuffled.map((item) => ({
          id: item.id,
          type: item.type,
          mediaUrl: item.mediaUrl,
          galleryUrls: item.galleryUrls || [],
          thumbnailUrl: item.thumbnailUrl,
          title: item.title,
          isLandscape: item.isLandscape,
          defaultRotate: item.defaultRotate,
          createdAt: item.createdAt,
          tags: item.tags.map((t) => t.tag.name),
        })),
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

    return NextResponse.json({
      success: true,
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        mediaUrl: item.mediaUrl,
        galleryUrls: item.galleryUrls || [],
        thumbnailUrl: item.thumbnailUrl,
        title: item.title,
        isLandscape: item.isLandscape,
        defaultRotate: item.defaultRotate,
        createdAt: item.createdAt,
        tags: item.tags.map((t) => t.tag.name),
      })),
      nextCursor,
    });
  } catch (err: any) {
    console.error("[FEED_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi tải dữ liệu feed" }, { status: 500 });
  }
}
