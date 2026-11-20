"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Tag, Check, Sparkles, Loader2 } from "lucide-react";

interface QuickTagRadialButtonProps {
  tags: string[];
  onSaveWithTag: (tag: string) => Promise<void>;
  onConfigureTags?: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function QuickTagRadialButton({
  tags,
  onSaveWithTag,
  onConfigureTags,
  label = "Lưu vào Server",
  disabled = false,
  className = "",
}: QuickTagRadialButtonProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccessTag, setSavedSuccessTag] = useState<string | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const centerPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeTags = tags && tags.length > 0 ? tags.slice(0, 10) : ["Hot", "1080p", "Trending", "Video", "Cosplay"];

  // Bán kính xòe vòng tròn tag
  const RADIUS = 96;

  // Tính tọa độ cho từng tag (phân bố vòng tròn đều xung quanh tâm)
  const tagPositions = activeTags.map((_, idx) => {
    // Bắt đầu từ góc -90 độ (đỉnh trên) và xoay theo chiều kim đồng hồ
    const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / activeTags.length;
    return {
      x: Math.round(RADIUS * Math.cos(angle)),
      y: Math.round(RADIUS * Math.sin(angle)),
    };
  });

  const triggerHaptic = (ms: number = 15) => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {}
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled || isSaving) return;
    const btn = buttonRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    centerPosRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

    // Khi người dùng dí chuột/ngón tay khoảng 160ms thì kích hoạt menu xòe
    holdTimerRef.current = setTimeout(() => {
      setIsHolding(true);
      setSelectedIndex(null);
      triggerHaptic(30);
    }, 160);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isHolding) return;

    const dx = e.clientX - centerPosRef.current.x;
    const dy = e.clientY - centerPosRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Nếu ở gần tâm (< 35px) thì coi như chưa chọn tag nào (vùng hủy / center)
    if (dist < 35) {
      if (selectedIndex !== null) {
        setSelectedIndex(null);
      }
      return;
    }

    // Tìm tag gần vị trí con trỏ nhất
    let closestIdx = 0;
    let minD = Infinity;

    tagPositions.forEach((pos, idx) => {
      const pDist = Math.sqrt((dx - pos.x) ** 2 + (dy - pos.y) ** 2);
      if (pDist < minD) {
        minD = pDist;
        closestIdx = idx;
      }
    });

    if (selectedIndex !== closestIdx) {
      setSelectedIndex(closestIdx);
      triggerHaptic(12);
    }
  };

  const handlePointerUp = async (e: React.PointerEvent) => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (isHolding) {
      setIsHolding(false);
      const chosenIdx = selectedIndex;
      setSelectedIndex(null);

      if (chosenIdx !== null && activeTags[chosenIdx]) {
        const chosenTag = activeTags[chosenIdx];
        triggerHaptic(40);
        await saveWithTag(chosenTag);
      }
    } else {
      // Trường hợp click nhanh (tap < 160ms): Lưu với tag đầu tiên hoặc mở tùy chỉnh
      if (activeTags[0]) {
        await saveWithTag(activeTags[0]);
      }
    }
  };

  const saveWithTag = async (tag: string) => {
    try {
      setIsSaving(true);
      await onSaveWithTag(tag);
      setSavedSuccessTag(tag);
      setTimeout(() => setSavedSuccessTag(null), 3500);
    } catch (err) {
      console.error("Lỗi khi lưu media:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      {/* Nút bấm chính tương tác dí ngón tay */}
      <button
        ref={buttonRef}
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
          setIsHolding(false);
          setSelectedIndex(null);
        }}
        disabled={disabled || isSaving}
        className={`relative select-none touch-none px-4 py-2.5 rounded-xl font-medium text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95 shadow-md ${
          savedSuccessTag
            ? "bg-emerald-500 text-white shadow-emerald-500/20"
            : isHolding
            ? "bg-white text-black scale-105 shadow-white/30 ring-4 ring-white/20"
            : "bg-white hover:bg-neutral-100 text-neutral-950"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Đang lưu...</span>
          </>
        ) : savedSuccessTag ? (
          <>
            <Check className="w-4 h-4" />
            <span>Đã lưu #{savedSuccessTag}</span>
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>{label}</span>
            <span className="text-[10px] text-neutral-500 font-normal hidden sm:inline">
              (Dí để chọn tag)
            </span>
          </>
        )}
      </button>

      {/* Vòng xòe Radial Menu khi dí ngón tay */}
      {isHolding && (
        <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center">
          {/* Lớp nền làm mờ nhẹ để tập trung vào các tag */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-none animate-in fade-in duration-150" />

          {/* Vùng tâm đặt tại vị trí ngón tay/nút bấm */}
          <div
            className="absolute transition-transform duration-75"
            style={{
              left: `${centerPosRef.current.x}px`,
              top: `${centerPosRef.current.y}px`,
            }}
          >
            {/* Vòng chỉ dẫn ở tâm */}
            <div className="absolute -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/20 bg-neutral-950/80 backdrop-blur-md flex flex-col items-center justify-center text-center p-1 shadow-2xl">
              <span className="text-[10px] text-neutral-400 font-medium leading-tight">
                {selectedIndex !== null ? "Thả để lưu" : "Kéo vào tag"}
              </span>
            </div>

            {/* Các pill tag xòe xung quanh */}
            {activeTags.map((tag, idx) => {
              const pos = tagPositions[idx];
              const isSelected = selectedIndex === idx;

              return (
                <div
                  key={tag}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 rounded-full whitespace-nowrap text-xs font-semibold shadow-xl transition-all duration-100 flex items-center gap-1.5 border pointer-events-none ${
                    isSelected
                      ? "bg-white text-black scale-125 border-white ring-4 ring-white/30 shadow-[0_0_25px_rgba(255,255,255,0.5)] z-20"
                      : "bg-neutral-900/95 text-neutral-200 border-white/20 backdrop-blur-md scale-100 z-10"
                  }`}
                  style={{
                    left: `${pos.x}px`,
                    top: `${pos.y}px`,
                  }}
                >
                  <Tag className={`w-3 h-3 ${isSelected ? "text-neutral-900" : "text-neutral-400"}`} />
                  <span>#{tag}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
