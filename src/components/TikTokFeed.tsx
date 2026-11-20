"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import VideoPlayer from "./VideoPlayer";
import ImageViewer from "./ImageViewer";
import GalleryViewer from "./GalleryViewer";
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
  Film,
  Layers,
  Image as ImageIcon,
} from "lucide-react";
import Link from "next/link";

export type MediaFormat = "VIDEO" | "GALLERY" | "IMAGE";

interface MediaItem {
  id: string;
  originalId?: string; // ID bài viết gốc nếu là ảnh được tách từ Gallery
  type: "IMAGE" | "VIDEO";
  mediaUrl: string;
  galleryUrls?: string[];
  thumbnailUrl?: string;
  title?: string;
  isLandscape?: boolean;
  defaultRotate?: number;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  tags: string[];
  createdAt?: string;
  feedKey?: string; // Khóa duy nhất cho infinite loop
  isFromGallery?: boolean; // Đánh dấu ảnh đơn được bung từ Album / Gallery
  galleryIndex?: number; // Số thứ tự ảnh trong Album gốc
  galleryTotal?: number; // Tổng số ảnh của Album gốc
}

/**
 * Xử lý tách các Album (Gallery) nhiều ảnh thành từng slide ảnh đơn độc lập
 * và trộn xen kẽ vào luồng cuộn dọc của TikTok Feed, tránh sự nhàm chán khi 1 bài có quá nhiều hình.
 */
