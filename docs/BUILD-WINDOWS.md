# Windows local build (`npm run build:win-local`)

## Bị kẹt lâu ở: `output file is locked for writing (maybe by virus scanner) => waiting for unlock...`

Đây là hành vi của **electron-builder**: nó **chờ** ghi xong file cài đặt (`dist/installer/OPENCLAW-setup.exe` — bootstrapper build tách khỏi `dist/` gốc để tránh xung đột với bản zip app). Trên Windows, **Windows Defender** (hoặc antivirus khác) thường **mở/quét** file `.exe` vừa tạo → file bị **khóa** vài giây đến vài phút, đôi khi rất lâu.

### Làm gì ngay

1. **Dừng build** đang treo: `Ctrl+C` trong terminal.
2. **Đóng** mọi thứ có thể giữ file:
   - App chạy từ `dist/win-unpacked/OpenClaw.exe`
   - Trình cài `OPENCLAW-setup.exe` nếu đang mở
   - Cửa sổ Explorer đang mở thư mục `dist` (hoặc tắt **Preview pane** nếu đang bật)
3. **Xóa** (nếu xóa được) `dist/installer/OPENCLAW-setup.exe` rồi build lại. Nếu không xóa được → có process đang giữ file; khởi động lại máy hoặc dùng Task Manager kết thúc process liên quan.
4. **Thêm loại trừ** cho Defender (khuyến nghị):
   - *Cài đặt* → *Quyền riêng tư & bảo mật* → *Bảo mật Windows* → *Bảo vệ khỏi mối đe dọa & vi-rút* → *Cài đặt bảo vệ khỏi mối đe dọa* → *Loại trừ* → *Thêm loại trừ* → **Thư mục** → chọn thư mục dự án hoặc ít nhất `...\openclaw-enchante\dist`.
5. Chạy lại: `npm run build:win-local`.

### Nếu vẫn lâu

- Đợi thêm **10–15 phút** một lần (sau khi đã loại trừ thư mục) — đôi khi chỉ chậm do quét lần đầu.
- Tạm **tạm dừng bảo vệ theo thời gian thực** (chỉ khi bạn hiểu rủi ro, và ưu tiên đã thêm loại trừ thư mục).

### Custom installer: **2 file** (nhỏ + gói app tải từ mạng)

1. **`dist/installer/OPENCLAW-setup.exe`** — chỉ **Electron + UI cài đặt** (thường **~100–180 MB**), không nhúng app đầy đủ. Trong `resources` có **`install-manifest.json`** với `appZipUrl` trỏ tới file (2).
2. **`dist/OpenClaw-*-win.zip`** (hoặc `*-win32-x64.zip`) — **toàn bộ app**; phải **đặt đúng URL** trong manifest (mặc định build script: `https://enchante.cloud/downloads/<tên-file-zip>`). `npm run sync-to-enchante-site` copy cả `.exe` và zip app vào `enchante.cloud/public/downloads/`.

Luồng người dùng: chạy `.exe` → tải zip từ mạng → giải nén vào thư mục đã chọn. **Cần mạng** lúc cài (trừ bản dev có `payload/openclaw-app.zip`).

- **Build:** `OPENCLAW_APP_ZIP_BASE_URL` / `OPENCLAW_APP_ZIP_URL` khi chạy `build-windows-bootstrapper.mjs` (xem script).
- Giải nén nhiều file + Defender vẫn có thể làm bước **Extract** lâu; UI hiển thị tiến độ tải (nếu có `Content-Length`) và số mục khi giải nén.

**Quy tắc phát hành (Pages + GitHub Releases, cho agent):** xem **[AGENTS-WINDOWS-DISTRIBUTION.md](AGENTS-WINDOWS-DISTRIBUTION.md)**.

### Cảnh báo khác trong log (bình thường)

- Vite `dynamic import will not move module into another chunk` — gợi ý tối ưu chunk, **không** chặn build.
- Node `DEP0190` — cảnh báo từ dependency/electron-builder, **không** phải lỗi dừng build.

### Cấu hình artifact

- **NSIS:** `electron-builder.yml` → `nsis.artifactName: OPENCLAW-setup.${ext}` → `dist/OPENCLAW-setup.exe`.
- **ZIP (khi ổ C đầy):** cùng lệnh build Windows còn tạo `dist/openclaw-enchante-*-win.zip` — giải nén thẳng lên **D:**, **không** qua NSIS/TEMP trên C. Chi tiết: **[WINDOWS-INSTALL-ZIP.md](WINDOWS-INSTALL-ZIP.md)**.

### NSIS: chính sách, branding, sidebar

