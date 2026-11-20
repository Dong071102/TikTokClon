"use client";

import { useState } from "react";
import { Tag as TagIcon, ExternalLink, Layers } from "lucide-react";

interface TagOverlayProps {
  title?: string | null;
  tags: string[];
  activeTag: string | null;
  onSelectTag: (tag: string | null) => void;
  onOpenTagDrawer: () => void;
  isFromGallery?: boolean;
  galleryIndex?: number;
  galleryTotal?: number;
  onOpenFullGallery?: () => void;
}

// Hàm phân tích và chuyển đổi URL thành Hyperlink có thể nhấp trực tiếp
function renderTextWithLinks(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={`Mở liên kết: ${part}`}
          className="text-blue-400 hover:text-blue-300 hover:underline underline-offset-2 break-all font-semibold inline-flex items-center gap-0.5 mx-0.5 pointer-events-auto bg-blue-500/10 px-1 py-0.5 rounded border border-blue-400/20"
        >
          <span>{part}</span>
          <ExternalLink className="w-3 h-3 inline-block shrink-0" />
        </a>
      );
    }
    return part;
  });
}

export default function TagOverlay({
  title,
  tags,
  activeTag,
  onSelectTag,
  onOpenTagDrawer,
  isFromGallery,
  galleryIndex,
  galleryTotal,
  onOpenFullGallery,
}: TagOverlayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="absolute left-0 bottom-0 right-14 sm:right-16 pt-20 pb-8 px-4 sm:px-5 pointer-events-none z-20 flex flex-col justify-end max-w-xl bg-gradient-to-t from-black/85 via-black/35 to-transparent">
      {/* Huy hiệu nếu ảnh thuộc Album / Gallery được trộn */}
      {isFromGallery && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-white text-[11px] font-medium mb-2.5 shadow-sm border border-white/15 w-fit pointer-events-auto">
          <Layers className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-semibold">Album</span>
          <span className="text-white/60">•</span>
          <span>{galleryIndex && galleryTotal ? `Ảnh ${galleryIndex}/${galleryTotal}` : "Từ Album"}</span>
          {onOpenFullGallery && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenFullGallery();
              }}
              className="ml-1 text-sky-400 hover:text-sky-300 font-semibold underline underline-offset-2 transition"
            >
              Xem cả album
            </button>
          )}
        </div>
      )}

      {/* Tiêu đề & Hyperlinks nếu có */}
      {title && (
        <div className="text-white text-xs sm:text-sm font-medium mb-2.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] pointer-events-auto leading-relaxed">
          <div
            className={
              isExpanded
                ? "whitespace-pre-line max-h-56 overflow-y-auto no-scrollbar bg-black/75 p-3 rounded-2xl backdrop-blur-xl border border-white/15 shadow-xl"
                : "line-clamp-2"
            }
          >
            {renderTextWithLinks(title)}
          </div>

          {(title.length > 80 || title.includes("\n")) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
              className="text-neutral-300 hover:text-white text-[11px] font-semibold mt-1.5 inline-flex items-center gap-1 bg-black/40 hover:bg-black/60 px-2.5 py-0.5 rounded-full backdrop-blur-md border border-white/10 transition"
            >
              {isExpanded ? "Thu gọn ▲" : "Xem thêm ▼"}
            </button>
          )}
        </div>
      )}

      {/* Danh sách Tags */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pointer-events-auto">
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => onSelectTag(tag === activeTag ? null : tag)}
            className={`px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md transition-all active:scale-95 shadow-sm ${
              activeTag?.toLowerCase() === tag.toLowerCase()
                ? "bg-white text-black font-bold shadow-md"
                : "bg-black/40 text-neutral-200 hover:text-white hover:bg-black/60 border border-white/15"
            }`}
          >
            #{tag}
          </button>
        ))}

        {/* Nút mở danh sách toàn bộ tag */}
        <button
          onClick={onOpenTagDrawer}
          title="Xem tất cả tag"
          className="p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-neutral-300 hover:text-white backdrop-blur-md border border-white/15 transition active:scale-95 shadow-sm"
        >
          <TagIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
