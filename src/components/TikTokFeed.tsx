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
      {/* Top Bar Tối Giản: Thanh chuyển nhanh định dạng + Huy hiệu bộ lọc đang bật + 1 Nút Menu duy nhất */}
      <header className="absolute top-0 left-0 right-0 p-3 sm:p-4 z-40 flex items-center justify-between pointer-events-none gap-2">
        {/* Vùng hiển thị tag / bộ lọc đang kích hoạt & Quick format selector */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto flex-wrap">
          {/* Quick Format Filter Tabs: Chuyển nhanh hoặc gộp bộ lọc trực tiếp */}
          <div className="flex items-center gap-0.5 sm:gap-1 bg-black/60 backdrop-blur-md p-1 rounded-full border border-white/20 pointer-events-auto text-xs shadow-lg">
            <button
              type="button"
              onClick={handleSelectAllFormats}
              title="Xem tất cả định dạng"
              className={`px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold transition ${
                selectedFormats.length === 3
                  ? "bg-white text-black shadow font-bold"
                  : "text-neutral-300 hover:text-white hover:bg-white/10"
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => handleToggleFormat("VIDEO")}
              title="Lọc riêng hoặc gộp Video"
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold transition ${
                selectedFormats.length < 3 && selectedFormats.includes("VIDEO")
                  ? "bg-emerald-600 text-white shadow font-bold"
                  : "text-neutral-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <Film className="w-3 h-3" />
              <span>Video</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleFormat("GALLERY")}
              title="Lọc riêng hoặc gộp Album"
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold transition ${
                selectedFormats.length < 3 && selectedFormats.includes("GALLERY")
                  ? "bg-blue-600 text-white shadow font-bold"
                  : "text-neutral-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>Album</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleFormat("IMAGE")}
              title="Lọc riêng hoặc gộp Ảnh đơn"
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold transition ${
                selectedFormats.length < 3 && selectedFormats.includes("IMAGE")
                  ? "bg-amber-600 text-white shadow font-bold"
                  : "text-neutral-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <ImageIcon className="w-3 h-3" />
              <span>Ảnh</span>
            </button>
          </div>

          {/* Nút bật/tắt nhanh chế độ Trộn ảnh từ Album thành cuộn dọc */}
          <button
            type="button"
            onClick={toggleMixGallery}
            title={
              mixGallery
                ? "Đang BẬT: Album được rã thành từng ảnh đơn cuộn dọc để lướt thoải mái (Bấm để tắt)"
                : "Đang TẮT: Album giữ nguyên dạng lướt ngang nhiều ảnh (Bấm để bật trộn)"
            }
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full backdrop-blur-md text-[11px] sm:text-xs font-semibold transition border shadow-lg ${
              mixGallery
                ? "bg-amber-500/25 border-amber-500/70 text-amber-300 shadow-amber-500/20 font-bold"
                : "bg-black/60 border-white/20 text-neutral-400 hover:text-white hover:bg-black/80"
            }`}
          >
            <Shuffle className={`w-3 h-3 ${mixGallery ? "text-amber-400 animate-pulse" : "text-neutral-400"}`} />
            <span className="hidden sm:inline">{mixGallery ? "Trộn Album: Bật" : "Trộn Album: Tắt"}</span>
            <span className="sm:hidden">{mixGallery ? "Trộn: Bật" : "Trộn: Tắt"}</span>
          </button>

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
        <div className="flex items-center gap-2 pointer-events-auto ml-auto shrink-0">
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
              {/* 1. BỘ LỌC ĐỊNH DẠNG NỘI DUNG (VIDEO / ALBUM / ẢNH) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    1. Định dạng nội dung
                  </label>
                  <span className="text-[10px] text-neutral-400">
                    {selectedFormats.length === 3
                      ? "Đang hiện tất cả"
                      : `Đang lọc: ${getFormatLabel()}`}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                  {/* Nút Tất cả */}
                  <button
                    type="button"
                    onClick={handleSelectAllFormats}
                    className={`py-2 px-1.5 sm:px-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1 border transition ${
                      selectedFormats.length === 3
                        ? "bg-white text-black font-bold border-white shadow-md"
                        : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Tất cả</span>
                  </button>

                  {/* Nút Video */}
                  <button
                    type="button"
                    onClick={() => handleToggleFormat("VIDEO")}
                    className={`py-2 px-1.5 sm:px-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1 border transition ${
                      selectedFormats.length < 3 && selectedFormats.includes("VIDEO")
                        ? "bg-emerald-600/30 border-emerald-500 text-emerald-300 font-bold shadow-sm shadow-emerald-500/20"
                        : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    <Film className="w-4 h-4" />
                    <span>Video</span>
                  </button>

                  {/* Nút Album / Gallery */}
                  <button
                    type="button"
                    onClick={() => handleToggleFormat("GALLERY")}
                    className={`py-2 px-1.5 sm:px-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1 border transition ${
                      selectedFormats.length < 3 && selectedFormats.includes("GALLERY")
                        ? "bg-blue-600/30 border-blue-500 text-blue-300 font-bold shadow-sm shadow-blue-500/20"
                        : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    <Layers className="w-4 h-4" />
                    <span>Album</span>
                  </button>

                  {/* Nút Ảnh đơn */}
                  <button
                    type="button"
                    onClick={() => handleToggleFormat("IMAGE")}
                    className={`py-2 px-1.5 sm:px-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1 border transition ${
                      selectedFormats.length < 3 && selectedFormats.includes("IMAGE")
                        ? "bg-amber-600/30 border-amber-500 text-amber-300 font-bold shadow-sm shadow-amber-500/20"
                        : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>Ảnh đơn</span>
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-neutral-400 mt-2 px-1">
                  <span>💡 Chạm 1 nút để lọc riêng, chạm thêm để gộp bộ lọc (VD: Video + Album)</span>
                </div>

                {/* Tùy chọn Trộn ảnh Album thành cuộn dọc */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-800/80 border border-neutral-700/80 mt-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-lg ${mixGallery ? "bg-amber-500/20 text-amber-400" : "bg-neutral-700/50 text-neutral-400"}`}>
                      <Shuffle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <span>Trộn ảnh từ Album (Gallery)</span>
                        {mixGallery && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                            Đang bật
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-400 leading-tight mt-0.5">
                        Tách album nhiều ảnh thành các slide ảnh đơn cuộn dọc, tránh nhàm chán
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={mixGallery}
                    onClick={toggleMixGallery}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      mixGallery ? "bg-amber-500" : "bg-neutral-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        mixGallery ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* 2. CHẾ ĐỘ HIỂN THỊ / SẮP XẾP */}
              <div className="pt-2 border-t border-neutral-800/80">
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  2. Chế độ lướt video / ảnh
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

              {/* 3. BỘ LỌC THỜI GIAN */}
              <div className="pt-2 border-t border-neutral-800/80">
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  3. Lọc theo thời gian
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

              {/* 4. MỤC YÊU THÍCH & DANH SÁCH TAGS */}
              <div className="pt-2 border-t border-neutral-800/80">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    4. Chủ đề & Mục Yêu thích
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

              {/* 5. TRANG QUẢN TRỊ ADMIN */}
              <div className="pt-2 border-t border-neutral-800/80">
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  5. Quản trị hệ thống
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
