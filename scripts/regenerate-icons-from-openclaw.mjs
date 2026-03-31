/**
 * Priority:
 * 1) `src/renderer/src/assets/eclaw-mark.png` (desktop + tray sources + multi-size `build/icon.ico`)
 * 2) `resources/openclaw-logo.ico` → `build/icon.ico` + rasterized PNGs
 * 3) `src/renderer/src/assets/openclaw-color.svg` → PNGs + ICO
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const eclawMarkPng = path.join(root, 'src/renderer/src/assets/eclaw-mark.png')
const svgPath = path.join(root, 'src/renderer/src/assets/openclaw-color.svg')
const brandIcoPath = path.join(root, 'resources/openclaw-logo.ico')

/** PNG-embedded ICO (common on Windows) — sharp often cannot decode the .ico wrapper. */
function firstImageBufferFromIco(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) return null
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null
  if (buf.readUInt16LE(4) < 1) return null
  const entry = 6
  const size = buf.readUInt32LE(entry + 8)
  const offset = buf.readUInt32LE(entry + 12)
  if (offset + size > buf.length) return null
  return buf.subarray(offset, offset + size)
}

function isPngBuffer(b) {
  return (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
}

async function rasterizePngSource(pngPath) {
  const buf = fs.readFileSync(pngPath)
  const outIcon = path.join(root, 'resources/icon.png')
  const outWin256 = path.join(root, 'resources/icon-win256.png')
  const outTray = path.join(root, 'resources/trayIconTemplate.png')
  const outTray2x = path.join(root, 'resources/trayIconTemplate@2x.png')
  const outIco = path.join(root, 'build/icon.ico')

  fs.mkdirSync(path.dirname(outIcon), { recursive: true })
  fs.mkdirSync(path.dirname(outIco), { recursive: true })

  await sharp(buf).resize(512, 512).png().toFile(outIcon)
  await sharp(buf).resize(256, 256).png().toFile(outWin256)
  await sharp(buf).resize(32, 32).png().toFile(outTray)
  await sharp(buf).resize(64, 64).png().toFile(outTray2x)

  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const pngBuffers = await Promise.all(
    sizes.map(async (s) => sharp(buf).resize(s, s).png().toBuffer())
  )
  const ico = await pngToIco(pngBuffers)
  fs.writeFileSync(outIco, ico)

  console.log('Wrote', outIcon, outWin256, outTray, outTray2x, outIco, '(from', path.basename(pngPath) + ')')
}

async function rasterizeSvgToPngs(svg) {
  const outIcon = path.join(root, 'resources/icon.png')
  const outWin256 = path.join(root, 'resources/icon-win256.png')
  const outTray = path.join(root, 'resources/trayIconTemplate.png')
  const outTray2x = path.join(root, 'resources/trayIconTemplate@2x.png')
  const outIco = path.join(root, 'build/icon.ico')

  fs.mkdirSync(path.dirname(outIcon), { recursive: true })
  fs.mkdirSync(path.dirname(outIco), { recursive: true })

  await sharp(svg).resize(512, 512).png().toFile(outIcon)
  await sharp(svg).resize(256, 256).png().toFile(outWin256)
  await sharp(svg).resize(32, 32).png().toFile(outTray)
  await sharp(svg).resize(64, 64).png().toFile(outTray2x)

  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const pngBuffers = await Promise.all(
    sizes.map(async (s) => sharp(svg).resize(s, s).png().toBuffer())
  )
  const ico = await pngToIco(pngBuffers)
  fs.writeFileSync(outIco, ico)

  console.log('Wrote', outIcon, outWin256, outTray, outTray2x, outIco, '(from SVG)')
}

async function useBrandIco() {
  const outIcon = path.join(root, 'resources/icon.png')
  const outWin256 = path.join(root, 'resources/icon-win256.png')
  const outTray = path.join(root, 'resources/trayIconTemplate.png')
  const outTray2x = path.join(root, 'resources/trayIconTemplate@2x.png')
  const outIco = path.join(root, 'build/icon.ico')

  fs.mkdirSync(path.dirname(outIcon), { recursive: true })
  fs.mkdirSync(path.dirname(outIco), { recursive: true })

  fs.copyFileSync(brandIcoPath, outIco)
  console.log('Windows icon:', brandIcoPath, '→', outIco)

  const icoBuf = fs.readFileSync(brandIcoPath)
  const embedded = firstImageBufferFromIco(icoBuf)
  const rasterSource =
    embedded && isPngBuffer(embedded) ? embedded : icoBuf

  try {
    await sharp(rasterSource).resize(512, 512).png().toFile(outIcon)
    await sharp(rasterSource).resize(256, 256).png().toFile(outWin256)
    await sharp(rasterSource).resize(32, 32).png().toFile(outTray)
    await sharp(rasterSource).resize(64, 64).png().toFile(outTray2x)
    console.log('Rasterized PNG/tray assets from openclaw-logo.ico')
  } catch (e) {
    console.warn(
      'openclaw-logo.ico: sharp could not decode; falling back to SVG for PNG/tray only:',
      e?.message ?? e
    )
    const svg = fs.readFileSync(svgPath)
    await sharp(svg).resize(512, 512).png().toFile(outIcon)
    await sharp(svg).resize(256, 256).png().toFile(outWin256)
    await sharp(svg).resize(32, 32).png().toFile(outTray)
    await sharp(svg).resize(64, 64).png().toFile(outTray2x)
  }
}

async function main() {
  if (fs.existsSync(eclawMarkPng)) {
    await rasterizePngSource(eclawMarkPng)
    return
  }
  if (fs.existsSync(brandIcoPath)) {
    await useBrandIco()
    return
  }
  const svg = fs.readFileSync(svgPath)
  await rasterizeSvgToPngs(svg)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
