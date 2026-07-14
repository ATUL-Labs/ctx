'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const COMMON_PORTS = [3001, 4000, 5173, 5174, 8000, 8080, 8081, 8888, 4200, 4173, 9000, 4747];

function probePort(port) {
  return new Promise((resolve) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: '/',
      timeout: 800,
    }, (res) => {
      res.destroy();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function detectUrls(root) {
  const urls = new Set();

  // 1. Check .lex/server.json (lex serve)
  try {
    const info = JSON.parse(fs.readFileSync(path.join(root, '.lex', 'server.json'), 'utf8'));
    if (info.port) urls.add('http://127.0.0.1:' + info.port);
  } catch {}

  // 2. Check package.json for dev script port hints
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const scripts = Object.values(pkg.scripts || {});
    for (const s of scripts) {
      // Vite default
      if (s.includes('vite') && !s.includes('build')) {
        urls.add('http://127.0.0.1:5173');
      }
      // Next.js default
      if (s.includes('next') && !s.includes('build')) {
        urls.add('http://127.0.0.1:3000');
      }
      // Nuxt
      if (s.includes('nuxt') && !s.includes('build')) {
        urls.add('http://127.0.0.1:3000');
      }
      // Angular
      if (s.includes('ng serve')) {
        urls.add('http://127.0.0.1:4200');
      }
      // Create React App
      if (s.includes('react-scripts start')) {
        urls.add('http://127.0.0.1:3000');
      }
      // Vue CLI
      if (s.includes('vue-cli-service serve')) {
        urls.add('http://127.0.0.1:8080');
      }
      // SvelteKit
      if (s.includes('svelte-kit') || s.includes('vite dev')) {
        urls.add('http://127.0.0.1:5173');
      }
      // Django
      if (s.includes('runserver') || s.includes('manage.py')) {
        urls.add('http://127.0.0.1:8000');
      }
      // Flask
      if (s.includes('flask')) {
        urls.add('http://127.0.0.1:5000');
      }
      // Express generic
      if (s.includes('nodemon') || s.includes('ts-node') || s.includes('tsx')) {
        urls.add('http://127.0.0.1:3000');
        urls.add('http://127.0.0.1:8080');
      }
    }
  } catch {}

  // 3. Probe common ports
  const candidates = [...urls].map(u => {
    const m = u.match(/:(\d+)$/);
    return m ? parseInt(m[1]) : null;
  }).filter(Boolean);

  // Also probe ports not yet in our set
  const allPorts = [...new Set([...candidates, ...COMMON_PORTS])];

  const live = await Promise.all(allPorts.map(async (port) => {
    const alive = await probePort(port);
    return alive ? port : null;
  }));

  for (const port of live.filter(Boolean)) {
    urls.add('http://127.0.0.1:' + port);
  }

  // Remove ports that aren't actually live
  const liveSet = new Set(live.filter(Boolean));
  const finalUrls = [...urls].filter(u => {
    const m = u.match(/:(\d+)$/);
    const port = m ? parseInt(m[1]) : null;
    return port && liveSet.has(port);
  });

  return finalUrls;
}

module.exports = { detectUrls, probePort };
