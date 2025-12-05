const http = require('http');
const fs = require('fs');
const path = require('path');
const { knowledge, generateSystemPrompt } = require('./data/knowledge.js');

// Try to load OpenAI - it's optional
let OpenAI;
try {
    OpenAI = require('openai');
} catch (e) {
    console.log('OpenAI package not found. AI chat will be disabled.');
}

// Load .env file manually (no dotenv dependency needed)
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length) {
                process.env[key.trim()] = valueParts.join('=').trim();
            }
        });
        console.log('✓ Loaded .env file');
    }
} catch (e) {
    console.log('No .env file found');
}

const PORT = process.env.PORT || 3000;

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ico': 'image/x-icon'
};

// OpenAI client (if available)
let openai = null;
if (OpenAI && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('✓ OpenAI configured');
} else {
    console.log('⚠ OpenAI not configured. AI chat disabled.');
    console.log('  Add OPENAI_API_KEY to .env file to enable.');
}

// ============================================
// RATE LIMITING (In-Memory for Local Dev)
// ============================================
const RATE_LIMIT = {
    WINDOW_MS: 60 * 1000,       // 1 minute
    MAX_REQUESTS: 15,            // More lenient for local dev
    BLOCK_DURATION_MS: 2 * 60 * 1000, // 2 min block
};

const rateLimitStore = new Map();

function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(req) {
    const ip = getClientIP(req);
    const now = Date.now();
    
    let entry = rateLimitStore.get(ip);
    
    if (!entry || now - entry.windowStart > RATE_LIMIT.WINDOW_MS) {
        entry = { windowStart: now, count: 0, blocked: false, blockUntil: 0 };
    }
    
    // Check if blocked
    if (entry.blocked && now < entry.blockUntil) {
        const retryIn = Math.ceil((entry.blockUntil - now) / 1000);
        return { allowed: false, retryIn, remaining: 0 };
    }
    
    entry.count++;
    entry.blocked = false;
    rateLimitStore.set(ip, entry);
    
    if (entry.count > RATE_LIMIT.MAX_REQUESTS) {
        entry.blocked = true;
        entry.blockUntil = now + RATE_LIMIT.BLOCK_DURATION_MS;
        rateLimitStore.set(ip, entry);
        
        const retryIn = Math.ceil(RATE_LIMIT.BLOCK_DURATION_MS / 1000);
        return { allowed: false, retryIn, remaining: 0 };
    }
    
    return { 
        allowed: true, 
        remaining: RATE_LIMIT.MAX_REQUESTS - entry.count,
        retryIn: Math.ceil((RATE_LIMIT.WINDOW_MS - (now - entry.windowStart)) / 1000)
    };
}

// Cleanup old entries every 5 min
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (now - entry.windowStart > RATE_LIMIT.WINDOW_MS * 2) {
            rateLimitStore.delete(key);
        }
    }
}, 5 * 60 * 1000);

// ============================================
// INPUT VALIDATION
// ============================================
const MAX_MESSAGE_LENGTH = 500;
const MAX_SESSION_ID_LENGTH = 50;
const MAX_REQUEST_BODY_SIZE = 2048; // 2KB max request body

function validateInput(body) {
    if (!body.message || typeof body.message !== 'string') {
        return { valid: false, error: 'Message is required' };
    }
    
    const message = body.message.trim();
    
    if (message.length === 0) {
        return { valid: false, error: 'Message cannot be empty' };
    }
    
    if (message.length > MAX_MESSAGE_LENGTH) {
        return { valid: false, error: `Message too long. Max ${MAX_MESSAGE_LENGTH} chars.` };
    }
    
    // Sanitize session ID
    let sessionId = 'default';
    if (body.sessionId && typeof body.sessionId === 'string') {
        sessionId = body.sessionId
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .slice(0, MAX_SESSION_ID_LENGTH) || 'default';
    }
    
    return { 
        valid: true, 
        sanitized: { message, sessionId } 
    };
}

// ============================================
// SESSION MANAGEMENT
// ============================================
const conversations = new Map();
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min
const MAX_SESSIONS = 100; // Lower for local dev

function cleanupSessions() {
    const now = Date.now();
    for (const [key, data] of conversations.entries()) {
        if (now - data.lastAccess > SESSION_TIMEOUT_MS) {
            conversations.delete(key);
        }
    }
    
    // Emergency cleanup
    if (conversations.size > MAX_SESSIONS) {
        const entries = Array.from(conversations.entries())
            .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
        const toRemove = Math.floor(entries.length / 2);
        for (let i = 0; i < toRemove; i++) {
            conversations.delete(entries[i][0]);
        }
    }
}

setInterval(cleanupSessions, 5 * 60 * 1000);

// ============================================
// CORS CONFIGURATION
// ============================================
const ALLOWED_ORIGINS = [
    // Production
    'https://suedagul.com',
    'https://www.suedagul.com',
    // Local development
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    null, // Same-origin requests have null origin
];

function isOriginAllowed(origin) {
    if (!origin) return true; // Same-origin requests
    return ALLOWED_ORIGINS.includes(origin);
}

function setCORSHeaders(req, res) {
    const origin = req.headers.origin;
    
    if (isOriginAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ============================================
// SECURITY HEADERS
// ============================================
function setSecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // SECURITY: Add CSP header for local development too
    res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data: blob:; " +
        "media-src 'self' blob:; " +
        "connect-src 'self' https://api.openai.com; " +
        "frame-ancestors 'none'"
    );
}

