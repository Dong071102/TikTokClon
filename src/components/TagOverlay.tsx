"use client";

import { Tag as TagIcon, X } from "lucide-react";

interface TagOverlayProps {
  title?: string | null;
  tags: string[];
  activeTag: string | null;
  onSelectTag: (tag: string | null) => void;
  onOpenTagDrawer: () => void;
}

export default function TagOverlay({
  title,
  tags,
  activeTag,
  onSelectTag,
  onOpenTagDrawer,
}: TagOverlayProps) {
  return (
    <div className="absolute left-0 bottom-0 right-16 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none z-20 flex flex-col justify-end">
      {/* Tiêu đề nếu có */}
      {title && (
        <p className="text-white text-sm font-medium line-clamp-2 mb-2 drop-shadow-md pointer-events-auto">
          {title}
        </p>
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
                : "bg-white/20 text-white hover:bg-white/30"
            }`}
          >
            #{tag}
          </button>
        ))}

        {/* Nút mở danh sách toàn bộ tag */}
        <button
          onClick={onOpenTagDrawer}
          title="Xem tất cả tag"
          className="p-1.5 rounded-full bg-white/10 hover:bg-white/25 text-white/80 hover:text-white backdrop-blur-md transition"
        >
          <TagIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
