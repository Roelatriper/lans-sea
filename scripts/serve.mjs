import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build, output } from './build.mjs';
import { lookupResponse } from '../src/dictionary.mjs';

const dataset = await build();
const port = Number(process.env.PORT || 8000);
const suggestionUrl = 'https://github.com/Roelatriper/china-meme-dictionary/issues/new?template=meme.yml';
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD, OPTIONS' }); response.end(); return; }
    if (url.pathname === '/api/v1/lookup') {
      const result = lookupResponse(dataset, url.searchParams.get('term'), suggestionUrl);
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(request.method === 'HEAD' ? undefined : await result.text());
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const file = path.resolve(output, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    const relative = path.relative(output, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) { response.writeHead(403); response.end(); return; }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : error instanceof URIError ? 400 : 500, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: { code: error.code === 'ENOENT' ? 'not_found' : 'request_failed' } }));
  }
});
server.listen(port, '127.0.0.1', () => console.log(`梗辞典：http://127.0.0.1:${port}`));
