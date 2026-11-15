"use client";

import { useState } from "react";
import { Tag as TagIcon, ExternalLink } from "lucide-react";

interface TagOverlayProps {
  title?: string | null;
  tags: string[];
  activeTag: string | null;
  onSelectTag: (tag: string | null) => void;
  onOpenTagDrawer: () => void;
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
}: TagOverlayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="absolute left-0 bottom-14 sm:bottom-16 right-16 p-3 sm:p-4 pb-1 sm:pb-1.5 pointer-events-none z-20 flex flex-col justify-end max-w-xl">
      {/* Tiêu đề & Hyperlinks nếu có */}
      {title && (
        <div className="text-white text-xs sm:text-sm font-medium mb-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] pointer-events-auto leading-relaxed">
          <div
            className={
              isExpanded
                ? "whitespace-pre-line max-h-48 overflow-y-auto no-scrollbar bg-black/60 p-2.5 rounded-xl backdrop-blur-md border border-white/15"
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
              className="text-neutral-200 hover:text-white text-[11px] font-semibold mt-1 underline underline-offset-2 inline-block bg-black/50 px-2 py-0.5 rounded backdrop-blur-sm border border-white/10"
            >
              {isExpanded ? "Thu gọn ▲" : "Xem thêm ▼"}
            </button>
          )}
        </div>
      )}

      {/* Danh sách Tags */}
      <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => onSelectTag(tag === activeTag ? null : tag)}
            className={`px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md transition shadow ${
              activeTag?.toLowerCase() === tag.toLowerCase()
                ? "bg-white text-black font-bold scale-105"
                : "bg-black/50 text-white hover:bg-black/70 border border-white/20"
            }`}
          >
            #{tag}
          </button>
        ))}

        {/* Nút mở danh sách toàn bộ tag */}
        <button
          onClick={onOpenTagDrawer}
          title="Xem tất cả tag"
          className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white backdrop-blur-md border border-white/20 transition shadow"
        >
          <TagIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
