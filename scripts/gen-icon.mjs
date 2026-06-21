// 把 XIAOJIN.png 转成多尺寸 .ico (16/32/48/64/128/256) 写到 build/icon.ico
// electron-builder 会自动用 build/icon.ico 作为 Windows app 图标
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const SRC = resolve(repoRoot, 'XIAOJIN.png')
const OUT_ICO = resolve(repoRoot, 'build', 'icon.ico')
const OUT_PNG = resolve(repoRoot, 'build', 'icon.png')

const SIZES = [16, 32, 48, 64, 128, 256]

async function main() {
  const src = await readFile(SRC)
  const meta = await sharp(src).metadata()
  console.log(`source: ${SRC} (${meta.width}x${meta.height}, ${src.length} bytes)`)

  // 为每个尺寸生成正方形 PNG（透明背景填充，居中 contain）
  const pngBuffers = []
  for (const size of SIZES) {
    const buf = await sharp(src)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: sharp.kernel.lanczos3, // 锐利重采样
      })
      .png()
      .toBuffer()
    pngBuffers.push(buf)
    console.log(`  generated ${size}x${size} (${buf.length} bytes)`)
  }

  await mkdir(dirname(OUT_ICO), { recursive: true })

  // png-to-ico 接受 buffer 数组，打包成多分辨率 .ico
  const icoBuffer = await pngToIco(pngBuffers)
  await writeFile(OUT_ICO, icoBuffer)
  console.log(`wrote ${OUT_ICO} (${icoBuffer.length} bytes)`)

  // 同时输出 256x256 PNG 给 linux / mac 使用
  await writeFile(OUT_PNG, pngBuffers[pngBuffers.length - 1])
  console.log(`wrote ${OUT_PNG} (${pngBuffers[pngBuffers.length - 1].length} bytes)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
