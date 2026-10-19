import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT || 3000);
const publicFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
};

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;

  if (request.method !== 'GET') {
    response.writeHead(405, { Allow: 'GET' });
    response.end('Method not allowed');
    return;
  }

  if (pathname === '/api/hello') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ message: 'Hello World' }));
    return;
  }

  const file = publicFiles[pathname];
  if (!file) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  try {
    const content = await readFile(new URL(`./public/${file[0]}`, import.meta.url));
    response.writeHead(200, { 'Content-Type': file[1] });
    response.end(content);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Internal server error');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`App running at http://127.0.0.1:${port}`);
});
