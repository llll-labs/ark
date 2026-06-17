import { randomBytes } from 'node:crypto'

export function uuidv7() {
  const bytes = randomBytes(16)
  const timestamp = Date.now()

  bytes[0] = Math.floor(timestamp / 0x10000000000) & 0xFF
  bytes[1] = Math.floor(timestamp / 0x100000000) & 0xFF
  bytes[2] = Math.floor(timestamp / 0x1000000) & 0xFF
  bytes[3] = Math.floor(timestamp / 0x10000) & 0xFF
  bytes[4] = Math.floor(timestamp / 0x100) & 0xFF
  bytes[5] = timestamp & 0xFF
  bytes[6] = (bytes[6]! & 0x0F) | 0x70
  bytes[8] = (bytes[8]! & 0x3F) | 0x80

  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
