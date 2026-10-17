import crypto from 'node:crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';
import { updateStoreJson } from './jsonStore.js';

export function requestNetworkKey(req: Request) {
  // These headers are accepted only inside the provider which overwrites them.
  const platformIP = process.env.VERCEL === '1' || process.env.VERCEL === 'true'
    ? req.get('x-vercel-forwarded-for')
    : process.env.NETLIFY === 'true' ? req.get('x-nf-client-connection-ip') : '';
  const candidate = platformIP?.split(',')[0]?.trim();
  const ip = candidate && isIP(candidate) ? candidate : req.ip || req.socket?.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(`network:${ip}`).digest('hex');
}

export async function consumeRequestLimit(key: string, maximum: number, windowMs: number) {
  const window = Math.floor(Date.now() / windowMs);
  await updateStoreJson<{ window: number; count: number }>('astro-request-limits', key, '.data/request-limits', current => {
    const count = current?.window === window ? current.count : 0;
    if (count >= maximum) throw Object.assign(new Error('请求过于频繁，请稍后再试。'), { status: 429, code: 'RATE_LIMITED' });
    return { window, count: count + 1 };
  });
}
