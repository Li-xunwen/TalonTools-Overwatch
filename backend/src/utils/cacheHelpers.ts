import crypto from 'crypto';

export function getCacheKey(body: any): string {
  const sortedStr = JSON.stringify(body, Object.keys(body).sort());
  const hash = crypto.createHash('sha256').update(sortedStr).digest('hex');
  return `dashen-profile:${hash}`;
}