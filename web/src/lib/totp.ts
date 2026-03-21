/**
 * 与 PocketBase $security.hs256 对齐的 3 秒步进 HMAC。
 * 协议：counter = floor(unixSeconds/3)，msg = `${counter}|${eventId}`，MAC = HMAC-SHA256(secret, msg) 输出 hex 小写。
 */

function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function computeProof(
  eventId: string,
  secretKey: string,
  unixSeconds = Math.floor(Date.now() / 1000)
): Promise<{ v: number; e: string; c: number; m: string }> {
  const counter = Math.floor(unixSeconds / 3);
  const msg = `${counter}|${eventId}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(msg)
  );
  const m = bufferToHex(sig);
  return { v: 1, e: eventId, c: counter, m };
}

export function getNextTickMs(): number {
  const now = Date.now();
  const stepMs = 3000;
  return stepMs - (now % stepMs);
}
