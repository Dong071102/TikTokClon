import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import sharp from "sharp";

// Cache kích thước ảnh trong bộ nhớ để không bao giờ probe lại 1 URL 2 lần
const imageDimensionCache = new Map<string, { width: number; height: number; error?: boolean }>();

// Cache kết quả kiểm tra trạng thái video trong bộ nhớ
const videoPlayableCache = new Map<string, { unplayable: boolean; reason?: string }>();

// Hàm chạy song song với giới hạn concurrency (pool worker)
async function pMap<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;
  const workers = new Array(Math.min(limit, Math.max(1, items.length))).fill(0).map(async () => {
    while (index < items.length) {
      const i = index++;
      try {
        results[i] = await fn(items[i], i);
      } catch {
        // Bỏ qua lỗi lẻ trong worker
      }
    }
  });
  await Promise.all(workers);
  return results;
}

// Hàm probe kích thước ảnh siêu tốc: chỉ tải 48KB phần đầu (Range header) thay vì tải toàn bộ file nhiều MB
async function probeImageSize(urlOrPath: string): Promise<{ width: number; height: number; error?: boolean }> {
  const cached = imageDimensionCache.get(urlOrPath);
  if (cached !== undefined) return cached;

  try {
    if (urlOrPath.startsWith("http")) {
      let origin = "";
      try {
        origin = new URL(urlOrPath).origin;
      } catch {}

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000); // 4s timeout

      // Yêu cầu Range 0-49151 (48KB) để chỉ lấy header metadata (JPEG, PNG, WebP, GIF, AVIF)
      const res = await fetch(urlOrPath, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Range: "bytes=0-49151",
          ...(origin ? { Referer: origin + "/" } : {}),
        },
      });

      if (!res.ok && res.status !== 206) {
        clearTimeout(timeout);
        const result = { width: 0, height: 0, error: true };
        imageDimensionCache.set(urlOrPath, result);
        return result;
      }

      // Đọc tối đa 64KB từ stream rồi hủy stream ngay lập tức để tiết kiệm 98% băng thông
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      if (reader) {
        while (totalBytes < 65536) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            totalBytes += value.length;
          }
        }
        try {
          reader.cancel();
        } catch {}
      }
      clearTimeout(timeout);
      controller.abort();

      const buffer = Buffer.concat(chunks);
      let metadata;
      try {
        metadata = await sharp(buffer).metadata();
      } catch {
        // Fallback tải đầy đủ nếu 48KB chưa đủ đọc metadata (rất hiếm gặp)
        try {
          const fullCtrl = new AbortController();
          const fullTo = setTimeout(() => fullCtrl.abort(), 5000);
          const fullRes = await fetch(urlOrPath, {
            signal: fullCtrl.signal,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              ...(origin ? { Referer: origin + "/" } : {}),
            },
          });
          clearTimeout(fullTo);
          if (fullRes.ok) {
            const fullBuf = Buffer.from(await fullRes.arrayBuffer());
            metadata = await sharp(fullBuf).metadata();
          }
        } catch {}
      }

      const result = {
        width: metadata?.width || 0,
        height: metadata?.height || 0,
        error: !metadata?.width || !metadata?.height,
      };
      imageDimensionCache.set(urlOrPath, result);
      return result;
    } else if (fs.existsSync(urlOrPath)) {
      const metadata = await sharp(urlOrPath).metadata();
      const result = {
        width: metadata.width || 0,
        height: metadata.height || 0,
        error: false,
      };
      imageDimensionCache.set(urlOrPath, result);
      return result;
    }
  } catch {
    const result = { width: 0, height: 0, error: true };
    imageDimensionCache.set(urlOrPath, result);
    return result;
  }

  return { width: 0, height: 0, error: true };
}

