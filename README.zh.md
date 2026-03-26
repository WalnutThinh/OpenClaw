<p align="center">
  <img src="resources/icon.png" width="120" alt="OpenClaw Enchante">
</p>

<h1 align="center">OpenClaw Enchante</h1>

<p align="center">
  <strong><a href="https://github.com/openclaw/openclaw">OpenClaw</a> 桌面安装器 — Enchante 定制</strong>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue?style=flat-square" alt="Platform">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8b5cf6?style=flat-square" alt="License"></a>
</p>

<p align="center">
  <a href="https://enchante.cloud">enchante.cloud</a> · <a href="https://github.com/openclaw/openclaw">OpenClaw</a>
</p>

---

## 简介

在 macOS / Windows 上引导安装、配置 OpenClaw 的 Electron 向导。Windows 通过 WSL Ubuntu 运行 CLI。

**完整结构说明:** [docs/APP-ARCHITECTURE.md](docs/APP-ARCHITECTURE.md)（英文）

## 开发

```bash
npm install
npm run dev
npm run build
```

打包: `npm run build:mac-local`、`npm run build:win-local`

> 请勿将应用安装到源码目录；卸载程序可能删除该目录。

## 贡献

[CONTRIBUTING.md](CONTRIBUTING.md)

## 许可

[MIT](LICENSE)
