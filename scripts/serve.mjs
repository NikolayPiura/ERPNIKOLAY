import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const port = Number(process.env.PIURA_PORT || 4184);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  let path = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
  if (!path.startsWith(root) || !existsSync(path) || statSync(path).isDirectory()) path = join(root, 'index.html');
  response.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(path).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`PIURA ERP: http://127.0.0.1:${port}`));
