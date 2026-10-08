// Serve beneath a project prefix so every browser test also checks GitHub Pages paths.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.png': 'image/png' };
createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname === '/') { res.writeHead(302, { Location: '/Jweather/' }); res.end(); return; }
        if (!pathname.startsWith('/Jweather/')) { res.writeHead(404); res.end(); return; }
        const file = resolve(root, pathname.slice('/Jweather/'.length) || 'index.html');
        if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403); res.end(); return; }
        const content = await readFile(file);
        res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(content);
    } catch { res.writeHead(404); res.end('Not found'); }
}).listen(8080, '127.0.0.1', () => console.log('Jweather development server on port 8080 (project path /Jweather/).'));