function processFeedItems(
  rawItems: MediaItem[],
  mixGallery: boolean,
  sort: "random" | "newest" | "oldest"
): MediaItem[] {
  if (!mixGallery) return rawItems;

  const result: MediaItem[] = [];
  const galleryPhotos: MediaItem[] = [];

  for (const item of rawItems) {
    if (item.type === "IMAGE" && item.galleryUrls && item.galleryUrls.length > 1) {
      // Tách từng ảnh trong galleryUrls thành các item ảnh đơn độc lập
      item.galleryUrls.forEach((url, gIdx) => {
        galleryPhotos.push({
          ...item,
          id: `${item.id}-g-${gIdx}`,
          originalId: item.id,
          type: "IMAGE",
          mediaUrl: url,
          thumbnailUrl: url,
          isFromGallery: true,
          galleryIndex: gIdx + 1,
          galleryTotal: item.galleryUrls!.length,
        });
      });
    } else {
      result.push(item);
    }
  }

  // Nếu không có ảnh gallery nào cần tách
  if (galleryPhotos.length === 0) {
    return result;
  }

  // Nếu toàn bộ rawItems là gallery
  if (result.length === 0) {
    return sort === "random"
      ? [...galleryPhotos].sort(() => Math.random() - 0.5)
      : galleryPhotos;
  }

  // Trộn (interleave / shuffle) các ảnh gallery xen kẽ với các bài viết khác
  if (sort === "random") {
    return [...result, ...galleryPhotos].sort(() => Math.random() - 0.5);
  }

  // Nếu chế độ Mới nhất hoặc Cũ nhất: Trộn xen kẽ (interleave) hài hoà
  const mixed: MediaItem[] = [];
  let gPtr = 0;
  const ratio = Math.max(1, Math.floor(galleryPhotos.length / result.length));

  for (let i = 0; i < result.length; i++) {
    mixed.push(result[i]);
    for (let k = 0; k < ratio && gPtr < galleryPhotos.length; k++) {
      mixed.push(galleryPhotos[gPtr++]);
    }
  }

  while (gPtr < galleryPhotos.length) {
    mixed.push(galleryPhotos[gPtr++]);
  }

  return mixed;
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

  // Bộ lọc Định dạng nội dung (Video / Album / Ảnh đơn)
  const [selectedFormats, setSelectedFormats] = useState<MediaFormat[]>(["VIDEO", "GALLERY", "IMAGE"]);

  // Chế độ Trộn ảnh từ Album (Gallery) thành từng slide ảnh đơn cuộn dọc
  const [mixGallery, setMixGallery] = useState(true);
  const [viewingGallery, setViewingGallery] = useState<{
    images: string[];
    initialIndex: number;
    title?: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Đọc danh sách Yêu thích & Cài đặt Trộn Gallery từ LocalStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("tiktok_clone_favorites");
      if (stored) {
        setFavorites(JSON.parse(stored));
      }
      const storedMix = localStorage.getItem("tiktok_clone_mix_gallery");
      if (storedMix !== null) {
        setMixGallery(storedMix === "true");
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const toggleMixGallery = () => {
    setMixGallery((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("tiktok_clone_mix_gallery", String(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  // Chuyển đổi Yêu thích (Favorite) - Hỗ trợ cả ID bài viết gốc của Album
  const toggleFavorite = (id: string, originalId?: string) => {
    const targetId = originalId || id;
    setFavorites((prev) => {
      const next = prev.includes(targetId) ? prev.filter((item) => item !== targetId) : [...prev, targetId];
      try {
        localStorage.setItem("tiktok_clone_favorites", JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });

    // Nếu người dùng đang lọc riêng "Mục yêu thích" và bỏ tim bài viết này, loại bỏ bài khỏi danh sách xem
    if (showFavoritesOnly) {
      setItems((prev) => prev.filter((item) => item.id !== id && item.originalId !== targetId));
      setBasePool((prev) => prev.filter((item) => item.id !== targetId));
    }
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
      formats: MediaFormat[] = ["VIDEO", "GALLERY", "IMAGE"],
      cursor: string | null = null,
      append = false,
      targetId: string | null = null
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
        if (formats.length > 0 && formats.length < 3) {
          params.set("formats", formats.join(","));
        }
        if (cursor && cursor !== "random-infinite") params.set("cursor", cursor);
        if (targetId && !append) params.set("id", targetId);

        params.set("mixGallery", mixGallery ? "true" : "false");

        const res = await fetch(`/api/feed?${params.toString()}`);
        if (!res.ok) throw new Error("Lỗi tải dữ liệu feed");
        const data = await res.json();

        const rawItems: MediaItem[] = data.items || [];
        const processed = processFeedItems(rawItems, mixGallery, sort);
        const newItemsWithKeys = attachFeedKeys(processed);

        if (append) {
          setItems((prev) => [...prev, ...newItemsWithKeys]);
          setBasePool((prev) => [...prev, ...rawItems]);
        } else {
          setItems(newItemsWithKeys);
          setBasePool(rawItems);
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
    [mixGallery]
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
    let initialTargetId: string | null = null;
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      initialTargetId = sp.get("id") || sp.get("mediaId");
    }

    loadMedia(
      activeTag,
      showFavoritesOnly,
      favorites,
      sortMode,
      startDate,
      endDate,
      selectedFormats,
      null,
      false,
      initialTargetId
    );
    loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTag, showFavoritesOnly, sortMode, startDate, endDate, selectedFormats, mixGallery, loadMedia]);

  // Cuộn vô tận không bao giờ hết (Endless Infinite Scroll / Loop):
  // Khi cuộn gần đến cuối danh sách (còn 2-3 bài), tự động nạp tiếp hoặc loop lại
  const handleInfiniteTrigger = useCallback(() => {
    if (isLoading || items.length === 0) return;

    // Trường hợp 1: Còn cursor tiếp theo hoặc đang ở chế độ random
    if (nextCursor) {
      loadMedia(
        activeTag,
        showFavoritesOnly,
        favorites,
        sortMode,
        startDate,
        endDate,
        selectedFormats,
        nextCursor,
        true
      );
      return;
    }

    // Trường hợp 2: Đã tải hết database (nextCursor === null)
    // -> Loop lại danh sách từ basePool để người dùng cuộn mãi không bao giờ bị dừng!
    if (basePool.length > 0) {
      const loopedItems = sortMode === "random"
        ? [...basePool].sort(() => Math.random() - 0.5)
        : [...basePool];
      const processedLooped = processFeedItems(loopedItems, mixGallery, sortMode);
      const withNewKeys = attachFeedKeys(processedLooped);
      setItems((prev) => [...prev, ...withNewKeys]);
    }
  }, [isLoading, items.length, nextCursor, basePool, sortMode, activeTag, showFavoritesOnly, favorites, startDate, endDate, selectedFormats, mixGallery, loadMedia]);

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

  // Xử lý chọn / gộp bộ lọc định dạng (Video / Album / Ảnh đơn)
  const handleToggleFormat = (format: MediaFormat) => {
    if (selectedFormats.length === 3) {
      // Khi đang ở trạng thái Tất cả -> chuyển sang chỉ chọn riêng mục vừa click
      setSelectedFormats([format]);
      return;
    }

    if (selectedFormats.includes(format)) {
      if (selectedFormats.length === 1) {
        // Nếu đang là mục duy nhất, click lại sẽ quay về chọn Tất cả
        setSelectedFormats(["VIDEO", "GALLERY", "IMAGE"]);
      } else {
        // Bỏ chọn mục này
        setSelectedFormats(selectedFormats.filter((f) => f !== format));
      }
    } else {
      // Gộp thêm mục này vào bộ lọc (Multi-select / Gộp filter)
      setSelectedFormats([...selectedFormats, format]);
    }
  };

  const handleSelectAllFormats = () => {
    setSelectedFormats(["VIDEO", "GALLERY", "IMAGE"]);
  };

  const getFormatLabel = () => {
    if (selectedFormats.length === 3) return "Tất cả";
    const labels: string[] = [];
    if (selectedFormats.includes("VIDEO")) labels.push("Video");
    if (selectedFormats.includes("GALLERY")) labels.push("Album");
    if (selectedFormats.includes("IMAGE")) labels.push("Ảnh đơn");
    return labels.join(" + ");
  };

  // Đặt lại toàn bộ bộ lọc
  const handleResetAllFilters = () => {
    setActiveTag(null);
    setShowFavoritesOnly(false);
    setSortMode("random");
    setDatePreset("all");
    setStartDate("");
    setEndDate("");
    setSelectedFormats(["VIDEO", "GALLERY", "IMAGE"]);
  };

  // Kiểm tra xem có bộ lọc nào đang được kích hoạt không
  const isAllFormats = selectedFormats.length === 3;
  const hasActiveFilter = Boolean(
    activeTag || showFavoritesOnly || startDate || endDate || sortMode !== "random" || !isAllFormats
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
      {/* Top Bar Tối Giản: Chỉ hiển thị huy hiệu bộ lọc đang bật (nếu có) + 1 Nút Menu duy nhất */}
      <header className="absolute top-0 left-0 right-0 p-3 sm:p-4 z-40 flex items-center justify-between pointer-events-none gap-2">
        {/* Vùng hiển thị tag / bộ lọc đang kích hoạt */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto flex-wrap">
          {!isAllFormats && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xl text-white text-xs font-medium border border-white/15 shadow-lg">
              <span>Định dạng: {getFormatLabel()}</span>
              <button
                onClick={handleSelectAllFormats}
                className="hover:bg-white/20 rounded-full p-0.5 transition active:scale-90"
                title="Bỏ lọc định dạng, xem tất cả"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {activeTag && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xl text-white text-xs font-medium border border-white/15 shadow-lg">
              <span>#{activeTag}</span>
              <button
                onClick={() => setActiveTag(null)}
                className="hover:bg-white/20 rounded-full p-0.5 transition active:scale-90"
                title="Bỏ lọc tag này"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {showFavoritesOnly && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 backdrop-blur-xl text-rose-300 text-xs font-semibold border border-rose-500/30 shadow-lg">
              <Heart className="w-3.5 h-3.5 fill-current text-rose-400" />
              <span>Yêu thích ({favorites.length})</span>
              <button
                onClick={() => setShowFavoritesOnly(false)}
                className="hover:bg-white/20 rounded-full p-0.5 transition active:scale-90"
                title="Bỏ xem yêu thích"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {(startDate || endDate) && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xl text-white text-xs font-medium border border-white/15 shadow-lg">
              <Calendar className="w-3.5 h-3.5 text-neutral-300" />
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
                className="hover:bg-white/20 rounded-full p-0.5 transition active:scale-90"
                title="Bỏ lọc ngày"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {sortMode !== "random" && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xl text-neutral-200 text-xs font-medium border border-white/15 shadow-lg">
              {sortMode === "newest" ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                  <span>Mới nhất</span>
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Cũ nhất</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* 1 Ô NÚT MENU TỔNG HỢP DUY NHẤT */}
        <div className="flex items-center gap-2 pointer-events-auto ml-auto shrink-0">
          <button
            onClick={() => setIsMenuOpen(true)}
            className={`flex items-center gap-2 h-10 px-4 rounded-full backdrop-blur-xl text-xs font-semibold transition-all active:scale-95 border shadow-xl ${
              hasActiveFilter
                ? "bg-neutral-900/90 border-white/30 text-white hover:bg-neutral-800"
                : "bg-black/45 hover:bg-black/75 border-white/15 text-white"
            }`}
            title="Mở menu bộ lọc và tuỳ chọn"
          >
            <Menu className="w-4 h-4" />
            <span>Menu</span>
            {hasActiveFilter && (
              <span className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] ml-0.5" />
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
                  {startDate || endDate || activeTag || selectedFormats.length < 3
                    ? "Hãy thử xoá bộ lọc ngày, tag hoặc định dạng để xem thêm bài viết."
                    : "Vui lòng vào trang quản trị để thêm link từ X hoặc tải lên video/ảnh."}
                </p>
                <div className="flex gap-2">
                  {(startDate || endDate || activeTag || selectedFormats.length < 3) && (
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

        {items.map((item, idx) => {
          // Chỉ mount Video/Gallery trong phạm vi ±1 slide xung quanh activeIndex để tiết kiệm RAM & ngăn AbortError
          const isNear = Math.abs(idx - activeIndex) <= 1;

          return (
            <div
              key={item.feedKey || item.id}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              data-index={idx}
              className="w-full h-[100dvh] snap-start relative flex items-center justify-center bg-black overflow-hidden"
            >
              {isNear ? (
                item.type === "VIDEO" ? (
                  <VideoPlayer
                    src={item.mediaUrl}
                    isActive={idx === activeIndex}
                    isMuted={isMuted}
                    toggleMute={() => setIsMuted((prev) => !prev)}
                    defaultRotate={item.defaultRotate}
                    isLandscape={item.isLandscape}
                    isFavorite={favorites.includes(item.originalId || item.id)}
                    onToggleFavorite={() => toggleFavorite(item.id, item.originalId)}
                    initialDuration={item.duration}
                    width={item.width}
                    height={item.height}
                  />
                ) : item.galleryUrls && item.galleryUrls.length > 1 && !item.isFromGallery ? (
                  <GalleryViewer
                    images={item.galleryUrls}
                    alt={item.title || "Gallery"}
                    isActive={idx === activeIndex}
                    isFavorite={favorites.includes(item.originalId || item.id)}
                    onToggleFavorite={() => toggleFavorite(item.id, item.originalId)}
                  />
                ) : (
                  <ImageViewer
                    src={item.mediaUrl}
                    alt={item.title || "Image"}
                    isActive={idx === activeIndex}
                    isFavorite={favorites.includes(item.originalId || item.id)}
                    onToggleFavorite={() => toggleFavorite(item.id, item.originalId)}
                  />
                )
              ) : (
                <div className="w-full h-full bg-neutral-950 flex items-center justify-center select-none pointer-events-none">
                  {item.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title || "thumbnail"}
                      className="w-full h-full object-contain opacity-30 select-none pointer-events-none"
                      loading="lazy"
                    />
                  )}
                </div>
              )}

              {/* Overlay hiển thị tags & title */}
              {isNear && (
                <TagOverlay
                  title={item.title}
                  tags={item.tags}
                  activeTag={activeTag}
                  onSelectTag={(tag) => {
                    setShowFavoritesOnly(false);
                    setActiveTag(tag);
                  }}
                  onOpenTagDrawer={() => setIsMenuOpen(true)}
                  isFromGallery={item.isFromGallery}
                  galleryIndex={item.galleryIndex}
                  galleryTotal={item.galleryTotal}
                  onOpenFullGallery={
                    item.galleryUrls && item.galleryUrls.length > 1
                      ? () =>
                          setViewingGallery({
                            images: item.galleryUrls || [],
                            initialIndex: (item.galleryIndex || 1) - 1,
                            title: item.title,
                          })
                      : undefined
                  }
                />
              )}
            </div>
          );
        })}

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
            className="w-full max-w-lg bg-neutral-950/95 border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur-2xl max-h-[85vh] flex flex-col space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Menu */}
            <div className="flex items-center justify-between pb-3.5 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-white/10 text-white border border-white/10">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Bộ lọc & Tuỳ chọn</h3>
                  <p className="text-[11px] text-neutral-400">Tuỳ chỉnh định dạng, thứ tự và quản trị</p>
                </div>
              </div>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nội dung menu cuộn được */}
            <div className="flex-1 overflow-y-auto space-y-5 pr-1 no-scrollbar">
              {/* 1. BỘ LỌC ĐỊNH DẠNG NỘI DUNG */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                    Định dạng nội dung
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    {selectedFormats.length === 3
                      ? "Tất cả định dạng"
                      : getFormatLabel()}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {/* Nút Tất cả */}
                  <button
                    type="button"
                    onClick={handleSelectAllFormats}
                    className={`py-2.5 px-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1.5 border transition-all active:scale-95 ${
                      selectedFormats.length === 3
                        ? "bg-white text-black font-bold border-white shadow-md"
                        : "bg-neutral-900 border-white/10 text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Tất cả</span>
                  </button>

                  {/* Nút Video */}
                  <button
                    type="button"
                    onClick={() => handleToggleFormat("VIDEO")}
                    className={`py-2.5 px-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1.5 border transition-all active:scale-95 ${
                      selectedFormats.length < 3 && selectedFormats.includes("VIDEO")
                        ? "bg-white text-black font-bold border-white shadow-md"
                        : "bg-neutral-900 border-white/10 text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    <Film className="w-4 h-4" />
                    <span>Video</span>
                  </button>

                  {/* Nút Album / Gallery */}
                  <button
                    type="button"
                    onClick={() => handleToggleFormat("GALLERY")}
                    className={`py-2.5 px-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1.5 border transition-all active:scale-95 ${
                      selectedFormats.length < 3 && selectedFormats.includes("GALLERY")
                        ? "bg-white text-black font-bold border-white shadow-md"
                        : "bg-neutral-900 border-white/10 text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    <Layers className="w-4 h-4" />
                    <span>Album</span>
                  </button>

                  {/* Nút Ảnh đơn */}
                  <button
                    type="button"
                    onClick={() => handleToggleFormat("IMAGE")}
                    className={`py-2.5 px-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1.5 border transition-all active:scale-95 ${
                      selectedFormats.length < 3 && selectedFormats.includes("IMAGE")
                        ? "bg-white text-black font-bold border-white shadow-md"
                        : "bg-neutral-900 border-white/10 text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>Ảnh đơn</span>
                  </button>
                </div>

                {/* Tùy chọn Trộn ảnh Album thành cuộn dọc */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-900/80 border border-white/10 mt-3.5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-white/10 text-white">
                      <Shuffle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <span>Trộn ảnh từ Album</span>
                        {mixGallery && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-white/20 text-white font-bold border border-white/20">
                            Bật
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-400 leading-tight mt-0.5">
                        Tách album thành từng slide cuộn dọc xen kẽ
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={mixGallery}
                    onClick={toggleMixGallery}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      mixGallery ? "bg-white" : "bg-neutral-800 border border-white/20"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-md transition duration-200 ease-in-out ${
                        mixGallery ? "translate-x-5 bg-black" : "translate-x-0 bg-neutral-400"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* 2. CHẾ ĐỘ HIỂN THỊ / SẮP XẾP */}
              <div className="pt-3 border-t border-white/10">
                <span className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2.5">
                  Chế độ lướt
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSortMode("random")}
                    className={`py-2.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all active:scale-95 ${
                      sortMode === "random"
                        ? "bg-white text-black font-bold border-white shadow-md"
                        : "bg-neutral-900 border-white/10 text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    <span>Ngẫu nhiên</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSortMode("newest")}
                    className={`py-2.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all active:scale-95 ${
                      sortMode === "newest"
                        ? "bg-white text-black font-bold border-white shadow-md"
                        : "bg-neutral-900 border-white/10 text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Mới nhất</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSortMode("oldest")}
                    className={`py-2.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all active:scale-95 ${
                      sortMode === "oldest"
                        ? "bg-white text-black font-bold border-white shadow-md"
                        : "bg-neutral-900 border-white/10 text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Cũ nhất</span>
                  </button>
                </div>
              </div>

              {/* 3. BỘ LỌC THỜI GIAN */}
              <div className="pt-3 border-t border-white/10">
                <span className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2.5">
                  Thời gian
                </span>
                <div className="grid grid-cols-4 gap-1.5 mb-3">
                  {(
                    [
                      { key: "all", label: "Tất cả" },
                      { key: "today", label: "Hôm nay" },
                      { key: "7days", label: "7 ngày" },
                      { key: "30days", label: "30 ngày" },
                    ] as const
                  ).map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => handleSelectDatePreset(preset.key)}
                      className={`py-2 px-1.5 rounded-xl text-xs font-medium border text-center transition-all active:scale-95 ${
                        datePreset === preset.key
                          ? "bg-white text-black font-bold border-white"
                          : "bg-neutral-900 border-white/10 text-neutral-300 hover:bg-neutral-800"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Khoảng ngày tuỳ chọn */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-neutral-400 block mb-1">Từ ngày</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setDatePreset("custom");
                      }}
                      className="w-full px-2.5 py-1.5 bg-neutral-900 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-white transition"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-400 block mb-1">Đến ngày</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setDatePreset("custom");
                      }}
                      className="w-full px-2.5 py-1.5 bg-neutral-900 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-white transition"
                    />
                  </div>
                </div>
              </div>

              {/* 4. MỤC YÊU THÍCH & DANH SÁCH TAGS */}
              <div className="pt-3 border-t border-white/10">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                    Chủ đề & Yêu thích
                  </span>
                </div>

                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTag(null);
                      setShowFavoritesOnly(false);
                      setIsMenuOpen(false);
                    }}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all border active:scale-95 ${
                      activeTag === null && !showFavoritesOnly
                        ? "bg-white text-black font-bold border-white shadow-sm"
                        : "bg-neutral-900 border-white/10 text-neutral-300 hover:bg-neutral-800"
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
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border active:scale-95 ${
                      showFavoritesOnly
                        ? "bg-rose-500 border-rose-400 text-white font-bold shadow-md shadow-rose-500/20"
                        : "bg-neutral-900 border-white/10 text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${showFavoritesOnly ? "fill-white" : "text-rose-400"}`} />
                    <span>Yêu thích ({favorites.length})</span>
                  </button>
                </div>

                {/* Danh sách Tags */}
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto no-scrollbar p-2.5 bg-neutral-900/60 rounded-2xl border border-white/10">
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
                          className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 border transition-all active:scale-95 ${
                            isSelected
                              ? "bg-white border-white text-black font-semibold shadow-sm"
                              : isTop5
                              ? "bg-white/10 border-white/20 text-white hover:bg-white/15"
                              : "bg-neutral-800/60 border-white/5 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                          }`}
                        >
                          <span>#{t.name}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                              isSelected
                                ? "bg-black/20 text-black font-bold"
                                : "bg-white/10 text-neutral-400"
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

              {/* 5. TRANG QUẢN TRỊ ADMIN */}
              <div className="pt-3 border-t border-white/10">
                <Link
                  href="/admin"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-900/90 hover:bg-neutral-900 border border-white/10 hover:border-white/25 transition group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-white/10 text-white group-hover:bg-white group-hover:text-black transition">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">
                        Trang Quản trị Admin
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">
                        Bóc tách URL, quét media, sửa tag và dọn dẹp hệ thống
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-white transition shrink-0" />
                </Link>
              </div>
            </div>

            {/* Footer Nút hành động */}
            <div className="flex gap-2.5 pt-3.5 border-t border-white/10 shrink-0">
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="flex-1 py-3 rounded-2xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-xs font-semibold text-neutral-300 flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Đặt lại</span>
              </button>

              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="flex-1 py-3 rounded-2xl bg-white hover:bg-neutral-100 text-xs font-bold text-black flex items-center justify-center transition shadow-lg active:scale-95"
              >
                <span>Áp dụng & Đóng</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xem toàn bộ Album / Gallery khi người dùng nhấp "Xem cả album" từ ảnh được trộn */}
      {viewingGallery && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col animate-fade-in backdrop-blur-md">
          <div className="p-3 sm:p-4 flex items-center justify-between border-b border-white/10 z-10 bg-black/50">
            <div className="flex items-center gap-2 text-white font-semibold text-sm">
              <Layers className="w-4 h-4 text-blue-400" />
              <span className="line-clamp-1">{viewingGallery.title || "Toàn bộ Album"}</span>
              <span className="text-xs text-neutral-400 font-normal">
                ({viewingGallery.images.length} ảnh)
              </span>
            </div>
            <button
              onClick={() => setViewingGallery(null)}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95"
              title="Đóng xem album"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 relative overflow-hidden">
            <GalleryViewer
              images={viewingGallery.images}
              alt={viewingGallery.title || "Gallery"}
              isActive={true}
            />
          </div>
        </div>
      )}
    </div>
  );
}
