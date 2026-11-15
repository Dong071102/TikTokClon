"use client";

import { useEffect, useRef, useState } from "react";
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { Maximize2, Minimize2, ZoomIn, RotateCcw, Heart } from "lucide-react";

interface ImageViewerProps {
  src: string;
  alt?: string;
  isActive: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

export default function ImageViewer({
  src,
  alt = "Image",
  isActive,
  isFavorite = false,
  onToggleFavorite,
}: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  // Tự động reset ảnh về kích thước gốc khi cuộn sang bài khác
  useEffect(() => {
    if (!isActive && transformRef.current) {
      transformRef.current.resetTransform();
      setIsZoomed(false);
    }
  }, [isActive]);

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden select-none"
    >
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={1}
        maxScale={5}
        // Vô hiệu hoá con lăn chuột zoom để cuộn chuột luôn luôn chuyển bài (scroll feed)
        wheel={{ disabled: true }}
        // Chỉ cho phép kéo ảnh (pan) khi đang phóng to (>1x) để không cản trở thao tác vuốt cuộn bài
        panning={{ disabled: !isZoomed, velocityDisabled: true }}
        // Hỗ trợ chụm 2 ngón trên điện thoại và nhấp đúp để phóng to/thu nhỏ
        pinch={{ disabled: false }}
        doubleClick={{ mode: "toggle", step: 2 }}
        onTransformed={(ref) => {
          setIsZoomed(ref.state.scale > 1.05);
        }}
      >
        {({ resetTransform, zoomIn }) => (
          <>
            <TransformComponent
              wrapperStyle={{
                width: "100%",
                height: "100%",
              }}
              contentStyle={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              wrapperClass="!w-full !h-full overflow-hidden"
              contentClass="!w-full !h-full !flex !items-center !justify-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[100dvh] w-auto h-auto object-contain pointer-events-auto select-none m-auto"
                style={{
                  maxHeight: "100dvh",
                  maxWidth: "100vw",
                  objectFit: "contain",
                  aspectRatio: "auto",
                  margin: "auto",
                }}
                loading="eager"
              />
            </TransformComponent>

            {/* Nút điều khiển nhanh cho ảnh */}
            <div className="absolute right-3 bottom-24 flex flex-col gap-4 z-30">
              {/* Nút Yêu thích (Heart) */}
              {onToggleFavorite && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite();
                  }}
                  title={isFavorite ? "Bỏ yêu thích" : "Yêu thích"}
                  className="p-3 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/80 active:scale-90 transition border border-white/20 shadow-lg"
                >
                  <Heart
                    className={`w-6 h-6 transition ${
                      isFavorite ? "fill-red-500 text-red-500 scale-110" : "text-white"
                    }`}
                  />
                </button>
              )}

              {/* Nút phóng to nhanh */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  zoomIn();
                  setIsZoomed(true);
                }}
                title="Phóng to"
                className="p-3 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/80 active:scale-90 transition border border-white/20 shadow-lg"
              >
                <ZoomIn className="w-6 h-6" />
              </button>

              {/* Nút đặt lại tỉ lệ ban đầu */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  resetTransform();
                  setIsZoomed(false);
                }}
                title="Thu nhỏ về ban đầu"
                className="p-3 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/80 active:scale-90 transition border border-white/20 shadow-lg"
              >
                <RotateCcw className="w-6 h-6" />
              </button>

              {/* Nút toàn màn hình */}
              <button
                onClick={toggleFullscreen}
                title="Toàn màn hình"
                className="p-3 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/80 active:scale-90 transition border border-white/20 shadow-lg"
              >
                {isFullscreen ? <Minimize2 className="w-6 h-6" /> : <Maximize2 className="w-6 h-6" />}
              </button>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
