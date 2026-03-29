# Wizard — tham chiếu từng bước (OpenClaw / Enchante)

Tài liệu này mô tả **nội dung UI, luồng điều hướng, IPC, và i18n** của wizard cài đặt để PM/dev đọc lại mà không cần mở toàn bộ code.

- **Luồng chính (thứ tự trong code):** `src/renderer/src/hooks/useWizard.ts` — mảng `STEPS`.
- **Điều kiện đặc biệt:** `src/renderer/src/App.tsx` — `handleEnvCheckDone`, `handleWslReady`, `handleConfigDone`, resume từ `wizard.loadState()`.
- **Thanh tiến trình (header):** `src/renderer/src/components/StepIndicator.tsx` — logo + chữ **OpenClaw** (`OpenClawHeaderBrand`) nằm **phía trên** dòng chấm step; **không** hiển thị ở màn **Welcome** và **Troubleshoot**.

---

## Thứ tự bước trong `useWizard` (canonical)

```text
welcome → envCheck → [wslSetup chỉ khi Windows cần] → install → apiKeyGuide → appchatGuide → hooks → config → done
```

**Lưu ý:** `troubleshoot` là bước **ngoài** mảng `STEPS`, chỉ `goTo('troubleshoot')` từ màn Done (hoặc tương tự).

---

## Stepper (header): label theo nền tảng

File: `StepIndicator.tsx` + `src/shared/i18n/locales/*/steps.json` → `indicator.default` / `indicator.windows`.

| Vị trí dot | macOS / Linux (`default`) | Windows (`windows`) |
|------------|---------------------------|---------------------|
| 0 | Start | Start |
| 1 | Env | Env |
| 2 | Install | **WSL** |
| 3 | Model & Provider | Install |
| 4 | Model Chat | Model & Provider |
| 5 | Hooks | Model Chat |
| 6 | Config | Hooks |
| 7 | Done | Config |
| 8 | — | Done |

**Mapping `currentStep` → dot:** `steps` là mảng tên bước (`welcome`, `envCheck`, …); `current` = `indexOf(currentStep)` trên mảng tương ứng. Bước `wslSetup` chỉ có trên Windows nên mới khớp với thêm một dot “WSL”.

---

## Step 1 — `welcome` (Bắt đầu)

| Mục | Chi tiết |
|-----|----------|
| **Component** | `src/renderer/src/steps/WelcomeStep.tsx` |
| **Stepper** | **Không** — `App.tsx` chỉ render `StepIndicator` khi `currentStep !== 'welcome' && !== 'troubleshoot'`. |
| **Nội dung UI** | `OpenClawBrandCenter` (logo + wordmark lớn, giữa màn), tiêu đề `welcome.title`, mô tả `welcome.desc`, nút `welcome.start`, `LanguageSwitcher` góc phải trên. |
| **i18n** | Namespace `steps`: keys `welcome.*` |
| **Điều hướng** | Nút “Get Started” → `next()` → chuyển sang `envCheck`. |
| **IPC** | Không gọi env trong bước này (env được gọi ở `App` `useEffect` khi mount). |

---

## Step 2 — `envCheck` (Môi trường / Kiểm tra môi trường)

| Mục | Chi tiết |
|-----|----------|
| **Component** | `src/renderer/src/steps/EnvCheckStep.tsx` |
| **Stepper** | Có — dot thứ 2 (sau “Start”) tương ứng “Env”. Logo OpenClaw nằm **trên** dòng step (header), không còn logo lớn ở giữa nội dung. |
| **Nội dung UI** | Tiêu đề `envCheck.title`. Trạng thái quét: `envCheck.scanning`. Danh sách hàng kiểm tra (`CheckRow`): **OS** (`envCheck.os`), **WSL** chỉ khi `env.os === 'windows'` (`envCheck.wsl` + `envCheck.wslState.*`), **Node.js** (`envCheck.nodejs`), **OpenClaw** (`envCheck.openclaw`). Nút chính: đang quét → `envCheck.checkBtn`; đủ điều kiện → `envCheck.nextBtn`; thiếu → `envCheck.installBtn`. Nếu có bản OpenClaw mới hơn: nút cập nhật (`envCheck.updateAvailable` + version). |
| **IPC** | `window.electronAPI.env.check()` — trả về OS, node, openclaw, `wslState` (Windows). Cập nhật OpenClaw: `window.electronAPI.install.openclaw()`. |
| **Logic** | `allReady` = node OK + openclaw đã cài. **Continue:** nếu `allReady` → `onNext()` (trong `App`: `goTo('apiKeyGuide')`). Nếu không: `onNeedInstall(env)` → `App.handleEnvCheckDone`: set `installNeeds`, nếu Windows và WSL chưa ready → `goTo('wslSetup')`, ngược lại → `goTo('install')`. |

---

## Step 3 (Windows) — `wslSetup` (WSL)

Chỉ xuất hiện khi môi trường Windows và WSL chưa ở trạng thái `ready` (điều hướng từ `handleEnvCheckDone`).

| Mục | Chi tiết |
|-----|----------|
| **Component** | `src/renderer/src/steps/WslSetupStep.tsx` |
| **Stepper** | Có — trên Windows có thêm dot “WSL” (xem bảng `indicator.windows`). |
| **Nội dung UI** | Theo `wslState`: cài WSL, reboot, cài Ubuntu, khởi tạo, v.v. — toàn bộ copy trong `steps.json` → `wslSetup.*`. |
| **IPC** | `window.electronAPI.wsl.install(currentState)`, có thể `wizard.saveState({ step: 'wslSetup', ... })` trước reboot. |
| **Điều hướng** | Khi `currentState === 'ready'`, sau timeout ngắn gọi `onReady` → `App.handleWslReady`: `wizard.clearState()`, `goTo('envCheck')` để kiểm tra lại. |

