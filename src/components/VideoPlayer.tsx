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

  // Chế độ thu phóng khi xoay: "fill" (phóng to theo chiều lớn nhất của màn hình) | "fit" (thu vừa khung)
  const [zoomMode, setZoomMode] = useState<"fill" | "fit">("fill");

  // Kích thước của container màn hình và video gốc
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Trạng thái cho thanh tiến trình (Progress Bar & Scrubbing)
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [bufferedPercent, setBufferedPercent] = useState<number>(0);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [pendingSeekTime, setPendingSeekTime] = useState<number | null>(null);
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const wasPlayingBeforeScrub = useRef<boolean>(false);

  // Theo dõi kích thước container thực tế qua ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        setContainerSize({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

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

  // Xác định chế độ xoay 90 hoặc 270 độ
  const isRotated90 = rotation === 90 || rotation === 270;

  // Lấy kích thước container (ưu tiên containerSize, fallback window)
  const screenWidth =
    containerSize.width > 0
      ? containerSize.width
      : typeof window !== "undefined"
      ? window.innerWidth
      : 390;
  const screenHeight =
    containerSize.height > 0
      ? containerSize.height
      : typeof window !== "undefined"
      ? window.innerHeight
      : 844;

  const maxScreenDim = Math.max(screenWidth, screenHeight);
  const minScreenDim = Math.min(screenWidth, screenHeight);
  const isPortrait = screenHeight >= screenWidth;

  // Lấy tỷ lệ khung hình video (ưu tiên video thực tế, fallback 16:9 cho video ngang)
  const videoAspect =
    (videoRef.current?.videoWidth && videoRef.current?.videoHeight
      ? videoRef.current.videoWidth / videoRef.current.videoHeight
      : null) ||
    (videoDimensions.width > 0 && videoDimensions.height > 0
      ? videoDimensions.width / videoDimensions.height
      : 16 / 9);

  // Tính toán kích thước tự động thu phóng khi xoay ngang:
  // - zoomMode === "fill": Chiều dài video (width) tự động phóng to bằng chiều lớn nhất của màn hình (maxScreenDim)
  // - zoomMode === "fit": Chiều ngang video thu vừa khít chiều nhỏ của màn hình không bị cắt mép
  let rotatedWidth = 0;
  let rotatedHeight = 0;

  if (isRotated90) {
    if (zoomMode === "fill") {
      const targetLength = isPortrait ? maxScreenDim : screenHeight;
      rotatedWidth = targetLength;
      rotatedHeight = targetLength / videoAspect;
    } else {
      const targetBreadth = isPortrait ? minScreenDim : screenWidth;
      rotatedHeight = targetBreadth;
      rotatedWidth = targetBreadth * videoAspect;
    }
  }

  // Tính tỷ lệ hiển thị thanh tiến trình
  const activeTime = isScrubbing && pendingSeekTime !== null ? pendingSeekTime : currentTime;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (activeTime / duration) * 100)) : 0;

  return (
    <div
      ref={containerRef}
      onClick={togglePlay}
      className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden select-none"
    >
      {/* Video Container với CSS Transform để xoay và tự động thu phóng theo chiều lớn nhất của screen */}
      <div
        className="flex items-center justify-center transition-all duration-300 ease-out"
        style={
          isRotated90
            ? {
                position: "absolute",
                top: "50%",
                left: "50%",
                width: `${rotatedWidth}px`,
                height: `${rotatedHeight}px`,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              }
            : {
                width: "100%",
                height: "100%",
                transform: `rotate(${rotation}deg)`,
              }
        }
      >
        <video
          ref={videoRef}
          src={src}
          playsInline
          loop
          preload="metadata"
          className="w-full h-full object-contain pointer-events-auto select-none"
          onTimeUpdate={() => {
            if (!isScrubbing && videoRef.current) {
              setCurrentTime(videoRef.current.currentTime);
              updateBuffered();
            }
          }}
          onLoadedMetadata={() => {
            if (videoRef.current) {
              setDuration(videoRef.current.duration || 0);
              if (videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
                setVideoDimensions({
                  width: videoRef.current.videoWidth,
                  height: videoRef.current.videoHeight,
                });
              }
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

      {/* Nút hành động nhanh phía bên phải - thiết kế gọn gàng, bán trong suốt cả khi xem thường lẫn xoay màn hình */}
      <div
        className={`absolute z-30 flex flex-col transition-all duration-300 ${
          isRotated90
            ? "right-2 sm:right-3.5 bottom-12 sm:bottom-16 gap-2 sm:gap-2.5 opacity-65 hover:opacity-100 active:opacity-100 focus-within:opacity-100"
            : "right-2.5 sm:right-3.5 bottom-16 sm:bottom-20 gap-2.5 sm:gap-3 opacity-75 hover:opacity-100 active:opacity-100 focus-within:opacity-100"
        }`}
      >
        {/* Nút Yêu thích (Heart) */}
        {onToggleFavorite && (
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
        )}

        {/* Nút xoay video 90° */}
        <button
          onClick={handleRotate}
          title="Xoay video 90°"
          className="p-2.5 sm:p-3 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/80 active:scale-90 transition border border-white/20 shadow-lg"
        >
          <RotateCw className="w-6 h-6 sm:w-7 sm:h-7" />
        </button>

        {/* Nút chuyển đổi thu phóng lớn nhất (Fill) / vừa khung (Fit) khi đang xoay */}
        {isRotated90 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setZoomMode((prev) => (prev === "fill" ? "fit" : "fill"));
            }}
            title={
              zoomMode === "fill"
                ? "Thu vừa khung hình (Fit)"
                : "Phóng to theo chiều lớn nhất của màn hình (Fill)"
            }
            className="p-2.5 sm:p-3 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/80 active:scale-90 transition border border-white/20 shadow-lg"
          >
            {zoomMode === "fill" ? (
              <Minimize2 className="w-6 h-6 sm:w-7 sm:h-7 text-yellow-400" />
            ) : (
              <Maximize2 className="w-6 h-6 sm:w-7 sm:h-7 text-blue-400" />
            )}
          </button>
        )}

        {/* Nút Bật/Tắt âm thanh */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMute();
          }}
          title={isMuted ? "Bật âm thanh" : "Tắt âm thanh"}
          className="p-2.5 sm:p-3 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/80 active:scale-90 transition border border-white/20 shadow-lg"
        >
          {isMuted ? (
            <VolumeX className="w-6 h-6 sm:w-7 sm:h-7 text-red-400" />
          ) : (
            <Volume2 className="w-6 h-6 sm:w-7 sm:h-7 text-green-400" />
          )}
        </button>

        {/* Nút Fullscreen */}
        <button
          onClick={toggleFullscreen}
          title="Toàn màn hình"
          className="p-2.5 sm:p-3 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/80 active:scale-90 transition border border-white/20 shadow-lg"
        >
          {isFullscreen ? (
            <Minimize2 className="w-6 h-6 sm:w-7 sm:h-7" />
          ) : (
            <Maximize2 className="w-6 h-6 sm:w-7 sm:h-7" />
          )}
        </button>
      </div>

      {/* THANH TIẾN TRÌNH VIDEO (PROGRESS BAR & SCRUBBER)
          - Nâng cao hơn đáy màn hình khoảng 0.5cm (~20px / bottom-4 sm:bottom-5) để dễ thao tác trên di động, tránh cấn thanh vuốt Home của điện thoại
          - Khi xoay ngang: chuyển lên trên đầu màn hình (top-1 sm:top-2), mờ bán trong suốt
      */}
      <div
        className={`absolute left-0 right-0 z-30 group/progress px-3 sm:px-6 flex flex-col pointer-events-auto cursor-pointer transition-all duration-300 ${
          isRotated90
            ? "top-1 sm:top-2 pt-2 pb-3 justify-start opacity-50 hover:opacity-100"
            : "bottom-4 sm:bottom-5 py-2.5 justify-end opacity-75 hover:opacity-100"
        } ${isScrubbing ? "!opacity-100" : ""}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {/* Hiển thị thời gian khi đang tua hoặc hover (khi ở dưới đáy màn hình) */}
        {!isRotated90 && (isScrubbing || isHovering) && duration > 0 && (
          <div className="flex items-center justify-between text-[11px] font-semibold text-white/90 mb-1.5 px-1 drop-shadow-md pointer-events-none select-none">
            <span className="bg-black/75 px-2.5 py-0.5 rounded-full backdrop-blur-md border border-white/15">
              {formatTime(activeTime)} / {formatTime(duration)}
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
          className="relative w-full h-1.5 group-hover/progress:h-2.5 transition-all duration-150 bg-white/20 rounded-full overflow-visible touch-none"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          {/* Buffer bar (phần đã tải sẵn) */}
          {bufferedPercent > 0 && (
            <div
              className="absolute top-0 bottom-0 left-0 bg-white/30 rounded-full"
              style={{ width: `${bufferedPercent}%` }}
            />
          )}

          {/* Played Progress Bar (phần đã phát) - mờ bán trong suốt, thanh mảnh */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-white/80 group-hover/progress:bg-white rounded-full transition-colors"
            style={{ width: `${progressPercent}%` }}
          />

          {/* Scrubber Thumb (nút tròn chỉ vị trí) */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md shadow-black/50 transition-transform pointer-events-none ${
              isScrubbing || isHovering
                ? "scale-100 opacity-100"
                : "scale-0 opacity-0 group-hover/progress:scale-100 group-hover/progress:opacity-100"
            }`}
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        {/* Hiển thị thời gian khi đang tua hoặc hover (khi xoay ngang ở trên đầu màn hình) */}
        {isRotated90 && (isScrubbing || isHovering) && duration > 0 && (
          <div className="flex items-center justify-between text-[11px] font-semibold text-white/90 mt-1.5 px-1 drop-shadow-md pointer-events-none select-none">
            <span className="bg-black/75 px-2.5 py-0.5 rounded-full backdrop-blur-md border border-white/15">
              {formatTime(activeTime)} / {formatTime(duration)}
            </span>
            {isScrubbing && (
              <span className="text-[10px] text-amber-300 font-medium bg-black/75 px-2.5 py-0.5 rounded-full backdrop-blur-md border border-white/15">
                Đang tua...
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
