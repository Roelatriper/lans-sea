import { lookupResponse } from '../src/dictionary.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/v1/lookup') return env.ASSETS.fetch(request);
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return Response.json({ error: { code: 'method_not_allowed' } }, { status: 405, headers: { ...headers, Allow: 'GET, OPTIONS' } });
    try {
      const response = await env.ASSETS.fetch(new Request(new URL('/api/v1/all.json', url)));
      if (!response.ok) throw new Error('词库不可用');
      const dataset = await response.json();
      return lookupResponse(dataset, url.searchParams.get('term'), env.SUGGESTION_URL || 'https://github.com/Roelatriper/lans-sea/issues/new?template=meme.yml');
    } catch {
      return Response.json({ error: { code: 'dataset_unavailable', message: '词库暂时不可用' } }, { status: 503, headers });
    }
  },
};
