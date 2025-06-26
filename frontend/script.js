/* ──────────────────────────────────────────────────────────────
   Front-end helper & UI logic
   Changes in this version:
   • Adds colour coding for port states
       open           → green
       filtered       → orange
       open|filtered  → orange
       closed         → red
   • Keeps the improved error handling and console logging
   ────────────────────────────────────────────────────────────── */

// ─── Helper: single port probe (kept for future use) ───
async function checkPort(ip, port, protocol = 'tcp') {
  const url = `/check-port?ip=${encodeURIComponent(ip)}&port=${encodeURIComponent(port)}&protocol=${protocol}`;
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }
  return response.json();
}

// ─── Batch scan; called by “Scan” button ───
async function checkBatch() {
  const ipInput    = document.getElementById('ipInput').value.trim();
  const portInput  = document.getElementById('portInput').value.trim();
  const protocol   = document.getElementById('protocolInput').value;
  const resultsDiv = document.getElementById('result');

  if (!ipInput || !portInput) {
    resultsDiv.innerHTML = '<span style="color:red;">Please enter IPs and ports</span>';
    return;
  }

  const ips   = ipInput.split(',').map(s => s.trim()).filter(Boolean);
  const ports = portInput.split(',').map(s => s.trim()).filter(Boolean);

  resultsDiv.innerHTML = 'Scanning…';

  try {
    const url = `/check-port-batch?ip=${encodeURIComponent(ips.join(','))}&port=${encodeURIComponent(ports.join(','))}&protocol=${protocol}`;
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
    }
    const results = await response.json();
    displayResults(results);
  } catch (err) {
    resultsDiv.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
    console.error('Frontend error:', err);
  }
}

// ─── Render results with colours ───
function displayResults(results) {
  const resultsDiv = document.getElementById('result');
  if (!Array.isArray(results) || results.length === 0) {
    resultsDiv.innerHTML = 'No results';
    return;
  }

  const listItems = results.map(r => {
    // Decide colour based on state
    let color = 'black';
    if (r.state === 'open') color = 'green';
    else if (r.state === 'closed') color = 'red';
    else if (r.state === 'filtered' || r.state.includes('filtered')) color = 'orange';

    return `<li>${r.ip}:${r.port} (${r.protocol.toUpperCase()}) — ` +
           `<strong style="color:${color};">${r.state}</strong></li>`;
  }).join('');

  resultsDiv.innerHTML = `<ul>${listItems}</ul>`;
}
