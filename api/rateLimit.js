/**
 * Production-Ready Rate Limiting for Vercel Serverless
 * 
 * Uses Upstash Redis for persistent rate limiting across serverless instances.
 * Falls back to in-memory for local development if Redis is not configured.
 * 
 * Setup:
 * 1. Create free account at https://upstash.com
 * 2. Create a Redis database
 * 3. Add to .env:
 *    UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
 *    UPSTASH_REDIS_REST_TOKEN=xxx
 */

const { Ratelimit } = require('@upstash/ratelimit');
const { Redis } = require('@upstash/redis');

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    // Rate limit settings
    REQUESTS_PER_WINDOW: 10,     // Max requests per window
    WINDOW_SIZE: '60 s',          // Window size (e.g., '10 s', '1 m', '1 h')
    
    // Input validation
    MAX_MESSAGE_LENGTH: 500,
    MAX_SESSION_ID_LENGTH: 50,
    
    // Prefix for Redis keys (helps identify/manage keys)
    REDIS_PREFIX: 'sueda_ai',
};

// ============================================
// REDIS CLIENT & RATE LIMITER
// ============================================
let redis = null;
let ratelimit = null;
let isRedisConfigured = false;

// Initialize Redis if credentials are available
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
        redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
        
        // Sliding window rate limiter - most accurate for API protection
        ratelimit = new Ratelimit({
            redis: redis,
            limiter: Ratelimit.slidingWindow(CONFIG.REQUESTS_PER_WINDOW, CONFIG.WINDOW_SIZE),
            prefix: CONFIG.REDIS_PREFIX,
            analytics: true, // Enable analytics in Upstash dashboard
        });
        
        isRedisConfigured = true;
        console.log('✓ Upstash Redis rate limiter configured');
    } catch (error) {
        console.error('Failed to initialize Upstash Redis:', error.message);
    }
}

if (!isRedisConfigured) {
    console.log('⚠ Upstash Redis not configured. Using in-memory rate limiting (NOT for production).');
    console.log('  Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to .env');
}

// ============================================
// IN-MEMORY FALLBACK (for local dev only)
// ============================================
const memoryStore = new Map();

function memoryRateLimit(identifier) {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    
    let entry = memoryStore.get(identifier);
    
    if (!entry || now - entry.windowStart > windowMs) {
        entry = { windowStart: now, count: 0 };
    }
    
    entry.count++;
    memoryStore.set(identifier, entry);
    
    const remaining = Math.max(0, CONFIG.REQUESTS_PER_WINDOW - entry.count);
    const resetMs = windowMs - (now - entry.windowStart);
    
    return {
        success: entry.count <= CONFIG.REQUESTS_PER_WINDOW,
        remaining,
        reset: Math.ceil(resetMs / 1000),
        limit: CONFIG.REQUESTS_PER_WINDOW,
    };
}

// Cleanup memory store periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore.entries()) {
        if (now - entry.windowStart > 120000) { // 2 minutes
            memoryStore.delete(key);
        }
    }
}, 60000);

// ============================================
// IP EXTRACTION
// ============================================
function getClientIP(req) {
    // Vercel
    if (req.headers['x-forwarded-for']) {
        return req.headers['x-forwarded-for'].split(',')[0].trim();
    }
    
    // Vercel (alternate)
    if (req.headers['x-real-ip']) {
        return req.headers['x-real-ip'];
    }
    
    // Cloudflare
    if (req.headers['cf-connecting-ip']) {
        return req.headers['cf-connecting-ip'];
    }
    
    // Direct connection
    return req.connection?.remoteAddress || 
           req.socket?.remoteAddress || 
           'unknown';
}

// ============================================
// MAIN RATE LIMIT CHECK
// ============================================
async function checkRateLimit(req) {
    const ip = getClientIP(req);
    const identifier = `ip:${ip}`;
    
    try {
        if (isRedisConfigured && ratelimit) {
            // Production: Use Upstash Redis
            const result = await ratelimit.limit(identifier);
            
            return {
                success: result.success,
                remaining: result.remaining,
                reset: Math.ceil((result.reset - Date.now()) / 1000),
                limit: result.limit,
                ip: ip,
                source: 'redis',
            };
        } else {
            // Development fallback: In-memory
            const result = memoryRateLimit(identifier);
            return {
                ...result,
                ip: ip,
                source: 'memory',
            };
        }
    } catch (error) {
        console.error('Rate limit check failed:', error.message);
        // On error, allow request but log it
        return {
            success: true,
            remaining: CONFIG.REQUESTS_PER_WINDOW,
            reset: 60,
            limit: CONFIG.REQUESTS_PER_WINDOW,
            ip: ip,
            source: 'error-fallback',
            error: error.message,
        };
    }
}

// ============================================
// MIDDLEWARE
// ============================================
async function rateLimitMiddleware(req, res) {
    const result = await checkRateLimit(req);
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.reset);
    
    if (!result.success) {
        res.setHeader('Retry-After', result.reset);
        console.log(`[RATE_LIMIT] IP: ${result.ip} blocked (${result.source})`);
        
        return {
            limited: true,
            status: 429,
            body: {
                error: `Rate limit exceeded. Try again in ${result.reset} seconds.`,
                retryAfter: result.reset,
            },
        };
    }
    
    return { limited: false, result };
}

// ============================================
// INPUT VALIDATION
// ============================================
function validateInput(body) {
    const errors = [];
    
    // Check message
    if (!body.message) {
        errors.push('Message is required');
    } else if (typeof body.message !== 'string') {
        errors.push('Message must be a string');
    } else if (body.message.length > CONFIG.MAX_MESSAGE_LENGTH) {
        errors.push(`Message too long. Maximum ${CONFIG.MAX_MESSAGE_LENGTH} characters.`);
    } else if (body.message.trim().length === 0) {
        errors.push('Message cannot be empty');
    }
    
    // Sanitize session ID
    let sessionId = 'default';
    if (body.sessionId) {
        if (typeof body.sessionId !== 'string') {
            errors.push('Session ID must be a string');
        } else {
            sessionId = body.sessionId
                .replace(/[^a-zA-Z0-9_-]/g, '')
                .slice(0, CONFIG.MAX_SESSION_ID_LENGTH);
            
            if (sessionId.length === 0) {
                sessionId = 'default';
            }
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        sanitized: {
            message: body.message?.trim().slice(0, CONFIG.MAX_MESSAGE_LENGTH),
            sessionId,
        },
    };
}

// ============================================
// CORS CONFIGURATION
// ============================================
const ALLOWED_ORIGINS = [
    // Production - UPDATE THESE WITH YOUR DOMAINS
    'https://suedagul.com',
    'https://www.suedagul.com',
    'https://whyme.live',
    'https://www.whyme.live',
    
    // Vercel preview deployments
    /\.vercel\.app$/,
    
    // Local development
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
];

function isOriginAllowed(origin) {
    if (!origin) return false;
    
    for (const allowed of ALLOWED_ORIGINS) {
        if (allowed instanceof RegExp) {
            if (allowed.test(origin)) return true;
        } else if (allowed === origin) {
            return true;
        }
    }
    return false;
}

function setCORSHeaders(req, res) {
    const origin = req.headers.origin;
    
    if (origin && isOriginAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
    checkRateLimit,
    rateLimitMiddleware,
    validateInput,
    setCORSHeaders,
    isOriginAllowed,
    getClientIP,
    CONFIG,
    isRedisConfigured,
};
