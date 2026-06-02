import crypto from 'crypto';

export function getCacheKey(path: string, body: any): string {
  const sortedBody = JSON.stringify(body, Object.keys(body).sort());
  const combined = `${path}|${sortedBody}`;
  const hash = crypto.createHash('sha256').update(combined).digest('hex');
  return `dashen-profile:${hash}`;
}