**Trên macOS/Linux:** không có bước này trong luồng thông thường; mảng `STEPS` trong `useWizard` vẫn có `wslSetup` nhưng UI chủ yếu dành cho Windows.

---

## Step 3 (hoặc 4 trên Windows) — `install` (Cài đặt)

| Mục | Chi tiết |
|-----|----------|
| **Component** | `src/renderer/src/steps/InstallStep.tsx` |
| **Props** | `needs: { needNode, needOpenclaw }` từ kết quả env. |
| **Nội dung UI** | Tiêu đề động: `install.done` / `install.failed` / `install.progress` / `install.ready`; mô tả `install.wait` / `install.allReady` / `install.checkLog` / `install.desc`. Card danh sách: `install.nodejs`, `install.openclaw` (số thứ tự 01/02). `LogViewer` + log qua `useInstallLogs`. Nút `install.startBtn` / `install.retryBtn` / `install.nextBtn`. |
| **IPC** | `install.node()` nếu `needNode`, `install.openclaw()` nếu `needOpenclaw`. |
| **Điều hướng** | `onDone` → `goTo('apiKeyGuide')`. |

---

## Step — `apiKeyGuide` (Model & Provider)

| Mục | Chi tiết |
|-----|----------|
| **Component** | `src/renderer/src/steps/ApiKeyGuideStep.tsx` |
| **Nội dung UI** | Chọn provider, API key hoặc OAuth (`apiKeyGuide.*`, `authMethod`), chọn model, link lấy key theo provider (`getApiKey.*`). |
| **State (App)** | `provider`, `modelId`, `authMethod`, `providerApiKey`, `oauthCompleted` — truyền xuống `ConfigStep` sau này. |
| **Điều hướng** | `onNext` → bước kế `appchatGuide`. |

---

## Step — `appchatGuide` (Model Chat / nền tảng chat)

| Mục | Chi tiết |
|-----|----------|
| **Component** | `src/renderer/src/steps/AppchatGuideStep.tsx` |
| **Nội dung UI** | `appchatGuide.*` — Telegram, Zalo, Lark; field token/app id/secret; có thể Skip. |
| **State (App)** | `telegramToken`, `zalo*`, `lark*` — dùng ở `ConfigStep`. |

---

## Step — `hooks` (Hooks / Nemo skills)

| Mục | Chi tiết |
|-----|----------|
| **Component** | `src/renderer/src/steps/HooksStep.tsx` |
| **Nội dung UI** | `hooks.*`, `skills.*` — Nemo Shield, chọn skills, log + copy. |
| **State (App)** | `enableNemoShield`, `selectedSkills`. |
| **Điều hướng** | `onDone` → `goTo('config')`. |

---

## Step — `config` (Cấu hình / Apply)

| Mục | Chi tiết |
|-----|----------|
| **Component** | `src/renderer/src/steps/ConfigStep.tsx` |
| **Nội dung UI** | Tiêu đề `config.title`, mô tả `config.desc`. Tóm tắt provider/model/chat/extras. Validation Zalo (bot vs OA), Telegram format, Lark đủ cặp. Nút lưu `config.saveBtn` / `config.savingBtn`; sau apply thành công: `config.applyDoneHint`, `config.nextAfterApply`. OAuth strings: `config.oauth*`. |
| **IPC** | `window.electronAPI.onboard.run({ provider, apiKey?, authMethod, telegramBotToken?, zalo*, lark*, modelId, enableNemoShield, selectedSkills? })` — thành công → `applyDone`, `onDone(savedBotUsername)`. |
| **Điều hướng** | `handleConfigDone` → `wizard.clearState()`, `goTo('done')`. |

---

## Step — `done` (Xong)

| Mục | Chi tiết |
|-----|----------|
| **Component** | `src/renderer/src/steps/DoneStep.tsx` |
| **Stepper** | Không hiển thị stepper theo logic cũ có thể khác — trong `App`, `canGoBack` = false khi `currentStep === 'done'` (nút Back ẩn). |
| **Nội dung UI** | Trạng thái gateway, model, troubleshoot entry, uninstall flow tùy implementation. |
| **Điều hướng** | `onTroubleshoot` → `goTo('troubleshoot')`; `onUninstallDone` → clear state, `goTo('welcome')`. |

---

## Step — `troubleshoot` (ngoài luồng chính)

| Mục | Chi tiết |
|-----|----------|
| **Component** | `src/renderer/src/steps/TroubleshootStep.tsx` |
| **Stepper** | **Không** (giống welcome). |
| **Nội dung UI** | `troubleshoot.*` — env, gateway, reinstall, fixer, log. |
| **Điều hướng** | `onBack` → `prev()`. |

---

## Footer toàn app (mọi màn có layout đầy đủ)

Trong `App.tsx`: version góc trái (từ `electronAPI.version()`, fallback `1.1.02` (khớp `package.json` hiện tại)), dòng “Customized by” + logo Enchante giữa; dev có nút `[skip→done]`.

---

## File i18n liên quan

- **Wizard copy chủ yếu:** `src/shared/i18n/locales/<lang>/steps.json`
- **Chung:** `common` (status, nút Back `common:button.back`, …)

---

## Cập nhật tài liệu này khi nào?

- Thêm/bớt bước trong `STEPS` hoặc đổi tên `StepName`.
- Đổi `StepIndicator` / `OpenClawHeaderBrand` / điều kiện hiển thị stepper trong `App.tsx`.
- Thêm field IPC mới trong `EnvCheckStep`, `ConfigStep`, v.v.
