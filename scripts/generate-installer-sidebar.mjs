/**
 * NSIS welcome/finish sidebar: 164×314 (same image on welcome + finish pages).
 * Brand asset priority: `build/installer-enchante-brand.png` → `build/installer-enchante-brand.svg` → legacy (dark + icon).
 */
import sharp from 'sharp'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const W = 164
const H = 314
const brandPngPath = join(root, 'build/installer-enchante-brand.png')
const brandSvgPath = join(root, 'build/installer-enchante-brand.svg')
const iconPath = join(root, 'build/icon.png')
const outPath = join(root, 'build/installerSidebar.png')

const footerWhiteBg = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <text x="50%" y="${H - 52}" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="8" fill="#64748b">Customized by</text>
  <text x="50%" y="${H - 28}" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="11" font-weight="600" fill="#0f172a">Enchante Direction</text>
</svg>`,
)

const footerDarkBg = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <text x="50%" y="${H - 52}" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="8" fill="#94a3b8">Customized by</text>
  <text x="50%" y="${H - 28}" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="11" font-weight="600" fill="#f8fafc">Enchante Direction</text>
</svg>`,
)

if (existsSync(brandPngPath) || existsSync(brandSvgPath)) {
  const bg = { r: 255, g: 255, b: 255, alpha: 1 }
  const raw = readFileSync(existsSync(brandPngPath) ? brandPngPath : brandSvgPath)
  const brandBuf = await sharp(raw)
    .resize(140, 210, { fit: 'inside' })
    .png()
    .toBuffer()
  const meta = await sharp(brandBuf).metadata()
  const bw = meta.width ?? 140
  const bh = meta.height ?? 180
  const bx = Math.round((W - bw) / 2)
  const by = 28

  await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: bg,
    },
  })
    .composite([
      { input: brandBuf, left: bx, top: by },
      { input: footerWhiteBg, left: 0, top: 0 },
    ])
    .png()
    .toFile(outPath)
} else {
  const bg = { r: 15, g: 23, b: 42, alpha: 1 }
  const iconBuf = readFileSync(iconPath)
  const iconResized = await sharp(iconBuf)
    .resize(112, 112, { fit: 'inside' })
    .png()
    .toBuffer()

  const iconMeta = await sharp(iconResized).metadata()
  const iw = iconMeta.width ?? 112
  const ih = iconMeta.height ?? 112
  const ix = Math.round((W - iw) / 2)
  const iy = 28

  await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: bg,
    },
  })
    .composite([
      { input: iconResized, left: ix, top: iy },
      { input: footerDarkBg, left: 0, top: 0 },
    ])
    .png()
    .toFile(outPath)
}

console.log('[generate-installer-sidebar] wrote', outPath)
