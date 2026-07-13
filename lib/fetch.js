'use strict';
const http = require('http');

const port = parseInt(process.argv[2], 10);
const path = process.argv[3] || '/api/console-errors';
const timeout = parseInt(process.argv[4], 10) || 1000;

const req = http.get({
  hostname: '127.0.0.1',
  port,
  path,
  timeout,
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => process.stdout.write(body));
});
req.on('error', () => process.exit(1));
req.on('timeout', () => { req.destroy(); process.exit(1); });
