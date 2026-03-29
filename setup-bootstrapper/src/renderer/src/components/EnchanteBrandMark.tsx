/**
 * Animated Enchante mark for the setup header. Bundled asset: `enchante-brand.mp4`.
 * Optional fallbacks: `enchante-brand.webm`, `enchante-brand.gif`; else static SVG.
 */
import enchanteFallback from '../assets/enchante-direction-black.svg?url'

const enchanteBrandFiles = import.meta.glob<string>('../assets/enchante-brand.{mp4,webm,gif}', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

function pickBrand(): { url: string; kind: 'video' | 'gif' } | null {
  const entries = Object.entries(enchanteBrandFiles)
  if (entries.length === 0) return null
  entries.sort(([a], [b]) => {
    const rank = (p: string): number =>
      p.endsWith('.mp4') ? 0 : p.endsWith('.webm') ? 1 : p.endsWith('.gif') ? 2 : 9
    return rank(a) - rank(b)
  })
  const [path, url] = entries[0]
  const kind = path.endsWith('.gif') ? 'gif' : 'video'
  return { url, kind }
}

/** Same visual height as the previous static header icon (~26px). */
export function EnchanteBrandMark({ height = 26 }: { height?: number }): React.JSX.Element {
  const picked = pickBrand()
  if (!picked) {
    return <img src={enchanteFallback} alt="" style={{ height, width: 'auto', display: 'block' }} />
  }
  if (picked.kind === 'gif') {
    return <img src={picked.url} alt="" style={{ height, width: 'auto', display: 'block', objectFit: 'contain' }} />
  }
  return (
    <video
      src={picked.url}
      muted
      autoPlay
      loop
      playsInline
      preload="auto"
      aria-hidden
      style={{
        height,
        width: 'auto',
        maxHeight: height,
        display: 'block',
        objectFit: 'contain',
        objectPosition: 'left center'
      }}
    />
  )
}

/** Header row: animated mark + wordmark (matches prior icon footprint for the video). */
export function EnchanteDirectionHeader({ markHeight = 26 }: { markHeight?: number }): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 0
      }}
    >
      <EnchanteBrandMark height={markHeight} />
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#1a1a1a',
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
          lineHeight: 1.2,
          userSelect: 'none'
        }}
      >
        Enchante Direction
      </span>
    </div>
  )
}