// Kiểm tra video có thể phát hay không siêu tốc bằng Range GET 0-100 song song
async function checkVideoPlayable(v: {
  id: string;
  title: string | null;
  mediaUrl: string;
  storageMode: string;
  localPath: string | null;
}): Promise<{ unplayable: boolean; reason?: string }> {
  // Kiểm tra cache trước
  const cached = videoPlayableCache.get(v.mediaUrl);
  if (cached !== undefined) return cached;

  // 1. File cục bộ trên máy chủ
  if (v.storageMode === "LOCAL_STORAGE" && v.localPath) {
    if (!fs.existsSync(v.localPath)) {
      const res = { unplayable: true, reason: "File cục bộ trên máy chủ không tồn tại" };
      videoPlayableCache.set(v.mediaUrl, res);
      return res;
    }
    const res = { unplayable: false };
    videoPlayableCache.set(v.mediaUrl, res);
    return res;
  }

  // 2. Direct HTTP link
  if (v.mediaUrl.startsWith("http")) {
    let origin = "";
    let domain = "";
    try {
      const u = new URL(v.mediaUrl);
      origin = u.origin;
      domain = u.hostname;
    } catch {}

    const isM3u8 = v.mediaUrl.includes(".m3u8");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      // Dùng GET Range bytes 0-100 trực tiếp (chuẩn video streaming)
      const res = await fetch(v.mediaUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          ...(origin ? { Referer: origin + "/" } : {}),
          ...(isM3u8 ? {} : { Range: "bytes=0-100" }),
        },
      });
      clearTimeout(timeout);

      // Status 200 hoặc 206 -> Video chạy tốt
      if (res.ok || res.status === 206) {
        const result = { unplayable: false };
        videoPlayableCache.set(v.mediaUrl, result);
        return result;
      }

      // Nếu 403 Forbidden -> Thử thêm referer từ domain
      if (res.status === 403) {
        try {
          const ctrl2 = new AbortController();
          const to2 = setTimeout(() => ctrl2.abort(), 3000);
          const res2 = await fetch(v.mediaUrl, {
            method: "GET",
            signal: ctrl2.signal,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              Referer: `https://${domain}/`,
              Range: "bytes=0-50",
            },
          });
          clearTimeout(to2);
          if (res2.ok || res2.status === 206) {
            const result = { unplayable: false };
            videoPlayableCache.set(v.mediaUrl, result);
            return result;
          }
        } catch {}

        const result = {
          unplayable: true,
          reason: "Server nguồn từ chối truy cập (HTTP 403 Forbidden)",
        };
        videoPlayableCache.set(v.mediaUrl, result);
        return result;
      }

      if (res.status === 404 || res.status === 410) {
        const result = {
          unplayable: true,
          reason: `Link video đã chết (HTTP ${res.status})`,
        };
        videoPlayableCache.set(v.mediaUrl, result);
        return result;
      }

      if (res.status >= 500) {
        const result = {
          unplayable: true,
          reason: `Máy chủ chứa video gặp lỗi (HTTP ${res.status})`,
        };
        videoPlayableCache.set(v.mediaUrl, result);
        return result;
      }

      if (res.status >= 400) {
        const result = {
          unplayable: true,
          reason: `Lỗi kết nối HTTP ${res.status}`,
        };
        videoPlayableCache.set(v.mediaUrl, result);
        return result;
      }

      const result = { unplayable: false };
      videoPlayableCache.set(v.mediaUrl, result);
      return result;
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        const result = {
          unplayable: true,
          reason: "Máy chủ video không phản hồi (Timeout > 4s)",
        };
        videoPlayableCache.set(v.mediaUrl, result);
        return result;
      }
      const result = {
        unplayable: true,
        reason: err.message || "Không thể kết nối đến URL video (Host chết hoặc DNS lỗi)",
      };
      videoPlayableCache.set(v.mediaUrl, result);
      return result;
    }
  }

  const result = { unplayable: false };
  videoPlayableCache.set(v.mediaUrl, result);
  return result;
}

