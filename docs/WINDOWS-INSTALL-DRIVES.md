# Windows: cài trên ổ D mà ổ C vẫn giảm dung lượng — vì sao?

## Ổ C chỉ còn vài trăm MB (vd. 400 MB) — gần như **không đủ** cho NSIS

Với gói Electron lớn (app + `resources` + `skill/`), bước giải nén tạm thường cần **nhiều GB** trên ổ chứa `%TEMP%` (mặc định là **C:**). **Đặt file `OPENCLAW-setup.exe` trên D: không giúp** — installer vẫn dùng **TEMP trên C** trừ khi bạn đổi `TMP`/`TEMP` đúng cách (và tránh UAC làm mất biến môi trường).

→ **Khuyến nghị:** dùng bản **ZIP** và giải nén thẳng ra **D:** — xem **[WINDOWS-INSTALL-ZIP.md](WINDOWS-INSTALL-ZIP.md)**.

---

## Cài tới ~70% rồi tự thoát / đóng — thường liên quan **ổ C đầy** (TEMP)

Trình cài **NSIS** (electron-builder) **giải nén gói ứng dụng và plugin vào thư mục tạm** trước, thường là **`%TEMP%` / `%TMP%`** → mặc định nằm trên **ổ C** (`...\AppData\Local\Temp\...`), **dù** bạn chọn cài app sang **D:\**.

- Gói Electron + `resources` + `skill/` có thể **rất lớn** → cần **hàng GB trống trên ổ chứa TEMP** trong lúc cài.
- Nếu **C hết chỗ** giữa chừng → giải nén lỗi → cửa sổ cài **đóng** hoặc **dừng ~70%** thanh tiến trình.

### Việc nên làm ngay

1. **Giải phóng C:** dọn `%TEMP%`, Thùng rác, ứng dụng không dùng — nên có **ít nhất ~3–5 GB trống** trước khi cài (tuỳ kích thước bản build).
2. **Chạy installer với TEMP trên ổ D** (hoặc ổ còn trống): dùng script trong repo:

   `scripts\run-openclaw-setup-temp-on-d.bat D: "đường\dẫn\đầy\đủ\OPENCLAW-setup.exe"`

   Script tạo `D:\EnchanteOpenClawInstallTemp` (hoặc ổ bạn truyền), gán `TMP`/`TEMP` rồi chạy file cài. Sau khi cài xong có thể **xóa** thư mục đó.

3. Xem thêm: [BUILD-WINDOWS.md](BUILD-WINDOWS.md) (WinShell.dll / Defender / temp).

---

## Tôi đã chọn ổ D trên trình cài, sao vẫn thấy “như cài trên C”?

### 1) Kiểm tra **chỗ thật** của file app (`.exe`)

Trình cài chỉ ghi **bộ Electron** vào **`$INSTDIR`** bạn duyệt tới (thường sẽ thêm thư mục con **`OpenClaw`** nếu bạn chọn một thư mục cha không chứa tên đó — logic `instFilesPre` trong template NSIS của electron-builder).

**Cách xác minh:**

- Chuột phải shortcut **OpenClaw** (Desktop hoặc Start) → **Thuộc tính** → xem **Mục tiêu** / **Bắt đầu từ**: đường dẫn `OpenClaw.exe` nằm ổ nào thì **bản cài** nằm ổ đó.

Nếu **Target** là `D:\...\OpenClaw.exe` mà bạn vẫn thấy **ổ C giảm** → đó thường là **dữ liệu khác** (mục 2–4 bên dưới), **không** phải do installer “bỏ qua” ổ D.

### 2) Trang “Chọn thư mục”: phải đúng **ô đường dẫn**

Thứ tự trong NSIS (electron-builder):

1. **`initMultiUser`** chạy trước, có thể đọc **`InstallLocation`** từ registry của **lần cài trước** (ví dụ `C:\Program Files\OpenClaw`) và **điền sẵn** `$INSTDIR`.
2. **`customInit`** trong `build/installer.nsh` **xóa** khóa gỡ cài cũ (để tránh chạy uninstaller lỗi thời) — **sau** bước (1). Đường dẫn trong ô chọn thư mục **vẫn có thể đang là C** cho đến khi bạn **sửa / Browse** sang D và **Next**.

