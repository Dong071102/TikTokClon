"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, Check, AlertCircle, Loader2, X, SlidersHorizontal, Film, Image as ImageIcon } from "lucide-react";
import { QuickTagRadialButton } from "@/components/admin/QuickTagRadialButton";

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

function QuickAddContent() {
  const searchParams = useSearchParams();
  const rawUrl = searchParams.get("url") || "";
  const rawTitle = searchParams.get("title") || "";

  const [url, setUrl] = useState(rawUrl);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Quick Tags
  const [quickTags, setQuickTags] = useState<string[]>(DEFAULT_QUICK_TAGS);

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
  }, []);

  useEffect(() => {
    if (url) {
      parseUrl(url);
    }
  }, [url]);

  const parseUrl = async (targetUrl: string) => {
    try {
      setIsParsing(true);
      setErrorMsg(null);
      setParsedData(null);

      const res = await fetch("/api/admin/parse-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl.trim() }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Không thể trích xuất video hoặc ảnh từ đường link này");
      }

      setParsedData(json.data);
    } catch (err: any) {
      setErrorMsg(err.message || "Lỗi xử lý đường link");
    } finally {
      setIsParsing(false);
    }
  };

  const handleSaveWithTag = async (tag: string) => {
    if (!parsedData && !url) {
      throw new Error("Chưa có dữ liệu media để lưu");
    }

    const payload = {
      type: parsedData?.type || "VIDEO",
      sourceType: parsedData?.sourceType || "DIRECT_LINK",
      sourceUrl: url,
      mediaUrl: parsedData?.mediaUrl || url,
      galleryUrls: parsedData?.allMedia ? parsedData.allMedia.map((m: any) => m.mediaUrl) : [],
      thumbnailUrl: parsedData?.thumbnailUrl || null,
      title: parsedData?.title || rawTitle || "Web Media",
      storageMode: "DIRECT_LINK",
      tags: [tag],
      isLandscape: Boolean(parsedData?.isLandscape),
    };

    const res = await fetch("/api/admin/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || "Lỗi lưu media vào cơ sở dữ liệu");
    }

    setStatusMsg(`✓ Đã lưu thành công với tag #${tag}!`);

    // Tự động đóng cửa sổ popup sau 1.5 giây
    setTimeout(() => {
      if (window.opener) {
        window.close();
      }
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 flex flex-col justify-between font-sans select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
            ⚡
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight">Lưu nhanh TikTokClone</h1>
            <p className="text-[11px] text-neutral-400 truncate max-w-[260px]" title={url}>
              {url || "Chưa có đường link"}
            </p>
          </div>
        </div>
        <button
          onClick={() => window.close()}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition"
          title="Đóng cửa sổ"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Body */}
      <div className="flex-1 my-4 flex flex-col items-center justify-center">
        {isParsing && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-xs text-neutral-400 font-medium">Đang trích xuất video & ảnh chất lượng cao...</p>
          </div>
        )}

        {errorMsg && (
          <div className="w-full bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1">
              <strong className="block font-semibold">Không thể bóc tách:</strong>
              <span>{errorMsg}</span>
            </div>
          </div>
        )}

        {statusMsg && (
          <div className="w-full bg-emerald-500/15 border border-emerald-500/40 rounded-xl p-4 text-sm text-emerald-300 flex items-center justify-center gap-2 font-bold animate-in zoom-in-95">
            <Check className="w-5 h-5 text-emerald-400" />
            <span>{statusMsg}</span>
          </div>
        )}

        {!isParsing && parsedData && (
          <div className="w-full flex flex-col items-center gap-4">
            {/* Thumbnail Preview */}
            <div className="w-full h-44 bg-neutral-900 border border-white/10 rounded-2xl overflow-hidden relative flex items-center justify-center shadow-lg">
              {parsedData.thumbnailUrl ? (
                <img
                  src={parsedData.thumbnailUrl}
                  alt="Thumbnail"
                  className="w-full h-full object-cover"
                />
              ) : parsedData.type === "VIDEO" ? (
                <Film className="w-12 h-12 text-neutral-600" />
              ) : (
                <ImageIcon className="w-12 h-12 text-neutral-600" />
              )}
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-bold uppercase text-white border border-white/10">
                {parsedData.type}
              </span>
              {parsedData.sourceType && (
                <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-md text-[10px] font-medium text-white">
                  {parsedData.sourceType}
                </span>
              )}
            </div>

            {/* Title */}
            <div className="w-full text-center px-2">
              <h2 className="text-xs sm:text-sm font-semibold text-white line-clamp-2">
                {parsedData.title || rawTitle || "Media từ web"}
              </h2>
            </div>

            {/* Big Radial Button */}
            <div className="py-2">
              <QuickTagRadialButton
                tags={quickTags}
                onSaveWithTag={handleSaveWithTag}
                label="Lưu vào TikTokClone"
                className="scale-110"
              />
            </div>
            <p className="text-[11px] text-neutral-500">
              Chạm giữ (dí) nút để xòe các tag, kéo ngón tay vào tag để lưu!
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/10 pt-3 flex items-center justify-between text-[11px] text-neutral-500">
        <span>Cấu hình: {quickTags.length} tag hiển thị</span>
        <button
          onClick={() => window.close()}
          className="hover:text-white transition"
        >
          Hủy bỏ
        </button>
      </div>
    </div>
  );
}

export default function QuickAddPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
        </div>
      }
    >
      <QuickAddContent />
    </Suspense>
  );
}
