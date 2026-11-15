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
  const [isTagDrawerOpen, setIsTagDrawerOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

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
      {/* Top Bar Điều hướng & Bộ lọc */}
      <header className="absolute top-0 left-0 right-0 p-3 sm:p-4 z-40 flex items-center justify-between bg-gradient-to-b from-black/85 via-black/40 to-transparent pointer-events-none gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto flex-wrap">
          {/* Tag filter badge nếu có */}
          {activeTag && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-semibold border border-white/25">
              <span>#{activeTag}</span>
              <button
                onClick={() => setActiveTag(null)}
                className="hover:bg-white/20 rounded-full p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Quick Sort Toggle Button: Ngẫu nhiên / Mới nhất / Cũ nhất */}
          <button
            onClick={() => {
              setSortMode((prev) => {
                if (prev === "random") return "newest";
                if (prev === "newest") return "oldest";
                return "random";
              });
            }}
            title="Đổi kiểu sắp xếp"
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-xs font-semibold transition border border-white/15"
          >
            {sortMode === "random" && (
              <>
                <Shuffle className="w-3.5 h-3.5 text-yellow-400" />
                <span>Ngẫu nhiên</span>
              </>
            )}
            {sortMode === "newest" && (
              <>
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>Mới nhất</span>
              </>
            )}
            {sortMode === "oldest" && (
              <>
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span>Cũ nhất</span>
              </>
            )}
          </button>

          {/* Nút Bộ lọc Ngày & Sắp xếp */}
          <button
            onClick={() => setIsFilterModalOpen(true)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full backdrop-blur-md text-xs font-semibold transition border ${
              startDate || endDate
                ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30"
                : "bg-white/10 hover:bg-white/20 border-white/15 text-white"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{startDate || endDate ? "Đã lọc ngày" : "Ngày"}</span>
          </button>

          {/* Nút Mục Yêu Thích */}
          <button
            onClick={() => {
              setShowFavoritesOnly((prev) => !prev);
              setActiveTag(null);
            }}
            title="Xem danh sách bài yêu thích"
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full backdrop-blur-md text-xs font-semibold transition border ${
              showFavoritesOnly
                ? "bg-red-600 border-red-500 text-white shadow-lg shadow-red-600/30"
                : "bg-white/10 hover:bg-white/20 border-white/15 text-white"
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${showFavoritesOnly ? "fill-white" : "text-red-400"}`} />
            <span>({favorites.length})</span>
          </button>

          {/* Nút Chủ đề (Tags) */}
          <button
            onClick={() => setIsTagDrawerOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-xs font-semibold transition border border-white/15"
          >
            <TagIcon className="w-3.5 h-3.5" />
            <span>Tag</span>
          </button>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <Link
            href="/admin"
            title="Trang quản trị Admin"
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white/80 hover:text-white transition border border-white/10"
          >
            <Lock className="w-4 h-4" />
          </Link>
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
                      onClick={() => {
                        setActiveTag(null);
                        setStartDate("");
                        setEndDate("");
                        setDatePreset("all");
                      }}
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

      {/* MODAL BỘ LỌC NGÀY & SẮP XẾP */}
      {isFilterModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setIsFilterModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-neutral-900 border border-white/10 rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl max-h-[85vh] flex flex-col space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-blue-400" />
                <span>Bộ lọc & Sắp xếp</span>
              </h3>
              <button
                onClick={() => setIsFilterModalOpen(false)}
                className="p-1 rounded-full hover:bg-white/10 text-white/70 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 1. Chọn Thứ tự Sắp xếp */}
            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Chế độ hiển thị khi lướt
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSortMode("random")}
                  className={`py-2.5 px-2 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 border transition ${
                    sortMode === "random"
                      ? "bg-yellow-500/20 border-yellow-500 text-yellow-300 font-bold"
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
                      ? "bg-blue-600/30 border-blue-500 text-blue-300 font-bold"
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
                      ? "bg-purple-600/30 border-purple-500 text-purple-300 font-bold"
                      : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>Cũ nhất</span>
                </button>
              </div>
            </div>

            {/* 2. Lọc theo Mốc Thời gian */}
            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Mốc thời gian
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

              {/* Tuỳ chọn Khoảng ngày (Date Range Pickers) */}
              <div className="space-y-2 pt-1 border-t border-neutral-800">
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

            {/* Nút hành động */}
            <div className="flex gap-2 pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => {
                  handleSelectDatePreset("all");
                  setSortMode("random");
                }}
                className="flex-1 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300 flex items-center justify-center gap-1.5 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Đặt lại</span>
              </button>

              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center justify-center transition shadow-lg shadow-blue-600/20"
              >
                <span>Áp dụng</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER DANH SÁCH TAGS */}
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
