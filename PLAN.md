# Kế hoạch Phát triển Dự án: TikTok-Style Media Viewer & Admin Manager (Đã Cập Nhật)

> **Mục tiêu:** Xây dựng ứng dụng Web App hiển thị hình ảnh và video cuộn dọc phong cách TikTok, tối ưu mượt mà trên trình duyệt di động và máy tính, với tính năng xoay ngang video, phóng to ảnh, toàn màn hình, lọc theo tag; đồng thời cung cấp trang quản trị cho phép Admin bóc tách link đa nền tảng (X/Twitter, TikTok, Instagram, YouTube...), upload file trực tiếp, tuỳ chọn lưu link direct hoặc tải media về máy.

---

## 1. Yêu cầu Chức năng (Functional Requirements)

### 1.1. Phía End User (Web App Trình duyệt Di động & Desktop)
- [ ] **TikTok Snap Scroll:** Cuộn dọc từng bài mượt mà (`100dvh`), hỗ trợ cảm ứng vuốt trên di động và con lăn chuột / phím mũi tên trên PC.
- [ ] **Tối ưu Video & Xoay ngang (Video Rotate):**
  - Tự động phát khi cuộn đến, dừng khi cuộn đi, tự động loop.
  - Chạm vào video để Pause / Resume. Nút Mute / Unmute âm thanh.
  - **Nút xoay video (Rotate 90° / Phóng ngang):** Cho phép xoay ngang màn hình hoặc xoay khung video 90° để xem trọn vẹn các video định dạng ngang (16:9) mà không bị viền đen quá lớn.
- [ ] **Tối ưu Image & Phóng to (Zoom):**
  - Double-tap hoặc Pinch-to-zoom (chụm/mở 2 ngón) trên di động.
  - Cuộn chuột hoặc drag pan trên máy tính.
- [ ] **Chế độ Toàn màn hình (Fullscreen):** Nút bật/tắt toàn màn hình ẩn thanh điều hướng trình duyệt.
- [ ] **Hệ thống Tag:**
  - Hiển thị danh sách tag nổi bật ở góc (`#tag`).
  - Bấm vào tag để lọc feed chỉ hiển thị các media có cùng tag.
  - Thanh chọn/lọc tag nhanh.

### 1.2. Phía Admin (Quản trị & Nhập liệu)
- [ ] **Đăng nhập Quản trị:**
  - Tài khoản: `vubadong071102@gmail.com` (hoặc `admin`)
  - Mật khẩu: `0711Vubadong02@`
  - Quản lý phiên bằng JWT Cookie bảo mật.
- [ ] **Bóc tách Link Đa Nền Tảng (Multi-platform Media Parser):**
  - Hỗ trợ **X (Twitter)** qua vxTwitter API / Twitter CDN.
  - Hỗ trợ thêm các nền tảng phổ biến: **TikTok, Instagram, YouTube Shorts, Facebook, v.v.** thông qua module giải mã đa năng (kết hợp API / `yt-dlp`).
  - Xem trước (Live Preview) ảnh/video ngay sau khi dán link.
- [ ] **Tuỳ chọn Lưu trữ linh hoạt khi thêm Media:**
  - **Lựa chọn 1: Chỉ lưu Direct Link** (Tiết kiệm dung lượng server, load trực tiếp từ CDN nguồn).
  - **Lựa chọn 2: Tải về Server cục bộ** (Tải media gốc về lưu trữ nội bộ, đảm bảo không bao giờ bị mất bài kể cả khi tweet/video nguồn bị xóa).
- [ ] **Upload File trực tiếp:**
  - Kéo thả file ảnh (`.jpg`, `.png`, `.webp`, `.gif`) hoặc video (`.mp4`, `.webm`, `.mov`).
  - Tự động tạo ảnh thumbnail xem trước.
- [ ] **Quản lý danh sách Media:**
  - Bảng danh sách bài đã lưu, phân trang, lọc theo tag và trạng thái lưu trữ (Direct link hay Local).
  - Chỉnh sửa tag, đổi chế độ xoay mặc định, xóa media.

---

## 2. Kiến trúc Kỹ thuật & Cấu hình Hệ thống

- **Frontend & Backend:** Next.js (App Router, TypeScript, Tailwind CSS, Lucide Icons)
- **Cơ sở dữ liệu:** **PostgreSQL**
  - Host: `192.168.68.5`
  - Port: `5432`
  - User: `tiktok`
  - Password: `tiktok`
  - Database name: `tiktok` (chuỗi kết nối: `postgresql://tiktok:tiktok@192.168.68.5:5432/tiktok`)
  - ORM: **Prisma**