// ============================================
// CHAT API HANDLER
// ============================================
async function handleChat(req, res) {
    // Rate limit check
    const rateCheck = checkRateLimit(req);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', rateCheck.retryIn);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            error: `Too many requests. Try again in ${rateCheck.retryIn} seconds.`,
            retryAfter: rateCheck.retryIn
        }));
        console.log(`[RATE_LIMIT] IP: ${getClientIP(req)} blocked for ${rateCheck.retryIn}s`);
        return;
    }
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT.MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
    
    let body = '';
    let bodySize = 0;
    req.on('data', chunk => {
        bodySize += chunk.length;
        // SECURITY: Prevent large request body DoS attacks
        if (bodySize > MAX_REQUEST_BODY_SIZE) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Request body too large' }));
            req.destroy();
            return;
        }
        body += chunk;
    });
    req.on('end', async () => {
        try {
            const parsed = JSON.parse(body);
            
            // SECURITY: Reject prototype pollution attempts
            // Check if these keys exist as OWN properties (not inherited)
            if (Object.prototype.hasOwnProperty.call(parsed, '__proto__') ||
                Object.prototype.hasOwnProperty.call(parsed, 'constructor') ||
                Object.prototype.hasOwnProperty.call(parsed, 'prototype')) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request payload' }));
                return;
            }
            
            // Input validation
            const validation = validateInput(parsed);
            if (!validation.valid) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: validation.error }));
                return;
            }
            
            const { message, sessionId } = validation.sanitized;
            
            if (!openai) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    error: 'AI not configured. Use direct commands: help, projects, show [name]' 
                }));
                return;
            }
            
            // Get or create conversation
            if (!conversations.has(sessionId)) {
                conversations.set(sessionId, { history: [], lastAccess: Date.now() });
            }
            const session = conversations.get(sessionId);
            session.lastAccess = Date.now();
            const history = session.history;
            
            // Build messages
            const messages = [
                { role: 'system', content: generateSystemPrompt() },
                ...history.slice(-10),
                { role: 'user', content: message }
            ];
            
            // Call OpenAI
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: messages,
                max_tokens: 500,
                temperature: 0.7,
            });
            
            const reply = completion.choices[0].message.content;
            
            // Update history
            history.push({ role: 'user', content: message });
            history.push({ role: 'assistant', content: reply });
            
            // Parse for project commands
            let showProject = null;
            const projectMatch = reply.match(/\[SHOW_PROJECT:(\w+)\]/);
            if (projectMatch) {
                showProject = projectMatch[1];
            }
            
            const cleanReply = reply.replace(/\[SHOW_PROJECT:\w+\]/g, '').trim();
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                reply: cleanReply,
                showProject: showProject,
                projectData: showProject ? knowledge.projects[showProject] : null
            }));
            
        } catch (error) {
            console.error('Chat error:', error.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Something went wrong. Try again.' }));
        }
    });
}

// ============================================
// STATIC FILE SERVER
// ============================================
function serveStatic(req, res) {
    let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    filePath = path.join(__dirname, filePath);
    
    // Security: prevent directory traversal
    const realPath = path.resolve(filePath);
    if (!realPath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Not found');
            } else {
                res.writeHead(500);
                res.end('Server error');
            }
        } else {
            // Handle video streaming for large files
            if (ext === '.mp4' || ext === '.webm') {
                const stat = fs.statSync(filePath);
                const range = req.headers.range;
                
                if (range) {
                    const parts = range.replace(/bytes=/, '').split('-');
                    let start = parseInt(parts[0], 10);
                    let end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
                    
                    // SECURITY: Validate range values to prevent DoS
                    if (isNaN(start) || start < 0) start = 0;
                    if (isNaN(end) || end >= stat.size) end = stat.size - 1;
                    if (start > end) {
                        res.writeHead(416, { 'Content-Type': 'text/plain' });
                        res.end('Range Not Satisfiable');
                        return;
                    }
                    
                    const chunkSize = end - start + 1;
                    
                    res.writeHead(206, {
                        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': chunkSize,
                        'Content-Type': contentType
                    });
                    
                    fs.createReadStream(filePath, { start, end }).pipe(res);
                    return;
                }
            }
            
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
}

// ============================================
// HTTP SERVER
// ============================================
const server = http.createServer((req, res) => {
    // Security headers
    setSecurityHeaders(res);
    
    // CORS headers
    setCORSHeaders(req, res);
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Route: API
    if (req.url === '/api/chat' && req.method === 'POST') {
        handleChat(req, res);
        return;
    }
    
    // Route: Static files
    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════╗');
    console.log('║     SUEDA AI PORTFOLIO SERVER              ║');
    console.log('╠════════════════════════════════════════════╣');
    console.log(`║  → http://localhost:${PORT}                   ║`);
    console.log('║                                            ║');
    console.log('║  Security Features:                        ║');
    console.log('║  ✓ Rate limiting (15 req/min)              ║');
    console.log('║  ✓ Input validation (500 char max)         ║');
    console.log('║  ✓ Session cleanup (30 min timeout)        ║');
    console.log('║  ✓ CORS restricted                         ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('');
});
