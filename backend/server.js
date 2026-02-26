require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');

const sessionRoutes = require('./src/routes/sessions');
const jobRoutes = require('./src/routes/jobs');
const creditRoutes = require('./src/routes/credits');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'reely-backend' });
});

app.use('/api/sessions', sessionRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/credits', creditRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err.message, err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Reely backend running on port ${PORT}`);
});
