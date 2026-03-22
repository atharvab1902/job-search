import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jobsRouter from './routes/jobs';
import companiesRouter from './routes/companies';
import remindersRouter from './routes/reminders';
import h1bRouter from './routes/h1b';
import statsRouter from './routes/stats';
import syncRouter from './routes/sync';
import documentsRouter from './routes/documents';
import settingsRouter from './routes/settings';
import authRouter from './routes/auth';
import profileRouter from './routes/profile';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/h1b', h1bRouter);
app.use('/api/stats', statsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/profile', profileRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
async function start() {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
  });
}

start().catch(console.error);
