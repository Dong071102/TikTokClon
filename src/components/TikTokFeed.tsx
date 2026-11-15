"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import VideoPlayer from "./VideoPlayer";
import ImageViewer from "./ImageViewer";
import TagOverlay from "./TagOverlay";
import { Tag as TagIcon, X, Loader2, Lock, Heart } from "lucide-react";
import Link from "next/link";

interface MediaItem {
  id: string;
  type: "IMAGE" | "VIDEO";
  mediaUrl: string;
  thumbnailUrl?: string;
  title?: string;
  isLandscape?: boolean;
  defaultRotate?: number;
  tags: string[];
}

interface TagItem {
  id: string;
  name: string;
  slug: string;
  count: number;
}

export default function TikTokFeed() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [isTagDrawerOpen, setIsTagDrawerOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Đọc danh sách Yêu thích từ LocalStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("tiktok_clone_favorites");
      if (stored) {
        setFavorites(JSON.parse(stored));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Chuyển đổi Yêu thích (Favorite / Bookmark)
  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      try {
        localStorage.setItem("tiktok_clone_favorites", JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  // Tải danh sách media
  const loadMedia = useCallback(
    async (
      tag: string | null = null,
      favOnly = false,
      favList: string[] = [],
      cursor: string | null = null,
      append = false
    ) => {
      // Nếu lọc mục yêu thích mà danh sách rỗng
      if (favOnly && favList.length === 0) {
        setItems([]);
        setNextCursor(null);
        return;
      }

      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "15");
        if (tag) params.set("tag", tag);
        if (favOnly && favList.length > 0) {
          params.set("ids", favList.join(","));
        }
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(`/api/feed?${params.toString()}`);
        if (!res.ok) throw new Error("Lỗi tải dữ liệu feed");
        const data = await res.json();

        if (append) {
          setItems((prev) => [...prev, ...data.items]);
        } else {
          setItems(data.items);
          setActiveIndex(0);
          if (containerRef.current) {
            containerRef.current.scrollTop = 0;
          }
        }
        setNextCursor(data.nextCursor);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Tải danh sách tags
  const loadTags = async () => {
    try {
      const res = await fetch("/api/tags");
      if (res.ok) {
        const data = await res.json();
        setAllTags(data.tags || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadMedia(activeTag, showFavoritesOnly, favorites);
    loadTags();
  }, [activeTag, showFavoritesOnly, favorites, loadMedia]);

  // Intersection Observer để xác định bài viết đang hiển thị trên màn hình
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute("data-index"));
            if (!isNaN(index)) {
              setActiveIndex(index);

              // Tải thêm trang tiếp theo khi gần chạm đáy
              if (index >= items.length - 3 && nextCursor && !isLoading) {
                loadMedia(activeTag, showFavoritesOnly, favorites, nextCursor, true);
              }
            }
          }
        });
      },
      {
        root: container,
        threshold: 0.6,
      }
    );

    itemRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [items, nextCursor, isLoading, activeTag, showFavoritesOnly, favorites, loadMedia]);

  // Phím tắt bàn phím (Mũi tên lên/xuống, phím M mute)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(activeIndex + 1, items.length - 1);
        itemRefs.current[next]?.scrollIntoView({ behavior: "smooth" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(activeIndex - 1, 0);
        itemRefs.current[prev]?.scrollIntoView({ behavior: "smooth" });
      } else if (e.key.toLowerCase() === "m") {
        setIsMuted((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, items.length]);

  return (
    <div className="relative w-full h-[100dvh] bg-black text-white overflow-hidden select-none">
      {/* Top Bar: Bộ lọc Tag, Nút Yêu thích & Nút mở Admin */}
      <header className="absolute top-0 left-0 right-0 p-4 z-40 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/30 to-transparent pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Tag filter badge */}
          {activeTag && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white text-xs sm:text-sm font-semibold border border-white/20">
              <span>#{activeTag}</span>
              <button
                onClick={() => setActiveTag(null)}
                className="hover:bg-white/20 rounded-full p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Nút mở danh sách chủ đề */}
          <button
            onClick={() => setIsTagDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-xs sm:text-sm font-medium transition border border-white/15"
          >
            <TagIcon className="w-3.5 h-3.5" />
            <span>Chủ đề</span>
          </button>

          {/* Nút Mục Yêu Thích */}
          <button
            onClick={() => {
              setShowFavoritesOnly((prev) => !prev);
              setActiveTag(null);
            }}
            title="Lọc các bài viết đã yêu thích"
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full backdrop-blur-md text-xs sm:text-sm font-semibold transition border ${
              showFavoritesOnly
                ? "bg-red-600 border-red-500 text-white shadow-lg shadow-red-600/30"
                : "bg-white/10 hover:bg-white/20 border-white/15 text-white"
            }`}
          >
            <Heart
              className={`w-3.5 h-3.5 ${showFavoritesOnly ? "fill-white" : "text-red-400"}`}
            />
            <span>Yêu thích ({favorites.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <Link
            href="/admin"
            title="Trang quản trị Admin"
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white/80 hover:text-white transition"
          >
            <Lock className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Main Container với Scroll Snap dọc */}
      <main
        ref={containerRef}
        className="w-full h-full overflow-y-scroll snap-y-mandatory no-scrollbar"
      >
        {items.length === 0 && !isLoading && (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-white/70">
            {showFavoritesOnly ? (
              <>
                <div className="p-4 rounded-full bg-red-500/10 text-red-400 mb-3">
                  <Heart className="w-10 h-10" />
                </div>
                <p className="text-lg font-medium mb-2">Chưa có bài viết yêu thích nào.</p>
                <p className="text-sm text-white/40 mb-4 max-w-xs">
                  Hãy nhấn biểu tượng trái tim ❤️ ở bên phải màn hình khi xem để lưu các video/ảnh bạn thích vào đây!
                </p>
                <button
                  onClick={() => setShowFavoritesOnly(false)}
                  className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white font-medium transition text-sm"
                >
                  Xem tất cả bài viết
                </button>
              </>
            ) : (
              <>
                <p className="text-lg font-medium mb-2">Chưa có bài viết hoặc video nào.</p>
                <p className="text-sm text-white/40 mb-4">
                  Vui lòng vào trang quản trị để thêm link từ X hoặc tải lên video/ảnh.
                </p>
                <Link
                  href="/admin"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition text-sm"
                >
                  Đến trang Admin
                </Link>
              </>
            )}
          </div>
        )}

        {items.map((item, idx) => (
          <div
            key={item.id}
            ref={(el) => {
              itemRefs.current[idx] = el;
            }}
            data-index={idx}
            className="w-full h-[100dvh] snap-start relative flex items-center justify-center bg-black overflow-hidden"
          >
            {item.type === "VIDEO" ? (
              <VideoPlayer
                src={item.mediaUrl}
                isActive={idx === activeIndex}
                isMuted={isMuted}
                toggleMute={() => setIsMuted((prev) => !prev)}
                defaultRotate={item.defaultRotate}
                isLandscape={item.isLandscape}
                isFavorite={favorites.includes(item.id)}
                onToggleFavorite={() => toggleFavorite(item.id)}
              />
            ) : (
              <ImageViewer
                src={item.mediaUrl}
                alt={item.title || "Image"}
                isActive={idx === activeIndex}
                isFavorite={favorites.includes(item.id)}
                onToggleFavorite={() => toggleFavorite(item.id)}
              />
            )}

            {/* Overlay hiển thị tags & title */}
            <TagOverlay
              title={item.title}
              tags={item.tags}
              activeTag={activeTag}
              onSelectTag={(tag) => {
                setShowFavoritesOnly(false);
                setActiveTag(tag);
              }}
              onOpenTagDrawer={() => setIsTagDrawerOpen(true)}
            />
          </div>
        ))}

        {isLoading && (
          <div className="w-full h-20 flex items-center justify-center text-white/50">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}
      </main>

      {/* Modal / Drawer Danh sách tất cả Tag */}
      {isTagDrawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setIsTagDrawerOpen(false)}
        >
          <div
            className="w-full max-w-md bg-neutral-900 border border-white/10 rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl max-h-[75vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <TagIcon className="w-5 h-5 text-blue-400" />
                <span>Khám phá theo Tag</span>
              </h3>
              <button
                onClick={() => setIsTagDrawerOpen(false)}
                className="p-1 rounded-full hover:bg-white/10 text-white/70 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar flex flex-wrap gap-2.5">
              <button
                onClick={() => {
                  setActiveTag(null);
                  setShowFavoritesOnly(false);
                  setIsTagDrawerOpen(false);
                }}
                className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition ${
                  activeTag === null && !showFavoritesOnly
                    ? "bg-white text-black font-bold"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                Tất cả bài viết
              </button>

              <button
                onClick={() => {
                  setShowFavoritesOnly(true);
                  setActiveTag(null);
                  setIsTagDrawerOpen(false);
                }}
                className={`px-3.5 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 transition ${
                  showFavoritesOnly
                    ? "bg-red-600 text-white font-bold"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                <Heart className="w-3.5 h-3.5 fill-current" />
                <span>Mục yêu thích ({favorites.length})</span>
              </button>

              {allTags.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTag(t.slug);
                    setShowFavoritesOnly(false);
                    setIsTagDrawerOpen(false);
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 transition ${
                    activeTag === t.slug && !showFavoritesOnly
                      ? "bg-blue-600 text-white font-bold"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  <span>#{t.name}</span>
                  <span className="text-xs opacity-60">({t.count})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
