import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor"); // id của item trước đó
  const limit = parseInt(searchParams.get("limit") || "10", 10);
  const tag = searchParams.get("tag");
  const idsParam = searchParams.get("ids");

  const where: any = {};
  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    where.id = { in: ids };
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
    const items = await prisma.mediaItem.findMany({
      where,
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: "desc" },
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
    return NextResponse.json({ error: err.message || "Lỗi tải danh sách video/ảnh" }, { status: 500 });
  }
}
