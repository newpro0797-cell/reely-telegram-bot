require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');

const telegramRoutes = require('./src/routes/telegram');
const adminRoutes = require('./src/routes/admin');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

// Save raw body for webhook verification
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'reely-backend' });
});

app.use('/api/telegram', telegramRoutes);
app.use('/api/admin', adminRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err.message, err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

const { startWorker } = require('./src/worker');

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Reely backend running on port ${PORT}`);
  startWorker();
});
