export interface ExtractedTubeMedia {
  title?: string;
  thumbnailUrl?: string;
  duration?: number;
  videoUrl: string;
  quality: string;
  format: string;
  allStreams: Array<{
    format: string;
    quality: string;
    videoUrl: string;
    isHls: boolean;
  }>;
}

/**
 * Trích xuất khối JSON lồng nhau chuẩn xác bằng kỹ thuật quét ngoặc nhọn,
 * tránh trường hợp regex non-greedy bị dừng sớm ở các object con bên trong.
 */
function extractJsonObject(text: string, startIndex: number): string | null {
  let braceCount = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        braceCount++;
      } else if (char === "}") {
        braceCount--;
        if (braceCount === 0) {
          return text.substring(startIndex, i + 1);
        }
      }
    }
  }
  return null;
}

/**
 * Trích xuất mảng JSON lồng nhau [...]
 */
function extractJsonArray(text: string, startIndex: number): string | null {
  let bracketCount = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === "[") {
        bracketCount++;
      } else if (char === "]") {
        bracketCount--;
        if (bracketCount === 0) {
          return text.substring(startIndex, i + 1);
        }
      }
    }
  }
  return null;
}

/**
 * Phân tích mã nguồn HTML / script hoặc chuỗi cấu hình player flashvars
 * phổ biến trên các nền tảng video lớn (Pornhub, RedTube, YouPorn, Tube8...)
 */
export function extractTubeMediaFromText(text: string): ExtractedTubeMedia | null {
  if (!text || typeof text !== "string") return null;

  let jsonStr: string | null = null;

  // 1. Quét tìm biến flashvars: var flashvars_12345 = {...} hoặc window.flashvars = {...}
  const fvIndex = text.search(/(?:var\s+|window\.)?flashvars(?:_\d+)?\s*=/i);
  if (fvIndex !== -1) {
    const openBrace = text.indexOf("{", fvIndex);
    if (openBrace !== -1) {
      jsonStr = extractJsonObject(text, openBrace);
    }
  }

  // 2. Dự phòng: Quét trực tiếp thuộc tính mediaDefinitions
  if (!jsonStr) {
    const mdIndex = text.indexOf('"mediaDefinitions"');
    if (mdIndex !== -1) {
      const colon = text.indexOf(":", mdIndex);
      if (colon !== -1) {
        const openBracket = text.indexOf("[", colon);
        if (openBracket !== -1) {
          const arrStr = extractJsonArray(text, openBracket);
          if (arrStr) {
            jsonStr = `{"mediaDefinitions":${arrStr}}`;
          }
        }
      }
    }
  }

  if (!jsonStr) return null;

  try {
    const data = JSON.parse(jsonStr);
    const mediaDefs = Array.isArray(data.mediaDefinitions) ? data.mediaDefinitions : [];
    if (mediaDefs.length === 0) return null;

    const qualityWeight = (q: any) => {
      const n = parseInt(q, 10);
      return isNaN(n) ? 0 : n;
    };

    const validStreams = mediaDefs
      .filter((d: any) => d && d.videoUrl && typeof d.videoUrl === "string" && d.videoUrl.trim().length > 0)
      .map((d: any) => {
        let cleanUrl = d.videoUrl.trim();
        // Unescape ký tự slash nếu còn sót (\/ -> /)
        cleanUrl = cleanUrl.replace(/\\\//g, "/").replace(/\\u002F/gi, "/");
        const qStr = Array.isArray(d.quality) ? d.quality.join(",") : String(d.quality || "");
        const isHls = String(d.format).toLowerCase() === "hls" || cleanUrl.includes(".m3u8");
        return {
          format: String(d.format || "").toLowerCase(),
          quality: qStr,
          qualityNum: qualityWeight(d.quality),
          videoUrl: cleanUrl,
          isHls,
        };
      });

    if (validStreams.length === 0) return null;

    // Sắp xếp ưu tiên:
    // 1. Luồng HLS (.m3u8) phân giải cao nhất (1080p -> 720p -> 480p...)
    // 2. Luồng MP4 phân giải cao nhất
    validStreams.sort((a: (typeof validStreams)[number], b: (typeof validStreams)[number]) => {
      if (a.isHls && !b.isHls) return -1;
      if (!a.isHls && b.isHls) return 1;
      return b.qualityNum - a.qualityNum;
    });

    const bestStream = validStreams[0];
    let thumbUrl = data.image_url
      ? String(data.image_url).replace(/\\\//g, "/").replace(/\\u002F/gi, "/")
      : undefined;
    let title = data.video_title ? String(data.video_title).trim() : undefined;
    let duration = typeof data.video_duration === "number" ? data.video_duration : undefined;

    return {
      title,
      thumbnailUrl: thumbUrl,
      duration,
      videoUrl: bestStream.videoUrl,
      quality: bestStream.quality,
      format: bestStream.format,
      allStreams: validStreams,
    };
  } catch {
    return null;
  }
}
