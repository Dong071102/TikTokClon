import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const tags = await prisma.tag.findMany({
      include: {
        _count: {
          select: { mediaItems: true },
        },
      },
      orderBy: {
        mediaItems: {
          _count: "desc",
        },
      },
    });

    return NextResponse.json({
      success: true,
      tags: tags.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        count: t._count.mediaItems,
      })),
    });
  } catch (err: any) {
    console.error("[TAGS_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi lấy danh sách tags" }, { status: 500 });
  }
}
