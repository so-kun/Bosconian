// CRC-32 (IEEE 802.3, same polynomial/convention as zip and MAME rom CRCs).

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function crc32Hex(data: Uint8Array): string {
  return crc32(data).toString(16).padStart(8, "0");
}

export async function sha1Hex(data: Uint8Array): Promise<string> {
  // WebCrypto is available in browsers and Node >= 20.
  const buf = await crypto.subtle.digest("SHA-1", data as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