// Hàm quét và lọc sạch các ảnh nhỏ / ảnh hỏng bên trong galleryUrls của từng Album (chạy song song 25 luồng)
async function processGalleriesSmallImages(minSize: number, dryRun: boolean) {
  const startTime = Date.now();

  const galleries = await prisma.mediaItem.findMany({
    where: {
      type: "IMAGE",
      galleryUrls: { isEmpty: false },
    },
    select: {
      id: true,
      title: true,
      mediaUrl: true,
      galleryUrls: true,
      width: true,
      height: true,
    },
  });

  // 1. Gom toàn bộ danh sách unique URL cần kiểm tra
  const allUrlsSet = new Set<string>();
  for (const g of galleries) {
    if (Array.isArray(g.galleryUrls)) {
      for (const u of g.galleryUrls) {
        if (u) allUrlsSet.add(u);
      }
    }
  }
  const allUniqueUrls = Array.from(allUrlsSet);

  // 2. Chạy quét song song 25 luồng với Range request (chỉ tải 48KB header mỗi ảnh)
  await pMap(allUniqueUrls, 25, async (url) => {
    await probeImageSize(url);
  });

  let totalSmallImagesRemoved = 0;
  let galleriesUpdatedCount = 0;
  let galleriesDeletedCount = 0;
  const affectedGalleries: Array<{
    id: string;
    title: string | null;
    originalCount: number;
    newCount: number;
    removedCount: number;
    isDeleted: boolean;
  }> = [];

  // 3. Phân loại và cập nhật từng Album
  for (const gallery of galleries) {
    const originalUrls = gallery.galleryUrls;
    if (!originalUrls || originalUrls.length === 0) continue;

    const validUrls: string[] = [];
    const removedUrls: string[] = [];
    let newFirstWidth: number | null = null;
    let newFirstHeight: number | null = null;

    for (const url of originalUrls) {
      const dim = imageDimensionCache.get(url) || (await probeImageSize(url));
      if (dim && (dim.error || dim.width < minSize || dim.height < minSize)) {
        removedUrls.push(url);
      } else {
        validUrls.push(url);
        if (validUrls.length === 1 && dim && !dim.error) {
          newFirstWidth = dim.width;
          newFirstHeight = dim.height;
        }
      }
    }

    if (removedUrls.length > 0) {
      totalSmallImagesRemoved += removedUrls.length;
      const isDeleted = validUrls.length === 0;

      affectedGalleries.push({
        id: gallery.id,
        title: gallery.title,
        originalCount: originalUrls.length,
        newCount: validUrls.length,
        removedCount: removedUrls.length,
        isDeleted,
      });

      if (!dryRun) {
        if (isDeleted) {
          await prisma.mediaItem.delete({ where: { id: gallery.id } });
          galleriesDeletedCount++;
        } else {
          await prisma.mediaItem.update({
            where: { id: gallery.id },
            data: {
              galleryUrls: validUrls,
              mediaUrl: validUrls[0],
              width: newFirstWidth || gallery.width,
              height: newFirstHeight || gallery.height,
            },
          });
          galleriesUpdatedCount++;
        }
      }
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    totalGalleriesScanned: galleries.length,
    totalImagesChecked: allUniqueUrls.length,
    totalSmallImagesRemoved,
    galleriesUpdatedCount,
    galleriesDeletedCount,
    affectedGalleries,
    durationMs,
  };
}

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

    // 1. Xóa tất cả ảnh có kích thước nhỏ hơn ngưỡng (threshold) bao gồm cả ảnh đơn và ảnh trong Album/Gallery
    if (action === "DELETE_SMALL_IMAGES") {
      const minSize = Math.max(100, Math.min(2000, Number(threshold) || 400));
      const startTime = Date.now();

      // 1.1 Tự động quét và cập nhật kích thước cho các ảnh đơn chưa có width/height trong DB
      const unprobedImages = await prisma.mediaItem.findMany({
        where: {
          type: "IMAGE",
          galleryUrls: { isEmpty: true },
          width: null,
        },
        select: { id: true, mediaUrl: true },
        take: 100,
      });

      if (unprobedImages.length > 0) {
        await pMap(unprobedImages, 15, async (item) => {
          const dim = await probeImageSize(item.mediaUrl);
          if (dim && !dim.error && dim.width > 0) {
            await prisma.mediaItem.update({
              where: { id: item.id },
              data: { width: dim.width, height: dim.height },
            });
          }
        });
      }

      // 1.2 Tìm các bài ảnh đơn nhỏ hơn ngưỡng
      const smallItems = await prisma.mediaItem.findMany({
        where: {
          type: "IMAGE",
          galleryUrls: { isEmpty: true },
          OR: [
            { width: { lt: minSize, not: null } },
            { height: { lt: minSize, not: null } },
          ],
        },
        select: { id: true, localPath: true },
      });

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

      // Xóa các bản ghi ảnh đơn nhỏ khỏi Database
      let deletedSingleCount = 0;
      if (smallItems.length > 0) {
        const deleteResult = await prisma.mediaItem.deleteMany({
          where: {
            id: { in: smallItems.map((item) => item.id) },
          },
        });
        deletedSingleCount = deleteResult.count;
      }

      // 1.3 Lọc sạch toàn bộ ảnh nhỏ nằm bên trong mảng galleryUrls của các bài Album/Gallery (chạy song song siêu tốc)
      const galleryResult = await processGalleriesSmallImages(minSize, false);
      const totalDuration = Date.now() - startTime;

      const messageParts = [];
      if (deletedSingleCount > 0) {
        messageParts.push(`Đã xóa ${deletedSingleCount} bài ảnh đơn`);
      }
      if (galleryResult.totalSmallImagesRemoved > 0) {
        messageParts.push(
          `Đã loại bỏ ${galleryResult.totalSmallImagesRemoved} ảnh nhỏ trong ${galleryResult.galleriesUpdatedCount} album${
            galleryResult.galleriesDeletedCount > 0 ? ` (xóa ${galleryResult.galleriesDeletedCount} album rỗng)` : ""
          }`
        );
      }

      const finalMessage =
        messageParts.length > 0
          ? messageParts.join(", và ") + ` (< ${minSize}px) trong ${(totalDuration / 1000).toFixed(1)}s!`
          : `Không phát hiện hình ảnh nào nhỏ hơn ${minSize}px cần dọn dẹp (quét xong trong ${(totalDuration / 1000).toFixed(1)}s).`;

      return NextResponse.json({
        success: true,
        count: deletedSingleCount + galleryResult.totalSmallImagesRemoved,
        deletedSingleCount,
        galleryResult,
        durationMs: totalDuration,
        message: finalMessage,
      });
    }

    // 1.2 Quét hoặc Lọc chuyên sâu ảnh nhỏ / ảnh hỏng bên trong Album (Gallery)
    if (action === "SCAN_GALLERY_SMALL_IMAGES" || action === "CLEAN_GALLERY_SMALL_IMAGES") {
      const minSize = Math.max(100, Math.min(2000, Number(threshold) || 400));
      const isDryRun = action === "SCAN_GALLERY_SMALL_IMAGES";
      const galleryResult = await processGalleriesSmallImages(minSize, isDryRun);

      return NextResponse.json({
        success: true,
        action,
        threshold: minSize,
        ...galleryResult,
        message: isDryRun
          ? `Quét xong ${galleryResult.totalGalleriesScanned} album (${galleryResult.totalImagesChecked} ảnh) trong ${(galleryResult.durationMs / 1000).toFixed(1)}s: Phát hiện ${galleryResult.totalSmallImagesRemoved} ảnh nhỏ/lỗi trong ${galleryResult.affectedGalleries.length} album.`
          : `Đã loại bỏ ${galleryResult.totalSmallImagesRemoved} ảnh nhỏ trong ${galleryResult.galleriesUpdatedCount} album${
              galleryResult.galleriesDeletedCount > 0 ? ` (đã xóa ${galleryResult.galleriesDeletedCount} album rỗng)` : ""
            } chỉ trong ${(galleryResult.durationMs / 1000).toFixed(1)}s!`,
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

    // 3. Quét kiểm tra trạng thái HTTP của các link video (Phát hiện video chết / 404 / hết hạn) song song 40 luồng trên toàn bộ hệ thống
    if (action === "SCAN_UNPLAYABLE_VIDEOS") {
      const startTime = Date.now();
      const scanAll = body.scanAll !== false;
      const limit = Number(body.limit);

      const videos = await prisma.mediaItem.findMany({
        where: { type: "VIDEO" },
        ...(scanAll || !limit ? {} : { take: Math.min(10000, limit) }),
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, mediaUrl: true, storageMode: true, localPath: true },
      });

      const unplayable: Array<{ id: string; title: string | null; mediaUrl: string; reason: string }> = [];

      // Chạy kiểm tra video song song 40 luồng đồng thời
      await pMap(videos, 40, async (v) => {
        const check = await checkVideoPlayable(v);
        if (check.unplayable) {
          unplayable.push({
            id: v.id,
            title: v.title,
            mediaUrl: v.mediaUrl,
            reason: check.reason || "Không thể phát video",
          });
        }
      });

      const durationMs = Date.now() - startTime;

      return NextResponse.json({
        success: true,
        scannedCount: videos.length,
        unplayableCount: unplayable.length,
        unplayableItems: unplayable,
        durationMs,
      });
    }

    return NextResponse.json({ error: "Hành động (action) không hợp lệ" }, { status: 400 });
  } catch (err: any) {
    console.error("[CLEANUP_POST_ERROR]", err);
    return NextResponse.json({ error: err.message || "Lỗi xử lý dọn dẹp" }, { status: 500 });
  }
}
