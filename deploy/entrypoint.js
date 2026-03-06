#!/usr/bin/env node
// eede entrypoint proxy.
//
// Sits in front of code-server to handle:
//   ?code=<base64>       — create notebook from code
//   ?code=<b64>&lang=py  — specify language (default: js)
//
// All other requests proxy to code-server.

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '8080', 10);
const CS_PORT = PORT + 1;
const WORKSPACE = '/home/coder/workspace';

// Start code-server on CS_PORT.
const cs = spawn('code-server', [
  '--bind-addr', `0.0.0.0:${CS_PORT}`,
  '--auth', 'none',
  '--cert', 'false',
  '--disable-telemetry',
  WORKSPACE,
], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(CS_PORT) },
});

cs.on('error', (err) => {
  console.error('code-server failed:', err);
  process.exit(1);
});

// Wait for code-server to be ready.
function waitForCS(cb, retries) {
  retries = retries || 0;
  const req = http.get(
    `http://127.0.0.1:${CS_PORT}/healthz`,
    (res) => {
      if (res.statusCode === 200) return cb();
      if (retries < 60) {
        setTimeout(() => waitForCS(cb, retries + 1),
          1000);
      }
    }
  );
  req.on('error', () => {
    if (retries < 60) {
      setTimeout(() => waitForCS(cb, retries + 1),
        1000);
    }
  });
}

function createNotebook(code, lang) {
  const ts = Date.now();
  const filename = `geeni-${ts}.eede`;
  const filepath = path.join(WORKSPACE, filename);
  const notebook = {
    version: 1,
    cells: [{
      language: lang === 'python' ? 'python'
        : 'javascript',
      source: code,
      kind: 'code',
    }],
  };
  fs.writeFileSync(filepath,
    JSON.stringify(notebook, null, 2) + '\n');
  return filename;
}

function proxy(req, res) {
  const opts = {
    hostname: '127.0.0.1',
    port: CS_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };
  const preq = http.request(opts, (pres) => {
    res.writeHead(pres.statusCode, pres.headers);
    pres.pipe(res, { end: true });
  });
  preq.on('error', (err) => {
    res.writeHead(502);
    res.end('Bad Gateway');
  });
  req.pipe(preq, { end: true });
}

// Handle WebSocket upgrades via proxy.
function proxyUpgrade(req, socket, head) {
  const opts = {
    hostname: '127.0.0.1',
    port: CS_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };
  const preq = http.request(opts);
  preq.on('upgrade', (pres, psock, phead) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      Object.entries(pres.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n') +
      '\r\n\r\n'
    );
    if (phead.length) socket.write(phead);
    psock.pipe(socket);
    socket.pipe(psock);
  });
  preq.on('error', () => {
    socket.destroy();
  });
  preq.end();
}

waitForCS(() => {
  console.log('code-server ready, proxy listening on',
    PORT);

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url,
        `http://localhost:${PORT}`);
      const codeParam = url.searchParams.get('code');

      if (codeParam && req.method === 'GET') {
        // Decode base64 code, create notebook, redirect.
        const code = Buffer.from(codeParam, 'base64')
          .toString('utf-8');
        const lang = url.searchParams.get('lang')
          || 'javascript';
        const filename = createNotebook(code, lang);
        // Redirect to open the file in code-server.
        res.writeHead(302, {
          Location: `/?folder=/home/coder/workspace` +
            `&file=/home/coder/workspace/${filename}`,
        });
        res.end();
        return;
      }
    } catch (e) {
      // Fall through to proxy on parse errors.
    }

    proxy(req, res);
  });

  server.on('upgrade', proxyUpgrade);
  server.listen(PORT);
});
