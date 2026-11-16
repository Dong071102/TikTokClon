import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "fs";

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Chưa đăng nhập quyền Admin" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const threshold = Math.max(100, Math.min(2000, parseInt(searchParams.get("threshold") || "400", 10)));

  try {
    const [total, smallImages, totalVideos, totalImages, noDimensions] = await Promise.all([
      prisma.mediaItem.count(),
      prisma.mediaItem.count({
        where: {
          type: "IMAGE",
          OR: [
            { width: { lt: threshold, not: null } },
            { height: { lt: threshold, not: null } },
          ],
        },
      }),
      prisma.mediaItem.count({ where: { type: "VIDEO" } }),
      prisma.mediaItem.count({ where: { type: "IMAGE" } }),
      prisma.mediaItem.count({ where: { width: null } }),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        total,
        smallImages,
        totalVideos,
        totalImages,
        noDimensions,
        threshold,
      },
    });
  } catch (err: any) {
    console.error("[CLEANUP_STATS_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi lấy thống kê dọn dẹp" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Chưa đăng nhập quyền Admin" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, threshold = 400, ids = [] } = body;

    // 1. Xóa tất cả ảnh có kích thước nhỏ hơn ngưỡng (threshold)
    if (action === "DELETE_SMALL_IMAGES") {
      const minSize = Math.max(100, Math.min(2000, Number(threshold) || 400));
      const smallItems = await prisma.mediaItem.findMany({
        where: {
          type: "IMAGE",
          OR: [
            { width: { lt: minSize, not: null } },
            { height: { lt: minSize, not: null } },
          ],
        },
        select: { id: true, localPath: true },
      });

      if (smallItems.length === 0) {
        return NextResponse.json({
          success: true,
          count: 0,
          message: `Không tìm thấy hình ảnh nào nhỏ hơn ${minSize}px`,
        });
      }

      // Xóa file cục bộ nếu có
      for (const item of smallItems) {
        if (item.localPath && fs.existsSync(item.localPath)) {
          try {
            fs.unlinkSync(item.localPath);
          } catch (e) {
            console.error("[DELETE_LOCAL_FILE_ERR]", item.localPath, e);
          }
        }
      }

      // Xóa khỏi Database
      const deleteResult = await prisma.mediaItem.deleteMany({
        where: {
          id: { in: smallItems.map((item) => item.id) },
        },
      });

      return NextResponse.json({
        success: true,
        count: deleteResult.count,
        message: `Đã xóa thành công ${deleteResult.count} hình ảnh có kích thước nhỏ (< ${minSize}px)`,
      });
    }

    // 2. Xóa danh sách media theo IDs được chỉ định
    if (action === "DELETE_BY_IDS") {
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: "Vui lòng chọn ít nhất 1 mục để xóa" }, { status: 400 });
      }

      const items = await prisma.mediaItem.findMany({
        where: { id: { in: ids } },
        select: { id: true, localPath: true },
      });

      for (const item of items) {
        if (item.localPath && fs.existsSync(item.localPath)) {
          try {
            fs.unlinkSync(item.localPath);
          } catch (e) {
            console.error("[DELETE_LOCAL_FILE_ERR]", item.localPath, e);
          }
        }
      }

      const deleteResult = await prisma.mediaItem.deleteMany({
        where: { id: { in: ids } },
      });

      return NextResponse.json({
        success: true,
        count: deleteResult.count,
        message: `Đã xóa thành công ${deleteResult.count} media được chọn!`,
      });
    }

    // 3. Quét kiểm tra trạng thái HTTP của các link video (Phát hiện video chết / 404 / hết hạn)
    if (action === "SCAN_UNPLAYABLE_VIDEOS") {
      const limit = Math.min(200, Math.max(10, Number(body.limit) || 100));
      const videos = await prisma.mediaItem.findMany({
        where: { type: "VIDEO" },
        take: limit,
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, mediaUrl: true, storageMode: true, localPath: true },
      });

      const unplayable: Array<{ id: string; title: string | null; mediaUrl: string; reason: string }> = [];

      for (const v of videos) {
        // Nếu là local file: kiểm tra file có tồn tại trên đĩa không
        if (v.storageMode === "LOCAL_STORAGE" && v.localPath) {
          if (!fs.existsSync(v.localPath)) {
            unplayable.push({
              id: v.id,
              title: v.title,
              mediaUrl: v.mediaUrl,
              reason: "File cục bộ trên máy chủ không tồn tại",
            });
          }
          continue;
        }

        // Nếu là direct link: thử ping HEAD / GET range
        if (v.mediaUrl.startsWith("http")) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);

            const res = await fetch(v.mediaUrl, {
              method: "HEAD",
              signal: controller.signal,
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              },
            });
            clearTimeout(timeout);

            if (res.status >= 400 && res.status !== 403 && res.status !== 405) {
              unplayable.push({
                id: v.id,
                title: v.title,
                mediaUrl: v.mediaUrl,
                reason: `Server nguồn trả về mã lỗi HTTP ${res.status}`,
              });
            }
          } catch (err: any) {
            // Nếu fetch timeout hoặc network error hoàn toàn
            if (err.name === "AbortError") {
              // Timeout - có thể do server chậm hoặc chặn HEAD, không vội đánh dấu hỏng
            } else {
              unplayable.push({
                id: v.id,
                title: v.title,
                mediaUrl: v.mediaUrl,
                reason: err.message || "Không thể kết nối đến URL video",
              });
            }
          }
        }
      }

      return NextResponse.json({
        success: true,
        scannedCount: videos.length,
        unplayableCount: unplayable.length,
        unplayableItems: unplayable,
      });
    }

    return NextResponse.json({ error: "Hành động (action) không hợp lệ" }, { status: 400 });
  } catch (err: any) {
    console.error("[CLEANUP_POST_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi xử lý dọn dẹp" }, { status: 500 });
  }
}
