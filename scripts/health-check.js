#!/usr/bin/env node

const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/system/health',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  if (res.statusCode >= 200 && res.statusCode < 300) {
    console.log(`Health check passed: ${res.statusCode}`);
    process.exit(0);
  } else {
    console.error(`Health check failed with status: ${res.statusCode}`);
    process.exit(1);
  }
});

req.on('error', (error) => {
  console.error(`Health check error: ${error.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('Health check timeout');
  req.destroy();
  process.exit(1);
});

req.setTimeout(5000);
req.end();