; OpenClaw Windows installer hooks (included by electron-builder before MUI2).
; Do not use MUI_HEADER_TEXT inside Functions here - MUI2 is not loaded yet.
;
; --- Windows Firewall (Private + Public + Domain) ---
; The native "Windows Security" dialog (publisher + path) is shown only by the OS when a program
; is blocked while listening; the "Publisher" line comes from Authenticode on the .exe, not from
; installer text. Unsigned builds may see a generic publisher until you code-sign.
; This installer adds an explicit inbound allow rule so Gateway/local services work without a
; manual prompt. The rule name includes "Enchante Direction"; full path is the installed OpenClaw.exe
; (visible in Windows Defender Firewall → Advanced settings → Inbound Rules).
!define OPENCLAW_FW_RULE_IN "OpenClaw - Enchante Direction (in)"
!include "installer-display-version.nsh"

!macro customHeader
  BrandingText "Version ${OPENCLAW_INSTALLER_DISPLAY_VERSION}"
!macroend

; customInit runs in .onInit AFTER initMultiUser (so $INSTDIR is already set from old registry)
; but BEFORE the install section and uninstallOldVersion.
!macro customInit
  ; 1) Kill all app processes so files aren't locked
  nsExec::Exec 'taskkill /F /IM "OpenClaw.exe" /T'
  Pop $0
  nsExec::Exec 'taskkill /F /IM "OpenClaw-Enchante.exe" /T'
  Pop $0
  ; Do NOT call wsl here: on PCs without WSL/Ubuntu or with broken WSL, `wsl` can block/hang .onInit.
  Sleep 1000

  ; 2) Remove the old uninstall registry entries.
  ;    This prevents uninstallOldVersion from finding and running the OLD
  ;    uninstaller binary - which can't handle silent close and shows a
  ;    "cannot be closed / Retry" dialog.
  ;    The new installer will overwrite files in $INSTDIR and re-create
  ;    clean registry entries after extraction.
  DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY}"
  DeleteRegKey HKLM "${UNINSTALL_REGISTRY_KEY}"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY_2}"
    DeleteRegKey HKLM "${UNINSTALL_REGISTRY_KEY_2}"
  !endif
!macroend

; Safety net: replace the built-in "app is running" check in the install section.
!macro customCheckAppRunning
  nsExec::Exec 'taskkill /F /IM "OpenClaw.exe" /T'
  Pop $0
  nsExec::Exec 'taskkill /F /IM "OpenClaw-Enchante.exe" /T'
  Pop $0
  Sleep 1000
!macroend

; Pinned taskbar / desktop shortcuts from older builds pointed at OpenClaw-Enchante.exe (npm package name).
; Current builds ship OpenClaw.exe only. Hard-link the legacy filename so old pins work without duplicating the binary (NTFS).
!macro customInstall
  IfFileExists "$INSTDIR\OpenClaw.exe" 0 +6
  nsExec::Exec 'cmd /c del /f /q "$INSTDIR\OpenClaw-Enchante.exe" 2>nul'
  Pop $0
  nsExec::Exec 'cmd /c mklink /H "$INSTDIR\OpenClaw-Enchante.exe" "$INSTDIR\OpenClaw.exe"'
  Pop $0

  ; AdvFirewall: allow inbound for this executable on all profiles (private, public, domain).
  IfFileExists "$INSTDIR\OpenClaw.exe" +1
  Goto enchante_fw_done
  FileOpen $R9 "$TEMP\enchante_openclaw_fw_install.bat" w
  FileWrite $R9 '@echo off$\r$\n'
  FileWrite $R9 'netsh advfirewall firewall delete rule name="${OPENCLAW_FW_RULE_IN}" >nul 2>&1$\r$\n'
  FileWrite $R9 'netsh advfirewall firewall add rule name="${OPENCLAW_FW_RULE_IN}" dir=in action=allow program="$INSTDIR\OpenClaw.exe" enable=yes profile=any$\r$\n'
  FileClose $R9
  nsExec::ExecToLog '"$TEMP\enchante_openclaw_fw_install.bat"'
  Pop $0
  Delete "$TEMP\enchante_openclaw_fw_install.bat"
  enchante_fw_done:
!macroend

!macro customUnInstall
  FileOpen $R9 "$TEMP\enchante_openclaw_fw_uninstall.bat" w
  FileWrite $R9 '@echo off$\r$\n'
  FileWrite $R9 'netsh advfirewall firewall delete rule name="${OPENCLAW_FW_RULE_IN}"$\r$\n'
  FileClose $R9
  nsExec::ExecToLog '"$TEMP\enchante_openclaw_fw_uninstall.bat"'
  Pop $0
  Delete "$TEMP\enchante_openclaw_fw_uninstall.bat"
!macroend

; Privacy / terms acknowledgement: use electron-builder `nsis.license` → MUI_PAGE_LICENSE
; (see build/installer-license.txt). Custom nsDialogs page after directory was removed due to
; install failures (~progress 80% / exit) correlated with UAC + MUI custom pages.

; Do NOT run WSL / openclaw from customInstall here: nsExec + wsl + doctor --fix can block for a long time
; and the MUI progress bar often stays ~70% while waiting — users think the installer crashed or "exited".
; Security / repair: use the in-app Fixer (openclaw doctor --fix) after install.
