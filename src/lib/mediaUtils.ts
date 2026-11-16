/**
 * Tiện ích hỗ trợ tính toán, định dạng và xác thực Media (Video & Hình ảnh)
 */

// Định dạng thời lượng (giây -> mm:ss hoặc hh:mm:ss)
export function formatDuration(seconds?: number | null): string {
  if (seconds == null || isNaN(seconds) || seconds < 0) return "00:00";
  const sec = Math.floor(seconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  const mm = m < 10 ? `0${m}` : `${m}`;
  const ss = s < 10 ? `0${s}` : `${s}`;

  if (h > 0) {
    const hh = h < 10 ? `0${h}` : `${h}`;
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

// Phân loại chất lượng theo độ phân giải pixel
export function getQualityTag(width?: number | null, height?: number | null): string {
  if (!width || !height || width <= 0 || height <= 0) return "Standard";
  const maxDim = Math.max(width, height);
  const minDim = Math.min(width, height);

  if (maxDim >= 3840 || (width >= 3840 && height >= 2160)) return "4K UHD";
  if (maxDim >= 2560 || (width >= 2560 && height >= 1440)) return "2K QHD";
  if (maxDim >= 1920 && minDim >= 1080) return "Full HD";
  if (maxDim >= 1280 && minDim >= 720) return "HD (720p)";
  if (maxDim <= 400 && minDim <= 400) return "Thumbnail / Nhỏ";
  return "SD";
}

// Định dạng độ phân giải kèm tỉ lệ
export function formatResolutionText(width?: number | null, height?: number | null): string {
  if (!width || !height) return "Chưa xác định";
  const tag = getQualityTag(width, height);
  const isLandscape = width > height;
  const orientation = isLandscape ? "Ngang" : width === height ? "Vuông" : "Dọc";
  return `${width} × ${height} (${tag} • ${orientation})`;
}

// Định dạng dung lượng file (bytes -> KB, MB, GB)
export function formatFileSize(bytes?: number | null): string {
  if (bytes == null || isNaN(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