Nếu chỉ lướt nhanh mà **ô văn bản vẫn là `C:\...`**, bản cài sẽ vào C.

**Gợi ý:** Trước khi bấm **Cài đặt / Next** sau trang chọn thư mục, nhìn lại **một dòng đường dẫn đầy đủ** có bắt đầu bằng `D:\` (hoặc đúng ổ bạn muốn).

### 3) Cài “cho mọi người dùng” (Program Files)

Khi chế độ cài **per-machine**, mặc định thường hướng tới **`%ProgramFiles%`** (thường là **ổ C**). Bạn vẫn có thể **Browse** sang `D:\...` — miễn là ô đường dẫn cuối cùng là D.

---

Trình cài (NSIS) cho phép chọn thư mục cài đặt (ví dụ `D:\Programs\OpenClaw`). **Điều đó chỉ quyết định chỗ đặt bản cài:** file `.exe`, thư viện, `resources\`, v.v.

**Quan trọng:** Trong lúc cài, phần **giải nén tạm** vẫn thường dùng **TEMP trên C** (trừ khi bạn đổi `TMP`/`TEMP` như mục trên). Vì vậy **ổ C vẫn giảm** trong khi **ổ D** (chỉ là `$INSTDIR`) có thể **tăng ít hơn** hoặc tăng đúng bằng kích thước app — đó là hành vi bình thường.

Dung lượng **ổ C** vẫn có thể tăng vì các thành phần sau **không** nằm trong thư mục cài bạn chọn:

## 1. Dữ liệu người dùng của Electron (luôn trên profile Windows)

Ứng dụng dùng `app.getPath('userData')` — trên Windows thường là:

`C:\Users\<tài khoản>\AppData\Roaming\OpenClaw-Enchante\`

Ở đây có cấu hình wizard, `settings.json`, log, v.v. **Đây là hành vi chuẩn của Electron**, không phải lỗi installer.

## 2. Bộ nhớ đệm / cập nhật

- Cache cập nhật (`electron-updater`), file tạm khi chạy app có thể dùng `%TEMP%` (thường trên **C:**).
- Shortcut Start Menu / Desktop có thể trỏ tới ổ D nhưng metadata vẫn nằm trên profile (C:).

## 3. WSL + Ubuntu (nếu bạn dùng tính năng cần WSL)

OpenClaw chạy trong **WSL Ubuntu**. Ổ đĩa ảo WSL2 (`ext4.vhdx`) mặc định nằm dưới:

`C:\Users\<user>\AppData\Local\Packages\...`

Toàn bộ `~/.openclaw` trong Linux, `npm -g` trong guest, v.v. **tính vào dung lượng ổ C** (trừ khi bạn đã di chuyển WSL sang ổ khác bằng công cụ Microsoft `wsl --export` / cài đặt nâng cao).

## 4. npm toàn cục trên Windows (nếu có)

Nếu có cài gói npm global phía Windows (`C:\Users\...\AppData\Roaming\npm`), đó cũng là **C:**, không liên quan thư mục cài app trên D:.

---

## Kết luận

- **Không phải lỗi** “cài D mà ghi nhầm sang C” trong nghĩa ghi đè file app vào `Program Files` trên C.
- **Đúng kỳ vọng hệ thống:** phần lớn “dữ liệu chạy app + WSL” vẫn trên ổ hệ thống / profile (C:).

## Gợi ý cho người dùng nâng cao

- Giải phóng C: dọn `%TEMP%`, dọn cache không cần thiết.
- Di chuyển WSL: xem tài liệu Microsoft “Move WSL 2 VHD” / cài distro trên ổ khác.
- (Tính năng tương lai, phức tạp) Cho phép đổi `userData` sang ổ khác cần thiết kế lại khởi động app (`app.setPath` trước `ready`) + UI chọn thư mục — không có sẵn trong bản hiện tại.