- **Media Resolver Engine:**
  - vxTwitter API cho X/Twitter siêu tốc
  - `yt-dlp` / Media Scraper cho TikTok, Instagram, YouTube Shorts...
- **Zoom Engine:** `react-zoom-pan-pinch`
- **Video Controller:** Hỗ trợ xoay CSS Transform 90° và HTML5 Fullscreen.

---

## 3. Thiết kế CSDL (Database Schema - PostgreSQL)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model MediaItem {
  id           String         @id @default(uuid())
  type         MediaType      // IMAGE hoặc VIDEO
  sourceType   SourceType     // X_TWITTER, TIKTOK, INSTAGRAM, YOUTUBE, DIRECT_LINK, UPLOAD...
  sourceUrl    String?        // Link gốc
  storageMode  StorageMode    @default(DIRECT_LINK) // DIRECT_LINK hoặc LOCAL_STORAGE
  mediaUrl     String         // URL phát (direct CDN hoặc /uploads/...)
  localPath    String?        // Đường dẫn file nội bộ (nếu tải về)
  thumbnailUrl String?
  isLandscape  Boolean        @default(false) // Đánh dấu video ngang
  defaultRotate Int           @default(0)     // Góc xoay mặc định (0, 90, 180, 270)
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  tags         MediaItemTag[]
}

enum MediaType {
  IMAGE
  VIDEO
}

enum SourceType {
  X_TWITTER
  TIKTOK
  INSTAGRAM
  YOUTUBE
  DIRECT_LINK
  UPLOAD
}

enum StorageMode {
  DIRECT_LINK
  LOCAL_STORAGE
}

model Tag {
  id         String         @id @default(uuid())
  name       String         @unique
  slug       String         @unique
  mediaItems MediaItemTag[]
}

model MediaItemTag {
  mediaItemId String
  tagId       String
  mediaItem   MediaItem @relation(fields: [mediaItemId], references: [id], onDelete: Cascade)
  tag         Tag       @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([mediaItemId, tagId])
}

model AdminUser {
  id        String   @id @default(uuid())
  email     String   @unique
  username  String   @unique
  password  String   // Mật khẩu đã băm (bcrypt)
  createdAt DateTime @default(now())
}
```

---

## 4. Lộ trình Triển khai Chi tiết

- **Bước 1:** Khởi tạo Next.js, cài đặt Prisma và kết nối CSDL PostgreSQL `192.168.68.5:5432`.
- **Bước 2:** Xây dựng hệ thống xác thực Admin (JWT cookie, seed tài khoản `vubadong071102@gmail.com`).
- **Bước 3:** Viết API trích xuất media đa nền tảng (X, TikTok, Instagram...) & cơ chế download file tuỳ chọn.
- **Bước 4:** Xây dựng trang Quản trị (Admin Dashboard):
  - Form thêm link (chọn Lưu Link hay Tải về).
  - Form upload trực tiếp.
  - Danh sách quản lý, gắn tag, xoá bài.
- **Bước 5:** Xây dựng giao diện End-User TikTok Feed:
  - Snap scroll dọc tối ưu cảm ứng di động.
  - Video player tự động phát, nút xoay ngang video 90°, nút toàn màn hình.
  - Image viewer với cử chỉ zoom chụm mở 2 ngón tay.
  - Bộ lọc tag.
- **Bước 6:** Kiểm thử thực tế với link X của bạn và các link video ngang/dọc khác.
- **Bước 7: Triển khai CI/CD với GitHub Actions & Portainer Stack:**
  - Viết `Dockerfile` (Multi-stage build cho Next.js Standalone mode, dung lượng siêu nhẹ ~100MB).
  - Viết `docker-compose.yml` (Portainer Stack Template) với volume ánh xạ `/app/public/uploads` để lưu trữ media không bị mất khi redeploy container.
  - Cấu hình file workflow `.github/workflows/docker-ci.yml` (Tự động build và push image lên Docker Hub / GitHub Container Registry `ghcr.io`, hoặc kích hoạt Portainer Webhook để tự động redeploy khi push code lên nhánh `main`).
  - Hướng dẫn cấu hình Environment Variables trực tiếp trong giao diện Portainer Stack (`DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`...).
