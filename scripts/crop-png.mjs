// Crops a PNG to its non-black content plus a margin, re-encoding losslessly.
// The headless browser shot is the window the page asked for, not the size
// the terminal div turned out to be, so the margins around the frame go here.

import { inflateSync, deflateSync } from "node:zlib"
import { readFileSync, writeFileSync } from "node:fs"

const [input, output] = process.argv.slice(2)

function decodePng(buf) {
  let pos = 8
  let width, height, bitDepth, colorType
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString("ascii", pos + 4, pos + 8)
    if (type === "IHDR") {
      width = buf.readUInt32BE(pos + 8)
      height = buf.readUInt32BE(pos + 12)
      bitDepth = buf[pos + 16]
      colorType = buf[pos + 17]
    } else if (type === "IDAT") {
      idat.push(buf.subarray(pos + 8, pos + 8 + len))
    }
    pos += 12 + len
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (!channels || bitDepth !== 8) {
    throw new Error(`unsupported png: colorType ${colorType} depth ${bitDepth}`)
  }
  const packed = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const data = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = packed[y * (stride + 1)]
    const row = packed.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = data.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? data.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev ? prev[x] : 0
      const c = x >= channels && prev ? prev[x - channels] : 0
      let v = row[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[x] = v & 0xff
    }
  }
  return { width, height, channels, data }
}

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(buf) {
  let c = -1
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, content) {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(content.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), content])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([head, body, crc])
}

function encodePng(width, height, channels, data) {
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = channels === 4 ? 6 : 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

const MARGIN = 48
const png = decodePng(readFileSync(input))
const { width, height, channels, data } = png

let right = 0
let bottom = 0
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const o = y * width * channels + x * channels
    if (data[o] + data[o + 1] + data[o + 2] > 12) {
      if (x > right) right = x
      if (y > bottom) bottom = y
    }
  }
}

const cropWidth = Math.min(width, right + 1 + MARGIN)
const cropHeight = Math.min(height, bottom + 1 + MARGIN)
const cropped = Buffer.alloc(cropWidth * cropHeight * channels)
for (let y = 0; y < cropHeight; y++) {
  data.copy(
    cropped,
    y * cropWidth * channels,
    y * width * channels,
    y * width * channels + cropWidth * channels,
  )
}

writeFileSync(output, encodePng(cropWidth, cropHeight, channels, cropped))
console.log(`cropped ${width}x${height} -> ${cropWidth}x${cropHeight}`)
