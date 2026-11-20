"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Globe,
  SlidersHorizontal,
  Film,
  Image as ImageIcon,
  Check,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
  Play,
  Sparkles,
  HelpCircle,
  Copy,
} from "lucide-react";
import { QuickTagRadialButton } from "./QuickTagRadialButton";

const DEFAULT_QUICK_TAGS = [
  "Hot",
  "1080p",
  "Trending",
  "Video",
  "Cosplay",
  "Anime",
  "POV",
  "Asian",
];

const BOOKMARKS = [
  { name: "Pornhub", url: "https://www.pornhub.com" },
  { name: "X (Twitter)", url: "https://x.com" },
  { name: "Reddit", url: "https://www.reddit.com" },
  { name: "RedTube", url: "https://www.redtube.com" },
  { name: "YouPorn", url: "https://www.youporn.com" },
];

export function AdminBrowserView() {
  const [inputUrl, setInputUrl] = useState("https://www.pornhub.com");
  const [currentUrl, setCurrentUrl] = useState("https://www.pornhub.com");
  const [pageTitle, setPageTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<string[]>(["https://www.pornhub.com"]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Quick Tags cấu hình 5-10 tag
  const [quickTags, setQuickTags] = useState<string[]>(DEFAULT_QUICK_TAGS);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [dbTags, setDbTags] = useState<Array<{ name: string; count: number }>>([]);
  const [newTagInput, setNewTagInput] = useState("");

  // Media được phát hiện (qua proxy DOM sniffing + server-side extraction)
  const [detectedMedia, setDetectedMedia] = useState<
    Array<{
      type: "IMAGE" | "VIDEO";
      mediaUrl: string;
      thumbnailUrl?: string;
      title?: string;
      duration?: number;
      isLandscape?: boolean;
      galleryUrls?: string[];
    }>
  >([]);
  const [isMediaDrawerOpen, setIsMediaDrawerOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);

  const BOOKMARKLET_CODE =
    "javascript:(function(){var u=encodeURIComponent(window.location.href);var t=encodeURIComponent(document.title||'');window.open('http://localhost:6789/admin/quick-add?url='+u+'&title='+t,'tk_quick_add','width=450,height=580,menubar=no,toolbar=no,location=no,status=no');})();";

  // Gán href cho bookmarklet bằng DOM API trực tiếp để tránh React chặn javascript: URL
  useEffect(() => {
    if (bookmarkletRef.current) {
      bookmarkletRef.current.setAttribute("href", BOOKMARKLET_CODE);
    }
  }, []);

  // 1. Tải danh sách tag từ cơ sở dữ liệu và cấu hình đã lưu
  useEffect(() => {
    try {
      const saved = localStorage.getItem("tiktok_quick_tags_config");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 3) {
          setQuickTags(parsed);
        }
      }
    } catch {}

    fetch("/api/tags")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.tags)) {
          setDbTags(data.tags);
        }
      })
      .catch((err) => console.warn("Lỗi tải tags:", err));
  }, []);

  // 2. Lắng nghe thông điệp từ injected script bên trong iframe proxy
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "BROWSER_NAVIGATE" && data.url) {
        navigateTo(data.url);
      } else if (data.type === "BROWSER_URL_CHANGED" && data.url) {
        let clean = data.url;
        if (clean.includes("/api/admin/browser-proxy?url=")) {
          const match = clean.match(/url=([^&]+)/);
          if (match && match[1]) {
            clean = decodeURIComponent(match[1]);
          }
        }
        setInputUrl(clean);
        setCurrentUrl(clean);
        if (data.title) setPageTitle(data.title);
      } else if (data.type === "MEDIA_DETECTED" && Array.isArray(data.items)) {
        setDetectedMedia((prev) => {
          const map = new Map<string, any>();
          prev.forEach((m) => map.set(m.mediaUrl, m));
          data.items.forEach((item: any) => {
            if (item.mediaUrl && !map.has(item.mediaUrl)) {
              map.set(item.mediaUrl, item);
            }
          });
          return Array.from(map.values());
        });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [historyIndex, history]);

  // 3. Hàm điều hướng tới URL
  const navigateTo = (rawUrl: string) => {
    let url = rawUrl.trim();
    if (!url) return;
    if (url.includes("/api/admin/browser-proxy?url=")) {
      const match = url.match(/url=([^&]+)/);
      if (match && match[1]) {
        url = decodeURIComponent(match[1]);
      }
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    setInputUrl(url);
    setCurrentUrl(url);
    setIsLoading(true);

    // Cập nhật lịch sử duyệt web
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(url);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);

    // Xóa tạm thời media cũ và quét bóc tách server-side song song
    setDetectedMedia([]);
    runServerExtraction(url);
  };

  // 4. Bóc tách media server-side song song để lấy HLS .m3u8 hoặc gallery
  const runServerExtraction = async (url: string) => {
    try {
      const res = await fetch("/api/admin/parse-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        const newItems: any[] = [];
        if (d.allMedia && Array.isArray(d.allMedia) && d.allMedia.length > 0) {
          d.allMedia.forEach((m: any) => {
            newItems.push({
              type: m.type,
              mediaUrl: m.mediaUrl,
              thumbnailUrl: m.thumbnailUrl || d.thumbnailUrl,
              title: d.title,
              isLandscape: d.isLandscape,
            });
          });
        } else if (d.mediaUrl) {
          newItems.push({
            type: d.type,
            mediaUrl: d.mediaUrl,
            thumbnailUrl: d.thumbnailUrl,
            title: d.title,
            isLandscape: d.isLandscape,
            galleryUrls: d.galleryUrls,
          });
        }

        if (newItems.length > 0) {
          setDetectedMedia((prev) => {
            const map = new Map<string, any>();
            newItems.forEach((item) => map.set(item.mediaUrl, item));
            prev.forEach((item) => {
              if (!map.has(item.mediaUrl)) map.set(item.mediaUrl, item);
            });
            return Array.from(map.values());
          });
        }
      }
    } catch (err) {
      // Bóc tách nền không làm gián đoạn trải nghiệm duyệt web
    }
  };

  const handleBack = () => {
    if (historyIndex > 0) {
      const prevUrl = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setInputUrl(prevUrl);
      setCurrentUrl(prevUrl);
      setIsLoading(true);
      setDetectedMedia([]);
      runServerExtraction(prevUrl);
    }
  };

  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      const nextUrl = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setInputUrl(nextUrl);
      setCurrentUrl(nextUrl);
      setIsLoading(true);
      setDetectedMedia([]);
      runServerExtraction(nextUrl);
    }
  };

  const handleReload = () => {
    setIsLoading(true);
    if (iframeRef.current) {
      iframeRef.current.src = `/api/admin/browser-proxy?url=${encodeURIComponent(currentUrl)}`;
    }
    runServerExtraction(currentUrl);
  };

  // 5. Lưu media vào server với tag được chọn khi người dùng nhả tay
  const handleSaveMedia = async (mediaItem: any, tag: string) => {
    const payload = {
      type: mediaItem.type || "VIDEO",
      sourceType: "DIRECT_LINK",
      sourceUrl: currentUrl,
      mediaUrl: mediaItem.mediaUrl,
      thumbnailUrl: mediaItem.thumbnailUrl || null,
      title: mediaItem.title || pageTitle || "Web Media",
      storageMode: "DIRECT_LINK",
      tags: [tag],
      isLandscape: Boolean(mediaItem.isLandscape),
      galleryUrls: mediaItem.galleryUrls || [],
    };

    const res = await fetch("/api/admin/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || "Không thể lưu media");
    }

    setStatusMessage(`✓ Đã lưu thành công media với tag #${tag}`);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Quản lý cấu hình Quick Tags
  const toggleTagInConfig = (tagName: string) => {
    if (quickTags.includes(tagName)) {
      if (quickTags.length <= 3) {
        alert("Cần giữ lại tối thiểu 3 tag!");
        return;
      }
      setQuickTags(quickTags.filter((t) => t !== tagName));
    } else {
      if (quickTags.length >= 10) {
        alert("Chỉ được cấu hình tối đa 10 tag hiển thị nhanh!");
        return;
      }
      setQuickTags([...quickTags, tagName]);
    }
  };

  const handleAddNewCustomTag = () => {
    const trimmed = newTagInput.trim();
    if (!trimmed) return;
    if (quickTags.includes(trimmed)) {
      setNewTagInput("");
      return;
    }
    if (quickTags.length >= 10) {
      alert("Chỉ được cấu hình tối đa 10 tag hiển thị nhanh!");
      return;
    }
    setQuickTags([...quickTags, trimmed]);
    setNewTagInput("");
  };

  const saveQuickTagsConfig = () => {
    localStorage.setItem("tiktok_quick_tags_config", JSON.stringify(quickTags));
    setIsConfigOpen(false);
  };

  // Mục media ưu tiên hiện tại (ưu tiên video trước, rồi đến ảnh)
  const primaryMedia =
    detectedMedia.find((m) => m.type === "VIDEO") || detectedMedia[0] || null;

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[600px] w-full bg-neutral-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative">
      {/* 1. TOP BROWSER CONTROLS TOOLBAR */}
      <div className="shrink-0 bg-neutral-900/90 border-b border-white/10 p-2.5 sm:p-3 flex flex-wrap items-center gap-2 z-20 backdrop-blur-md">
        {/* Nút Back / Forward / Reload */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleBack}
            disabled={historyIndex <= 0}
            title="Quay lại"
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleForward}
            disabled={historyIndex >= history.length - 1}
            title="Tiến lên"
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition active:scale-95"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={handleReload}
            title="Tải lại trang"
            className={`p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition active:scale-95 ${
              isLoading ? "animate-spin text-white" : ""
            }`}
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Thanh nhập URL Address Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigateTo(inputUrl);
          }}
          className="flex-1 min-w-[200px] relative flex items-center"
        >
          <div className="absolute left-3 text-neutral-500 pointer-events-none">
            <Globe className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Nhập địa chỉ web (VD: pornhub.com, x.com, link video...)"
            className="w-full bg-neutral-950/80 border border-white/15 focus:border-white/40 focus:ring-1 focus:ring-white/30 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-white placeholder-neutral-500 outline-none transition"
          />
          {inputUrl && (
            <button
              type="button"
              onClick={() => setInputUrl("")}
              className="absolute right-2.5 text-neutral-500 hover:text-white p-0.5 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>

        {/* Nút Đi tới (Go) */}
        <button
          onClick={() => navigateTo(inputUrl)}
          className="px-3 py-2 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-medium transition"
        >
          Duyệt
        </button>

        {/* Nút Cấu hình 5-10 Tag */}
        <button
          onClick={() => setIsConfigOpen(true)}
          title="Cấu hình 5 - 10 Tag hiển thị khi dí nút"
          className="p-2 rounded-xl border border-white/10 bg-neutral-900 text-neutral-300 hover:text-white hover:bg-white/10 transition active:scale-95 flex items-center gap-1.5 text-xs"
        >
          <SlidersHorizontal className="w-4 h-4 text-neutral-400" />
          <span className="hidden md:inline">Cấu hình Tag ({quickTags.length})</span>
        </button>

        {/* Nút Quick Save chính (Dí nút để chọn tag) cho Media đang phát hiện */}
        {primaryMedia && (
          <div className="shrink-0">
            <QuickTagRadialButton
              tags={quickTags}
              onSaveWithTag={(tag) => handleSaveMedia(primaryMedia, tag)}
              label={
                primaryMedia.type === "VIDEO" ? "Lưu Video này" : "Lưu Ảnh này"
              }
              className="z-30"
            />
          </div>
        )}

        {/* Nút xem danh sách tất cả media bắt được */}
        <button
          onClick={() => setIsMediaDrawerOpen(!isMediaDrawerOpen)}
          className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 border ${
            detectedMedia.length > 0
              ? "bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/25"
              : "bg-white/5 border-white/10 text-neutral-500"
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          <span>{detectedMedia.length} Media</span>
          {isMediaDrawerOpen ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* 2. DẢI BOOKMARK NHANH */}
      <div className="shrink-0 bg-neutral-950 px-3 py-1.5 border-b border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar text-xs">
        <span className="text-neutral-500 font-medium text-[11px] shrink-0">
          Phím tắt:
        </span>
        {BOOKMARKS.map((bm) => (
          <button
            key={bm.name}
            onClick={() => navigateTo(bm.url)}
            className={`px-2.5 py-1 rounded-lg transition shrink-0 whitespace-nowrap ${
              currentUrl.includes(new URL(bm.url).hostname)
                ? "bg-white text-black font-semibold"
                : "bg-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800 border border-white/5"
            }`}
          >
            {bm.name}
          </button>
        ))}
        {currentUrl && (
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Mở tab mới trên trình duyệt thật"
            className="ml-auto text-neutral-400 hover:text-white flex items-center gap-1 shrink-0 text-[11px] underline underline-offset-2"
          >
            <span>Mở tab ngoài</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* DẢI TIỆN ÍCH BOOKMARKLET (Duyệt trên Firefox/Chrome thật) */}
      <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/20 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-amber-300">
          <Sparkles className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            <strong>Lướt web thật (đã đăng nhập sẵn):</strong> Kéo nút này vào thanh Dấu trang ➔
          </span>
          <a
            ref={bookmarkletRef}
            draggable="true"
            title="Kéo thả nút này lên thanh Dấu trang (Bookmark Bar) của Firefox"
            className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs cursor-grab active:cursor-grabbing shadow-sm flex items-center gap-1 transition select-none"
            onClick={(e) => {
              e.preventDefault();
              navigator.clipboard.writeText(BOOKMARKLET_CODE);
              setStatusMessage("✓ Đã sao chép mã Bookmarklet! Bạn có thể dán vào dấu trang.");
              setTimeout(() => setStatusMessage(null), 4000);
            }}
          >
            <span>⚡ Lưu TikTokClone</span>
          </a>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            className="text-amber-400 hover:text-amber-200 underline underline-offset-2 flex items-center gap-1 text-[11px]"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Xem hướng dẫn cài đặt (10 giây)</span>
          </button>
        </div>
      </div>

      {/* LƯU Ý KHI ĐĂNG NHẬP X / TWITTER */}
      {(currentUrl.includes("x.com") || currentUrl.includes("twitter.com")) && (
        <div className="shrink-0 bg-blue-500/10 border-b border-blue-500/20 px-3 py-1.5 text-xs text-blue-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-blue-400" />
          <span>
            <strong>Đăng nhập X (Twitter):</strong> Vui lòng chọn <em>"Đăng nhập bằng tên người dùng hoặc email"</em> (tránh chọn <em>"Tiếp tục với Google"</em> vì Google cấm OAuth từ localhost). Hoặc dùng nút <strong>⚡ Lưu TikTokClone</strong> trên tab Firefox thật đã đăng nhập!
          </span>
        </div>
      )}

      {/* Thông báo trạng thái Toast */}
      {statusMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/95 border border-emerald-500/50 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* 3. KHUNG HIỂN THỊ WEB (IFRAME PROXY) */}
      <div className="flex-1 w-full h-full relative bg-neutral-900">
        <iframe
          ref={iframeRef}
          src={`/api/admin/browser-proxy?url=${encodeURIComponent(currentUrl)}`}
          className="w-full h-full border-0 select-text"
          onLoad={() => setIsLoading(false)}
          sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
        />

        {/* Thanh tiến trình / loading spinner khi tải trang */}
        {isLoading && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-white/20 overflow-hidden z-20">
            <div className="h-full bg-white w-1/3 animate-[shimmer_1.5s_infinite]" />
          </div>
        )}
      </div>

      {/* 4. DRAWER / DANH SÁCH TẤT CẢ MEDIA PHÁT HIỆN */}
      {isMediaDrawerOpen && (
        <div className="absolute bottom-0 left-0 right-0 max-h-72 bg-neutral-950/95 border-t border-white/15 backdrop-blur-xl z-40 p-4 overflow-y-auto shadow-2xl flex flex-col gap-3 animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">
                Media phát hiện trên trang ({detectedMedia.length})
              </h3>
            </div>
            <button
              onClick={() => setIsMediaDrawerOpen(false)}
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {detectedMedia.length === 0 ? (
            <p className="text-xs text-neutral-400 py-4 text-center">
              Chưa phát hiện video hoặc ảnh lớn trên trang này. Bạn có thể mở một video để hệ thống tự động bắt luồng HLS/MP4.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {detectedMedia.map((m, idx) => (
                <div
                  key={idx}
                  className="bg-neutral-900 border border-white/10 rounded-xl p-3 flex flex-col justify-between gap-2.5 hover:border-white/20 transition"
                >
                  <div className="flex gap-2.5 items-start">
                    <div className="w-16 h-12 bg-neutral-800 rounded-lg overflow-hidden shrink-0 relative flex items-center justify-center">
                      {m.thumbnailUrl ? (
                        <img
                          src={m.thumbnailUrl}
                          alt="Thumbnail"
                          className="w-full h-full object-cover"
                        />
                      ) : m.type === "VIDEO" ? (
                        <Film className="w-6 h-6 text-neutral-500" />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-neutral-500" />
                      )}
                      <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded bg-black/80 text-[9px] text-white font-bold uppercase">
                        {m.type}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate" title={m.title}>
                        {m.title || "Không có tiêu đề"}
                      </p>
                      <p className="text-[10px] text-neutral-400 truncate mt-0.5" title={m.mediaUrl}>
                        {m.mediaUrl}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <QuickTagRadialButton
                      tags={quickTags}
                      onSaveWithTag={(tag) => handleSaveMedia(m, tag)}
                      label="Lưu mục này"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. MODAL CẤU HÌNH 5-10 QUICK TAGS */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-white/15 rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-neutral-300" />
                  <span>Cấu hình 5 - 10 Tag hiển thị khi dí nút</span>
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Đã chọn: <strong className="text-white">{quickTags.length} / 10 tag</strong> (tối thiểu 3, tối đa 10)
                </p>
              </div>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Danh sách tag đang được kích hoạt */}
            <div>
              <label className="text-xs font-semibold text-neutral-300 mb-2 block">
                Các tag sẽ xòe ra trên vòng tròn:
              </label>
              <div className="flex flex-wrap gap-2">
                {quickTags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-black text-xs font-bold"
                  >
                    <span>#{t}</span>
                    <button
                      type="button"
                      onClick={() => toggleTagInConfig(t)}
                      className="hover:opacity-70 p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Thêm tag mới tự gõ */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddNewCustomTag();
                  }
                }}
                placeholder="Nhập tên tag mới..."
                className="flex-1 bg-neutral-900 border border-white/15 focus:border-white/40 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-neutral-500 outline-none"
              />
              <button
                type="button"
                onClick={handleAddNewCustomTag}
                className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm</span>
              </button>
            </div>

            {/* Gợi ý từ cơ sở dữ liệu */}
            {dbTags.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-neutral-400 mb-2 block">
                  Chọn nhanh từ các tag có sẵn trong cơ sở dữ liệu:
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto no-scrollbar">
                  {dbTags.map((dt) => {
                    const isSelected = quickTags.includes(dt.name);
                    return (
                      <button
                        key={dt.name}
                        type="button"
                        onClick={() => toggleTagInConfig(dt.name)}
                        className={`px-2.5 py-1 rounded-full text-xs transition flex items-center gap-1 ${
                          isSelected
                            ? "bg-white/20 text-white border border-white/40"
                            : "bg-neutral-900 text-neutral-400 hover:text-white border border-white/5"
                        }`}
                      >
                        <span>#{dt.name}</span>
                        <span className="text-[10px] opacity-60">({dt.count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer nút lưu */}
            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsConfigOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/10"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={saveQuickTagsConfig}
                className="px-5 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-bold transition active:scale-95 shadow-md"
              >
                Lưu cấu hình
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 6. MODAL HƯỚNG DẪN CÀI ĐẶT BOOKMARKLET */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-white/15 rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-white font-bold">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span>Cách cài nút "Lưu TikTokClone" lên trình duyệt</span>
              </div>
              <button
                onClick={() => setIsHelpOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-neutral-300">
              <div className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </span>
                <div>
                  <strong className="text-white block mb-0.5">Bật thanh Dấu trang (Bookmark Bar):</strong>
                  <span>Nhấn phím <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-white font-mono text-xs">Ctrl + Shift + B</kbd> trên Firefox hoặc Chrome.</span>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </span>
                <div>
                  <strong className="text-white block mb-0.5">Tạo Dấu trang mới:</strong>
                  <span>Nhấp chuột phải vào một khoảng trống trên thanh Dấu trang ➔ Chọn <strong>"Thêm dấu trang..." (Add Bookmark...)</strong>.</span>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  3
                </span>
                <div className="w-full">
                  <strong className="text-white block mb-1">Dán mã sau vào ô "Địa chỉ (URL)":</strong>
                  <div className="bg-neutral-900 border border-white/15 rounded-xl p-2.5 flex items-center justify-between gap-2">
                    <code className="text-[11px] text-amber-300 font-mono truncate select-all">
                      {BOOKMARKLET_CODE}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(BOOKMARKLET_CODE);
                        setStatusMessage("✓ Đã sao chép mã Bookmarklet!");
                        setTimeout(() => setStatusMessage(null), 3000);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold shrink-0 flex items-center gap-1 transition"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Sao chép</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
                🎉 <strong>Cách dùng:</strong> Mỗi khi bạn đang mở bất kỳ trang web nào (X, Pornhub, Reddit...), bấm vào nút Bookmark đó trên thanh trình duyệt: Nút nổi <strong>⚡ Lưu TikTokClone</strong> sẽ hiện ra. Bạn chỉ cần <strong>dí nút & kéo vào tag</strong> để lưu video về server!
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="px-5 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-bold transition active:scale-95 shadow-md"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
