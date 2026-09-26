import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { createHmac } from 'node:crypto';

const denied = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) denied.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 96], ['::ffff:0:0', 96], ['64:ff9b::', 96],
  ['2002::', 16], ['2001::', 32], ['fc00::', 7],
  ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32],
] as const) denied.addSubnet(network, prefix, 'ipv6');

export function publicAddress(address: string): boolean {
  const family = isIP(address);
  return family !== 0 && !denied.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/** User webhook bots only: internal human turns use Redis, never an HTTP loopback. */
export async function callBotWebhook(target: string, input: unknown, timeoutMs: number, signal: AbortSignal, secret?: string): Promise<string> {
  const url = new URL(target);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Invalid webhook URL');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error('Webhook must resolve to a public address');
  const pinned = addresses[0];
  const body = JSON.stringify(input);
  if (Buffer.byteLength(body) > 1024 * 1024) throw new Error('Webhook input limit exceeded');
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Webhook cancelled'));
    let bytes = 0;
    const chunks: Buffer[] = [];
    const req = request(url, {
      method: 'POST', family: pinned.family,
      lookup: (_host, options, callback) => options.all ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family),
      headers: {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
        ...(secret ? { 'X-Leverage-Signature': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` } : {}),
      },
    }, res => {
      // Do not follow redirects: each additional destination needs a fresh admission.
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        res.resume(); finish(''); return;
      }
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 65536) { req.destroy(); finish(''); }
        else chunks.push(chunk);
      });
      res.on('end', () => finish(Buffer.concat(chunks).toString('utf8').trim()));
      res.on('error', () => finish(''));
    });
    let done = false;
    const finish = (value: string, error?: Error) => {
      if (done) return;
      done = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => { req.destroy(); finish('', new Error('Webhook cancelled')); };
    const timer = setTimeout(() => { req.destroy(); finish(''); }, Math.max(1, Math.min(timeoutMs, 30000)));
    signal.addEventListener('abort', abort, { once: true });
    req.on('error', () => finish(''));
    req.end(body);
  });
}
