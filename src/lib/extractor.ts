import { scrapeSingleWebUrl } from "./webScraper";

export interface ExtractedMedia {
  sourceType: "X_TWITTER" | "TIKTOK" | "INSTAGRAM" | "YOUTUBE" | "DIRECT_LINK";
  type: "IMAGE" | "VIDEO";
  mediaUrl: string;
  thumbnailUrl?: string;
  title?: string;
  isLandscape?: boolean;
  aspectRatio?: number;
  allMedia?: Array<{
    type: "IMAGE" | "VIDEO";
    mediaUrl: string;
    thumbnailUrl?: string;
  }>;
}

// 1. Phân tích link X / Twitter
async function extractTwitterMedia(url: string): Promise<ExtractedMedia | null> {
  try {
    // Chuẩn hóa link: lấy status ID
    const match = url.match(/(?:twitter|x)\.com\/([a-zA-Z0-9_]+)\/status\/([0-9]+)/i);
    if (!match) return null;

    const username = match[1];
    const statusId = match[2];

    // Gọi API của vxTwitter / FixupX
    const apiUrl = `https://api.vxtwitter.com/${username}/status/${statusId}`;
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      // Thử fallback sang FixupX API
      const fallbackUrl = `https://api.fxtwitter.com/${username}/status/${statusId}`;
      const fallbackRes = await fetch(fallbackUrl);
      if (!fallbackRes.ok) return null;
      const data = await fallbackRes.json();
      return parseFxTwitterResponse(data);
    }

    const data = await res.json();
    return parseVxTwitterResponse(data);
  } catch (err) {
    console.error("[EXTRACTOR] Error extracting Twitter media:", err);
    return null;
  }
}

function parseVxTwitterResponse(data: any): ExtractedMedia | null {
  const mediaList: Array<{ type: "IMAGE" | "VIDEO"; mediaUrl: string; thumbnailUrl?: string }> = [];

  if (data.media_extended && Array.isArray(data.media_extended)) {
    for (const item of data.media_extended) {
      if (item.type === "video" || item.type === "gif") {
        mediaList.push({
          type: "VIDEO",
          mediaUrl: item.url,
          thumbnailUrl: item.thumbnail_url || data.mediaURLs?.[0],
        });
      } else if (item.type === "image") {
        mediaList.push({
          type: "IMAGE",
          mediaUrl: item.url,
          thumbnailUrl: item.url,
        });
      }
    }
  } else if (data.mediaURLs && Array.isArray(data.mediaURLs)) {
    for (const mUrl of data.mediaURLs) {
      const isVideo = mUrl.includes(".mp4") || mUrl.includes("video.twimg.com");
      mediaList.push({
        type: isVideo ? "VIDEO" : "IMAGE",
        mediaUrl: mUrl,
        thumbnailUrl: mUrl,
      });
    }
  }

  if (mediaList.length === 0) return null;

  const first = mediaList[0];
  return {
    sourceType: "X_TWITTER",
    type: first.type,
    mediaUrl: first.mediaUrl,
    thumbnailUrl: first.thumbnailUrl,
    title: data.text || undefined,
    allMedia: mediaList,
  };
}

function parseFxTwitterResponse(data: any): ExtractedMedia | null {
  const tweet = data.tweet;
  if (!tweet || !tweet.media) return null;

  const mediaList: Array<{ type: "IMAGE" | "VIDEO"; mediaUrl: string; thumbnailUrl?: string }> = [];

  if (tweet.media.videos && tweet.media.videos.length > 0) {
    for (const v of tweet.media.videos) {
      mediaList.push({
        type: "VIDEO",
        mediaUrl: v.url,
        thumbnailUrl: v.thumbnail_url,
      });
    }
  }

  if (tweet.media.photos && tweet.media.photos.length > 0) {
    for (const p of tweet.media.photos) {
      mediaList.push({
        type: "IMAGE",
        mediaUrl: p.url,
        thumbnailUrl: p.url,
      });
    }
  }

  if (mediaList.length === 0) return null;

  const first = mediaList[0];
  return {
    sourceType: "X_TWITTER",
    type: first.type,
    mediaUrl: first.mediaUrl,
    thumbnailUrl: first.thumbnailUrl,
    title: tweet.text || undefined,
    allMedia: mediaList,
  };
}

