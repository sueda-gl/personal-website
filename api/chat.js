const OpenAI = require('openai');
const { knowledge, generateSystemPrompt } = require('../data/knowledge.js');
const { 
    rateLimitMiddleware, 
    validateInput, 
    setCORSHeaders,
    getClientIP,
    isRedisConfigured,
} = require('./rateLimit.js');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// ============================================
// SESSION STORAGE
// For production at scale, use Redis for sessions too
// ============================================
const conversations = new Map();
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SESSIONS = 1000;

function cleanupSessions() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, data] of conversations.entries()) {
        if (now - data.lastAccess > SESSION_TIMEOUT_MS) {
            conversations.delete(key);
            cleaned++;
        }
    }
    
    // Emergency cleanup if too many sessions
    if (conversations.size > MAX_SESSIONS) {
        const entries = Array.from(conversations.entries())
            .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
        
        const toRemove = Math.floor(entries.length / 2);
        for (let i = 0; i < toRemove; i++) {
            conversations.delete(entries[i][0]);
        }
    }
}

// Cleanup every 5 minutes
setInterval(cleanupSessions, 5 * 60 * 1000);

// ============================================
// MAIN HANDLER
// ============================================
module.exports = async function handler(req, res) {
    // Set CORS headers
    setCORSHeaders(req, res);
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Method check
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Rate limiting check (async for Redis)
    const rateLimit = await rateLimitMiddleware(req, res);
    if (rateLimit.limited) {
        return res.status(rateLimit.status).json(rateLimit.body);
    }
    
    try {
        // Input validation
        const validation = validateInput(req.body);
        if (!validation.valid) {
            return res.status(400).json({ 
                error: validation.errors.join('. ') 
            });
        }
        
        const { message, sessionId } = validation.sanitized;
        
        // Get or create conversation history
        if (!conversations.has(sessionId)) {
            conversations.set(sessionId, {
                history: [],
                lastAccess: Date.now()
            });
        }
        
        const session = conversations.get(sessionId);
        session.lastAccess = Date.now();
        const history = session.history;
        
        // Build messages array
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
        
        // Update conversation history
        history.push({ role: 'user', content: message });
        history.push({ role: 'assistant', content: reply });
        
        // Parse for special commands
        let showProject = null;
        const projectMatch = reply.match(/\[SHOW_PROJECT:(\w+)\]/);
        if (projectMatch) {
            showProject = projectMatch[1];
        }
        
        // Clean reply
        const cleanReply = reply.replace(/\[SHOW_PROJECT:\w+\]/g, '').trim();
        
        return res.status(200).json({
            reply: cleanReply,
            showProject: showProject,
            projectData: showProject ? knowledge.projects[showProject] : null
        });
        
    } catch (error) {
        console.error('Chat API Error:', error);
        
        if (error.code === 'invalid_api_key') {
            return res.status(500).json({ 
                error: 'API configuration error. Please try again later.' 
            });
        }
        
        if (error.code === 'rate_limit_exceeded') {
            return res.status(429).json({
                error: 'AI service is busy. Please try again in a moment.'
            });
        }
        
        return res.status(500).json({ 
            error: 'Something went wrong. Try again.'
        });
    }
};
