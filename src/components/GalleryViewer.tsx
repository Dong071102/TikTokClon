"use client";

import { useEffect, useState, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Heart, Layers, LayoutGrid, X } from "lucide-react";

interface GalleryViewerProps {
  images: string[];
  alt?: string;
  isActive: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

export default function GalleryViewer({
  images,
  alt = "Gallery",
  isActive,
  isFavorite = false,
  onToggleFavorite,
}: GalleryViewerProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    axis: "x",
    loop: false,
    dragFree: false,
    containScroll: "trimSnaps",
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isGridOpen, setIsGridOpen] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCurrentIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  // Tự động quay về ảnh đầu tiên và đóng modal khi cuộn bài khác
  useEffect(() => {
    if (!isActive && emblaApi) {
      emblaApi.scrollTo(0);
      setCurrentIndex(0);
      setIsGridOpen(false);
    }
  }, [isActive, emblaApi]);

  const scrollPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    emblaApi?.scrollPrev();
  };

  const scrollNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    emblaApi?.scrollNext();
  };

  if (!images || images.length === 0) return null;

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden select-none">
      {/* Vùng lướt ngang Carousel của Embla */}
      <div className="overflow-hidden w-full h-full" ref={emblaRef}>
        <div className="flex h-full touch-pan-y">
          {images.map((src, idx) => (
            <div
              key={`${src}-${idx}`}
              className="flex-[0_0_100%] min-w-0 h-full relative flex items-center justify-center bg-black overflow-hidden select-none"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`${alt} - ${idx + 1}`}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[100dvh] w-auto h-auto object-contain pointer-events-auto select-none m-auto"
                style={{
                  maxHeight: "100dvh",
                  maxWidth: "100vw",
                  objectFit: "contain",
                  margin: "auto",
                }}
                loading={idx === 0 ? "eager" : "lazy"}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Huy hiệu chỉ số ảnh Album (ví dụ: 1/5) - bấm vào để mở lưới chọn ảnh */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsGridOpen(true);
        }}
        title="Bấm để xem tất cả ảnh trong Album"
        className="absolute top-16 right-4 z-30 px-3 py-1.5 rounded-full bg-black/65 hover:bg-black/85 backdrop-blur-md border border-white/20 hover:border-white/40 text-white text-xs font-bold tracking-wider shadow-lg flex items-center gap-1.5 pointer-events-auto cursor-pointer active:scale-95 transition"
      >
        <Layers className="w-3.5 h-3.5 text-blue-400" />
        <span>
          {currentIndex + 1} / {images.length}
        </span>
        <LayoutGrid className="w-3 h-3 text-neutral-400 ml-0.5" />
      </button>

      {/* Nút điều hướng ảnh trước/sau trên Desktop */}
      {currentIndex > 0 && (
        <button
          onClick={scrollPrev}
          className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-30 p-2.5 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md border border-white/20 transition shadow-lg active:scale-95"
          title="Ảnh trước"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {currentIndex < images.length - 1 && (
        <button
          onClick={scrollNext}
          className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-30 p-2.5 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md border border-white/20 transition shadow-lg active:scale-95"
          title="Ảnh tiếp theo"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {/* Các chấm chỉ vị trí ảnh ở chân màn hình (Dots indicator) - nâng cao hơn 0.5cm tránh cấn thanh vuốt Home */}
      <div className="absolute bottom-5 sm:bottom-6 left-0 right-0 z-30 flex items-center justify-center gap-1.5 pointer-events-none">
        {images.map((_, idx) => (
          <div
            key={idx}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              idx === currentIndex
                ? "w-6 bg-white shadow-md shadow-white/50"
                : "w-1.5 bg-white/40"
            }`}
          />
        ))}
      </div>

      {/* Nút Yêu thích (Heart) phía bên phải */}
      {onToggleFavorite && (
        <div className="absolute right-2.5 sm:right-3.5 bottom-16 sm:bottom-20 flex flex-col gap-2.5 sm:gap-3 z-30 opacity-75 hover:opacity-100 active:opacity-100 focus-within:opacity-100 transition-all duration-300">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            title={isFavorite ? "Bỏ yêu thích" : "Yêu thích"}
            className="p-2.5 sm:p-3 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/80 active:scale-90 transition border border-white/20 shadow-lg"
          >
            <Heart
              className={`w-6 h-6 sm:w-7 sm:h-7 transition ${
                isFavorite ? "fill-red-500 text-red-500 scale-110" : "text-white"
              }`}
            />
          </button>
        </div>
      )}
      {/* MODAL / DRAWER HIỂN THỊ LƯỚI TẤT CẢ ẢNH TRONG GALLERY */}
      {isGridOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            setIsGridOpen(false);
          }}
        >
          <div
            className="w-full max-w-xl bg-neutral-900 border border-white/10 rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 shadow-2xl max-h-[85vh] flex flex-col space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400">
                  <LayoutGrid className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Tất cả ảnh trong Album ({images.length})
                  </h3>
                  <p className="text-[11px] text-neutral-400">
                    Chạm vào ảnh bất kỳ để chuyển nhanh tới ảnh đó
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsGridOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition"
                title="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid danh sách ảnh */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 overflow-y-auto max-h-[60vh] p-1 no-scrollbar">
              {images.map((src, idx) => {
                const isCurrent = idx === currentIndex;

                return (
                  <div
                    key={`${src}-${idx}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      emblaApi?.scrollTo(idx);
                      setCurrentIndex(idx);
                      setIsGridOpen(false);
                    }}
                    className={`group relative aspect-[3/4] rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${
                      isCurrent
                        ? "border-blue-500 ring-2 ring-blue-500/50 shadow-lg shadow-blue-500/30 scale-[0.98]"
                        : "border-neutral-800 hover:border-neutral-600 opacity-75 hover:opacity-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Thumbnail ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover select-none pointer-events-none"
                      loading="lazy"
                    />

                    {/* Huy hiệu số thứ tự */}
                    <div
                      className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold backdrop-blur-sm ${
                        isCurrent
                          ? "bg-blue-600 text-white shadow"
                          : "bg-black/60 text-white/80"
                      }`}
                    >
                      #{idx + 1}
                    </div>

                    {/* Nhãn đang xem */}
                    {isCurrent && (
                      <div className="absolute bottom-1.5 inset-x-1.5 py-0.5 rounded bg-blue-600/90 text-white text-[10px] font-bold text-center backdrop-blur-sm shadow">
                        Đang xem
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
