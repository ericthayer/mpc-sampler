/**
 * Minimal single-file ZIP (stored, no compression). Used when a host only lets
 * the page save well-known file types: the WAV or .slab rides inside a .zip.
 */

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Wrap one file in a ZIP archive. */
export function zipStore(filename: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const name = new TextEncoder().encode(filename);
  const crc = crc32(data);
  const local = 30 + name.length;
  const central = 46 + name.length;
  const out = new Uint8Array(local + data.length + central + 22);
  const view = new DataView(out.buffer);

  // Local file header
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true); // version needed
  view.setUint16(6, 0x0800, true); // UTF-8 file name
  view.setUint16(8, 0, true); // stored
  view.setUint32(14, crc, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, name.length, true);
  out.set(name, 30);
  out.set(data, local);

  // Central directory
  const cd = local + data.length;
  view.setUint32(cd, 0x02014b50, true);
  view.setUint16(cd + 4, 20, true);
  view.setUint16(cd + 6, 20, true);
  view.setUint16(cd + 8, 0x0800, true);
  view.setUint32(cd + 16, crc, true);
  view.setUint32(cd + 20, data.length, true);
  view.setUint32(cd + 24, data.length, true);
  view.setUint16(cd + 28, name.length, true);
  out.set(name, cd + 46);

  // End of central directory
  const end = cd + central;
  view.setUint32(end, 0x06054b50, true);
  view.setUint16(end + 8, 1, true);
  view.setUint16(end + 10, 1, true);
  view.setUint32(end + 12, central, true);
  view.setUint32(end + 16, cd, true);
  return out;
}

/** Read the first entry of a stored ZIP. Returns null if it isn't one we can read. */
export function unzipFirst(buffer: ArrayBuffer): { name: string; data: ArrayBuffer } | null {
  if (buffer.byteLength < 30) return null;
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x04034b50 || view.getUint16(8, true) !== 0) return null;
  const size = view.getUint32(18, true);
  const nameLength = view.getUint16(26, true);
  const start = 30 + nameLength + view.getUint16(28, true);
  if (start + size > buffer.byteLength) return null;
  return {
    name: new TextDecoder().decode(new Uint8Array(buffer, 30, nameLength)),
    data: buffer.slice(start, start + size),
  };
}