- `npm install` chạy `scripts/patch-nsis-multiuser-ui.mjs` để **ẩn** dòng trạng thái kiểu “There is already a per-user installation… Will reinstall” trên trang chọn cài cho ai (template `multiUserUi.nsh` trong `app-builder-lib`).
- `npm run build` chạy `prepare-installer-assets`: ghi `build/installer-display-version.nsh` từ `package.json` (giữ dạng **x.x.xx** trên dòng branding, theo `package.json`) và tạo lại `build/installerSidebar.png` (164×314, logo OpenClaw + “Customized by Enchante Direction”).
- Trang **chính sách** (checkbox bắt buộc) nằm trong `build/installer.nsh` (`customPageAfterChangeDir`): **sau** trang chọn thư mục, **trước** bước giải nén. (Không đặt trang này làm “welcome” đầu tiên — MUI2 của electron-builder cần `MUI_PAGE_INIT` từ trang chế độ cài trước, nếu không trình cài có thể thoát im lặng.)
- **Không** chạy `wsl` / `openclaw doctor --fix` trong `customInstall` của NSIS: lệnh đó dễ **chặn** bước cài rất lâu, thanh tiến trình MUI thường **đứng ~70%** trong lúc chờ → dễ hiểu nhầm là trình cài treo hoặc tự thoát. Bảo mật/sửa lỗi dùng **Fixer trong app** sau khi cài.
- **Ghim taskbar / shortcut trỏ `OpenClaw-Enchante.exe`:** bản build cũ lấy tên exe từ package npm; hiện `electron-builder.yml` dùng `executableName: OpenClaw` → chỉ có `OpenClaw.exe`. `build/installer.nsh` trong `customInstall` tạo **hard link** `OpenClaw-Enchante.exe` trỏ cùng file với `OpenClaw.exe` trên **NTFS** (không nhân đôi dung lượng) để shortcut đã ghim còn mở được sau khi cài/cập nhật lại. Bản **ZIP** giải nén sang ổ không hỗ trợ hard link: bỏ ghim cũ, mở `OpenClaw.exe` rồi ghim lại.
- Trang **Hoàn tất** đôi khi hiện “Installation Complete” trong khi thanh xanh **chưa đầy 100%** — đó là giới hạn hiển thị MUI/NSIS khi phần cuối không cập nhật progress; nếu có nút **Finish** và không báo lỗi, cài đặt file app thường đã xong.
- **Cài chọn D nhưng C vẫn tụt / cài thoát ~70%:** NSIS giải nén **TEMP trên C** trước khi ghi `D:\...` — nếu **C đầy**, cài có thể **lỗi giữa chừng**. Dùng `scripts/run-openclaw-setup-temp-on-d.bat` hoặc xem **[WINDOWS-INSTALL-DRIVES.md](WINDOWS-INSTALL-DRIVES.md)**.

---

## Khi **cài đặt** (chạy `OPENCLAW-setup.exe`): `Extract: error writing to file ...\WinShell.dll`

Thông báo kiểu **Extract: error writing to file** tới `...\AppData\Local\Temp\nsc....tmp\WinShell.dll` là lỗi **ghi file tạm** của NSIS (plugin WinShell cho shortcut/shell), **không** phải lỗi chọn ổ cài hay nội dung `skill/`.

### Làm gì trên máy cài (theo thứ tự)

1. **Đóng** mọi cửa sổ cài OpenClaw cũ, thoát `OpenClaw.exe` / trình cài đang treo.
2. **Xóa thư mục tạm NSIS** (PowerShell, chạy với user thường):
   - `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Temp\nsc*" -ErrorAction SilentlyContinue`
   - Hoặc dọn rộng hơn: xóa file trong `%LOCALAPPDATA%\Temp` (đóng app trước).
3. **Windows Defender / antivirus**: tạm tắt bảo vệ theo thời gian thực **hoặc** thêm **loại trừ** cho file `.exe` cài đặt và cho `%LOCALAPPDATA%\Temp` (nhiều AV chặn/ghi đè `WinShell.dll` lúc giải nén).
4. **Chạy installer** chuột phải → **Run as administrator** (thử một lần nếu vẫn lỗi).
5. Kiểm tra **ổ C còn trống** đủ (Temp luôn nằm trên ổ hệ thống).
6. **Tải lại** bản `OPENCLAW-setup.exe` (tránh file hỏng do copy/USB).

Sau khi ổn định, có thể bật lại AV; nên giữ **loại trừ thư mục `dist`** khi build và có thể loại trừ bản cài nếu vẫn hay bị quét.

---

## Cài trên ổ D mà ổ C vẫn giảm dung lượng?

Xem **[WINDOWS-INSTALL-DRIVES.md](WINDOWS-INSTALL-DRIVES.md)** — giải thích AppData, WSL, temp (hành vi bình thường, không phải lỗi chọn thư mục cài).

---

## Mục tiêu "tải về chạy luôn, không untrusted"

- Không đạt ổn định bằng cách nhúng/cài `Enchante.cer` (self-signed) trong installer: bước cảnh báo đầu tiên vẫn có thể xuất hiện trước khi cert được import.
- Cách đúng cho phát hành công khai: chỉ phát hành `OPENCLAW-setup.exe` đã có chữ ký Authenticode hợp lệ (EV/SignPath).
- Script `npm run sync-to-enchante-site` đã chặn upload file `.exe` nếu chữ ký không hợp lệ trên máy Windows.
- Có thể chạy 1 lệnh để tải artifact đã ký từ GitHub Release rồi sync website:
  - `npm run sync-signed-to-enchante-site`
  - Mặc định lấy release mới nhất; có thể chỉ định tag: `RELEASE_TAG=v1.1.02 npm run sync-signed-to-enchante-site`
- Nếu bạn publish qua AWS CLI / R2, dùng lệnh:
  - `S3_BUCKET=download S3_KEY=windows/OPENCLAW-setup.exe S3_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com npm run publish-signed-installer-s3`
  - Script sẽ chặn upload nếu `dist/installer/OPENCLAW-setup.exe` chưa có Authenticode `Valid`.
- Luồng khuyến nghị:
  1. Build release qua CI/release pipeline có signing.
  2. Lấy artifact đã ký.
  3. Đồng bộ lên website.
