<p align="center">
  <img src="resources/icon.png" width="120" alt="OpenClaw Enchante">
</p>

<h1 align="center">OpenClaw Enchante</h1>

<p align="center">
  <strong><a href="https://github.com/openclaw/openclaw">OpenClaw</a> 用デスクトップインストーラー（Enchante カスタマイズ）</strong>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.ko.md">한국어</a> · <a href="README.zh.md">中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue?style=flat-square" alt="Platform">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8b5cf6?style=flat-square" alt="License"></a>
</p>

<p align="center">
  <a href="https://enchante.cloud">enchante.cloud</a> · <a href="https://github.com/openclaw/openclaw">OpenClaw</a>
</p>

---

## 概要

macOS / Windows で OpenClaw をセットアップする Electron ウィザードです。Windows は WSL Ubuntu 上で CLI を動かします。

**アーキテクチャ詳細:** [docs/APP-ARCHITECTURE.md](docs/APP-ARCHITECTURE.md)（英語）

## 開発

```bash
npm install
npm run dev
npm run build
```

パッケージ: `npm run build:mac-local` / `npm run build:win-local`

> インストーラーをソースと同じフォルダに入れると、アンインストールでソースが消えることがあります。

## コントリビューション

[CONTRIBUTING.md](CONTRIBUTING.md)

## ライセンス

[MIT](LICENSE)
