export const endpoints = Object.freeze({
  finance: 'https://script.google.com/macros/s/AKfycbxjg9I0W6r8slpuex8yvQIqO3BR9k9NS6h5grvqLVMN0Wjn7iT_1drEOXT2Sn93Y_x_/exec',
  time: 'https://script.google.com/macros/s/AKfycbxnd2ZyN7B6YzVvIH6wp8Uer5tNqG7OFV20Av7xmCqUrEHH3rREj6AfjDwRBsW_hahAPg/exec',
  pff: 'https://script.google.com/macros/s/AKfycbwn_984PnYQ2zSMAPlgVPT1xrXw4vXe91H0-_jgU7_9pLdNAwNjs78FMjPNAQeew1Zc/exec',
  moscow: 'https://script.google.com/macros/s/AKfycbzj1IX4yWqV8LNMCVhfmJ5SVgGBzCyDemYoLDUpwJqNq3Ezkeu17NeGe-dPCuU0u0_b/exec',
  safe: 'https://script.google.com/macros/s/AKfycbx_n76kW9xt7MX7q48_AL3uzH1UaSwfbJqwebZaiGhyDFdLo3Ozj0zRdirgN6ifl3qj/exec'
});

export async function getJson(url, timeout = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const separator = url.includes('?') ? '&' : '?';
    const response = await fetch(`${url}${separator}t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshCached(endpoint, cacheKey) {
  const data = await getJson(endpoint);
  localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data }));
  return data;
}
