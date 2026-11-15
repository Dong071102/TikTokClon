"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import VideoPlayer from "./VideoPlayer";
import ImageViewer from "./ImageViewer";
import TagOverlay from "./TagOverlay";
import {
  Tag as TagIcon,
  X,
  Loader2,
  Lock,
  Heart,
  Shuffle,
  Calendar,
  SlidersHorizontal,
  Clock,
  Sparkles,
  RotateCcw,
  Menu,
  ChevronRight,
} from "lucide-react";
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
  createdAt?: string;
  feedKey?: string; // Khóa duy nhất cho infinite loop
}

interface TagItem {
  id: string;
  name: string;
  slug: string;
  count: number;
}

export default function TikTokFeed() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [basePool, setBasePool] = useState<MediaItem[]>([]); // Lưu pool gốc để loop vô tận
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Bộ lọc Sắp xếp & Thời gian
  const [sortMode, setSortMode] = useState<"random" | "newest" | "oldest">("random");
  const [datePreset, setDatePreset] = useState<"all" | "today" | "7days" | "30days" | "custom">("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

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

  // Chuyển đổi Yêu thích (Favorite)
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

  // Hàm tạo feedKey duy nhất để lặp vô tận không bị trùng React Key
  const attachFeedKeys = (list: MediaItem[]): MediaItem[] => {
    return list.map((item) => ({
      ...item,
      feedKey: `${item.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    }));
  };

  // Tải danh sách media từ API
  const loadMedia = useCallback(
    async (
      tag: string | null = null,
      favOnly = false,
      favList: string[] = [],
      sort: "random" | "newest" | "oldest" = "random",
      sDate = "",
      eDate = "",
      cursor: string | null = null,
      append = false
    ) => {
      // Nếu đang lọc mục yêu thích mà danh sách rỗng
      if (favOnly && favList.length === 0) {
        setItems([]);
        setBasePool([]);
        setNextCursor(null);
        return;
      }

      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "12");
        params.set("sort", sort);
        if (tag) params.set("tag", tag);
        if (favOnly && favList.length > 0) params.set("ids", favList.join(","));
        if (sDate) params.set("startDate", sDate);
        if (eDate) params.set("endDate", eDate);
        if (cursor && cursor !== "random-infinite") params.set("cursor", cursor);

        const res = await fetch(`/api/feed?${params.toString()}`);
        if (!res.ok) throw new Error("Lỗi tải dữ liệu feed");
        const data = await res.json();

        const newItemsWithKeys = attachFeedKeys(data.items || []);

        if (append) {
          setItems((prev) => [...prev, ...newItemsWithKeys]);
          setBasePool((prev) => [...prev, ...(data.items || [])]);
        } else {
          setItems(newItemsWithKeys);
          setBasePool(data.items || []);
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

  // Tải lại khi thay đổi bộ lọc
  useEffect(() => {
    loadMedia(activeTag, showFavoritesOnly, favorites, sortMode, startDate, endDate);
    loadTags();
  }, [activeTag, showFavoritesOnly, favorites, sortMode, startDate, endDate, loadMedia]);

  // Cuộn vô tận không bao giờ hết (Endless Infinite Scroll / Loop):
  // Khi cuộn gần đến cuối danh sách (còn 2-3 bài), tự động nạp tiếp hoặc loop lại
  const handleInfiniteTrigger = useCallback(() => {
    if (isLoading || items.length === 0) return;

    // Trường hợp 1: Còn cursor tiếp theo hoặc đang ở chế độ random
    if (nextCursor) {
      loadMedia(activeTag, showFavoritesOnly, favorites, sortMode, startDate, endDate, nextCursor, true);
      return;
    }

    // Trường hợp 2: Đã tải hết database (nextCursor === null)
    // -> Loop lại danh sách từ basePool để người dùng cuộn mãi không bao giờ bị dừng!
    if (basePool.length > 0) {
      const loopedItems = sortMode === "random"
        ? [...basePool].sort(() => Math.random() - 0.5)
        : [...basePool];
      const withNewKeys = attachFeedKeys(loopedItems);
      setItems((prev) => [...prev, ...withNewKeys]);
    }
  }, [isLoading, items.length, nextCursor, basePool, sortMode, activeTag, showFavoritesOnly, favorites, startDate, endDate, loadMedia]);

  // Intersection Observer theo dõi vị trí bài viết đang xem
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

              // Kích hoạt nạp thêm bài khi còn cách đáy 3 bài
              if (index >= items.length - 3) {
                handleInfiniteTrigger();
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
  }, [items, handleInfiniteTrigger]);

  // Xử lý chọn Preset ngày
  const handleSelectDatePreset = (preset: "all" | "today" | "7days" | "30days") => {
    setDatePreset(preset);
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    if (preset === "all") {
      setStartDate("");
      setEndDate("");
    } else if (preset === "today") {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "7days") {
      const past = new Date();
      past.setDate(past.getDate() - 7);
      setStartDate(past.toISOString().split("T")[0]);
      setEndDate(todayStr);
    } else if (preset === "30days") {
      const past = new Date();
      past.setDate(past.getDate() - 30);
      setStartDate(past.toISOString().split("T")[0]);
      setEndDate(todayStr);
    }
  };

  // Đặt lại toàn bộ bộ lọc
  const handleResetAllFilters = () => {
    setActiveTag(null);
    setShowFavoritesOnly(false);
    setSortMode("random");
    setDatePreset("all");
    setStartDate("");
    setEndDate("");
  };

  // Kiểm tra xem có bộ lọc nào đang được kích hoạt không
  const hasActiveFilter = Boolean(
    activeTag || showFavoritesOnly || startDate || endDate || sortMode !== "random"
  );

  // Phím tắt bàn phím
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
      {/* Top Bar Tối Giản: Huy hiệu bộ lọc đang bật (nếu có) + 1 Nút Menu duy nhất */}
      <header className="absolute top-0 left-0 right-0 p-3 sm:p-4 z-40 flex items-center justify-between bg-gradient-to-b from-black/85 via-black/40 to-transparent pointer-events-none gap-2">
        {/* Vùng hiển thị tag / bộ lọc đang kích hoạt để người dùng nắm rõ */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto flex-wrap">
          {activeTag && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-600/90 backdrop-blur-md text-white text-xs font-semibold border border-blue-400/40 shadow">
              <span>#{activeTag}</span>
              <button
                onClick={() => setActiveTag(null)}
                className="hover:bg-white/20 rounded-full p-0.5 transition"
                title="Bỏ lọc tag này"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {showFavoritesOnly && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-600/90 backdrop-blur-md text-white text-xs font-semibold border border-red-400/40 shadow">
              <Heart className="w-3.5 h-3.5 fill-current" />
              <span>Yêu thích ({favorites.length})</span>
              <button
                onClick={() => setShowFavoritesOnly(false)}
                className="hover:bg-white/20 rounded-full p-0.5 transition"
                title="Bỏ xem yêu thích"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {(startDate || endDate) && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-600/90 backdrop-blur-md text-white text-xs font-semibold border border-amber-400/40 shadow">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {datePreset === "today"
                  ? "Hôm nay"
                  : datePreset === "7days"
                  ? "7 ngày qua"
                  : datePreset === "30days"
                  ? "30 ngày qua"
                  : `${startDate || "..."} → ${endDate || "..."}`}
              </span>
              <button
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                  setDatePreset("all");
                }}
                className="hover:bg-white/20 rounded-full p-0.5 transition"
                title="Bỏ lọc ngày"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {sortMode !== "random" && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-800/90 backdrop-blur-md text-neutral-300 text-xs font-medium border border-neutral-700 shadow">
              {sortMode === "newest" ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span>Mới nhất</span>
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                  <span>Cũ nhất</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* 1 Ô NÚT MENU TỔNG HỢP DUY NHẤT */}
        <div className="flex items-center gap-2 pointer-events-auto ml-auto">
          <button
            onClick={() => setIsMenuOpen(true)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full backdrop-blur-md text-xs font-semibold transition active:scale-95 border shadow-lg ${
              hasActiveFilter
                ? "bg-neutral-900/90 border-blue-500/60 text-white hover:bg-neutral-800"
                : "bg-black/60 hover:bg-black/80 border-white/20 text-white"
            }`}
            title="Mở menu bộ lọc và tuỳ chọn"
          >
            <Menu className="w-4 h-4" />
            <span>Menu</span>
            {hasActiveFilter && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-0.5" />
            )}
          </button>
        </div>
      </header>

      {/* Main Container với Scroll Snap dọc 100dvh */}
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
                <p className="text-lg font-medium mb-2">Không tìm thấy bài viết hoặc video phù hợp.</p>
                <p className="text-sm text-white/40 mb-4">
                  {startDate || endDate || activeTag
                    ? "Hãy thử xoá bộ lọc ngày hoặc tag để xem thêm bài viết."
                    : "Vui lòng vào trang quản trị để thêm link từ X hoặc tải lên video/ảnh."}
                </p>
                <div className="flex gap-2">
                  {(startDate || endDate || activeTag) && (
                    <button
                      onClick={handleResetAllFilters}
                      className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium transition"
                    >
                      Đặt lại bộ lọc
                    </button>
                  )}
                  <Link
                    href="/admin"
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition text-sm"
                  >
                    Đến trang Admin
                  </Link>
                </div>
              </>
            )}
          </div>
        )}

        {items.map((item, idx) => (
          <div
            key={item.feedKey || item.id}
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
              onOpenTagDrawer={() => setIsMenuOpen(true)}
            />
          </div>
        ))}

        {isLoading && (
          <div className="w-full h-20 flex items-center justify-center text-white/50">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}
      </main>

      {/* DRAWER / MODAL MENU TỔNG HỢP (Bộ lọc Ngẫu nhiên, Ngày, Tag, Yêu thích & Admin) */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setIsMenuOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-neutral-900 border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[85vh] flex flex-col space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Menu */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Menu & Bộ lọc</h3>
                  <p className="text-[11px] text-neutral-400">Tuỳ chỉnh chế độ lướt, thời gian, chủ đề & quản trị</p>
                </div>
              </div>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nội dung menu cuộn được */}
            <div className="flex-1 overflow-y-auto space-y-5 pr-1 no-scrollbar">
              {/* 1. CHẾ ĐỘ HIỂN THỊ / SẮP XẾP */}
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  1. Chế độ lướt video / ảnh
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSortMode("random")}
                    className={`py-2.5 px-2 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 border transition ${
                      sortMode === "random"
                        ? "bg-yellow-500/20 border-yellow-500 text-yellow-300 font-bold shadow-sm shadow-yellow-500/20"
                        : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    <Shuffle className="w-4 h-4" />
                    <span>Ngẫu nhiên</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSortMode("newest")}
                    className={`py-2.5 px-2 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 border transition ${
                      sortMode === "newest"
                        ? "bg-blue-600/30 border-blue-500 text-blue-300 font-bold shadow-sm shadow-blue-500/20"
                        : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Mới nhất</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSortMode("oldest")}
                    className={`py-2.5 px-2 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 border transition ${
                      sortMode === "oldest"
                        ? "bg-purple-600/30 border-purple-500 text-purple-300 font-bold shadow-sm shadow-purple-500/20"
                        : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    <span>Cũ nhất</span>
                  </button>
                </div>
              </div>

              {/* 2. BỘ LỌC THỜI GIAN */}
              <div className="pt-2 border-t border-neutral-800/80">
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  2. Lọc theo thời gian
                </label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => handleSelectDatePreset("all")}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border transition ${
                      datePreset === "all"
                        ? "bg-white text-black font-bold border-white"
                        : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    Tất cả thời gian
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectDatePreset("today")}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border transition ${
                      datePreset === "today"
                        ? "bg-white text-black font-bold border-white"
                        : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    Hôm nay
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectDatePreset("7days")}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border transition ${
                      datePreset === "7days"
                        ? "bg-white text-black font-bold border-white"
                        : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    7 ngày qua
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectDatePreset("30days")}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border transition ${
                      datePreset === "30days"
                        ? "bg-white text-black font-bold border-white"
                        : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    30 ngày qua
                  </button>
                </div>

                {/* Khoảng ngày tuỳ chọn */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] text-neutral-400 font-semibold block">Hoặc chọn khoảng ngày tuỳ ý:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-neutral-400 block mb-0.5">Từ ngày</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          setDatePreset("custom");
                        }}
                        className="w-full px-2.5 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-400 block mb-0.5">Đến ngày</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => {
                          setEndDate(e.target.value);
                          setDatePreset("custom");
                        }}
                        className="w-full px-2.5 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. MỤC YÊU THÍCH & DANH SÁCH TAGS */}
              <div className="pt-2 border-t border-neutral-800/80">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    3. Chủ đề & Mục Yêu thích
                  </label>
                  <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                    <span>🔥</span> Top 5 tag phổ biến
                  </span>
                </div>

                {/* Các nút lựa chọn chung */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTag(null);
                      setShowFavoritesOnly(false);
                      setIsMenuOpen(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                      activeTag === null && !showFavoritesOnly
                        ? "bg-white text-black font-bold border-white"
                        : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    Tất cả bài viết
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowFavoritesOnly(true);
                      setActiveTag(null);
                      setIsMenuOpen(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border ${
                      showFavoritesOnly
                        ? "bg-red-600 border-red-500 text-white font-bold shadow-md shadow-red-600/30"
                        : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${showFavoritesOnly ? "fill-white" : "text-red-400"}`} />
                    <span>Mục yêu thích ({favorites.length})</span>
                  </button>
                </div>

                {/* Danh sách Tags với Top 5 phân biệt màu sắc */}
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto no-scrollbar p-2 bg-neutral-950/70 rounded-xl border border-neutral-800">
                  {allTags.length === 0 ? (
                    <div className="text-xs text-neutral-500 italic p-2">Chưa có tag nào được tạo.</div>
                  ) : (
                    allTags.map((t, idx) => {
                      const isTop5 = idx < 5;
                      const isSelected = activeTag === t.slug && !showFavoritesOnly;

                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setActiveTag(t.slug);
                            setShowFavoritesOnly(false);
                            setIsMenuOpen(false);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition active:scale-95 ${
                            isSelected
                              ? isTop5
                                ? "bg-amber-500 border-amber-400 text-black font-bold shadow-md shadow-amber-500/20"
                                : "bg-blue-600 border-blue-500 text-white font-bold shadow-md shadow-blue-600/20"
                              : isTop5
                              ? "bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                              : "bg-neutral-800/80 border-neutral-700 text-neutral-300 hover:bg-neutral-700 hover:text-white"
                          }`}
                        >
                          {isTop5 && <span>🔥</span>}
                          <span>#{t.name}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                              isSelected
                                ? isTop5
                                  ? "bg-black/20 text-black"
                                  : "bg-white/20 text-white"
                                : isTop5
                                ? "bg-amber-500/25 text-amber-200"
                                : "bg-neutral-700 text-neutral-400"
                            }`}
                          >
                            {t.count}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 4. TRANG QUẢN TRỊ ADMIN */}
              <div className="pt-2 border-t border-neutral-800/80">
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  4. Quản trị hệ thống
                </label>
                <Link
                  href="/admin"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center justify-between p-3 rounded-xl bg-neutral-800/90 hover:bg-neutral-800 border border-neutral-700 hover:border-neutral-600 transition group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-blue-300 transition">
                        Trang Quản trị Admin
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        Thêm link X/mạng xã hội, tải lên video/ảnh, sửa tag và quản lý bài
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-white transition shrink-0" />
                </Link>
              </div>
            </div>

            {/* Footer Nút hành động */}
            <div className="flex gap-2 pt-3 border-t border-neutral-800 shrink-0">
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="flex-1 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300 flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Đặt lại tất cả</span>
              </button>

              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center justify-center transition shadow-lg shadow-blue-600/25 active:scale-95"
              >
                <span>Áp dụng & Đóng</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
