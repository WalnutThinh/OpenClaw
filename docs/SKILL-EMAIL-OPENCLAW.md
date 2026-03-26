# Skill Email (IMAP/SMTP) trong OpenClaw

**Người dùng không cần gõ lệnh:** ứng dụng Enchante (bản mới) tự **bổ sung `.env`**, **ghi hướng dẫn vào `AGENTS.md`** trong workspace OpenClaw, và có nút **“Gửi email thử”** trên màn **Xong** (Windows) để kiểm tra SMTP.

## Bot nói “không gửi được email” dù đã cài skill?

Có hai nguyên nhân thường gặp:

### 1) Model không biết phải gọi CLI

Skill gửi mail bằng **lệnh shell**, không phải “gửi mail ảo” trong chat:

```bash
cd ~/.openclaw/workspace/skills/Office-Task--Email
node scripts/smtp.js send --to walnut.thinh@gmail.com --subject "CSV" --body "Đính kèm file." --attach /root/.openclaw/workspace/gold_dollar_tracker.csv
```

(Đổi đường dẫn nếu bạn cài bản cũ: thư mục có thể là `Office Task--Email`. Kiểm tra `ls ~/.openclaw/workspace/skills/` hoặc mục **Enchante — Bundled skills** trong `AGENTS.md` của workspace.)

Trong `SKILL.md` đã có mục **“OpenClaw / coding agents — you *can* send email”** để agent đọc được hướng dẫn này khi skill được load.

### 2) Thiếu `ALLOWED_READ_DIRS` → không gắn được file CSV

Script `smtp.js` **chặn** đọc file đính kèm nếu không có whitelist. Bản cài qua wizard **Enchante** (file `_enchante.json`) giờ đã thêm:

- `ALLOWED_READ_DIRS=~/.openclaw/workspace,~/.openclaw/workspace/skills`
- `ALLOWED_WRITE_DIRS=~/.openclaw/workspace`

Nếu bạn cài **trước** khi có hai dòng này, hãy **tự thêm** vào `~/.config/imap-smtp-email/.env` trong WSL (hoặc chạy lại bước áp dụng cấu hình / cài lại skill từ wizard để ghi đè `.env` — lưu ý backup).

### Gmail

Dùng **mật khẩu ứng dụng** (App Password), không dùng mật khẩu đăng nhập web. Xem phần **Important for Gmail** trong `skill/Office Task/Email/SKILL.md`.

## Bot chỉ kể tên skill kiểu ClawHub (github, web-search…) mà không thấy Excel / API / Email?

OpenClaw **chụp danh sách skill khi phiên (session) bắt đầu**; sau khi wizard cài thêm skill trong `~/.openclaw/workspace/skills/`, cần **phiên chat mới** (hoặc khởi động lại gateway) để prompt có đủ skill.

Bản Enchante mới còn ghi một mục **« Enchante — Bundled skills in this workspace »** vào `~/.openclaw/workspace/AGENTS.md` (trong WSL: `/root/.openclaw/workspace/AGENTS.md`) để agent biết **đúng tên thư mục** đã cài (ví dụ `API--GATEWAY`, `Office-Task--Email`).

Một số skill (như **API Gateway / Maton**) chỉ hiện trong prompt nếu đã có biến môi trường cần thiết (ví dụ `MATON_API_KEY`) — xem `metadata` trong `SKILL.md` của từng skill.
