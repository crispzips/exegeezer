import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { SourceError, getUserAgent } from './http.js';

/**
 * A fetch for sites the user names (not a fixed list), so it only goes to public web servers:
 * https only, never an address on this machine or a private network, and every redirect is checked again.
 * (The address is checked just before the request is made; a site that changes its address in between could slip past.)
 */

/** @param {string} ip */
function isPrivateAddress(ip) {
	const v = ip.toLowerCase();
	if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
	if (isIP(v) === 4) {
		const [a, b] = v.split('.').map(Number);
		return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || a >= 224;
	}
	return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
}

/**
 * @param {URL} url
 * @throws {SourceError} when the address is not a public web page
 */
async function checkPublic(url) {
	if (url.protocol !== 'https:') throw new SourceError(400, 'Only https addresses can be used.');
	if (url.username || url.password) throw new SourceError(400, 'That address has a login in it.');
	if (url.port && url.port !== '443') throw new SourceError(400, 'Only the usual web port can be used.');
	const host = url.hostname.replace(/^\[|\]$/g, '');
	if (!host.includes('.') && !isIP(host)) throw new SourceError(400, 'That is not a public web address.');
	if (/(^|\.)(localhost|local|internal|lan|home|corp)$/i.test(host)) throw new SourceError(400, 'That is not a public web address.');
	let addresses;
	try {
		addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
	} catch {
		throw new SourceError(404, `${host} could not be found.`);
	}
	if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new SourceError(400, 'That is not a public web address.');
}

/**
 * @param {string} address
 * @param {{ method?: 'GET' | 'HEAD', maxBytes?: number, timeoutMs?: number }} [options]
 * @returns {Promise<{ status: number, url: string, type: string, length: number | null, text: string }>}
 *   `text` is empty for HEAD. Redirects are followed (up to four), each checked.
 */
export async function fetchPublic(address, { method = 'GET', maxBytes = 12_000_000, timeoutMs = 20000 } = {}) {
	let target;
	try {
		target = new URL(address);
	} catch {
		throw new SourceError(400, 'That is not a web address.');
	}
	const headers = { 'User-Agent': await getUserAgent(), Accept: 'text/markdown, text/plain;q=0.9, */*;q=0.1' };
	for (let hop = 0; hop < 5; hop++) {
		await checkPublic(target);
		let res;
		try {
			res = await fetch(target, { method, headers, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
		} catch {
			throw new SourceError(504, `${target.hostname} did not answer in time.`);
		}
		if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
			try {
				target = new URL(/** @type {string} */ (res.headers.get('location')), target);
			} catch {
				throw new SourceError(502, `${target.hostname} sent us somewhere that is not a web address.`);
			}
			await res.body?.cancel();
			continue;
		}
		const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
		const declared = Number(res.headers.get('content-length'));
		const length = Number.isFinite(declared) && declared > 0 ? declared : null;
		if (method === 'HEAD' || !res.ok) {
			await res.body?.cancel();
			return { status: res.status, url: target.href, type, length, text: '' };
		}
		if (length && length > maxBytes) {
			await res.body?.cancel();
			throw new SourceError(413, 'That text is too large to import.');
		}
		const reader = res.body?.getReader();
		if (!reader) return { status: res.status, url: target.href, type, length, text: await res.text() };
		/** @type {Uint8Array[]} */
		const chunks = [];
		let size = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > maxBytes) {
				await reader.cancel();
				throw new SourceError(413, 'That text is too large to import.');
			}
			chunks.push(value);
		}
		return { status: res.status, url: target.href, type, length: size, text: Buffer.concat(chunks).toString('utf8') };
	}
	throw new SourceError(502, `${target.hostname} sent us round in circles.`);
}
