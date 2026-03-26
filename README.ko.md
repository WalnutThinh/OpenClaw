<p align="center">
  <img src="resources/icon.png" width="120" alt="OpenClaw Enchante">
</p>

<h1 align="center">OpenClaw Enchante</h1>

<p align="center">
  <strong><a href="https://github.com/openclaw/openclaw">OpenClaw</a> AI 에이전트용 데스크톱 설치기 — Enchante 커스터마이징</strong>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.ja.md">日本語</a> · <a href="README.zh.md">中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue?style=flat-square" alt="Platform">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8b5cf6?style=flat-square" alt="License"></a>
</p>

<p align="center">
  <a href="https://enchante.cloud">enchante.cloud</a> · <a href="https://github.com/openclaw/openclaw">OpenClaw</a>
</p>

---

## 개요

macOS / Windows에서 OpenClaw를 설치·설정하는 Electron 마법사입니다. Windows는 WSL Ubuntu에서 CLI를 실행합니다.

**전체 구조:** [docs/APP-ARCHITECTURE.md](docs/APP-ARCHITECTURE.md) (영문)

## 개발

```bash
npm install
npm run dev
npm run build
```

로컬 패키징: `npm run build:mac-local`, `npm run build:win-local`

> 소스 폴더에 설치 프로그램을 설치하면 제거 시 소스가 지워질 수 있습니다. 별도 경로를 사용하세요.

## 기여

[CONTRIBUTING.md](CONTRIBUTING.md)

## 라이선스

[MIT](LICENSE)
