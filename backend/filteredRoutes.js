const express = require('express');
const { Parser } = require('json2csv');
const ExcelJS   = require('exceljs');

const router = express.Router();
const filtered = [];  // In-memory store for filtered ports (replace with DB if needed)

function addIfFiltered(r) {
  if (['filtered', 'open|filtered'].includes(r.state)) {
    filtered.push({
      ip: r.ip,
      port: r.port,
      protocol: r.protocol,
      timeISO: new Date().toISOString()
    });
  }
}

module.exports.addIfFiltered = addIfFiltered;

/* ----- JSON list ----- */
router.get('/', (_req, res) => {
  res.json(filtered);
});

/* ----- CSV export ----- */
router.get('/export/csv', (_req, res) => {
  const csv = new Parser({
    fields: ['ip', 'port', 'protocol', 'timeISO']
  }).parse(filtered);
  res.header('Content-Type', 'text/csv');
  res.attachment('filtered-ports.csv');
  res.send(csv);
});

/* ----- Excel export ----- */
router.get('/export/xlsx', async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Filtered');
  ws.columns = [
    { header: 'IP',        key: 'ip',       width: 18 },
    { header: 'Port',      key: 'port',     width:  8 },
    { header: 'Protocol',  key: 'protocol', width: 10 },
    { header: 'Timestamp', key: 'timeISO',  width: 28 }
  ];
  ws.addRows(filtered);
  res.header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.attachment('filtered-ports.xlsx');
  await wb.xlsx.write(res);
  res.end();
});

module.exports.router = router;
