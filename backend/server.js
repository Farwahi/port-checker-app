/* ────────────────────────────────────────────────────────────
   Server: Express backend for port-checker
   Changes:
   • Added /ping route for quick connectivity tests
   • Wrapped API routes in try/catch + console logging
   • Added final error-handler middleware
   • Accepts PORT from env, falls back to 3000
   ──────────────────────────────────────────────────────────── */

const express   = require('express');
const net       = require('net');
const dgram     = require('dgram');
const dnsPacket = require('dns-packet');
const cors      = require('cors');
const path      = require('path');

const {
  router: filteredRoutes,
  addIfFiltered
} = require('./filteredRoutes');

const app = express();

// ─── Global middleware ──────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Serve frontend build (../frontend) ─────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

/* ───────────── helper: TCP probe ───────────── */
function checkTCPPort(ip, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let state = 'unknown';

    socket.setTimeout(timeout);

    socket.on('connect', () => { state = 'open';       socket.destroy(); });
    socket.on('timeout', () => { state = 'filtered';   socket.destroy(); });
    socket.on('error',  (err) => { state = err.code === 'ECONNREFUSED' ? 'closed' : 'filtered'; });
    socket.on('close', () => resolve({ ip, port, protocol: 'tcp', state }));

    socket.connect(port, ip);
  });
}

/* ───────────── helper: UDP probe ───────────── */
function checkUDPPort(ip, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    let state = 'open|filtered';

    // Craft a tiny packet suited to the destination port (DNS or SIP),
    // otherwise just send an empty datagram
    let message;
    if (port === 53) {             // DNS
      message = dnsPacket.encode({
        type: 'query',
        id:   Math.floor(Math.random() * 65535),
        flags: dnsPacket.RECURSION_DESIRED,
        questions: [{ type: 'A', name: 'google.com' }]
      });
    } else if (port === 5060) {    // SIP OPTIONS
      message = Buffer.from(
        `OPTIONS sip:${ip}:5060 SIP/2.0\r\n` +
        `Via: SIP/2.0/UDP 0.0.0.0;rport;branch=z9hG4bK-12345\r\n` +
        `Max-Forwards: 70\r\n` +
        `To:   <sip:${ip}:5060>\r\n` +
        `From: <sip:probe@localhost>;tag=123\r\n` +
        `Call-ID: 12345@localhost\r\n` +
        `CSeq: 1 OPTIONS\r\n` +
        `Content-Length: 0\r\n\r\n`
      );
    } else {
      message = Buffer.alloc(0);
    }

    socket.send(message, 0, message.length, port, ip, (err) => {
      if (err) state = err.code === 'ECONNREFUSED' ? 'closed' : err.code;
    });

    socket.on('message', () => { state = 'open'; });
    socket.on('error',   (err) => { state = err.code === 'ECONNREFUSED' ? 'closed' : err.code; });

    setTimeout(() => {
      socket.close();
      resolve({ ip, port, protocol: 'udp', state });
    }, timeout);
  });
}

/* ───────────── Quick connectivity probe ───────────── */
app.get('/ping', (_req, res) => {
  res.json({ message: 'pong', timeISO: new Date().toISOString() });
});

/* ───────────── API: single target ───────────── */
app.get('/check-port', async (req, res) => {
  try {
    const { ip, port, protocol = 'tcp' } = req.query;
    if (!ip || !port) {
      return res.status(400).json({ error: 'IP and port are required' });
    }

    const parsedPort = Number(port);
    const result = protocol === 'udp'
      ? await checkUDPPort(ip, parsedPort)
      : await checkTCPPort(ip, parsedPort);

    addIfFiltered(result);
    res.json(result);
  } catch (err) {
    console.error('Error in /check-port:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ───────────── API: batch targets ───────────── */
app.get('/check-port-batch', async (req, res) => {
  try {
    const ips      = req.query.ip    ? req.query.ip.split(',')    : [];
    const ports    = req.query.port  ? req.query.port.split(',')  : [];
    const protocol = req.query.protocol || 'tcp';

    if (ips.length === 0 || ports.length === 0) {
      return res.status(400).json({ error: 'IPs and ports are required' });
    }

    const scan  = protocol === 'udp' ? checkUDPPort : checkTCPPort;
    const tasks = [];

    for (const ip of ips.map(s => s.trim())) {
      for (const port of ports.map(s => Number(s.trim()))) {
        tasks.push(scan(ip, port));
      }
    }

    const results = await Promise.all(tasks);
    results.forEach(addIfFiltered);
    res.json(results);
  } catch (err) {
    console.error('Error in /check-port-batch:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ───────────── Store & export filtered ports ───────────── */
app.use('/filtered', filteredRoutes);

/* ───────────── SPA fallback ───────────── */
app.get('/', (_req, res) =>
  res.sendFile(path.join(__dirname, '../frontend/index.html'))
);

/* ───────────── Global error handler ───────────── */
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Unexpected server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Backend server running → http://localhost:${PORT}`)
);