// 2. Phân tích link TikTok
async function extractTikTokMedia(url: string): Promise<ExtractedMedia | null> {
  try {
    const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 0 || !data.data) return null;

    const playUrl = data.data.play || data.data.wmplay;
    if (!playUrl) return null;

    return {
      sourceType: "TIKTOK",
      type: "VIDEO",
      mediaUrl: playUrl,
      thumbnailUrl: data.data.cover,
      title: data.data.title,
      isLandscape: (data.data.width || 0) > (data.data.height || 0),
    };
  } catch (err) {
    console.error("[EXTRACTOR] Error extracting TikTok:", err);
    return null;
  }
}

// 3. Phân tích link trực tiếp (Direct image/video URL)
function extractDirectMedia(url: string): ExtractedMedia | null {
  const cleanUrl = url.split("?")[0].toLowerCase();
  const videoExts = [".mp4", ".webm", ".mov", ".m4v", ".ogv"];
  const imageExts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg"];

  if (videoExts.some((ext) => cleanUrl.endsWith(ext))) {
    return {
      sourceType: "DIRECT_LINK",
      type: "VIDEO",
      mediaUrl: url,
      thumbnailUrl: undefined,
    };
  }

  if (imageExts.some((ext) => cleanUrl.endsWith(ext))) {
    return {
      sourceType: "DIRECT_LINK",
      type: "IMAGE",
      mediaUrl: url,
      thumbnailUrl: url,
    };
  }

  return null;
}

// Hàm điều phối chính
export async function extractMediaFromUrl(rawUrl: string): Promise<ExtractedMedia | null> {
  const url = rawUrl.trim();
  if (!url) return null;

  // 1. Kiểm tra nếu là link Twitter / X
  if (/twitter\.com|x\.com/i.test(url)) {
    const res = await extractTwitterMedia(url);
    if (res) return res;
  }

  // 2. Kiểm tra nếu là link TikTok
  if (/tiktok\.com/i.test(url)) {
    const res = await extractTikTokMedia(url);
    if (res) return res;
  }

  // 3. Kiểm tra link file trực tiếp
  const direct = extractDirectMedia(url);
  if (direct) return direct;

  // 4. Nếu là trang web bất kỳ (blog, video tube, báo chí, diễn đàn...), dùng webScraper để trích xuất media thật
  try {
    const scraped = await scrapeSingleWebUrl(url);
    if (scraped.items && scraped.items.length > 0) {
      // Ưu tiên video nếu có
      const firstVideo = scraped.items.find((i) => i.type === "VIDEO");
      if (firstVideo) {
        return {
          sourceType: "DIRECT_LINK",
          type: "VIDEO",
          mediaUrl: firstVideo.url,
          thumbnailUrl: firstVideo.thumbnailUrl,
          title: scraped.title,
          allMedia: scraped.items.map((i) => ({
            type: i.type,
            mediaUrl: i.url,
            thumbnailUrl: i.thumbnailUrl,
          })),
        };
      }

      // Nếu không có video thì lấy ảnh đầu tiên
      const firstImage = scraped.items[0];
      return {
        sourceType: "DIRECT_LINK",
        type: "IMAGE",
        mediaUrl: firstImage.url,
        thumbnailUrl: firstImage.thumbnailUrl || firstImage.url,
        title: scraped.title,
        allMedia: scraped.items.map((i) => ({
          type: i.type,
          mediaUrl: i.url,
          thumbnailUrl: i.thumbnailUrl,
        })),
      };
    }
  } catch (err) {
    console.warn("[EXTRACTOR] Fallback scrape failed:", err);
  }

  // 5. Fallback cuối cùng
  return {
    sourceType: "DIRECT_LINK",
    type: url.includes(".mp4") || url.includes("video") ? "VIDEO" : "IMAGE",
    mediaUrl: url,
    thumbnailUrl: url,
  };
}
