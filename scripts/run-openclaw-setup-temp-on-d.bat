@echo off
setlocal EnableExtensions
REM =============================================================================
REM OpenClaw / Enchante — chạy trình cài với TEMP/TMP trên ổ khác (vd. D:)
REM để NSIS/electron-builder không giải nén hết vào %LOCALAPPDATA%\Temp trên C:.
REM
REM QUAN TRONG:
REM - Neu o C chi con ~400MB–1GB trong: NSIS rat de THAT BAI (~70%% roi tat). Can nhieu GB
REM   trong tren o chua TEMP, HOAC dung ban ZIP giai nen thang len D: (xem docs).
REM - DUNG chuot phai "Run as administrator" len file .BAT nay: tien trinh nang quyen co the
REM   BO QUA bien TMP/TEMP ban vua dat, va van dung Temp mac dinh tren C:.
REM   Chay .bat binh thuong (double-click), hoac mo cmd roi go lenh.
REM
REM Cách dùng (cmd):
REM   scripts\run-openclaw-setup-temp-on-d.bat D: "D:\Downloads\OPENCLAW-setup.exe"
REM
REM Tham số 1: ổ đích cho thư mục tạm (mặc định D:)
REM Tham số 2: đường dẫn đầy đủ tới OPENCLAW-setup.exe
REM =============================================================================

set "TDRV=%~1"
if "%TDRV%"=="" set "TDRV=D:"

set "SETUP=%~2"
if "%SETUP%"=="" (
  echo.
  echo Thieu file cai dat. Vi du:
  echo   %~nx0 D: "%USERPROFILE%\Downloads\OPENCLAW-setup.exe"
  echo.
  exit /b 1
)

if not exist "%SETUP%" (
  echo Khong tim thay: %SETUP%
  exit /b 1
)

set "EN_TEMPDIR=%TDRV%\EnchanteOpenClawInstallTemp"
mkdir "%EN_TEMPDIR%" 2>nul
if errorlevel 1 (
  echo Khong tao duoc thu muc: %EN_TEMPDIR%
  exit /b 1
)

set "TMP=%EN_TEMPDIR%"
set "TEMP=%EN_TEMPDIR%"
echo TMP/TEMP = %TEMP%
echo Dang chay trinh cai...
echo Sau khi cai xong, co the xoa thu muc: %EN_TEMPDIR%
echo.

"%SETUP%"
set "ERR=%ERRORLEVEL%"
echo.
echo Trinh cai ket thuc ma %ERR%. Nhan phim bat ky...
pause >nul
exit /b %ERR%
