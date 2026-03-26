/**
 * Local OpenClaw Control UI (Gateway HTTP). Prefer `electronAPI.dashboard.open()` so the main process
 * can attach `#token=` from `gateway.auth.token` (see docs/OPENCLAW-DASHBOARD.md).
 */
export const OPENCLAW_DASHBOARD_URL = 'http://127.0.0.1:18789/'

/** Zalo Bot Platform — create bot & get Bot Token */
export const ZALO_BOT_DOCS_URL = 'https://bot.zapps.me/docs/create-bot/'

/** Open Zalo app / web (user chats with their bot in the Zalo client on mobile or desktop) */
export const ZALO_OPEN_URL = 'https://zalo.me/'

/** Feishu / Lark — open product home (user has Lark app for chat) */
export const LARK_OPEN_URL = 'https://www.feishu.cn/'

/** Official Ollama installers (Windows / macOS / Linux) */
export const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download'

/** Ollama env vars and networking (OLLAMA_HOST, listeners) */
export const OLLAMA_FAQ_URL = 'https://github.com/ollama/ollama/blob/main/docs/faq.mdx'
