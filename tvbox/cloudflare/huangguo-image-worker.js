const IMG_HOSTS = new Set(['pic.cuinhri.cn']);
const KEY_BYTES = new TextEncoder().encode('f5d965df75336270');
const IV_BYTES  = new TextEncoder().encode('97b60394abc2fbe1');

function detectMime(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'image/webp';
  if (bytes.length >= 6) {
    const sig = String.fromCharCode(...bytes.slice(0,6));
    if (sig === 'GIF87a' || sig === 'GIF89a') return 'image/gif';
  }
  return '';
}

function trimImage(bytes, mime) {
  if (mime === 'image/jpeg') {
    for (let i = bytes.length - 2; i >= 0; i--) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return bytes.slice(0, i + 2);
    }
  }
  if (mime === 'image/png') {
    const sig = [0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82];
    outer: for (let i = bytes.length - sig.length; i >= 0; i--) {
      for (let j = 0; j < sig.length; j++) if (bytes[i + j] !== sig[j]) continue outer;
      return bytes.slice(0, i + sig.length);
    }
  }
  return bytes;
}

async function decryptIfNeeded(buf) {
  const raw = new Uint8Array(buf);
  const rawMime = detectMime(raw);
  if (rawMime) return { bytes: raw, mime: rawMime };
  if (!raw.length || raw.length % 16 !== 0) return null;

  const key = await crypto.subtle.importKey('raw', KEY_BYTES, { name: 'AES-CBC' }, false, ['decrypt']);
  let plain;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: IV_BYTES }, key, raw));
  } catch (_) {
    return null;
  }
  const mime = detectMime(plain);
  if (!mime) return null;
  return { bytes: trimImage(plain, mime), mime };
}

function responseHeaders(mime) {
  return {
    'Content-Type': mime,
    'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff'
  };
}

export default {
  async fetch(request, env, ctx) {
    const reqUrl = new URL(request.url);
    if (reqUrl.pathname !== '/img') {
      return new Response('Huangguo image worker: use /img?url=<encoded image url>', { status: 200 });
    }

    const targetParam = reqUrl.searchParams.get('url');
    if (!targetParam) return new Response('Missing url', { status: 400 });

    let target;
    try { target = new URL(targetParam); }
    catch (_) { return new Response('Bad url', { status: 400 }); }

    if (target.protocol !== 'https:' || !IMG_HOSTS.has(target.hostname)) {
      return new Response('Host not allowed', { status: 403 });
    }

    const cacheKey = new Request(`${reqUrl.origin}/cache${target.pathname}`, { method: 'GET' });
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    let upstream;
    try {
      upstream = await fetch(target.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          'Referer': 'https://huangguoai.com/',
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
        },
        redirect: 'follow'
      });
    } catch (_) {
      return new Response('Upstream fetch failed', { status: 502 });
    }

    if (!upstream.ok) return new Response(`Upstream ${upstream.status}`, { status: upstream.status });

    const buf = await upstream.arrayBuffer();
    const result = await decryptIfNeeded(buf);
    if (!result) return new Response('Decrypt failed', { status: 502 });

    const resp = new Response(result.bytes, { status: 200, headers: responseHeaders(result.mime) });
    ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  }
};
