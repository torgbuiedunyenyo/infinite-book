import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import pagesRouter from './routes/pages';
import { checkConnection } from './services/database';
import { serverLogger, createLogger } from './services/logger';

const log = serverLogger;

// Log startup banner
log.separator('THE INFINITE BOOK - SERVER STARTING');

log.info('Environment configuration', {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  logLevel: process.env.LOG_LEVEL || 'debug',
  databaseUrlSet: !!process.env.DATABASE_URL,
  anthropicKeySet: !!process.env.ANTHROPIC_API_KEY,
});

const app = express();
const PORT = process.env.PORT || 3000;

// Request ID middleware
let requestCounter = 0;
app.use((req: Request, res: Response, next: NextFunction) => {
  requestCounter++;
  (req as any).requestId = requestCounter;
  next();
});

// CORS configuration
log.info('Configuring CORS middleware');
app.use(cors());

// JSON body parser
log.info('Configuring JSON body parser');
app.use(express.json());

// Global request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req as any).requestId;
  const startTime = performance.now();
  
  // Log incoming request
  log.debug(`[REQ #${requestId}] ${req.method} ${req.url}`, {
    headers: {
      host: req.get('host'),
      contentType: req.get('content-type'),
      accept: req.get('accept')?.slice(0, 50),
    },
    ip: req.ip || req.socket.remoteAddress,
  });
  
  // Log response on finish
  res.on('finish', () => {
    const duration = performance.now() - startTime;
    const level = res.statusCode >= 400 ? 'warn' : 'debug';
    
    if (level === 'warn') {
      log.warn(`[REQ #${requestId}] ${req.method} ${req.url} -> ${res.statusCode}`, {
        duration: `${duration.toFixed(2)}ms`,
        contentLength: res.get('content-length'),
      });
    } else {
      log.debug(`[REQ #${requestId}] ${req.method} ${req.url} -> ${res.statusCode}`, {
        duration: `${duration.toFixed(2)}ms`,
        contentLength: res.get('content-length'),
      });
    }
  });
  
  next();
});

// Mount API routes
log.info('Mounting API routes at /api');
app.use('/api', pagesRouter);

// Production static file serving
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, 'frontend');
  log.info('Production mode: Serving static files', {
    frontendPath,
  });
  
  app.use(express.static(frontendPath));
  
  // Express 5 requires named parameter for wildcards
  app.get('/{*path}', (req, res) => {
    if (!req.path.startsWith('/api')) {
      log.debug('Serving index.html for SPA route', {
        path: req.path,
      });
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
} else {
  log.info('Development mode: Static files served by Vite dev server');
}

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  log.info('Health check requested');
  
  const startTime = performance.now();
  const dbConnected = await checkConnection();
  const checkDuration = performance.now() - startTime;
  
  const health = {
    status: dbConnected ? 'healthy' : 'unhealthy',
    database: dbConnected ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      database: {
        status: dbConnected ? 'pass' : 'fail',
        duration: `${checkDuration.toFixed(2)}ms`,
      },
    },
    memory: {
      heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
      rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
    },
  };
  
  if (dbConnected) {
    log.info('Health check passed', health);
  } else {
    log.error('Health check failed - database disconnected', health);
  }
  
  res.status(dbConnected ? 200 : 503).json(health);
});

// 404 handler
app.use((req: Request, res: Response) => {
  log.warn('404 Not Found', {
    method: req.method,
    url: req.url,
    path: req.path,
  });
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  log.error('Unhandled error in request', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
  });
  
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
log.info('Starting HTTP server', { port: PORT });

const server = app.listen(PORT, () => {
  log.separator('SERVER STARTED SUCCESSFULLY');
  log.info(`The Infinite Book is now running`, {
    port: PORT,
    nodeEnv: process.env.NODE_ENV || 'development',
    pid: process.pid,
    nodeVersion: process.version,
  });
  
  // Log initial database connection check
  checkConnection().then((connected) => {
    if (connected) {
      log.info('Initial database connection verified');
    } else {
      log.error('Initial database connection failed - check DATABASE_URL');
    }
  });
});

server.on('error', (err: Error) => {
  log.error('Server error', {
    error: err.message,
    stack: err.stack,
  });
});

server.on('close', () => {
  log.info('Server closed');
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  log.separator('SHUTDOWN INITIATED');
  log.info('SIGTERM received, starting graceful shutdown...');
  
  server.close(() => {
    log.info('HTTP server closed');
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    log.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  log.separator('SHUTDOWN INITIATED');
  log.info('SIGINT received, starting graceful shutdown...');
  
  server.close(() => {
    log.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (err: Error) => {
  log.error('Uncaught exception', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  log.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// Log process info
log.debug('Process information', {
  pid: process.pid,
  ppid: process.ppid,
  platform: process.platform,
  arch: process.arch,
  nodeVersion: process.version,
  cwd: process.cwd(),
});
