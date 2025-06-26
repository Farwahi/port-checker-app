// probe5060.js
const net = require('net');
const dgram = require('dgram');

const targetIP = process.argv[2];
const port = 5060;
const TIMEOUT = 2500; // ms

if (!targetIP) {
  console.error('Usage: node probe5060.js <IP>');
  process.exit(1);
}

// TCP test
function tcpTest() {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let state = 'unknown';

    s.setTimeout(TIMEOUT);

    s.on('connect', () => {
      state = 'open';
      s.destroy();
    });

    s.on('timeout', () => {
      state = 'filtered';
      s.destroy();
    });

    s.on('error', (err) => {
      state = (err.code === 'ECONNREFUSED') ? 'closed' : err.code;
    });

    s.on('close', () => resolve({ proto: 'TCP', state }));
    s.connect(port, targetIP);
  });
}

// UDP test
function udpTest() {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    let state = 'open|filtered'; // assume open|filtered unless proven closed

    sock.send('', port, targetIP, (err) => {
      if (err) state = err.code;
    });

    sock.on('message', () => {
      state = 'open';
    });

    sock.on('error', (err) => {
      state = (err.code === 'ECONNREFUSED') ? 'closed' : err.code;
    });

    setTimeout(() => {
      sock.close();
      resolve({ proto: 'UDP', state });
    }, TIMEOUT);
  });
}

// Run both tests
(async () => {
  const results = await Promise.all([tcpTest(), udpTest()]);
  console.table(results);
  process.exit(0);
})();
