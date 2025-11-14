import express from 'express';
import { errorHandler } from './middleware/error-handler';
import tripsRoutes from './routes/trips.routes';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/trips', tripsRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;

