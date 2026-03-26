# Windows: cài **không dùng NSIS** (ổ C đầy — chỉ còn vài trăm MB)

Trình cài **`OPENCLAW-setup.exe` (NSIS)** trong lúc chạy **bắt buộc** giải nén rất nhiều dữ liệu vào thư mục tạm — mặc định **`%TEMP%` trên ổ C**. Gói Electron + `resources` + `skill/` có thể cần **nhiều GB chỗ trống trên ổ đó** trong vài phút, **dù** bạn chọn thư mục cài là **`D:\`**.

- Nếu **C: chỉ còn ~400 MB–1 GB trống** → thường sẽ **lỗi / thoát khoảng 70%** thanh tiến trình, và **C vẫn bị “ăn”** thêm vì file tạm giữa chừng.
- Đặt file `.exe` trên **D:** **không** thay đổi điều đó: quan trọng là **ổ chứa TEMP khi chạy installer**, không phải chỗ bạn lưu file setup.

## Vì sao `OPENCLAW-setup.exe` nhỏ hơn file `.zip`?

Đó là **bình thường**: bên trong `.exe` (NSIS) gói ứng dụng thường được nén **LZMA/7z**; file `.zip` là định dạng nén khác và thường **lớn hơn** dù cùng một bản build. **Không** có nghĩa bản `.exe` “thiếu” so với `.zip` — cùng nội dung sau khi cài/giải nén.

## ZIP chạy được, NSIS báo lỗi ~70–80%?

Hai cách này **cùng một app**; khác nhau ở chỗ:

| Cách | Điều gì xảy ra |
|------|----------------|
| **Giải nén `.zip`** | Bạn chỉ **copy** file ra đĩa → ít bước, không cần nhiều **TEMP trên C:**, ít xung đột khóa file. |
| **`OPENCLAW-setup.exe`** | NSIS **giải nén** gói vào `%TEMP%` (thường ổ **C:**), rồi **ghi đè** vào thư mục cài → cần **C: đủ trống**, không được **khóa file** (app đang chạy, Explorer Preview, quét AV). |

Nếu `.zip` ổn mà NSIS lỗi khoảng **70–80%** (đúng lúc ghi file), thường là:

1. **Ổ C:** (hoặc ổ chứa `%TEMP%`) **gần đầy** — xem mục dưới và [WINDOWS-INSTALL-DRIVES.md](WINDOWS-INSTALL-DRIVES.md).
2. **`OpenClaw.exe` vẫn đang chạy** (kể cả bản portable bạn vừa thử) — **tắt hết** OpenClaw / Task Manager, đóng Explorer đang mở sẵn thư mục cài, tắt **Preview pane** nếu đang xem file trong thư mục đó.
3. **Windows Defender / AV** đang quét file vừa giải nén — thử **loại trừ** thư mục cài hoặc tạm tắt quét thời gian thực khi cài (xem [BUILD-WINDOWS.md](BUILD-WINDOWS.md)).
4. **Cài đè** lên thư mục cũ bị “kẹt” — thử gỡ sạch / cài vào **thư mục mới** hoặc dùng **ZIP** như bản portable.

**Kết luận:** Dùng **`OpenClaw-…-win.zip` + giải nén** là cách **ổn định** khi máy hạn chế ổ C hoặc NSIS hay lỗi; bản `.exe` tiện cho shortcut và “Apps & features”.

### Trang “đồng ý điều khoản” trên NSIS

Bản build hiện dùng **trang license chuẩn** (`MUI_PAGE_LICENSE`) — xuất hiện **sau Welcome**, **trước** bước chọn cài cho ai / thư mục. Trang **nsDialogs tùy chỉnh** sau bước chọn thư mục từng gây **cài treo/thoát ~80%** trên một số máy (tương tác UAC / MUI), nên đã **bỏ** để ổn định trình cài.

**Sửa nội dung / tiếng Việt:** chỉnh `build/installer-license.source.txt` (UTF-8), rồi chạy `npm run prepare-installer-assets` (hoặc `node scripts/encode-installer-license-nsis.mjs`) để tạo `build/installer-license.txt` dạng **UTF-16 LE + BOM**. NSIS Unicode nếu đọc file UTF-8 thường sẽ **lỗi font (mojibake)** cho tiếng Việt.

## Cách an toàn khi C quá đầy: dùng bản **ZIP**

Sau `npm run build:win-local`, trong thư mục `dist/` có thêm file dạng:

`OpenClaw-<version>-win.zip` hoặc tương tự (tên chính xác xem trong `dist/`).

1. Copy file **.zip** sang **D:** (hoặc để sẵn trên D:).
2. Chuột phải → **Extract All…** / hoặc dùng **7-Zip** → giải nén **thẳng vào** một thư mục trên **D:**, ví dụ `D:\OpenClaw\`.
3. Chạy **`OpenClaw.exe`** trong thư mục vừa giải nén.

**Lưu ý:**

- Không có **shortcut tự tạo** / **Gỡ cài trong Settings** như bản NSIS; muốn shortcut thì tự tạo tới `D:\...\OpenClaw.exe`.
- Lần chạy đầu Windows có thể hỏi SmartScreen — bình thường với app chưa ký đầy đủ.

## Nếu vẫn muốn dùng `OPENCLAW-setup.exe`

1. **Giải phóng C:** nên có **ít nhất ~3–5 GB trống** (càng nhiều càng an toàn).
2. Chạy `scripts\run-openclaw-setup-temp-on-d.bat` (xem [WINDOWS-INSTALL-DRIVES.md](WINDOWS-INSTALL-DRIVES.md)) — **không** “Run as administrator” lên file `.bat`.
3. Xem thêm [BUILD-WINDOWS.md](BUILD-WINDOWS.md).

### Trang “Installation Complete” nhưng thanh xanh chỉ ~80% — app không tự mở?

- **Thanh tiến trình không full 100%** trong khi đã báo xong: điều này **hay gặp** với NSIS + MUI (electron-builder) — **không** chứng minh cài dở. Quan trọng là có nút **Finish** và không có hộp thoại lỗi đỏ.
- **App không bật lên sau khi cài:** trình cài dạng **assisted** thường có **ô chọn** kiểu **“Run OpenClaw”** / **“Run …”** trên trang cuối. Phải **tích vào ô đó** rồi bấm **Finish** thì Windows mới chạy app (hoặc mở thủ công):
  - Shortcut **Desktop** / **Start** (nếu đã tạo), hoặc
  - `D:\...\OpenClaw\OpenClaw.exe` (đúng thư mục bạn đã chọn khi cài).

### Vì sao ổ C mất thêm ~300MB dù cài sang D:?

- **File `OPENCLAW-setup.exe` nằm trên D** không có nghĩa Windows **chỉ dùng D**. Trong lúc cài, NSIS **giải nén gói** (7z + plugin) vào **`%TEMP%` trên C** (thư mục kiểu `...\AppData\Local\Temp\nsc....tmp`). Phần **~300MB** (hoặc hơn) thường là **dữ liệu tạm đó**, không phải “copy nguyên file .exe sang C”.
- Sau khi đóng trình cài, Windows **thường** dọn bớt temp; nếu còn sót, có thể xóa tay các thư mục `nsc*` trong `%LOCALAPPDATA%\Temp` khi **không** đang cài.
- Ngoài ra, nếu app **đã chạy một lần** (hoặc wizard tạo profile), **Electron** có thể tạo thư mục dưới `%APPDATA%` / `%LOCALAPPDATA%` trên C — đó là dữ liệu user, không nằm trên D.

## Tài liệu liên quan

- [WINDOWS-INSTALL-DRIVES.md](WINDOWS-INSTALL-DRIVES.md) — vì sao cài D mà C vẫn tụt; TEMP; script `.bat`.
