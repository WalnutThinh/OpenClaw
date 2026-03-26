export const CONFIGURABLE_CHAT_PLATFORMS = ['telegram', 'zalo', 'lark'] as const
export type ConfigurableChatPlatform = (typeof CONFIGURABLE_CHAT_PLATFORMS)[number]
export const CHAT_PLATFORMS = [
  ...CONFIGURABLE_CHAT_PLATFORMS,
  'whatsapp',
  'discord',
  'slack',
  'line',
  'signal',
  'skip'
] as const
export type ChatPlatform = (typeof CHAT_PLATFORMS)[number]
export const OPENCLAW_CHANNEL_KEYS: Record<ConfigurableChatPlatform, string> = {
  telegram: 'telegram',
  zalo: 'zalo',
  lark: 'feishu'
}
