const express = require('express');
const path = require('path');
const { getSnapshot } = require('./src/data');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/snapshot', (_req, res) => {
  res.json(getSnapshot());
});

app.listen(PORT, () => {
  console.log(`Operations Center listening on :${PORT}`);
});
