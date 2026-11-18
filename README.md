# TikTok Media Viewer & Admin Manager

Ứng dụng web lướt xem ảnh và video phong cách TikTok tối giản, hỗ trợ bóc tách link tự động (X / Twitter, TikTok...), xoay ngang video 90°, phóng to ảnh mượt mà, toàn màn hình và hệ thống quản trị chuyên nghiệp.

---

## 1. Tính năng Nổi bật

### End User (Trải nghiệm xem)
- **TikTok Snap Scroll:** Cuộn dọc snap 100dvh mượt mà trên Safari/Chrome điện thoại và chuột/phím mũi tên trên PC.
- **Xoay ngang video (Rotate 90°):** Nút xoay video giúp thưởng thức trọn vẹn các video định dạng ngang (16:9) mà không bị viền đen.
- **Phóng to ảnh (Zoom & Pan):** Chụm/mở 2 ngón (pinch-to-zoom) hoặc double-tap trên điện thoại; cuộn chuột trên PC.
- **Toàn màn hình (Fullscreen):** Nút fullscreen ẩn hoàn toàn thanh điều hướng trình duyệt.
- **Lọc theo Tag:** Bấm vào `#tag` trên màn hình hoặc mở Drawer để xem theo chủ đề.

### Admin (Quản trị & Thêm Media)
- **Tài khoản Admin mặc định:**
  - Email / Username: `` hoặc `
  - Mật khẩu: ``
- **Bóc tách Link tự động:** Dán link X (Twitter) hoặc TikTok $\rightarrow$ Hệ thống tự động bóc tách direct link và hiển thị preview.
- **Tuỳ chọn lưu trữ linh hoạt:**
  - *Direct Link:* Lưu link gốc CDN, tiết kiệm dung lượng server.
  - *Local Storage:* Tải file media gốc về máy chủ, lưu trữ vĩnh viễn không lo bài đăng trên X bị xoá.
- **Upload trực tiếp:** Kéo thả ảnh/video tải lên máy chủ.
- **Quản lý Media:** Bảng danh sách bài đã lưu, xoay góc mặc định, xoá bài, sửa tag.

---

## 2. Chuẩn bị Cơ sở dữ liệu PostgreSQL

CSDL tại `192.168.68.5:5432`, user `tiktok`.
Nếu database `tiktok` chưa được tạo hoặc user `tiktok` chưa được cấp quyền, hãy chạy lệnh SQL này một lần trên PostgreSQL server (qua pgAdmin / Portainer / psql):

```sql
CREATE DATABASE tiktok OWNER tiktok;
GRANT ALL PRIVILEGES ON DATABASE tiktok TO tiktok;
```

Sau đó chạy lệnh đồng bộ bảng:
```bash
npx prisma db push
```

---

## 3. Triển khai bằng Portainer Stack (Git Repository)

1. Mở giao diện **Portainer** $\rightarrow$ **Stacks** $\rightarrow$ Chọn **Add stack**.
2. Chọn phương thức **Repository**:
   - **Repository URL:** Đường dẫn Git repo của bạn (ví dụ `https://github.com/your-username/tiktok-clone.git`).
   - **Repository reference:** `refs/heads/main` (hoặc `refs/heads/master`).
   - **Compose path:** `docker-compose.yml`.
3. Bật **Automatic updates** (nếu muốn Portainer định kỳ tự pull hoặc nhận Webhook từ GitHub Actions):
   - Sao chép **Webhook URL** được tạo ra để cấu hình vào GitHub Secrets.
4. Cấu hình **Environment variables** trong Stack:
   ```env
   DATABASE_URL=postgresql://tiktok:tiktok@192.168.68.5:5432/tiktok?schema=public
   JWT_SECRET=tiktok_clone_super_secret_jwt_key_2026_0711@
   ADMIN_EMAIL=
   ADMIN_USERNAME=
   ADMIN_PASSWORD=
   NEXT_PUBLIC_APP_URL=http://your-server-ip:3000
   APP_PORT=3000
   ```
5. Nhấn **Deploy the stack**.

---

## 4. Tự động hoá CI/CD với GitHub Actions

File workflow đã được tạo sẵn tại [.github/workflows/deploy.yml](file:///.github/workflows/deploy.yml).

- Khi bạn `git push` code lên nhánh `main`, GitHub Actions sẽ tự động kiểm tra cú pháp và build ứng dụng.
- Để tự động redeploy trên Portainer sau khi build thành công:
  1. Vào GitHub Repo $\rightarrow$ **Settings** $\rightarrow$ **Secrets and variables** $\rightarrow$ **Actions**.
  2. Tạo Secret tên `PORTAINER_WEBHOOK_URL` và dán URL webhook lấy từ Portainer Stack.

---

## 5. Chạy Thử nghiệm ở Môi trường Local

```bash
# Cài đặt thư viện
npm install

# Đồng bộ Database
npx prisma db push

# Khởi chạy server dev
npm run dev
```

- **Giao diện người dùng:** `http://localhost:3000`
- **Trang quản trị Admin:** `http://localhost:3000/admin`
