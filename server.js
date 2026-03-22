const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const url    = require('url');

const PORT        = 3456;
const API_TARGET  = 'https://api6.axiom.trade/online-users-count';
const COOKIE_FILE = path.join(__dirname, '.axiom-cookie');

// ── helpers ──────────────────────────────────────────────────────────────────

function readCookie() {
  try { return fs.readFileSync(COOKIE_FILE, 'utf8').trim(); } catch { return ''; }
}

function saveCookie(val) {
  fs.writeFileSync(COOKIE_FILE, val.trim(), 'utf8');
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function proxyRequest(cookie, res) {
  const parsed = new URL(API_TARGET);
  const opts = {
    hostname: parsed.hostname,
    port: 443,
    path: parsed.pathname,
    method: 'GET',
    headers: {
      'Cookie':          cookie,
      'Origin':          'https://axiom.trade',
      'Referer':         'https://axiom.trade/',
      'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept':          'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  };

  const req = https.request(opts, apiRes => {
    let body = '';
    apiRes.on('data', chunk => body += chunk);
    apiRes.on('end', () => {
      res.writeHead(apiRes.statusCode, {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(body);
    });
  });

  req.on('error', err => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });

  req.end();
}

// ── server ────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const p = parsed.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  // ── GET /api/users — proxy to axiom ──────────────────────────────────
  if (p === '/api/users' && req.method === 'GET') {
    const cookie = readCookie();
    if (!cookie) {
      res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'no_cookie', message: 'No auth cookie saved. Use POST /api/cookie to set it.' }));
      return;
    }
    proxyRequest(cookie, res);
    return;
  }

  // ── POST /api/cookie — save cookie ───────────────────────────────────
  if (p === '/api/cookie' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { cookie } = JSON.parse(body);
        if (!cookie || typeof cookie !== 'string') throw new Error('invalid');
        saveCookie(cookie);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'bad request' }));
      }
    });
    return;
  }

  // ── GET /api/cookie-status ────────────────────────────────────────────
  if (p === '/api/cookie-status' && req.method === 'GET') {
    const cookie = readCookie();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ configured: !!cookie }));
    return;
  }

  // ── Static files ──────────────────────────────────────────────────────
  if (p === '/' || p === '/index.html') {
    serveFile(res, path.join(__dirname, 'index.html'), 'text/html'); return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('\n\x1b[36m  ╔══════════════════════════════════════╗');
  console.log('  ║   AXIOM USER CHART — LOCAL SERVER    ║');
  console.log('  ╚══════════════════════════════════════╝\x1b[0m');
  console.log(`\n  \x1b[32m→ Open:\x1b[0m http://localhost:${PORT}\n`);
});
