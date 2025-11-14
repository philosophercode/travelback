import express from 'express';
import path from 'path';
import { errorHandler } from './middleware/error-handler';
import tripsRoutes from './routes/trips.routes';
import { config } from './config';

const app = express();

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
if (config.storage.provider === 'local') {
  const uploadsPath = path.resolve(config.storage.uploadDir);
  app.use('/uploads', express.static(uploadsPath));
}

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/trips', tripsRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;

