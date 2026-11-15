"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, RotateCw, Maximize2, Minimize2 } from "lucide-react";

interface VideoPlayerProps {
  src: string;
  isActive: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  defaultRotate?: number;
  isLandscape?: boolean;
}

export default function VideoPlayer({
  src,
  isActive,
  isMuted,
  toggleMute,
  defaultRotate = 0,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const [rotation, setRotation] = useState<number>(defaultRotate);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Tự động phát khi slide active, dừng khi cuộn qua slide khác
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      video.muted = isMuted;
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          // Autoplay policy có thể yêu cầu muted
          video.muted = true;
          video.play().catch(() => {});
        });
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [isActive, isMuted]);

  // Đồng bộ trạng thái mute
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
    setShowPlayIcon(true);
    setTimeout(() => setShowPlayIcon(false), 500);
  };

  // Nút xoay 90 độ cho video ngang
  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRotation((prev) => (prev + 90) % 360);
  };

  // Bật/tắt toàn màn hình
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

  const isRotated90 = rotation === 90 || rotation === 270;

  return (
    <div
      ref={containerRef}
      onClick={togglePlay}
      className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden select-none"
    >
      {/* Video Container với CSS Transform để xoay */}
      <div
        className="w-full h-full flex items-center justify-center transition-transform duration-300"
        style={{
          transform: `rotate(${rotation}deg)`,
          width: isRotated90 ? "100vh" : "100%",
          height: isRotated90 ? "100vw" : "100%",
        }}
      >
        <video
          ref={videoRef}
          src={src}
          playsInline
          loop
          preload="metadata"
          className="w-full h-full object-contain"
          onError={(e) => {
            const target = e.currentTarget;
            if (!target.src.includes("/api/proxy")) {
              target.src = `/api/proxy?url=${encodeURIComponent(src)}`;
              target.load();
              if (isActive) target.play().catch(() => {});
            }
          }}
        />
      </div>

      {/* Hiệu ứng Icon Pause/Play ở giữa khi click */}
      {showPlayIcon && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="p-4 rounded-full bg-black/60 text-white backdrop-blur-sm animate-fade-in">
            {isPlaying ? <Play className="w-12 h-12" /> : <Pause className="w-12 h-12" />}
          </div>
        </div>
      )}

      {/* Nút hành động nhanh phía bên phải */}
      <div className="absolute right-3 bottom-24 flex flex-col gap-4 z-30">
        {/* Nút xoay video */}
        <button
          onClick={handleRotate}
          title="Xoay video 90°"
          className="p-3 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/80 active:scale-90 transition border border-white/20 shadow-lg"
        >
          <RotateCw className="w-6 h-6" />
        </button>

        {/* Nút Bật/Tắt âm thanh */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMute();
          }}
          title={isMuted ? "Bật âm thanh" : "Tắt âm thanh"}
          className="p-3 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/80 active:scale-90 transition border border-white/20 shadow-lg"
        >
          {isMuted ? <VolumeX className="w-6 h-6 text-red-400" /> : <Volume2 className="w-6 h-6 text-green-400" />}
        </button>

        {/* Nút Fullscreen */}
        <button
          onClick={toggleFullscreen}
          title="Toàn màn hình"
          className="p-3 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/80 active:scale-90 transition border border-white/20 shadow-lg"
        >
          {isFullscreen ? <Minimize2 className="w-6 h-6" /> : <Maximize2 className="w-6 h-6" />}
        </button>
      </div>
    </div>
  );
}
