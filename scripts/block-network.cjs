#!/usr/bin/env node
'use strict';
// Node preload script: intercept all network primitives and throw [PRTY-07] error.
// Usage: NODE_OPTIONS=--require=./scripts/block-network.cjs <your-command>
//   or:  node --require ./scripts/block-network.cjs <your-script>
// Blocks: net.connect, net.createConnection, http.request, http.get,
//         https.request, https.get, tls.connect, global fetch.
// Loopback (127.0.0.1/::1) is also blocked by default; set
// PARITY_ALLOW_LOOPBACK=1 to permit host-level loopback only.

const net = require('net');
const http = require('http');
const https = require('https');
const tls = require('tls');

const BLOCKED_MSG = '[PRTY-07] Network access is blocked during Phase 4 parity commands. ' +
  'All parity tests must be hermetic and offline.';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function isLoopback(host) {
  return LOOPBACK_HOSTS.has(host);
}

function blockOrAllow(host, ...rest) {
  if (process.env.PARITY_ALLOW_LOOPBACK === '1' && isLoopback(host)) {
    return; // host-level loopback allowed only
  }
  throw new Error(BLOCKED_MSG + (host ? ` (attempted host: ${host})` : ''));
}

// Extract host from various call signatures (host, {host}, options object)
function extractHost(args) {
  const first = args[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object' && first.host) return first.host;
  if (first && typeof first === 'object' && first.hostname) return first.hostname;
  return '';
}

const _netConnect = net.connect.bind(net);
net.connect = function (...args) { blockOrAllow(extractHost(args)); return _netConnect(...args); };
net.createConnection = net.connect;

const _httpRequest = http.request.bind(http);
http.request = function (...args) { blockOrAllow(extractHost(args)); return _httpRequest(...args); };
const _httpGet = http.get.bind(http);
http.get = function (...args) { blockOrAllow(extractHost(args)); return _httpGet(...args); };

const _httpsRequest = https.request.bind(https);
https.request = function (...args) { blockOrAllow(extractHost(args)); return _httpsRequest(...args); };
const _httpsGet = https.get.bind(https);
https.get = function (...args) { blockOrAllow(extractHost(args)); return _httpsGet(...args); };

const _tlsConnect = tls.connect.bind(tls);
tls.connect = function (...args) { blockOrAllow(extractHost(args)); return _tlsConnect(...args); };

// Block global fetch (Node 18+)
if (typeof globalThis.fetch === 'function') {
  const _originalFetch = globalThis.fetch;
  globalThis.fetch = function (input, ...rest) {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : String(input));
    let host = '';
    try { host = new URL(url).hostname; } catch (_) { host = url; }
    blockOrAllow(host);
    return _originalFetch(input, ...rest);
  };
}

if (process.env.PARITY_ALLOW_LOOPBACK === '1') {
  process.stderr.write('[PRTY-07] WARNING: host-level loopback (127.0.0.1/::1) is permitted via PARITY_ALLOW_LOOPBACK=1\n');
}

// Coverage note: this blocker intercepts Node core network primitives:
// net.connect, net.createConnection, http.request, http.get,
// https.request, https.get, tls.connect, and global fetch (Node 18+).
// It does NOT claim to block raw node:dns or undici unless those packages
// are confirmed as repo dependencies. Callers must not overstate coverage.
// If a parity test requires undici or dns blocking, add explicit overrides here
// and document the justification with a PARITY_ALLOW_LOOPBACK reference.
