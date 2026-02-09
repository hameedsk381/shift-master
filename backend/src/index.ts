import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/bun';
import { connectToDatabase } from './utils/db';

// Routes
import auth from './routes/auth';
import users from './routes/users';
import teams from './routes/teams';
import shifts from './routes/shifts';
import timeoff from './routes/timeoff';
import notifications from './routes/notifications';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
    origin: process.env.CORS_ORIGIN || '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/', (c) => {
    return c.json({
        status: 'ok',
        name: 'ShiftMaster API',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (c) => {
    return c.json({ status: 'healthy' });
});

// Static file serving for production
if (process.env.NODE_ENV === 'production') {
    app.use('*', serveStatic({ root: './dist' }));
    app.use('*', serveStatic({ path: './dist/index.html' }));
}

// API Routes
app.route('/api/auth', auth);
app.route('/api/users', users);
app.route('/api/teams', teams);
app.route('/api/shifts', shifts);
app.route('/api/timeoff', timeoff);
app.route('/api/notifications', notifications);

// Dashboard stats endpoint
app.get('/api/dashboard/stats', async (c) => {
    try {
        const { getDb } = await import('./utils/db');
        const db = getDb();

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        const [
            totalUsers,
            totalTeams,
            shiftsThisWeek,
            todayShifts,
            pendingTimeOff,
        ] = await Promise.all([
            db.collection('users').countDocuments({ role: { $ne: 'Admin' } }),
            db.collection('teams').countDocuments(),
            db.collection('shifts').countDocuments({
                startTime: { $gte: weekStart.toISOString(), $lt: weekEnd.toISOString() }
            }),
            db.collection('shifts').countDocuments({
                startTime: { $gte: today.toISOString(), $lt: tomorrow.toISOString() }
            }),
            db.collection('timeoff_requests').countDocuments({ status: 'pending' }),
        ]);

        return c.json({
            totalEmployees: totalUsers,
            totalTeams,
            shiftsThisWeek,
            todayShifts,
            pendingTimeOffRequests: pendingTimeOff,
            coverageRate: 94, // Mock value
            hoursScheduled: shiftsThisWeek * 8,
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// Static file serving for frontend
app.get('*', async (c) => {
    const url = new URL(c.req.url);
    const path = url.pathname;
    
    // API routes go to 404
    if (path.startsWith('/api/')) {
        return c.json({ error: 'Not found' }, 404);
    }
    
    // Serve static files
    if (path === '/' || path === '/index.html') {
        return c.html(await Bun.file('./dist/index.html').text());
    }
    
    // Serve assets
    if (path.startsWith('/assets/')) {
        const file = Bun.file(`./dist${path}`);
        if (await file.exists()) {
            return new Response(file);
        }
    }
    
    // SPA fallback - serve index.html for all other routes
    return c.html(await Bun.file('./dist/index.html').text());
});

// 404 handler for API routes only
app.notFound((c) => {
    const url = new URL(c.req.url);
    if (url.pathname.startsWith('/api/')) {
        return c.json({ error: 'Not found' }, 404);
    }
    // For non-API routes, let the static handler above deal with it
    return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
    console.error('Server error:', err);
    return c.json({ error: 'Internal server error' }, 500);
});

// Start server
const PORT = parseInt(process.env.PORT || '3000');

async function start() {
    try {
        await connectToDatabase();
        console.log(`
    ╔══════════════════════════════════════════╗
    ║                                          ║
    ║   🚀 ShiftMaster API Server              ║
    ║                                          ║
    ║   Running on: http://localhost:${PORT}      ║
    ║   Environment: ${process.env.NODE_ENV || 'development'}             ║
    ║                                          ║
    ╚══════════════════════════════════════════╝
    `);
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

start();

export default {
    port: PORT,
    fetch: app.fetch,
};
