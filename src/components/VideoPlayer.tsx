"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, RotateCw, Maximize2, Minimize2, Heart } from "lucide-react";

interface VideoPlayerProps {
  src: string;
  isActive: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  defaultRotate?: number;
  isLandscape?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

// Hàm format thời gian định dạng phút:giây (vd: 0:15, 1:24)
function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export default function VideoPlayer({
  src,
  isActive,
  isMuted,
  toggleMute,
  defaultRotate = 0,
  isFavorite = false,
  onToggleFavorite,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const [rotation, setRotation] = useState<number>(defaultRotate);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Trạng thái cho thanh tiến trình (Progress Bar & Scrubbing)
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [bufferedPercent, setBufferedPercent] = useState<number>(0);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [pendingSeekTime, setPendingSeekTime] = useState<number | null>(null);
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const wasPlayingBeforeScrub = useRef<boolean>(false);

  // Cập nhật phần trăm đã đệm (buffered)
  const updateBuffered = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    if (video.buffered.length > 0) {
      const end = video.buffered.end(video.buffered.length - 1);
      setBufferedPercent(Math.min(100, (end / video.duration) * 100));
    }
  }, []);

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
      setIsScrubbing(false);
      setPendingSeekTime(null);
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

  // Tính vị trí thời gian khi kéo hoặc bấm vào thanh tiến trình
  const handleSeekFromPointer = useCallback(
    (clientX: number) => {
      const progressBar = progressBarRef.current;
      const video = videoRef.current;
      if (!progressBar || !video || !duration) return;

      const rect = progressBar.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      const targetTime = ratio * duration;

      setPendingSeekTime(targetTime);
      setCurrentTime(targetTime);
      video.currentTime = targetTime;
    },
    [duration]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!duration || !progressBarRef.current) return;

    // Lưu lại trạng thái phát trước khi kéo
    wasPlayingBeforeScrub.current = isPlaying;
    if (videoRef.current && isPlaying) {
      videoRef.current.pause();
    }

    setIsScrubbing(true);
    try {
      progressBarRef.current.setPointerCapture(e.pointerId);
    } catch {}
    handleSeekFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return;
    e.stopPropagation();
    handleSeekFromPointer(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return;
    e.stopPropagation();

    try {
      progressBarRef.current?.releasePointerCapture(e.pointerId);
    } catch {}

    setIsScrubbing(false);

    if (videoRef.current && pendingSeekTime !== null) {
      videoRef.current.currentTime = pendingSeekTime;
      setCurrentTime(pendingSeekTime);
      setPendingSeekTime(null);
    }

    // Nếu trước khi tua video đang phát thì tiếp tục phát
    if (wasPlayingBeforeScrub.current && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return;
    e.stopPropagation();
    try {
      progressBarRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
    setIsScrubbing(false);
    setPendingSeekTime(null);
    if (wasPlayingBeforeScrub.current && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  const isRotated90 = rotation === 90 || rotation === 270;

  // Tính tỷ lệ hiển thị thanh tiến trình
  const activeTime = isScrubbing && pendingSeekTime !== null ? pendingSeekTime : currentTime;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (activeTime / duration) * 100)) : 0;

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
          onTimeUpdate={() => {
            if (!isScrubbing && videoRef.current) {
              setCurrentTime(videoRef.current.currentTime);
              updateBuffered();
            }
          }}
          onLoadedMetadata={() => {
            if (videoRef.current) {
              setDuration(videoRef.current.duration || 0);
              updateBuffered();
            }
          }}
          onDurationChange={() => {
            if (videoRef.current) {
              setDuration(videoRef.current.duration || 0);
            }
          }}
          onProgress={updateBuffered}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
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

      {/* THANH TIẾN TRÌNH VIDEO (PROGRESS BAR & SCRUBBER) */}
      <div
        className="absolute bottom-0 left-0 right-0 z-30 group/progress py-3 px-3 sm:px-6 flex flex-col justify-end pointer-events-auto cursor-pointer"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {/* Hiển thị thời gian khi đang tua (Scrubbing) hoặc hover */}
        {(isScrubbing || isHovering) && duration > 0 && (
          <div className="flex items-center justify-between text-[11px] font-semibold text-white/90 mb-1.5 px-1 drop-shadow-md pointer-events-none select-none">
            <span className="bg-black/75 px-2.5 py-0.5 rounded-full backdrop-blur-md border border-white/15">
              {formatTime(isScrubbing && pendingSeekTime !== null ? pendingSeekTime : currentTime)} / {formatTime(duration)}
            </span>
            {isScrubbing && (
              <span className="text-[10px] text-amber-300 font-medium bg-black/75 px-2.5 py-0.5 rounded-full backdrop-blur-md border border-white/15">
                Đang tua...
              </span>
            )}
          </div>
        )}

        {/* Thanh Track & Fill */}
        <div
          ref={progressBarRef}
          className="relative w-full h-1 group-hover/progress:h-2 transition-all duration-150 bg-white/20 rounded-full overflow-visible touch-none"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          {/* Buffer bar (phần đã tải sẵn) */}
          {bufferedPercent > 0 && (
            <div
              className="absolute top-0 bottom-0 left-0 bg-white/25 rounded-full"
              style={{ width: `${bufferedPercent}%` }}
            />
          )}

          {/* Played Progress Bar (phần đã phát) */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-white group-hover/progress:bg-red-500 rounded-full transition-colors"
            style={{ width: `${progressPercent}%` }}
          />

          {/* Scrubber Thumb (nút tròn chỉ vị trí) */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white group-hover/progress:bg-red-500 rounded-full shadow-lg transition-transform pointer-events-none ${
              isScrubbing || isHovering
                ? "scale-100 opacity-100"
                : "scale-0 opacity-0 group-hover/progress:scale-100 group-hover/progress:opacity-100"
            }`}
            style={{ left: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
