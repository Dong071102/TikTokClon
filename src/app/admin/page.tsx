"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Link as LinkIcon,
  Upload,
  List,
  LogOut,
  PlaySquare,
  Image as ImageIcon,
  Check,
  AlertCircle,
  Loader2,
  Trash2,
  ExternalLink,
  RotateCw,
  Search,
  HardDrive,
  Globe,
  Pencil,
} from "lucide-react";
import Link from "next/link";

function renderAdminTextWithLinks(text?: string | null) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          title={`Mở trang: ${part}`}
          className="text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all font-semibold inline-flex items-center gap-0.5 mx-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <span>{part}</span>
          <ExternalLink className="w-3 h-3 inline-block shrink-0" />
        </a>
      );
    }
    return part;
  });
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"link" | "upload" | "list">("link");
  const [user, setUser] = useState<{ email: string; username: string } | null>(null);

  // States cho Tab 1: Thêm từ Link
  const [inputUrl, setInputUrl] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<any | null>(null);
  const [storageMode, setStorageMode] = useState<"DIRECT_LINK" | "LOCAL_STORAGE">("DIRECT_LINK");
  const [tagsInput, setTagsInput] = useState("");
  const [defaultRotate, setDefaultRotate] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);
  const [linkMsg, setLinkMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // States cho Tab 2: Upload File
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadTags, setUploadTags] = useState("");
  const [uploadRotate, setUploadRotate] = useState(0);
  const [uploadLandscape, setUploadLandscape] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // States cho Tab 3: Danh sách Media
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [mediaTotal, setMediaTotal] = useState(0);
  const [mediaPage, setMediaPage] = useState(1);
  const [loadingList, setLoadingList] = useState(false);
  const [searchTag, setSearchTag] = useState("");
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [editingTagsInput, setEditingTagsInput] = useState<string>("");
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; slug: string; count: number }>>([]);

  // Tải danh sách tag có sẵn để chọn nhanh
  const loadExistingTags = useCallback(async () => {
    try {
      const res = await fetch("/api/tags");
      if (res.ok) {
        const data = await res.json();
        setAvailableTags(data.tags || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Kiểm tra auth & tải tags
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => {
        if (!res.ok) window.location.href = "/admin/login";
        return res.json();
      })
      .then((data) => {
        if (data?.authenticated) setUser(data.user);
      })
      .catch(() => {
        window.location.href = "/admin/login";
      });

    loadExistingTags();
  }, [loadExistingTags]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  };

  // 1. Xử lý Bóc tách link
  const handleParseUrl = async () => {
    if (!inputUrl.trim()) return;
    setIsParsing(true);
    setLinkMsg(null);
    setParsedData(null);

    try {
      const res = await fetch("/api/admin/parse-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inputUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không thể bóc tách link");

      setParsedData(json.data);
      if (json.data.isLandscape) setIsLandscape(true);
    } catch (err: any) {
      setLinkMsg({ type: "error", text: err.message });
    } finally {
      setIsParsing(false);
    }
  };

  // 1.1 Lưu link vào DB
  const handleSaveParsedMedia = async () => {
    if (!parsedData) return;
    setIsSubmittingLink(true);
    setLinkMsg(null);

    try {
      const tags = tagsInput
        .split(/[,;\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch("/api/admin/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: parsedData.type,
          sourceType: parsedData.sourceType,
          sourceUrl: inputUrl,
          mediaUrl: parsedData.mediaUrl,
          thumbnailUrl: parsedData.thumbnailUrl,
          title: parsedData.title,
          storageMode,
          tags,
          isLandscape,
          defaultRotate,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Lỗi lưu media");

      setLinkMsg({ type: "success", text: "Đã thêm media thành công vào hệ thống!" });
      setInputUrl("");
      setParsedData(null);
      setTagsInput("");
      setDefaultRotate(0);
      setIsLandscape(false);
      loadMediaList();
      loadExistingTags();
    } catch (err: any) {
      setLinkMsg({ type: "error", text: err.message });
    } finally {
      setIsSubmittingLink(false);
    }
  };

  // 2. Xử lý Upload file trực tiếp
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setIsUploading(true);
    setUploadMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("tags", uploadTags);
      formData.append("isLandscape", String(uploadLandscape));
      formData.append("defaultRotate", String(uploadRotate));

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Lỗi tải file");

      setUploadMsg({ type: "success", text: "Đã tải lên và lưu file thành công!" });
      setUploadFile(null);
      setUploadPreview(null);
      setUploadTags("");
      setUploadRotate(0);
      setUploadLandscape(false);
      loadMediaList();
      loadExistingTags();
    } catch (err: any) {
      setUploadMsg({ type: "error", text: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  // 3. Tải danh sách media
  const loadMediaList = useCallback(
    async (page = 1, tag = "") => {
      setLoadingList(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "15");
        if (tag) params.set("tag", tag);

        const res = await fetch(`/api/admin/media?${params.toString()}`);
        if (!res.ok) throw new Error("Lỗi tải danh sách");
        const json = await res.json();
        setMediaList(json.items || []);
        setMediaTotal(json.pagination?.total || 0);
        setMediaPage(page);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingList(false);
      }
    },
    []
  );

  useEffect(() => {
    if (activeTab === "list") {
      loadMediaList(1, searchTag);
    }
  }, [activeTab, loadMediaList, searchTag]);

  // Xoá media
  const handleDeleteMedia = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xoá media này?")) return;
    try {
      const res = await fetch(`/api/admin/media/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMediaList((prev) => prev.filter((m) => m.id !== id));
        setMediaTotal((prev) => Math.max(prev - 1, 0));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Xoay nhanh 90 độ
  const handleToggleRotate = async (id: string, currentRotate: number) => {
    const nextRotate = (currentRotate + 90) % 360;
    try {
      const res = await fetch(`/api/admin/media/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultRotate: nextRotate }),
      });
      if (res.ok) {
        setMediaList((prev) =>
          prev.map((m) => (m.id === id ? { ...m, defaultRotate: nextRotate } : m))
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Bắt đầu sửa tags cho media
  const handleStartEditTags = (item: any) => {
    setEditingTagsId(item.id);
    setEditingTagsInput(item.tags.join(", "));
  };

  // Lưu tags sau khi chỉnh sửa
  const handleSaveTags = async (id: string) => {
    setIsSavingTags(true);
    try {
      const splitTags = editingTagsInput
        .split(/[,;\s]+/)
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean);

      const res = await fetch(`/api/admin/media/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: splitTags }),
      });

      if (res.ok) {
        setMediaList((prev) =>
          prev.map((m) => (m.id === id ? { ...m, tags: splitTags } : m))
        );
        setEditingTagsId(null);
        loadExistingTags();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingTags(false);
    }
  };

  // Render danh sách tag có sẵn với màu sắc phân biệt cho Top 5 tag phổ biến nhất
  const renderTagSelector = (
    selectedString: string,
    onChange: (val: string) => void
  ) => {
    if (availableTags.length === 0) return null;

    const currentTags = selectedString
      .split(/[,;\s]+/)
      .map((t) => t.trim().replace(/^#/, "").toLowerCase())
      .filter(Boolean);

    const handleToggle = (tagName: string) => {
      const cleanName = tagName.trim().replace(/^#/, "");
      const lowerName = cleanName.toLowerCase();
      let updated: string[];

      if (currentTags.includes(lowerName)) {
        // Nếu đã có thì bỏ chọn
        updated = selectedString
          .split(/[,;\s]+/)
          .map((t) => t.trim().replace(/^#/, ""))
          .filter((t) => t.toLowerCase() !== lowerName);
      } else {
        // Nếu chưa có thì thêm vào
        const existing = selectedString
          .split(/[,;\s]+/)
          .map((t) => t.trim().replace(/^#/, ""))
          .filter(Boolean);
        updated = [...existing, cleanName];
      }
      onChange(updated.join(", "));
    };

    return (
      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-neutral-400 font-medium">
          <span>Chọn nhanh từ tag có sẵn:</span>
          <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
            <span>🔥</span> Top 5 tag nhiều nhất
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto no-scrollbar p-2 bg-neutral-950/70 rounded-xl border border-neutral-800">
          {availableTags.map((t, idx) => {
            const isTop5 = idx < 5;
            const isSelected = currentTags.includes(t.name.toLowerCase());

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleToggle(t.name)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition active:scale-95 ${
                  isSelected
                    ? isTop5
                      ? "bg-amber-500 border-amber-400 text-black font-bold shadow-md shadow-amber-500/20"
                      : "bg-blue-600 border-blue-500 text-white font-bold"
                    : isTop5
                    ? "bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                    : "bg-neutral-800/80 border-neutral-700 text-neutral-300 hover:bg-neutral-700 hover:text-white"
                }`}
              >
                {isTop5 && <span>🔥</span>}
                <span>#{t.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected
                      ? isTop5
                        ? "bg-black/20 text-black"
                        : "bg-white/20 text-white"
                      : isTop5
                      ? "bg-amber-500/25 text-amber-200"
                      : "bg-neutral-700 text-neutral-400"
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-[100dvh] bg-neutral-950 text-white flex flex-col">
      {/* Top Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-md sticky top-0 z-30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400">
            <PlaySquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight">TikTok Media Admin</h1>
            <p className="text-xs text-neutral-400">{user?.email || "Admin"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            target="_blank"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-white transition border border-neutral-700"
          >
            <span>Xem Feed</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={handleLogout}
            title="Đăng xuất"
            className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-red-400 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="border-b border-neutral-800 bg-neutral-900 px-4 flex gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab("link")}
          className={`py-3.5 flex items-center gap-2 border-b-2 transition ${
            activeTab === "link"
              ? "border-blue-500 text-blue-400 font-semibold"
              : "border-transparent text-neutral-400 hover:text-white"
          }`}
        >
          <LinkIcon className="w-4 h-4" />
          <span>Thêm từ Link (X, TikTok...)</span>
        </button>

        <button
          onClick={() => setActiveTab("upload")}
          className={`py-3.5 flex items-center gap-2 border-b-2 transition ${
            activeTab === "upload"
              ? "border-blue-500 text-blue-400 font-semibold"
              : "border-transparent text-neutral-400 hover:text-white"
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>Tải file trực tiếp</span>
        </button>

        <button
          onClick={() => setActiveTab("list")}
          className={`py-3.5 flex items-center gap-2 border-b-2 transition ${
            activeTab === "list"
              ? "border-blue-500 text-blue-400 font-semibold"
              : "border-transparent text-neutral-400 hover:text-white"
          }`}
        >
          <List className="w-4 h-4" />
          <span>Danh sách media ({mediaTotal})</span>
        </button>
      </div>

      {/* Main Tab Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 overflow-y-auto">
        {/* TAB 1: THÊM TỪ LINK */}
        {activeTab === "link" && (
          <div className="space-y-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-blue-400" />
                <span>Bóc tách Link đa nền tảng</span>
              </h2>
              <p className="text-xs text-neutral-400 mb-4">
                Hỗ trợ link bài đăng X (Twitter), TikTok, Instagram, YouTube Shorts hoặc link trực tiếp ảnh/video.
              </p>

              {linkMsg && (
                <div
                  className={`p-3.5 rounded-xl text-sm mb-4 flex items-center gap-2 ${
                    linkMsg.type === "success"
                      ? "bg-green-500/10 text-green-400 border border-green-500/20"
                      : "bg-red-500/10 text-red-400 border border-red-500/20"
                  }`}
                >
                  {linkMsg.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span>{linkMsg.text}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="url"
                  placeholder="Dán link vào đây (ví dụ: https://x.com/username/status/...)"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  className="flex-1 px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-blue-500 transition"
                />
                <button
                  onClick={handleParseUrl}
                  disabled={isParsing || !inputUrl.trim()}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white font-medium rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                >
                  {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Bóc tách link</span>}
                </button>
              </div>
            </div>

            {/* PREVIEW KẾT QUẢ BÓC TÁCH */}
            {parsedData && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6 animate-fade-in">
                <h3 className="font-bold text-base text-neutral-200">Xem trước & Thiết lập Media</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Khung Preview Media */}
                  <div className="relative aspect-[9/16] max-h-[420px] bg-black rounded-xl overflow-hidden border border-neutral-800 flex items-center justify-center">
                    {parsedData.type === "VIDEO" ? (
                      <video
                        src={parsedData.mediaUrl}
                        controls
                        playsInline
                        className="w-full h-full object-contain"
                        style={{ transform: `rotate(${defaultRotate}deg)` }}
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (!target.src.includes("/api/proxy")) {
                            target.src = `/api/proxy?url=${encodeURIComponent(parsedData.mediaUrl)}`;
                            target.load();
                          }
                        }}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={parsedData.mediaUrl}
                        alt="Preview"
                        referrerPolicy="no-referrer"
                        className="max-w-full max-h-full w-auto h-auto object-contain select-none"
                      />
                    )}
                  </div>

                  {/* Form Cấu hình */}
                  <div className="space-y-4 flex flex-col justify-between">
                    <div className="space-y-4">
                      {/* Tiêu đề / Nội dung bài viết từ link */}
                      {parsedData.title && (
                        <div className="p-3 bg-neutral-800/80 border border-neutral-700/80 rounded-xl text-xs text-neutral-300 leading-relaxed whitespace-pre-line">
                          <span className="font-bold text-neutral-400 block mb-1">Nội dung bài viết & Hyperlink:</span>
                          {renderAdminTextWithLinks(parsedData.title)}
                        </div>
                      )}

                      {/* Chọn chế độ lưu trữ */}
                      <div>
                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                          Phương án lưu trữ
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setStorageMode("DIRECT_LINK")}
                            className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                              storageMode === "DIRECT_LINK"
                                ? "border-blue-500 bg-blue-500/10 text-white"
                                : "border-neutral-800 bg-neutral-800 text-neutral-400"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 font-semibold text-xs text-blue-400">
                              <Globe className="w-3.5 h-3.5" /> Direct Link
                            </span>
                            <span className="text-[11px] leading-tight opacity-70">
                              Lưu link gốc CDN, tiết kiệm dung lượng.
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setStorageMode("LOCAL_STORAGE")}
                            className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                              storageMode === "LOCAL_STORAGE"
                                ? "border-green-500 bg-green-500/10 text-white"
                                : "border-neutral-800 bg-neutral-800 text-neutral-400"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 font-semibold text-xs text-green-400">
                              <HardDrive className="w-3.5 h-3.5" /> Tải về Máy chủ
                            </span>
                            <span className="text-[11px] leading-tight opacity-70">
                              Lưu trữ nội bộ vĩnh viễn, không sợ bị xoá.
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Video Controls: Rotate */}
                      {parsedData.type === "VIDEO" && (
                        <div>
                          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                            Xoay ngang video mặc định
                          </label>
                          <div className="flex gap-2">
                            {[0, 90, 180, 270].map((deg) => (
                              <button
                                key={deg}
                                type="button"
                                onClick={() => setDefaultRotate(deg)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                  defaultRotate === deg
                                    ? "bg-blue-600 border-blue-500 text-white"
                                    : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                                }`}
                              >
                                {deg}°
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Gắn Tags */}
                      <div>
                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
                          Gắn Tags (cách nhau bởi dấu phẩy hoặc khoảng trắng)
                        </label>
                        <input
                          type="text"
                          placeholder="gái_xinh, meme, anime, travel..."
                          value={tagsInput}
                          onChange={(e) => setTagsInput(e.target.value)}
                          className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition"
                        />
                        {renderTagSelector(tagsInput, setTagsInput)}
                      </div>
                    </div>

                    <button
                      onClick={handleSaveParsedMedia}
                      disabled={isSubmittingLink}
                      className="w-full py-3.5 bg-green-600 hover:bg-green-500 active:scale-98 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-green-600/20"
                    >
                      {isSubmittingLink ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Lưu vào Hệ thống</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TẢI FILE TRỰC TIẾP */}
        {activeTab === "upload" && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-400" />
              <span>Tải Video hoặc Ảnh lên máy chủ</span>
            </h2>
            <p className="text-xs text-neutral-400 mb-6">
              Hỗ trợ video MP4/WebM hoặc ảnh JPG/PNG/WebP/GIF lưu trữ vĩnh viễn trên server.
            </p>

            {uploadMsg && (
              <div
                className={`p-3.5 rounded-xl text-sm mb-6 flex items-center gap-2 ${
                  uploadMsg.type === "success"
                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}
              >
                {uploadMsg.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{uploadMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-6">
              {/* Khu vực Drag & Drop */}
              <div className="border-2 border-dashed border-neutral-700 hover:border-neutral-500 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition bg-neutral-800/40 relative">
                <input
                  type="file"
                  accept="video/*,image/*"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="p-3 rounded-full bg-neutral-700/50 text-neutral-300 mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-neutral-200">
                  {uploadFile ? uploadFile.name : "Kéo thả hoặc nhấn để chọn file"}
                </p>
                <p className="text-xs text-neutral-500 mt-1">Hỗ trợ MP4, WebM, JPG, PNG, WebP</p>
              </div>

              {uploadPreview && (
                <div className="flex flex-col sm:flex-row gap-6 items-center">
                  <div className="relative aspect-[9/16] w-48 bg-black rounded-xl overflow-hidden border border-neutral-800 flex items-center justify-center">
                    {uploadFile?.type.startsWith("video/") ? (
                      <video
                        src={uploadPreview}
                        controls
                        className="w-full h-full object-contain"
                        style={{ transform: `rotate(${uploadRotate}deg)` }}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={uploadPreview} alt="Preview" className="w-full h-full object-contain" />
                    )}
                  </div>

                  <div className="flex-1 w-full space-y-4">
                    {uploadFile?.type.startsWith("video/") && (
                      <div>
                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                          Xoay góc video mặc định
                        </label>
                        <div className="flex gap-2">
                          {[0, 90, 180, 270].map((deg) => (
                            <button
                              key={deg}
                              type="button"
                              onClick={() => setUploadRotate(deg)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                uploadRotate === deg
                                  ? "bg-blue-600 border-blue-500 text-white"
                                  : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                              }`}
                            >
                              {deg}°
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
                        Gắn Tags (cách nhau bởi dấu phẩy)
                      </label>
                      <input
                        type="text"
                        placeholder="viral, funny, dance..."
                        value={uploadTags}
                        onChange={(e) => setUploadTags(e.target.value)}
                        className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition"
                      />
                      {renderTagSelector(uploadTags, setUploadTags)}
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isUploading || !uploadFile}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-98 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
              >
                {isUploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Tải lên và Lưu</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* TAB 3: QUẢN LÝ DANH SÁCH */}
        {activeTab === "list" && (
          <div className="space-y-4">
            {/* Filter Search */}
            <div className="flex items-center justify-between gap-4 bg-neutral-900 border border-neutral-800 p-4 rounded-xl">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Lọc theo tag..."
                  value={searchTag}
                  onChange={(e) => setSearchTag(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <span className="text-xs text-neutral-400">Tổng cộng: {mediaTotal} bài</span>
            </div>

            {loadingList ? (
              <div className="py-20 flex items-center justify-center text-neutral-500">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : mediaList.length === 0 ? (
              <div className="py-16 text-center text-neutral-500 bg-neutral-900 border border-neutral-800 rounded-xl">
                Chưa có media nào. Hãy thêm link hoặc tải file lên.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {mediaList.map((item) => (
                  <div
                    key={item.id}
                    className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex flex-col group"
                  >
                    {/* Media Preview Box */}
                    <div className="relative aspect-[9/16] max-h-60 bg-black flex items-center justify-center overflow-hidden">
                      {item.type === "VIDEO" ? (
                        <video
                          src={item.mediaUrl}
                          className="w-full h-full object-contain"
                          style={{ transform: `rotate(${item.defaultRotate}deg)` }}
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (!target.src.includes("/api/proxy")) {
                              target.src = `/api/proxy?url=${encodeURIComponent(item.mediaUrl)}`;
                              target.load();
                            }
                          }}
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.mediaUrl}
                          alt={item.title || "media"}
                          referrerPolicy="no-referrer"
                          className="max-w-full max-h-full w-auto h-auto object-contain select-none"
                        />
                      )}

                      {/* Badge Type & Source */}
                      <div className="absolute top-2 left-2 flex gap-1.5 z-10">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/60 text-white backdrop-blur-md">
                          {item.type}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-600/70 text-white backdrop-blur-md">
                          {item.sourceType}
                        </span>
                      </div>

                      {/* Storage Badge */}
                      <div className="absolute top-2 right-2 z-10">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold backdrop-blur-md ${
                            item.storageMode === "LOCAL_STORAGE"
                              ? "bg-green-600/80 text-white"
                              : "bg-neutral-700/80 text-neutral-300"
                          }`}
                        >
                          {item.storageMode === "LOCAL_STORAGE" ? "LOCAL" : "DIRECT"}
                        </span>
                      </div>
                    </div>

                    {/* Metadata & Actions */}
                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                      <div className="space-y-1">
                        <div className="text-xs text-neutral-300 line-clamp-2 leading-relaxed">
                          {renderAdminTextWithLinks(item.title) || (
                            <span className="text-neutral-500 italic">Không có tiêu đề</span>
                          )}
                        </div>
                        {editingTagsId === item.id ? (
                          <div className="space-y-1.5 pt-1">
                            <input
                              type="text"
                              value={editingTagsInput}
                              onChange={(e) => setEditingTagsInput(e.target.value)}
                              placeholder="tag1, tag2, tag3..."
                              className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs text-white focus:outline-none focus:border-blue-500"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveTags(item.id);
                                if (e.key === "Escape") setEditingTagsId(null);
                              }}
                              autoFocus
                            />
                            {renderTagSelector(editingTagsInput, setEditingTagsInput)}
                            <div className="flex gap-1.5 justify-end">
                              <button
                                onClick={() => handleSaveTags(item.id)}
                                disabled={isSavingTags}
                                className="px-2 py-0.5 rounded bg-green-600 hover:bg-green-500 text-white text-[11px] font-medium flex items-center gap-1"
                              >
                                {isSavingTags ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                                <span>Lưu tag</span>
                              </button>
                              <button
                                onClick={() => setEditingTagsId(null)}
                                className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px]"
                              >
                                Hủy
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            {item.tags.length > 0 ? (
                              item.tags.map((t: string) => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-400"
                                >
                                  #{t}
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] text-neutral-600 italic">Chưa gắn tag</span>
                            )}
                            <button
                              onClick={() => handleStartEditTags(item)}
                              title="Chỉnh sửa hoặc thêm tag"
                              className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-blue-400 transition ml-auto flex items-center gap-1 text-[11px]"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Sửa tag</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-neutral-800 flex items-center justify-between">
                        {item.type === "VIDEO" && (
                          <button
                            onClick={() => handleToggleRotate(item.id, item.defaultRotate)}
                            title="Xoay 90° mặc định"
                            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition text-xs flex items-center gap-1"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            <span>{item.defaultRotate}°</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleDeleteMedia(item.id)}
                          title="Xoá media"
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-neutral-400 hover:text-red-400 transition ml-auto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
