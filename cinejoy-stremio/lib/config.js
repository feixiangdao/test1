function decodeConfig(token) {
  if (!token) return {};
  try {
    const json = Buffer.from(String(token), 'base64url').toString('utf8');
    const obj = JSON.parse(json);
    return {
      tmdbKey: String(obj.tmdbKey || '').trim(),
      subdlKey: String(obj.subdlKey || '').trim(),
      language: String(obj.language || 'zh-CN').trim() || 'zh-CN'
    };
  } catch (_) {
    return {};
  }
}

function validTmdbKey(v) {
  return /^[a-f0-9]{32}$/i.test(String(v || '').trim());
}

function encodeConfig(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

module.exports = { decodeConfig, encodeConfig, validTmdbKey };
