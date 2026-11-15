"use client";

import { useRef, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Maximize2, Minimize2, ZoomIn, RotateCcw } from "lucide-react";

interface ImageViewerProps {
  src: string;
  alt?: string;
  isActive: boolean;
}

export default function ImageViewer({ src, alt = "Image", isActive }: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
        initialScale={1}
        minScale={1}
        maxScale={6}
        doubleClick={{ mode: "toggle", step: 2 }}
        wheel={{ step: 0.2 }}
        panning={{ velocityDisabled: true }}
      >
        {({ resetTransform, zoomIn }) => (
          <>
            <TransformComponent
              wrapperClass="!w-full !h-full flex items-center justify-center"
              contentClass="!w-full !h-full flex items-center justify-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                className="w-full h-full object-contain pointer-events-auto"
                loading="eager"
              />
            </TransformComponent>

            {/* Nút điều khiển nhanh cho ảnh */}
            <div className="absolute right-3 bottom-24 flex flex-col gap-4 z-30">
              {/* Nút phóng to nhanh */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  zoomIn();
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
