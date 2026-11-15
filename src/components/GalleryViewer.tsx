"use client";

import { useEffect, useState, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Heart, Layers } from "lucide-react";

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

  // Tự động quay về ảnh đầu tiên khi cuộn bài khác
  useEffect(() => {
    if (!isActive && emblaApi) {
      emblaApi.scrollTo(0);
      setCurrentIndex(0);
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

      {/* Huy hiệu chỉ số ảnh Album (ví dụ: 1/5) ở góc trên */}
      <div className="absolute top-16 right-4 z-30 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white text-xs font-bold tracking-wider shadow-lg flex items-center gap-1.5 pointer-events-none">
        <Layers className="w-3.5 h-3.5 text-blue-400" />
        <span>
          {currentIndex + 1} / {images.length}
        </span>
      </div>

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

      {/* Các chấm chỉ vị trí ảnh ở chân màn hình (Dots indicator) */}
      <div className="absolute bottom-3 left-0 right-0 z-30 flex items-center justify-center gap-1.5 pointer-events-none">
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
    </div>
  );
}
