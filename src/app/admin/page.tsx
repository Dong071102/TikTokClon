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
  X,
  Plus,
  Layers,
  Film,
  Video,
  Tag,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CheckSquare,
  Square,
  Sparkles,
  Wand2,
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
  const [activeTab, setActiveTab] = useState<"link" | "web_images" | "upload" | "list">("link");
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

  // States cho Tab Bóc tách Media Web (Nhiều trang, Ảnh & Video)
  const [webScrapeUrl, setWebScrapeUrl] = useState("");
  const [isScrapingWeb, setIsScrapingWeb] = useState(false);
  const [scrapedWebTitle, setScrapedWebTitle] = useState("");
  const [isDeepCrawl, setIsDeepCrawl] = useState(false);

  // States cho công cụ tạo dải link phân trang tự động
  const [showPaginationBuilder, setShowPaginationBuilder] = useState(false);
  const [pageBuilderUrl, setPageBuilderUrl] = useState("");
  const [pageBuilderFrom, setPageBuilderFrom] = useState(1);
  const [pageBuilderTo, setPageBuilderTo] = useState(5);
  const [pageBuilderStep, setPageBuilderStep] = useState(1);
  const [scrapedPages, setScrapedPages] = useState<
    Array<{
      url: string;
      title: string;
      imageCount: number;
      videoCount: number;
      error?: string;
    }>
  >([]);
  const [scrapedMediaItems, setScrapedMediaItems] = useState<
    Array<{
      id: string;
      url: string;
      type: "IMAGE" | "VIDEO";
      sourceUrl: string;
      pageTitle?: string;
      thumbnailUrl?: string;
    }>
  >([]);
  const [selectedMediaUrls, setSelectedMediaUrls] = useState<string[]>([]);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<"ALL" | "IMAGE" | "VIDEO">("ALL");
  const [webStorageMode, setWebStorageMode] = useState<"DIRECT_LINK" | "LOCAL_STORAGE">("DIRECT_LINK");
  const [webGalleryTitle, setWebGalleryTitle] = useState("");
  const [webGalleryTags, setWebGalleryTags] = useState("");
  const [isSubmittingWebMedia, setIsSubmittingWebMedia] = useState(false);
  const [webScrapeMsg, setWebScrapeMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
  const [mediaLimit, setMediaLimit] = useState(24);
  const [mediaTotalPages, setMediaTotalPages] = useState(1);
  const [loadingList, setLoadingList] = useState(false);
  const [searchTag, setSearchTag] = useState("");
  const [listFormatFilter, setListFormatFilter] = useState<"ALL" | "IMAGE" | "GALLERY" | "VIDEO">("ALL");
  const [formatCounts, setFormatCounts] = useState<{ all: number; video: number; gallery: number; image: number }>({
    all: 0,
    video: 0,
    gallery: 0,
    image: 0,
  });

  // Chọn & Thao tác hàng loạt (Bulk actions)
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkTagging, setIsBulkTagging] = useState(false);
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkTagMode, setBulkTagMode] = useState<"ADD" | "REPLACE">("ADD");
  const [bulkActionMsg, setBulkActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [editingTagsInput, setEditingTagsInput] = useState<string>("");
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; slug: string; count: number }>>([]);
  const [tagFilterQuery, setTagFilterQuery] = useState("");

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

  // Hàm tạo dải link phân trang thông minh (Hỗ trợ cả page=N và lazy load offset=0, 20, 40...)
  const generatePaginationUrls = (
    urlTemplate: string,
    from: number,
    to: number,
    step: number = 1
  ): string[] => {
    const trimmed = urlTemplate.trim();
    if (!trimmed) return [];

    const validStep = Math.max(1, step || 1);
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const generated: string[] = [];

    // 1. Kiểm tra placeholder: [page], {page}, [offset], {offset}
    const hasPagePlaceholder = /\[page\]|\{page\}/i.test(trimmed);
    const hasOffsetPlaceholder = /\[offset\]|\{offset\}/i.test(trimmed);

    for (let val = start; val <= end; val += validStep) {
      if (hasPagePlaceholder) {
        generated.push(trimmed.replace(/\[page\]|\{page\}/gi, String(val)));
      } else if (hasOffsetPlaceholder) {
        generated.push(trimmed.replace(/\[offset\]|\{offset\}/gi, String(val)));
      } else if (/[?&](?:offset|skip|start)=\d+/i.test(trimmed)) {
        // Hỗ trợ dạng lazy load: offset=0, offset=20...
        const url = trimmed.replace(
          /([?&](?:offset|skip|start)=)\d+/gi,
          `$1${val}`
        );
        generated.push(url);
      } else if (/from_videos=\d+|from_albums=\d+/i.test(trimmed)) {
        // KVS CMS AJAX pattern (như abc.pink, xnhau...)
        let url = trimmed;
        if (/from_videos=\d+/i.test(url)) {
          url = url.replace(/from_videos=\d+/gi, `from_videos=${val}`);
        }
        if (/from_albums=\d+/i.test(url)) {
          url = url.replace(/from_albums=\d+/gi, `from_albums=${val}`);
        }
        generated.push(url);
      } else if (/[?&](?:page|p|pg|pagination|paged)=\d+/i.test(trimmed)) {
        // Query param phổ biến: page=2, p=2, pg=2
        const url = trimmed.replace(
          /([?&](?:page|p|pg|pagination|paged)=)\d+/gi,
          `$1${val}`
        );
        generated.push(url);
      } else if (/\/page\/\d+/i.test(trimmed)) {
        // Path phổ biến: /page/2/
        const url = trimmed.replace(/\/page\/\d+/gi, `/page/${val}`);
        generated.push(url);
      } else if (/\/p\/\d+/i.test(trimmed)) {
        // Path: /p/2/
        const url = trimmed.replace(/\/p\/\d+/gi, `/p/${val}`);
        generated.push(url);
      } else {
        // Fallback: tự động gắn ?page=N hoặc &page=N
        const separator = trimmed.includes("?") ? "&" : "?";
        generated.push(`${trimmed}${separator}page=${val}`);
      }
    }

    return generated;
  };

  // 1.2 Xử lý Quét & Bóc tách Media (Ảnh & Video) từ Web (Hỗ trợ nhiều trang cùng lúc)
  const handleScrapeWeb = async (overrideUrl?: string | unknown) => {
    const targetUrl = typeof overrideUrl === "string" ? overrideUrl : webScrapeUrl;
    if (!targetUrl.trim()) return;
    setIsScrapingWeb(true);
    setWebScrapeMsg(null);
    setScrapedMediaItems([]);
    setSelectedMediaUrls([]);
    setScrapedPages([]);

    try {
      const res = await fetch("/api/admin/scrape-web-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, deepCrawl: isDeepCrawl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không thể bóc tách media từ trang web");

      const items = json.data.items || [];
      const pages = json.data.pages || [];
      const totalImages = json.data.totalImages || 0;
      const totalVideos = json.data.totalVideos || 0;

      setScrapedWebTitle(json.data.title || "");
      setWebGalleryTitle(json.data.title || "");
      setScrapedPages(pages);
      setScrapedMediaItems(items);
      // Mặc định chọn tất cả media tìm thấy
      setSelectedMediaUrls(items.map((m: any) => m.url));

      setWebScrapeMsg({
        type: "success",
        text: `Quét thành công ${pages.length} trang web! Tìm thấy ${totalImages} hình ảnh và ${totalVideos} video. Hãy chọn các media bạn muốn lưu.`,
      });
    } catch (err: any) {
      setWebScrapeMsg({ type: "error", text: err.message });
    } finally {
      setIsScrapingWeb(false);
    }
  };

  const toggleSelectMedia = (url: string) => {
    setSelectedMediaUrls((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  };

  const handleSelectAllMedia = () => {
    if (mediaTypeFilter === "ALL") {
      setSelectedMediaUrls(scrapedMediaItems.map((m) => m.url));
    } else {
      setSelectedMediaUrls((prev) => {
        const filteredUrls = scrapedMediaItems
          .filter((m) => m.type === mediaTypeFilter)
          .map((m) => m.url);
        return Array.from(new Set([...prev, ...filteredUrls]));
      });
    }
  };

  const handleDeselectAllMedia = () => {
    if (mediaTypeFilter === "ALL") {
      setSelectedMediaUrls([]);
    } else {
      const filteredUrls = new Set(
        scrapedMediaItems
          .filter((m) => m.type === mediaTypeFilter)
          .map((m) => m.url)
      );
      setSelectedMediaUrls((prev) => prev.filter((u) => !filteredUrls.has(u)));
    }
  };

  const handleSelectOnlyImages = () => {
    setSelectedMediaUrls(
      scrapedMediaItems.filter((m) => m.type === "IMAGE").map((m) => m.url)
    );
  };

  const handleSelectOnlyVideos = () => {
    setSelectedMediaUrls(
      scrapedMediaItems.filter((m) => m.type === "VIDEO").map((m) => m.url)
    );
  };

  // Lưu các ảnh đã chọn thành 1 bài viết Gallery Album
  const handleSaveImagesAsGallery = async () => {
    const selectedImages = scrapedMediaItems
      .filter((m) => m.type === "IMAGE" && selectedMediaUrls.includes(m.url))
      .map((m) => m.url);

    if (selectedImages.length === 0) {
      setWebScrapeMsg({ type: "error", text: "Vui lòng chọn ít nhất 1 hình ảnh để tạo Gallery" });
      return;
    }

    setIsSubmittingWebMedia(true);
    setWebScrapeMsg(null);

    try {
      const tags = webGalleryTags
        .split(/[,;\s]+/)
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean);

      const firstPageUrl = webScrapeUrl.split(/[\r\n,]+/)[0]?.trim() || null;

      const res = await fetch("/api/admin/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "IMAGE",
          sourceType: "WEB_SCRAPE",
          sourceUrl: firstPageUrl,
          mediaUrl: selectedImages[0],
          galleryUrls: selectedImages,
          title: webGalleryTitle.trim() || scrapedWebTitle || null,
          storageMode: webStorageMode,
          tags,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không thể lưu Gallery");

      setWebScrapeMsg({
        type: "success",
        text: `Tạo Gallery thành công với ${selectedImages.length} ảnh! Đã lưu vào hệ thống.`,
      });
      loadMediaList();
      loadExistingTags();
    } catch (err: any) {
      setWebScrapeMsg({ type: "error", text: err.message });
    } finally {
      setIsSubmittingWebMedia(false);
    }
  };

  // Lưu các video đã chọn thành từng bài viết riêng
  const handleSaveSelectedVideos = async () => {
    const selectedVideos = scrapedMediaItems.filter(
      (m) => m.type === "VIDEO" && selectedMediaUrls.includes(m.url)
    );

    if (selectedVideos.length === 0) {
      setWebScrapeMsg({ type: "error", text: "Vui lòng chọn ít nhất 1 video để lưu" });
      return;
    }

    setIsSubmittingWebMedia(true);
    setWebScrapeMsg(null);

    try {
      const tags = webGalleryTags
        .split(/[,;\s]+/)
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean);

      const itemsToSave = selectedVideos.map((v) => ({
        type: "VIDEO",
        sourceType: "WEB_SCRAPE",
        sourceUrl: v.sourceUrl,
        mediaUrl: v.url,
        thumbnailUrl: v.thumbnailUrl || null,
        title: webGalleryTitle.trim() || v.pageTitle || scrapedWebTitle || null,
        storageMode: webStorageMode,
        tags,
      }));

      const res = await fetch("/api/admin/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsToSave }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không thể lưu danh sách video");

      setWebScrapeMsg({
        type: "success",
        text: `Đã lưu thành công ${selectedVideos.length} video vào hệ thống!`,
      });
      loadMediaList();
      loadExistingTags();
    } catch (err: any) {
      setWebScrapeMsg({ type: "error", text: err.message });
    } finally {
      setIsSubmittingWebMedia(false);
    }
  };

  // Lưu tất cả đã chọn: Gom các ảnh thành 1 bài Gallery + Lưu từng video thành bài riêng
  const handleSaveAllSelectedMedia = async () => {
    const selectedImages = scrapedMediaItems
      .filter((m) => m.type === "IMAGE" && selectedMediaUrls.includes(m.url))
      .map((m) => m.url);
    const selectedVideos = scrapedMediaItems.filter(
      (m) => m.type === "VIDEO" && selectedMediaUrls.includes(m.url)
    );

    if (selectedImages.length === 0 && selectedVideos.length === 0) {
      setWebScrapeMsg({ type: "error", text: "Vui lòng chọn ít nhất 1 ảnh hoặc video để lưu" });
      return;
    }

    setIsSubmittingWebMedia(true);
    setWebScrapeMsg(null);

    try {
      const tags = webGalleryTags
        .split(/[,;\s]+/)
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean);

      const itemsToSave: any[] = [];
      const firstPageUrl = webScrapeUrl.split(/[\r\n,]+/)[0]?.trim() || null;

      // 1. Nếu có ảnh: gom thành 1 bài Gallery
      if (selectedImages.length > 0) {
        itemsToSave.push({
          type: "IMAGE",
          sourceType: "WEB_SCRAPE",
          sourceUrl: firstPageUrl,
          mediaUrl: selectedImages[0],
          galleryUrls: selectedImages,
          title: webGalleryTitle.trim() || scrapedWebTitle || null,
          storageMode: webStorageMode,
          tags,
        });
      }

      // 2. Nếu có video: lưu từng video thành bài viết riêng
      for (const v of selectedVideos) {
        itemsToSave.push({
          type: "VIDEO",
          sourceType: "WEB_SCRAPE",
          sourceUrl: v.sourceUrl,
          mediaUrl: v.url,
          thumbnailUrl: v.thumbnailUrl || null,
          title: webGalleryTitle.trim() || v.pageTitle || scrapedWebTitle || null,
          storageMode: webStorageMode,
          tags,
        });
      }

      const res = await fetch("/api/admin/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsToSave }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không thể lưu media");

      setWebScrapeMsg({
        type: "success",
        text: `Đã lưu thành công ${itemsToSave.length} bài viết (${selectedImages.length} ảnh trong 1 Gallery + ${selectedVideos.length} video riêng) vào hệ thống!`,
      });
      loadMediaList();
      loadExistingTags();
    } catch (err: any) {
      setWebScrapeMsg({ type: "error", text: err.message });
    } finally {
      setIsSubmittingWebMedia(false);
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
    async (
      page = 1,
      tag = searchTag,
      format = listFormatFilter,
      limit = mediaLimit
    ) => {
      setLoadingList(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        if (tag) params.set("tag", tag);
        if (format && format !== "ALL") params.set("format", format);

        const res = await fetch(`/api/admin/media?${params.toString()}`);
        if (!res.ok) throw new Error("Lỗi tải danh sách");
        const json = await res.json();
        setMediaList(json.items || []);
        setMediaTotal(json.pagination?.total || 0);
        setMediaTotalPages(json.pagination?.totalPages || 1);
        setMediaPage(page);
        if (json.counts) {
          setFormatCounts(json.counts);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingList(false);
      }
    },
    [searchTag, listFormatFilter, mediaLimit]
  );

  useEffect(() => {
    if (activeTab === "list") {
      loadMediaList(mediaPage, searchTag, listFormatFilter, mediaLimit);
    }
  }, [activeTab, loadMediaList, mediaPage, searchTag, listFormatFilter, mediaLimit]);

  // Chọn / bỏ chọn 1 media
  const handleToggleSelectMedia = (id: string) => {
    setSelectedMediaIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Chọn tất cả các media trên trang hiện tại
  const handleSelectAllOnCurrentPage = () => {
    const currentPageIds = mediaList.map((m) => m.id);
    const allSelected =
      currentPageIds.length > 0 && currentPageIds.every((id) => selectedMediaIds.includes(id));
    if (allSelected) {
      setSelectedMediaIds((prev) => prev.filter((id) => !currentPageIds.includes(id)));
    } else {
      setSelectedMediaIds((prev) => Array.from(new Set([...prev, ...currentPageIds])));
    }
  };

  // Bỏ chọn tất cả danh sách
  const handleDeselectAllListMedia = () => {
    setSelectedMediaIds([]);
  };

  // Xoá media đơn lẻ
  const handleDeleteMedia = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xoá media này?")) return;
    try {
      const res = await fetch(`/api/admin/media/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMediaList((prev) => prev.filter((m) => m.id !== id));
        setSelectedMediaIds((prev) => prev.filter((item) => item !== id));
        setMediaTotal((prev) => Math.max(prev - 1, 0));
        loadMediaList(mediaPage, searchTag, listFormatFilter, mediaLimit);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Xóa media hàng loạt
  const handleBulkDelete = async () => {
    if (selectedMediaIds.length === 0) return;
    if (
      !confirm(
        `Bạn có chắc chắn muốn xoá vĩnh viễn ${selectedMediaIds.length} media đã chọn khỏi hệ thống?`
      )
    )
      return;

    setIsBulkDeleting(true);
    setBulkActionMsg(null);
    try {
      const res = await fetch("/api/admin/media", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedMediaIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi khi xóa hàng loạt");

      setBulkActionMsg({
        type: "success",
        text: `Đã xóa thành công ${selectedMediaIds.length} media!`,
      });
      setSelectedMediaIds([]);
      loadMediaList(mediaPage, searchTag, listFormatFilter, mediaLimit);
      loadExistingTags();
    } catch (err: any) {
      setBulkActionMsg({ type: "error", text: err.message || "Xóa hàng loạt thất bại" });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Gán nhãn hàng loạt
  const handleBulkAssignTags = async () => {
    if (selectedMediaIds.length === 0) return;
    const splitTags = bulkTagInput
      .split(/[,;\s]+/)
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean);

    if (splitTags.length === 0 && bulkTagMode === "ADD") {
      alert("Vui lòng nhập ít nhất 1 nhãn (tag) hợp lệ để gán.");
      return;
    }

    setIsBulkTagging(true);
    setBulkActionMsg(null);
    try {
      const res = await fetch("/api/admin/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedMediaIds,
          tags: splitTags,
          mode: bulkTagMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi khi gán nhãn hàng loạt");

      setBulkActionMsg({
        type: "success",
        text: `Đã gán nhãn thành công cho ${selectedMediaIds.length} media!`,
      });
      setShowBulkTagModal(false);
      setBulkTagInput("");
      loadMediaList(mediaPage, searchTag, listFormatFilter, mediaLimit);
      loadExistingTags();
    } catch (err: any) {
      alert(err.message || "Gán nhãn hàng loạt thất bại");
    } finally {
      setIsBulkTagging(false);
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

  // Render danh sách tag có sẵn với màu sắc phân biệt cho Top 5 tag phổ biến nhất và ô tìm kiếm/lọc tag
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

    const query = tagFilterQuery.toLowerCase().trim();
    const filteredTags = query
      ? availableTags.filter(
          (t) =>
            t.name.toLowerCase().includes(query) ||
            t.slug.toLowerCase().includes(query)
        )
      : availableTags;

    return (
      <div className="mt-2.5 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px] text-neutral-400 font-medium">
          <div className="flex items-center gap-1.5">
            <span>Chọn nhanh từ tag có sẵn:</span>
            {filteredTags.length > 0 && query && (
              <span className="text-[10px] text-neutral-400 bg-neutral-800 px-1.5 py-0.2 rounded-full">
                {filteredTags.length} kết quả
              </span>
            )}
          </div>
          <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
            <span>🔥</span> Top 5 tag nhiều nhất
          </span>
        </div>

        {/* Ô tìm kiếm / lọc tag */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Lọc / tìm kiếm nhanh trong danh sách tag..."
            value={tagFilterQuery}
            onChange={(e) => setTagFilterQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 bg-neutral-900 border border-neutral-700/80 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition"
          />
          {tagFilterQuery && (
            <button
              type="button"
              onClick={() => setTagFilterQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
              title="Xoá tìm kiếm tag"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Danh sách Tag Chips */}
        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto no-scrollbar p-2 bg-neutral-950/70 rounded-xl border border-neutral-800">
          {filteredTags.length === 0 ? (
            <div className="w-full flex items-center justify-between p-2 text-xs text-neutral-400">
              <span>Không tìm thấy tag &quot;{tagFilterQuery}&quot;</span>
              <button
                type="button"
                onClick={() => {
                  handleToggle(tagFilterQuery);
                  setTagFilterQuery("");
                }}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1 transition active:scale-95 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm #{tagFilterQuery}</span>
              </button>
            </div>
          ) : (
            filteredTags.map((t) => {
              // Xác định vị trí top 5 dựa theo index trong danh sách gốc availableTags
              const originalIndex = availableTags.findIndex((item) => item.id === t.id);
              const isTop5 = originalIndex >= 0 && originalIndex < 5;
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
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-neutral-950 text-white flex flex-col overflow-hidden select-none">
      {/* Top Header */}
      <header className="shrink-0 border-b border-neutral-800 bg-neutral-900/90 backdrop-blur-md z-30 px-4 py-3 flex items-center justify-between">
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

      {/* Navigation Tabs (Cho phép cuộn ngang mượt mà trên điện thoại hẹp) */}
      <div className="shrink-0 border-b border-neutral-800 bg-neutral-900 px-4 flex gap-6 text-sm font-medium overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab("link")}
          className={`py-3.5 flex items-center gap-2 border-b-2 transition whitespace-nowrap shrink-0 ${
            activeTab === "link"
              ? "border-blue-500 text-blue-400 font-semibold"
              : "border-transparent text-neutral-400 hover:text-white"
          }`}
        >
          <LinkIcon className="w-4 h-4" />
          <span>Thêm từ Link (X, TikTok...)</span>
        </button>

        <button
          onClick={() => setActiveTab("web_images")}
          className={`py-3.5 flex items-center gap-2 border-b-2 transition whitespace-nowrap shrink-0 ${
            activeTab === "web_images"
              ? "border-blue-500 text-blue-400 font-semibold"
              : "border-transparent text-neutral-400 hover:text-white"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Bóc tách Web (Ảnh & Video đa trang)</span>
        </button>

        <button
          onClick={() => setActiveTab("upload")}
          className={`py-3.5 flex items-center gap-2 border-b-2 transition whitespace-nowrap shrink-0 ${
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
          className={`py-3.5 flex items-center gap-2 border-b-2 transition whitespace-nowrap shrink-0 ${
            activeTab === "list"
              ? "border-blue-500 text-blue-400 font-semibold"
              : "border-transparent text-neutral-400 hover:text-white"
          }`}
        >
          <List className="w-4 h-4" />
          <span>Danh sách media ({mediaTotal})</span>
        </button>
      </div>

      {/* Main Tab Content - Cuộn dọc mượt mà trên mọi điện thoại */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 pb-32 sm:pb-16 overflow-y-auto overscroll-contain select-text">
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

        {/* TAB BÓC TÁCH MEDIA WEB (ẢNH & VIDEO ĐA TRANG) */}
        {activeTab === "web_images" && (() => {
          const totalImages = scrapedMediaItems.filter((m) => m.type === "IMAGE").length;
          const totalVideos = scrapedMediaItems.filter((m) => m.type === "VIDEO").length;
          const selectedImagesCount = scrapedMediaItems.filter(
            (m) => m.type === "IMAGE" && selectedMediaUrls.includes(m.url)
          ).length;
          const selectedVideosCount = scrapedMediaItems.filter(
            (m) => m.type === "VIDEO" && selectedMediaUrls.includes(m.url)
          ).length;

          const displayedItems = scrapedMediaItems.filter((item) => {
            if (mediaTypeFilter === "ALL") return true;
            return item.type === mediaTypeFilter;
          });

          return (
            <div className="space-y-6">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-sm">
                <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-400" />
                  <span>Bóc tách Media từ Web (Ảnh & Video đa trang)</span>
                </h2>
                <p className="text-xs text-neutral-400 mb-4">
                  Dán 1 hoặc nhiều link trang web (báo, blog, diễn đàn, gallery, bài viết phân trang...), hệ thống sẽ tự động quét song song và bóc tách tất cả hình ảnh lẫn video. Bạn có thể chọn ảnh để tạo Gallery lướt ngang hoặc lưu video thành bài viết riêng biệt.
                </p>

                {webScrapeMsg && (
                  <div
                    className={`p-3.5 rounded-xl text-sm mb-4 flex items-center gap-2 ${
                      webScrapeMsg.type === "success"
                        ? "bg-green-500/10 text-green-400 border border-green-500/20"
                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                    }`}
                  >
                    {webScrapeMsg.type === "success" ? (
                      <Check className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{webScrapeMsg.text}</span>
                  </div>
                )}

                <div className="space-y-3">
                  {/* Tiêu đề & Nút bật công cụ phân trang */}
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Đường dẫn các trang web (Mỗi link 1 dòng)
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        if (!showPaginationBuilder && !pageBuilderUrl && webScrapeUrl) {
                          setPageBuilderUrl(webScrapeUrl.split(/[\r\n,]+/)[0].trim());
                        }
                        setShowPaginationBuilder(!showPaginationBuilder);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 hover:text-blue-300 border border-blue-500/30 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                      <span>{showPaginationBuilder ? "Đóng công cụ phân trang" : "⚡ Tự động tạo dải link (Trang 1 -> N)"}</span>
                    </button>
                  </div>

                  {/* Panel Công cụ sinh link phân trang tự động */}
                  {showPaginationBuilder && (
                    <div className="p-4 bg-blue-950/20 border border-blue-500/30 rounded-xl space-y-3 animate-in fade-in zoom-in-98 duration-150">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                          <Wand2 className="w-4 h-4 text-blue-400" />
                          <span>Công cụ sinh dải link phân trang hàng loạt</span>
                        </span>
                        <span className="text-[11px] text-neutral-400">
                          Hỗ trợ query `from_videos=N`, `page=N`, path `/page/N/` hoặc dùng ký hiệu `[page]`
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Dán link mẫu vào đây (ví dụ: https://abc.pink/search/...?from_videos=1 hoặc dùng [page])"
                            value={pageBuilderUrl}
                            onChange={(e) => setPageBuilderUrl(e.target.value)}
                            className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setPageBuilderUrl((prev) => prev ? `${prev}[page]` : "https://example.com/page/[page]");
                            }}
                            title="Thêm biến [page] vào URL"
                            className="px-2.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-blue-400 font-mono font-bold transition shrink-0"
                          >
                            + [page]
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPageBuilderUrl((prev) => prev ? `${prev}[offset]` : "https://example.com/api?offset=[offset]");
                            }}
                            title="Thêm biến [offset] vào URL (cho lazy loading)"
                            className="px-2.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-purple-400 font-mono font-bold transition shrink-0"
                          >
                            + [offset]
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-neutral-400">Từ:</span>
                            <input
                              type="number"
                              min={0}
                              max={50000}
                              value={pageBuilderFrom}
                              onChange={(e) => setPageBuilderFrom(parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1 bg-neutral-900 border border-neutral-700 rounded-md text-xs text-center text-white focus:outline-none focus:border-blue-500"
                            />
                            <span className="text-neutral-400">Đến:</span>
                            <input
                              type="number"
                              min={0}
                              max={50000}
                              value={pageBuilderTo}
                              onChange={(e) => setPageBuilderTo(parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1 bg-neutral-900 border border-neutral-700 rounded-md text-xs text-center text-white focus:outline-none focus:border-blue-500"
                            />
                            <span className="text-neutral-400">Bước nhảy (Step):</span>
                            <input
                              type="number"
                              min={1}
                              max={1000}
                              value={pageBuilderStep}
                              onChange={(e) => setPageBuilderStep(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-14 px-2 py-1 bg-neutral-900 border border-neutral-700 rounded-md text-xs text-center text-white focus:outline-none focus:border-blue-500"
                            />
                            <span className="text-blue-400 font-medium">
                              (Sẽ sinh {Math.floor(Math.abs(pageBuilderTo - pageBuilderFrom) / Math.max(1, pageBuilderStep)) + 1} link)
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const urls = generatePaginationUrls(pageBuilderUrl, pageBuilderFrom, pageBuilderTo, pageBuilderStep);
                                if (urls.length === 0) {
                                  alert("Vui lòng nhập link mẫu hợp lệ trước khi sinh link.");
                                  return;
                                }
                                setWebScrapeUrl(urls.join("\n"));
                              }}
                              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-white font-medium transition active:scale-95"
                            >
                              Điền vào ô danh sách
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const urls = generatePaginationUrls(pageBuilderUrl, pageBuilderFrom, pageBuilderTo, pageBuilderStep);
                                if (urls.length === 0) {
                                  alert("Vui lòng nhập link mẫu hợp lệ trước khi sinh link.");
                                  return;
                                }
                                const urlString = urls.join("\n");
                                setWebScrapeUrl(urlString);
                                handleScrapeWeb(urlString);
                              }}
                              disabled={isScrapingWeb}
                              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-semibold transition active:scale-95 flex items-center gap-1 shadow-md shadow-blue-600/20"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Sinh link & Quét luôn</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <textarea
                      rows={3}
                      placeholder="Dán 1 hoặc nhiều link trang web (mỗi link trên 1 dòng hoặc cách nhau bằng dấu phẩy)&#10;https://example.com/gallery/page-1&#10;https://example.com/gallery/page-2&#10;https://example.com/gallery/page-3"
                      value={webScrapeUrl}
                      onChange={(e) => setWebScrapeUrl(e.target.value)}
                      className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-blue-500 transition resize-y font-mono"
                    />
                  </div>

                  {/* Tuỳ chọn Deep Crawl */}
                  <div className="flex items-center gap-2 p-2.5 bg-neutral-850/80 rounded-xl border border-neutral-700/60">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none text-xs text-neutral-300 hover:text-white transition">
                      <input
                        type="checkbox"
                        checked={isDeepCrawl}
                        onChange={(e) => setIsDeepCrawl(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 bg-neutral-900 border-neutral-650 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="font-semibold text-blue-400">
                        🔍 Cào sâu vào các bài viết con (Deep Crawl)
                      </span>
                      <span className="text-[11px] text-neutral-400">
                        — Tự động chui vào từng bài viết trong danh mục/tìm kiếm để trích xuất video & iframe ẩn, bỏ qua 100% link quảng cáo rác.
                      </span>
                    </label>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-[11px] text-neutral-500">
                      💡 Hỗ trợ quét đồng thời nhiều trang (multi-page). Tự động phân loại ảnh và video, lọc bỏ ảnh rác.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleScrapeWeb()}
                      disabled={isScrapingWeb || !webScrapeUrl.trim()}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white font-medium rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 shrink-0"
                    >
                      {isScrapingWeb ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Đang quét các trang...</span>
                        </>
                      ) : (
                        <>
                          <Globe className="w-4 h-4" />
                          <span>Bắt đầu quét Media</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* KẾT QUẢ QUÉT VÀ DANH SÁCH MEDIA */}
              {scrapedMediaItems.length > 0 && (
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6 animate-fade-in">
                  {/* Báo cáo phân chia theo từng trang nếu có nhiều trang */}
                  {scrapedPages.length > 1 && (
                    <div className="p-3 bg-neutral-800/60 rounded-xl border border-neutral-700/60 space-y-2">
                      <span className="text-xs font-bold text-neutral-300 block">
                        Tổng hợp kết quả từ {scrapedPages.length} trang web:
                      </span>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {scrapedPages.map((page, idx) => (
                          <div
                            key={idx}
                            className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
                              page.error
                                ? "bg-red-500/10 border-red-500/30 text-red-300"
                                : "bg-neutral-700/60 border-neutral-600/60 text-neutral-200"
                            }`}
                            title={page.url}
                          >
                            <span className="font-bold">Trang {idx + 1}:</span>
                            {page.error ? (
                              <span className="text-red-400">Lỗi ({page.error})</span>
                            ) : (
                              <span>
                                {page.imageCount} ảnh, {page.videoCount} video
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Header thanh công cụ & lọc theo loại */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-800">
                    <div>
                      <h3 className="font-bold text-base text-neutral-200 flex items-center gap-2 flex-wrap">
                        <span>Danh sách Media tìm thấy</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-600/30 text-blue-400 border border-blue-500/40 text-xs font-semibold">
                          Đã chọn: {selectedImagesCount} ảnh, {selectedVideosCount} video
                        </span>
                      </h3>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Nhấn vào từng hình ảnh/video để chọn hoặc bỏ chọn.
                      </p>
                    </div>

                    {/* Bộ lọc loại Media */}
                    <div className="flex items-center gap-1.5 bg-neutral-800 p-1 rounded-xl border border-neutral-700 shrink-0">
                      <button
                        type="button"
                        onClick={() => setMediaTypeFilter("ALL")}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                          mediaTypeFilter === "ALL"
                            ? "bg-blue-600 text-white shadow"
                            : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        Tất cả ({scrapedMediaItems.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setMediaTypeFilter("IMAGE")}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                          mediaTypeFilter === "IMAGE"
                            ? "bg-blue-600 text-white shadow"
                            : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Ảnh ({totalImages})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMediaTypeFilter("VIDEO")}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                          mediaTypeFilter === "VIDEO"
                            ? "bg-purple-600 text-white shadow"
                            : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>Video ({totalVideos})</span>
                      </button>
                    </div>
                  </div>

                  {/* Nút thao tác chọn nhanh */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllMedia}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-white font-medium transition active:scale-95"
                    >
                      Chọn tất cả
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllMedia}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-neutral-400 hover:text-white font-medium transition active:scale-95"
                    >
                      Bỏ chọn tất cả
                    </button>
                    {totalImages > 0 && (
                      <button
                        type="button"
                        onClick={handleSelectOnlyImages}
                        className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-blue-300 hover:text-blue-200 font-medium transition active:scale-95"
                      >
                        Chỉ chọn Ảnh ({totalImages})
                      </button>
                    )}
                    {totalVideos > 0 && (
                      <button
                        type="button"
                        onClick={handleSelectOnlyVideos}
                        className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-purple-300 hover:text-purple-200 font-medium transition active:scale-95"
                      >
                        Chỉ chọn Video ({totalVideos})
                      </button>
                    )}
                  </div>

                  {/* Grid hiển thị các media items */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[520px] overflow-y-auto no-scrollbar p-1">
                    {displayedItems.map((item, idx) => {
                      const isSelected = selectedMediaUrls.includes(item.url);
                      const selectedIndex = selectedMediaUrls.indexOf(item.url);

                      return (
                        <div
                          key={`${item.url}-${idx}`}
                          onClick={() => toggleSelectMedia(item.url)}
                          className={`group relative aspect-[3/4] rounded-xl overflow-hidden cursor-pointer border-2 transition-all bg-neutral-950 flex items-center justify-center ${
                            isSelected
                              ? "border-blue-500 ring-2 ring-blue-500/50 shadow-lg shadow-blue-500/20 scale-[0.98]"
                              : "border-neutral-800 hover:border-neutral-600 opacity-60 hover:opacity-100"
                          }`}
                        >
                          {item.type === "VIDEO" ? (
                            <div className="relative w-full h-full flex items-center justify-center bg-black">
                              {item.thumbnailUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={item.thumbnailUrl}
                                  alt="Video Poster"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover select-none pointer-events-none"
                                  loading="lazy"
                                />
                              ) : (
                                <video
                                  src={item.url}
                                  muted
                                  preload="metadata"
                                  className="w-full h-full object-cover select-none pointer-events-none"
                                />
                              )}
                              {/* Overlay Play Icon */}
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/30">
                                <div className="p-2 rounded-full bg-black/60 text-white backdrop-blur-sm border border-white/20">
                                  <Film className="w-5 h-5 text-amber-400" />
                                </div>
                              </div>
                              <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-purple-900/80 border border-purple-500/40 text-[10px] font-bold text-purple-200">
                                VIDEO
                              </div>
                            </div>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.url}
                              alt={`Scraped ${idx + 1}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover select-none pointer-events-none"
                              loading="lazy"
                            />
                          )}

                          {/* Checkbox badge ở góc trên phải */}
                          <div
                            className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shadow-md transition ${
                              isSelected
                                ? "bg-blue-600 text-white scale-100"
                                : "bg-black/50 border border-white/40 text-transparent scale-90 group-hover:border-white"
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </div>

                          {/* Thứ tự trong Gallery ở góc trên trái (nếu là ảnh) */}
                          {isSelected && item.type === "IMAGE" && (
                            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[10px] font-bold text-blue-300 border border-blue-400/30">
                              #{selectedIndex + 1}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Form Thiết lập & Nút Lưu Media */}
                  <div className="pt-4 border-t border-neutral-800 space-y-4">
                    {/* Tiêu đề bài viết */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
                        Tiêu đề / Mô tả bài viết
                      </label>
                      <input
                        type="text"
                        placeholder="Nhập tiêu đề hoặc mô tả cho bài viết / gallery này..."
                        value={webGalleryTitle}
                        onChange={(e) => setWebGalleryTitle(e.target.value)}
                        className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition"
                      />
                    </div>

                    {/* Phương án lưu trữ */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                        Phương án lưu trữ ({selectedImagesCount} ảnh, {selectedVideosCount} video)
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setWebStorageMode("DIRECT_LINK")}
                          className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                            webStorageMode === "DIRECT_LINK"
                              ? "border-blue-500 bg-blue-500/10 text-white"
                              : "border-neutral-800 bg-neutral-800 text-neutral-400"
                          }`}
                        >
                          <span className="flex items-center gap-1.5 font-semibold text-xs text-blue-400">
                            <Globe className="w-3.5 h-3.5" /> Direct Link (Khuyên dùng)
                          </span>
                          <span className="text-[11px] leading-tight opacity-70">
                            Lưu link trực tiếp từ trang web gốc, không tốn dung lượng máy chủ.
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setWebStorageMode("LOCAL_STORAGE")}
                          className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                            webStorageMode === "LOCAL_STORAGE"
                              ? "border-green-500 bg-green-500/10 text-white"
                              : "border-neutral-800 bg-neutral-800 text-neutral-400"
                          }`}
                        >
                          <span className="flex items-center gap-1.5 font-semibold text-xs text-green-400">
                            <HardDrive className="w-3.5 h-3.5" /> Tải về Máy chủ
                          </span>
                          <span className="text-[11px] leading-tight opacity-70">
                            Máy chủ tải media về thư mục cục bộ vĩnh viễn, không lo trang gốc xoá file.
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Gắn Tags */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
                        Gắn Tags (cách nhau bởi dấu phẩy hoặc khoảng trắng)
                      </label>
                      <input
                        type="text"
                        placeholder="gallery, cosplay, travel, video, wallpaper..."
                        value={webGalleryTags}
                        onChange={(e) => setWebGalleryTags(e.target.value)}
                        className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition"
                      />
                      {renderTagSelector(webGalleryTags, setWebGalleryTags)}
                    </div>

                    {/* Nút hành động Lưu Media linh hoạt */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      {selectedImagesCount > 0 && (
                        <button
                          type="button"
                          onClick={handleSaveImagesAsGallery}
                          disabled={isSubmittingWebMedia}
                          className="flex-1 py-3.5 px-4 bg-blue-600 hover:bg-blue-500 active:scale-98 disabled:opacity-50 text-white font-semibold rounded-xl text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                        >
                          {isSubmittingWebMedia ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Layers className="w-4 h-4" />
                          )}
                          <span>Tạo 1 Album Gallery ({selectedImagesCount} ảnh)</span>
                        </button>
                      )}

                      {selectedVideosCount > 0 && (
                        <button
                          type="button"
                          onClick={handleSaveSelectedVideos}
                          disabled={isSubmittingWebMedia}
                          className="flex-1 py-3.5 px-4 bg-purple-600 hover:bg-purple-500 active:scale-98 disabled:opacity-50 text-white font-semibold rounded-xl text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20"
                        >
                          {isSubmittingWebMedia ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Film className="w-4 h-4" />
                          )}
                          <span>Lưu {selectedVideosCount} Video (bài riêng)</span>
                        </button>
                      )}

                      {selectedImagesCount > 0 && selectedVideosCount > 0 && (
                        <button
                          type="button"
                          onClick={handleSaveAllSelectedMedia}
                          disabled={isSubmittingWebMedia}
                          className="flex-1 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-98 disabled:opacity-50 text-white font-semibold rounded-xl text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                        >
                          {isSubmittingWebMedia ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          <span>Lưu tất cả ({selectedImagesCount} ảnh + {selectedVideosCount} video)</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* TAB 3: TẢI FILE TRỰC TIẾP */}
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
            {/* Thông báo thao tác hàng loạt */}
            {bulkActionMsg && (
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition ${
                  bulkActionMsg.type === "success"
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400"
                }`}
              >
                <span>{bulkActionMsg.text}</span>
                <button
                  type="button"
                  onClick={() => setBulkActionMsg(null)}
                  className="p-1 hover:bg-neutral-800 rounded transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Thanh lọc định dạng Media (Tất cả, Video, Album/Gallery, Ảnh đơn) */}
            <div className="bg-neutral-900 border border-neutral-800 p-3 sm:p-4 rounded-2xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 p-1 bg-neutral-950 rounded-xl border border-neutral-800 overflow-x-auto max-w-full">
                  <button
                    type="button"
                    onClick={() => {
                      setListFormatFilter("ALL");
                      setMediaPage(1);
                      loadMediaList(1, searchTag, "ALL", mediaLimit);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                      listFormatFilter === "ALL"
                        ? "bg-blue-600 text-white shadow"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    Tất cả ({formatCounts.all || mediaTotal})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setListFormatFilter("VIDEO");
                      setMediaPage(1);
                      loadMediaList(1, searchTag, "VIDEO", mediaLimit);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
                      listFormatFilter === "VIDEO"
                        ? "bg-purple-600 text-white shadow"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>Video ({formatCounts.video})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setListFormatFilter("GALLERY");
                      setMediaPage(1);
                      loadMediaList(1, searchTag, "GALLERY", mediaLimit);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
                      listFormatFilter === "GALLERY"
                        ? "bg-pink-600 text-white shadow"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Gallery / Album ({formatCounts.gallery})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setListFormatFilter("IMAGE");
                      setMediaPage(1);
                      loadMediaList(1, searchTag, "IMAGE", mediaLimit);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
                      listFormatFilter === "IMAGE"
                        ? "bg-emerald-600 text-white shadow"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Ảnh đơn ({formatCounts.image})</span>
                  </button>
                </div>

                {/* Chọn số lượng hiển thị mỗi trang */}
                <div className="flex items-center gap-1.5 text-xs text-neutral-400 ml-auto">
                  <span>Hiển thị:</span>
                  {[24, 48, 96, 200].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setMediaLimit(num);
                        setMediaPage(1);
                        loadMediaList(1, searchTag, listFormatFilter, num);
                      }}
                      className={`px-2 py-1 rounded-md text-xs font-medium transition ${
                        mediaLimit === num
                          ? "bg-neutral-800 text-white border border-neutral-600 font-bold"
                          : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hàng tìm kiếm theo Tag & Thống kê */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-800/80">
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="text"
                    placeholder="Lọc theo tag (ví dụ: cosplay, funny...)"
                    value={searchTag}
                    onChange={(e) => {
                      setSearchTag(e.target.value);
                      setMediaPage(1);
                    }}
                    className="w-full pl-9 pr-8 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition"
                  />
                  {searchTag && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTag("");
                        setMediaPage(1);
                        loadMediaList(1, "", listFormatFilter, mediaLimit);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="text-xs text-neutral-400 flex items-center gap-3">
                  <span>
                    Tổng cộng: <strong className="text-white">{mediaTotal}</strong> bài
                  </span>
                  {mediaTotalPages > 1 && (
                    <span className="text-neutral-500">
                      (Trang {mediaPage} / {mediaTotalPages})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Thanh công cụ Chọn & Thao tác hàng loạt */}
            <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllOnCurrentPage}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-white font-medium transition flex items-center gap-1.5 active:scale-95"
                >
                  {mediaList.length > 0 &&
                  mediaList.every((item) => selectedMediaIds.includes(item.id)) ? (
                    <>
                      <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                      <span>Bỏ chọn trang này</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Chọn tất cả trang này</span>
                    </>
                  )}
                </button>

                {selectedMediaIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDeselectAllListMedia}
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-neutral-400 hover:text-white font-medium transition active:scale-95"
                  >
                    Bỏ chọn tất cả ({selectedMediaIds.length})
                  </button>
                )}
              </div>

              {/* Các nút hành động khi đã chọn media */}
              {selectedMediaIds.length > 0 && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-blue-400 font-semibold px-2">
                    Đã chọn {selectedMediaIds.length} mục
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      setBulkTagInput("");
                      setShowBulkTagModal(true);
                    }}
                    disabled={isBulkTagging}
                    className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs text-white font-semibold transition flex items-center gap-1.5 shadow-md shadow-blue-600/20"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>Gán nhãn hàng loạt</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    disabled={isBulkDeleting}
                    className="px-3.5 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-500 active:scale-95 text-xs text-white font-semibold transition flex items-center gap-1.5 shadow-md shadow-red-600/20"
                  >
                    {isBulkDeleting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>Xoá ({selectedMediaIds.length})</span>
                  </button>
                </div>
              )}
            </div>

            {/* Danh sách Media Grid */}
            {loadingList ? (
              <div className="py-24 flex flex-col items-center justify-center text-neutral-500 gap-2">
                <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
                <span className="text-xs text-neutral-400">Đang tải danh sách media...</span>
              </div>
            ) : mediaList.length === 0 ? (
              <div className="py-16 text-center text-neutral-500 bg-neutral-900 border border-neutral-800 rounded-xl space-y-2">
                <p className="text-sm">Không tìm thấy media nào phù hợp với bộ lọc.</p>
                {searchTag && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTag("");
                      setMediaPage(1);
                      loadMediaList(1, "", listFormatFilter, mediaLimit);
                    }}
                    className="text-xs text-blue-400 underline hover:text-blue-300"
                  >
                    Xóa từ khóa lọc tag
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {mediaList.map((item) => {
                  const isSelected = selectedMediaIds.includes(item.id);
                  const isGallery = item.galleryUrls && item.galleryUrls.length > 1;

                  return (
                    <div
                      key={item.id}
                      className={`bg-neutral-900 border rounded-xl overflow-hidden flex flex-col group transition-all duration-200 ${
                        isSelected
                          ? "border-blue-500 ring-2 ring-blue-500/40 shadow-lg shadow-blue-500/10"
                          : "border-neutral-800 hover:border-neutral-700"
                      }`}
                    >
                      {/* Media Preview Box */}
                      <div className="relative aspect-[9/16] max-h-64 bg-black flex items-center justify-center overflow-hidden">
                        {/* Checkbox chọn mục */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSelectMedia(item.id);
                          }}
                          className="absolute top-2 left-2 z-20 cursor-pointer"
                          title={isSelected ? "Bỏ chọn" : "Chọn media này"}
                        >
                          <div
                            className={`w-6 h-6 rounded-md flex items-center justify-center transition shadow-md ${
                              isSelected
                                ? "bg-blue-600 text-white ring-2 ring-blue-400 scale-105"
                                : "bg-black/60 border border-white/50 text-transparent hover:border-white hover:bg-black/80"
                            }`}
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                          </div>
                        </div>

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

                        {/* Badges định dạng (Type, Album, Source) */}
                        <div className="absolute top-2 left-10 flex gap-1.5 z-10 flex-wrap">
                          {isGallery ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-pink-600/90 text-white backdrop-blur-md flex items-center gap-1 shadow">
                              <Layers className="w-3 h-3" />
                              <span>Album ({item.galleryUrls.length})</span>
                            </span>
                          ) : item.type === "VIDEO" ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600/90 text-white backdrop-blur-md flex items-center gap-1 shadow">
                              <Film className="w-3 h-3" />
                              <span>Video</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600/90 text-white backdrop-blur-md flex items-center gap-1 shadow">
                              <ImageIcon className="w-3 h-3" />
                              <span>Ảnh đơn</span>
                            </span>
                          )}

                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-800/90 text-neutral-300 backdrop-blur-md">
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
                                  type="button"
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
                                  type="button"
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
                                type="button"
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
                              type="button"
                              onClick={() => handleToggleRotate(item.id, item.defaultRotate)}
                              title="Xoay 90° mặc định"
                              className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition text-xs flex items-center gap-1"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                              <span>{item.defaultRotate}°</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteMedia(item.id)}
                            title="Xoá media"
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-neutral-400 hover:text-red-400 transition ml-auto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Thanh điều hướng phân trang (Pagination) */}
            {mediaTotalPages > 1 && (
              <div className="bg-neutral-900 border border-neutral-800 p-3 sm:p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 mt-6">
                <div className="text-xs text-neutral-400">
                  Hiển thị{" "}
                  <strong className="text-white">
                    {(mediaPage - 1) * mediaLimit + 1} -{" "}
                    {Math.min(mediaPage * mediaLimit, mediaTotal)}
                  </strong>{" "}
                  trên tổng số <strong className="text-white">{mediaTotal}</strong> bài
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Trang đầu */}
                  <button
                    type="button"
                    onClick={() => {
                      setMediaPage(1);
                      loadMediaList(1, searchTag, listFormatFilter, mediaLimit);
                    }}
                    disabled={mediaPage <= 1 || loadingList}
                    title="Về trang đầu"
                    className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-neutral-800 text-neutral-300 transition"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>

                  {/* Trang trước */}
                  <button
                    type="button"
                    onClick={() => {
                      const prevPage = Math.max(1, mediaPage - 1);
                      setMediaPage(prevPage);
                      loadMediaList(prevPage, searchTag, listFormatFilter, mediaLimit);
                    }}
                    disabled={mediaPage <= 1 || loadingList}
                    title="Trang trước"
                    className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-neutral-800 text-neutral-300 transition flex items-center gap-1 text-xs"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Trước</span>
                  </button>

                  {/* Các số trang xung quanh */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: mediaTotalPages }, (_, i) => i + 1)
                      .filter((p) => {
                        if (mediaTotalPages <= 7) return true;
                        if (p === 1 || p === mediaTotalPages) return true;
                        return Math.abs(p - mediaPage) <= 2;
                      })
                      .map((p, idx, arr) => {
                        const prev = arr[idx - 1];
                        const showEllipsis = prev && p - prev > 1;

                        return (
                          <div key={p} className="flex items-center">
                            {showEllipsis && (
                              <span className="px-1 text-xs text-neutral-600">...</span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setMediaPage(p);
                                loadMediaList(p, searchTag, listFormatFilter, mediaLimit);
                              }}
                              disabled={loadingList}
                              className={`w-8 h-8 rounded-lg text-xs font-semibold transition ${
                                mediaPage === p
                                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold"
                                  : "bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700"
                              }`}
                            >
                              {p}
                            </button>
                          </div>
                        );
                      })}
                  </div>

                  {/* Trang sau */}
                  <button
                    type="button"
                    onClick={() => {
                      const nextPage = Math.min(mediaTotalPages, mediaPage + 1);
                      setMediaPage(nextPage);
                      loadMediaList(nextPage, searchTag, listFormatFilter, mediaLimit);
                    }}
                    disabled={mediaPage >= mediaTotalPages || loadingList}
                    title="Trang sau"
                    className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-neutral-800 text-neutral-300 transition flex items-center gap-1 text-xs"
                  >
                    <span className="hidden sm:inline">Sau</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {/* Trang cuối */}
                  <button
                    type="button"
                    onClick={() => {
                      setMediaPage(mediaTotalPages);
                      loadMediaList(mediaTotalPages, searchTag, listFormatFilter, mediaLimit);
                    }}
                    disabled={mediaPage >= mediaTotalPages || loadingList}
                    title="Tới trang cuối"
                    className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-neutral-800 text-neutral-300 transition"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Modal Gán nhãn hàng loạt (Bulk Tag Modal) */}
            {showBulkTagModal && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
                        <Tag className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base text-white">Gán nhãn hàng loạt</h3>
                        <p className="text-xs text-neutral-400">
                          Áp dụng cho <strong className="text-blue-400">{selectedMediaIds.length}</strong>{" "}
                          media đã chọn
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowBulkTagModal(false)}
                      className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
                        Nhập các nhãn (tags), cách nhau bởi dấu phẩy
                      </label>
                      <input
                        type="text"
                        placeholder="anime, cosplay, sexy, 4k..."
                        value={bulkTagInput}
                        onChange={(e) => setBulkTagInput(e.target.value)}
                        className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition"
                        autoFocus
                      />
                      {renderTagSelector(bulkTagInput, setBulkTagInput)}
                    </div>

                    {/* Lựa chọn chế độ gán nhãn */}
                    <div className="pt-2">
                      <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                        Phương thức áp dụng
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <label
                          className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 transition ${
                            bulkTagMode === "ADD"
                              ? "bg-blue-600/10 border-blue-500/50 text-white"
                              : "bg-neutral-800/60 border-neutral-700/60 text-neutral-400 hover:bg-neutral-800"
                          }`}
                        >
                          <input
                            type="radio"
                            name="bulkTagMode"
                            checked={bulkTagMode === "ADD"}
                            onChange={() => setBulkTagMode("ADD")}
                            className="mt-0.5 text-blue-600"
                          />
                          <div>
                            <span className="block text-xs font-bold text-white">
                              Bổ sung thêm nhãn
                            </span>
                            <span className="text-[11px] leading-tight text-neutral-400">
                              Giữ nguyên các tag cũ và thêm các tag mới này vào.
                            </span>
                          </div>
                        </label>

                        <label
                          className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 transition ${
                            bulkTagMode === "REPLACE"
                              ? "bg-amber-600/10 border-amber-500/50 text-white"
                              : "bg-neutral-800/60 border-neutral-700/60 text-neutral-400 hover:bg-neutral-800"
                          }`}
                        >
                          <input
                            type="radio"
                            name="bulkTagMode"
                            checked={bulkTagMode === "REPLACE"}
                            onChange={() => setBulkTagMode("REPLACE")}
                            className="mt-0.5 text-amber-500"
                          />
                          <div>
                            <span className="block text-xs font-bold text-amber-300">
                              Thay thế toàn bộ nhãn
                            </span>
                            <span className="text-[11px] leading-tight text-neutral-400">
                              Xóa hết các tag cũ và chỉ lưu các tag mới này.
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Footer buttons */}
                  <div className="pt-3 border-t border-neutral-800 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowBulkTagModal(false)}
                      disabled={isBulkTagging}
                      className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-300 font-medium transition"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkAssignTags}
                      disabled={isBulkTagging}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs text-white font-semibold transition flex items-center gap-1.5 shadow-lg shadow-blue-600/20"
                    >
                      {isBulkTagging ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      <span>Xác nhận gán nhãn</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
