const encoder = new TextEncoder();
const decoder = new TextDecoder();

function keyBytes(key: number): Uint8Array {
  const keyBuffer = new ArrayBuffer(4);
  new DataView(keyBuffer).setUint32(0, key);
  return new Uint8Array(keyBuffer);
}

export function encodeMessage(message: string, key: number): string {
  const msgBytes = encoder.encode(message);
  const bytesKey = keyBytes(key);
  const encrypted = msgBytes.map((byte, idx) => byte ^ bytesKey[idx % bytesKey.length]);
  return Array.from(encrypted)
    .map((val) => val.toString(16).padStart(2, '0'))
    .join('');
}

export function decodeMessage(cipherHex: string, key: number): string {
  if (!cipherHex) return '';
  const bytes = cipherHex.match(/.{1,2}/g)?.map((pair) => parseInt(pair, 16)) ?? [];
  const bytesKey = keyBytes(key);
  const decrypted = bytes.map((byte, idx) => byte ^ bytesKey[idx % bytesKey.length]);
  return decoder.decode(new Uint8Array(decrypted));
}
