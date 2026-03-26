# Wizard steps (UX / structure)

Each setup step is implemented as a dedicated component in this folder. For clearer ownership you can **split into subfolders** per step, for example:

```
steps/
  welcome/WelcomeStep.tsx
  env-check/EnvCheckStep.tsx
  wsl-setup/WslSetupStep.tsx
  install/InstallStep.tsx
  api-key/ApiKeyGuideStep.tsx
  chat-model/AppchatGuideStep.tsx
  hooks/HooksStep.tsx
  config/ConfigStep.tsx
  done/DoneStep.tsx
  troubleshoot/TroubleshootStep.tsx
```

Imports from shared UI: `../../components/...`, `../../hooks/...`.

Current entry points are re-exported from flat files (e.g. `WelcomeStep.tsx`) — migrate imports in `App.tsx` when you move files.
