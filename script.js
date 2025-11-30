// ========== PROJECT DATA (for cinema mode) ==========
const projects = {
    whyme: {
        name: 'WHYME.LIVE',
        tagline: 'AI portfolio that answers questions about me',
        status: 'LIVE',
        year: '2024',
        tech: ['React', 'Node.js', 'OpenAI', 'RAG'],
        video: null,
        image: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=1200&h=675&fit=crop'
    },
    freedhome: {
        name: 'FREEDHOME',
        tagline: 'Smart home discovery powered by ML',
        status: 'LIVE',
        year: '2023',
        tech: ['Python', 'FastAPI', 'React', 'ML'],
        video: null,
        image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200&h=675&fit=crop'
    },
    battlearena: {
        name: 'BATTLE ARENA',
        tagline: 'Anything vs Anything — LLM-powered battles',
        status: 'EXPERIMENTAL',
        year: '2024',
        tech: ['LLM Engine', 'Real-time', 'Creative AI'],
        video: 'battle-arena.mp4',
        image: null
    }
};

// ========== DOM ELEMENTS ==========
const $ = id => document.getElementById(id);
const output = $('output');
const input = $('input');
const inputLoader = $('input-loader');
const cinema = $('cinema');
const grain = $('grain');
const videoLayer = $('video-layer');
const projectVideo = $('project-video');
const projectImage = $('project-image');
const cinemaTitle = $('cinema-title');
const cinemaTagline = $('cinema-tagline');
const cinemaTech = $('cinema-tech');
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const bootOverlay = $('boot-overlay');
const bootOutput = $('boot-output');
const suggestions = $('suggestions');

// ========== SESSION ==========
const sessionId = 'session_' + Math.random().toString(36).substr(2, 9);

// ========== SMART SCROLL ==========
// Only auto-scroll if user is near the bottom (not reading history)
function smartScroll() {
    const threshold = 100; // pixels from bottom
    const isNearBottom = output.scrollHeight - output.scrollTop - output.clientHeight < threshold;
    if (isNearBottom) {
        output.scrollTop = output.scrollHeight;
    }
}

// Force scroll to bottom (for new user messages)
function scrollToBottom() {
    output.scrollTop = output.scrollHeight;
}

// ========== TYPEWRITER SYSTEM ==========
const typeSpeed = 12;
let printQueue = [];
let isTyping = false;

function typeText(element, text, speed = typeSpeed) {
    return new Promise(resolve => {
        let i = 0;
        const cursor = document.createElement('span');
        cursor.className = 'typing-cursor';
        cursor.textContent = '█';
        element.appendChild(cursor);
        
        function type() {
            if (i < text.length) {
                if (text[i] === '\n') {
                    element.insertBefore(document.createElement('br'), cursor);
                    i++;
                } else if (text[i] === '&') {
                    const entityEnd = text.indexOf(';', i);
                    if (entityEnd !== -1) {
                        const entity = text.substring(i, entityEnd + 1);
                        const span = document.createElement('span');
                        span.innerHTML = entity;
                        element.insertBefore(span, cursor);
                        i = entityEnd + 1;
                    } else {
                        element.insertBefore(document.createTextNode(text[i]), cursor);
                        i++;
                    }
                } else if (text[i] === '<') {
                    const tagEnd = text.indexOf('>', i);
                    if (tagEnd !== -1) {
                        const tag = text.substring(i, tagEnd + 1);
                        const temp = document.createElement('div');
                        temp.innerHTML = tag;
                        if (temp.firstChild) {
                            element.insertBefore(temp.firstChild, cursor);
                        }
                        i = tagEnd + 1;
                    } else {
                        element.insertBefore(document.createTextNode(text[i]), cursor);
                        i++;
                    }
                } else {
                    element.insertBefore(document.createTextNode(text[i]), cursor);
                    i++;
                }
                // Auto-scroll as text is being typed (only if user is near bottom)
                smartScroll();
                setTimeout(type, speed);
            } else {
                cursor.remove();
                resolve();
            }
        }
        type();
    });
}

async function processQueue() {
    if (isTyping || printQueue.length === 0) return;
    
    isTyping = true;
    const { text, className, useTypewriter } = printQueue.shift();
    
    const el = document.createElement('div');
    el.className = `line ${className}`;
    output.appendChild(el);
    smartScroll();
    
    if (useTypewriter && text && text !== '&nbsp;') {
        await typeText(el, text);
    } else {
        el.innerHTML = text;
    }
    
    smartScroll();
    isTyping = false;
    
    setTimeout(() => processQueue(), 50);
}

function print(text, className = '', delay = 0, useTypewriter = true) {
    setTimeout(() => {
        printQueue.push({ text, className, useTypewriter });
        processQueue();
    }, delay);
}

function printInstant(text, className = '') {
    const el = document.createElement('div');
    el.className = `line ${className}`;
    el.innerHTML = text;
    output.appendChild(el);
    scrollToBottom(); // Always scroll for user messages
}

function renderProjectBlock(projectData) {
    // Header line
    const header = document.createElement('div');
    header.className = 'line project-header';
    header.innerHTML = '—— PROJECT DATA ——';
    output.appendChild(header);
    
    // Project block
    const block = document.createElement('div');
    block.className = 'project-block';
    
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = projectData.name;
    
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `[${projectData.status}] • ${projectData.year}`;
    
    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = projectData.tagline || projectData.description?.split('\n')[0];
    
    const tech = document.createElement('div');
    tech.className = 'tech';
    if (projectData.tech) {
        projectData.tech.forEach(t => {
            const span = document.createElement('span');
            span.textContent = `[${t}]`;
            tech.appendChild(span);
        });
    }
    
    block.appendChild(title);
    block.appendChild(meta);
    block.appendChild(desc);
    block.appendChild(tech);
    
    output.appendChild(block);
    smartScroll();
}

// Render AI response in a styled block with typewriter effect
function renderAIResponse(text) {
    return new Promise(resolve => {
        // Create the response block
        const block = document.createElement('div');
        block.className = 'ai-block';
        output.appendChild(block);
        
        // Create content div for typewriter
        const content = document.createElement('div');
        content.className = 'ai-content';
        block.appendChild(content);
        
        // Typewriter effect inside the block
        let i = 0;
        const cursor = document.createElement('span');
        cursor.className = 'typing-cursor';
        cursor.textContent = '█';
        content.appendChild(cursor);
        
        function type() {
            if (i < text.length) {
                if (text[i] === '\n') {
                    content.insertBefore(document.createElement('br'), cursor);
                    i++;
                } else if (text[i] === '&') {
                    const entityEnd = text.indexOf(';', i);
                    if (entityEnd !== -1) {
                        const entity = text.substring(i, entityEnd + 1);
                        const span = document.createElement('span');
                        span.innerHTML = entity;
                        content.insertBefore(span, cursor);
                        i = entityEnd + 1;
                    } else {
                        content.insertBefore(document.createTextNode(text[i]), cursor);
                        i++;
                    }
                } else if (text[i] === '<') {
                    const tagEnd = text.indexOf('>', i);
                    if (tagEnd !== -1) {
                        const tag = text.substring(i, tagEnd + 1);
                        const temp = document.createElement('div');
                        temp.innerHTML = tag;
                        if (temp.firstChild) {
                            content.insertBefore(temp.firstChild, cursor);
                        }
                        i = tagEnd + 1;
                    } else {
                        content.insertBefore(document.createTextNode(text[i]), cursor);
                        i++;
                    }
                } else {
                    content.insertBefore(document.createTextNode(text[i]), cursor);
                    i++;
                }
                smartScroll();
                setTimeout(type, typeSpeed);
            } else {
                cursor.remove();
                resolve();
            }
        }
        type();
    });
}

// ========== BOOT SEQUENCE ==========
const bootMessages = [
    { text: 'SUEDA SYSTEMS BIOS v3.0.0', delay: 0 },
    { text: 'Copyright (C) 2024 Sueda Industries', delay: 100, dim: true },
    { text: '', delay: 200 },
    { text: 'Initializing AI subsystem...', delay: 300 },
    { text: '', delay: 400 },
    { text: 'CPU: Neural Processing Unit @ ∞ GHz', delay: 500 },
    { text: 'RAM: 16384 MB Context Window', delay: 650 },
    { text: 'GPU: Imagination Engine v4.0', delay: 800 },
    { text: '', delay: 900 },
    { text: 'Loading knowledge base......... OK', delay: 1000 },
    { text: 'Mounting personality........... OK', delay: 1200 },
    { text: 'Connecting to OpenAI........... OK', delay: 1400 },
    { text: 'Starting AI interface.......... OK', delay: 1600 },
    { text: '', delay: 1800 },
    { text: 'All systems operational.', delay: 1900 },
    { text: '', delay: 2000 },
    { text: 'Press any key to continue_', delay: 2100, blink: true }
];

function typeBootText(element, text, speed = 12) {
    return new Promise(resolve => {
        let i = 0;
        function type() {
            if (i < text.length) {
                element.textContent += text[i];
                i++;
                setTimeout(type, speed);
            } else {
                resolve();
            }
        }
        type();
    });
}

async function runBootSequence() {
    if (sessionStorage.getItem('booted')) {
        bootOverlay.style.display = 'none';
        await initTerminal();
        return;
    }
    
    bootOverlay.style.display = 'flex';
    
    for (const msg of bootMessages) {
        await new Promise(r => setTimeout(r, msg.delay ? 150 : 50));
        
        const line = document.createElement('div');
        line.className = 'boot-line';
        if (msg.dim) line.classList.add('dim');
        if (msg.blink) line.classList.add('blink');
        bootOutput.appendChild(line);
        
        if (msg.text) {
            await typeBootText(line, msg.text);
        }
        
        bootOutput.scrollTop = bootOutput.scrollHeight;
    }
    
    await new Promise(resolve => {
        function handler() {
            document.removeEventListener('keydown', handler);
            document.removeEventListener('click', handler);
            resolve();
        }
        document.addEventListener('keydown', handler);
        document.addEventListener('click', handler);
    });
    
    bootOverlay.classList.add('fade-out');
    await new Promise(r => setTimeout(r, 500));
    bootOverlay.style.display = 'none';
    
    sessionStorage.setItem('booted', 'true');
    await initTerminal();
}

// ========== TERMINAL INIT ==========
const asciiArt = [
    '███████╗██╗   ██╗███████╗██████╗  █████╗ ',
    '██╔════╝██║   ██║██╔════╝██╔══██╗██╔══██╗',
    '███████╗██║   ██║█████╗  ██║  ██║███████║',
    '╚════██║██║   ██║██╔══╝  ██║  ██║██╔══██║',
    '███████║╚██████╔╝███████╗██████╔╝██║  ██║',
    '╚══════╝ ╚═════╝ ╚══════╝╚═════╝ ╚═╝  ╚═╝'
];

function typeAsciiLine(element, text, speed = 8) {
    return new Promise(resolve => {
        let i = 0;
        function type() {
            if (i < text.length) {
                element.textContent += text[i];
                i++;
                setTimeout(type, speed);
            } else {
                element.textContent += '\n';
                resolve();
            }
        }
        type();
    });
}

async function typeAsciiArt() {
    const ascii = document.createElement('pre');
    ascii.className = 'ascii';
    output.appendChild(ascii);
    
    for (const line of asciiArt) {
        await typeAsciiLine(ascii, line);
    }
}

async function initTerminal() {
    output.innerHTML = '';
    
    await typeAsciiArt();
    
    print('════════════════════════════════════════════', 'dim', 100, false);
    print("Hey, I'm Sueda's AI.", 'bright', 200);
    print('I know her story, her projects, and what she builds.', '', 400);
    print('&nbsp;', '', 600, false);
    print('Ask me anything_', 'dim', 800);
    
    setTimeout(() => input.focus(), 1200);
}

// ========== PARTICLES ==========
const particlesContainer = $('particles');
const particleCount = 25;

function createParticle() {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    const sizeRand = Math.random();
    if (sizeRand < 0.4) particle.classList.add('small');
    else if (sizeRand > 0.85) particle.classList.add('large');
    
    particle.style.left = Math.random() * 100 + '%';
    
    const driftX = (Math.random() - 0.5) * 100;
    particle.style.setProperty('--drift-x', driftX + 'px');
    
    const duration = 15 + Math.random() * 25;
    particle.style.animationDuration = duration + 's';
    particle.style.animationDelay = Math.random() * 15 + 's';
    
    particlesContainer.appendChild(particle);
    
    setTimeout(() => {
        particle.remove();
        createParticle();
    }, (duration + parseFloat(particle.style.animationDelay)) * 1000);
}

function initParticles() {
    particlesContainer.innerHTML = '';
    for (let i = 0; i < particleCount; i++) {
        setTimeout(() => createParticle(), i * 200);
    }
}

// ========== CUSTOM CURSOR ==========
const customCursor = $('custom-cursor');
const mouseGlow = $('mouse-glow');
let mouseX = 0, mouseY = 0;
let glowX = 0, glowY = 0;
const glowEase = 0.08;

function updateCursorAndGlow() {
    customCursor.style.left = mouseX + 'px';
    customCursor.style.top = mouseY + 'px';
    
    glowX += (mouseX - glowX) * glowEase;
    glowY += (mouseY - glowY) * glowEase;
    
    mouseGlow.style.left = glowX + 'px';
    mouseGlow.style.top = glowY + 'px';
    
    requestAnimationFrame(updateCursorAndGlow);
}

document.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    
    if (!mouseGlow.classList.contains('active')) {
        mouseGlow.classList.add('active');
        customCursor.style.opacity = '1';
    }
});

document.addEventListener('mouseleave', () => {
    mouseGlow.classList.remove('active');
    customCursor.style.opacity = '0';
});

document.addEventListener('mouseenter', () => {
    mouseGlow.classList.add('active');
    customCursor.style.opacity = '1';
});

document.addEventListener('mouseover', e => {
    const target = e.target;
    if (target.matches('button, a, .link, .suggest-btn, input, [onclick]') || 
        target.closest('button, a, .link, .suggest-btn')) {
        customCursor.classList.add('clickable');
    }
});

document.addEventListener('mouseout', e => {
    const target = e.target;
    if (target.matches('button, a, .link, .suggest-btn, input, [onclick]') || 
        target.closest('button, a, .link, .suggest-btn')) {
        customCursor.classList.remove('clickable');
    }
});

updateCursorAndGlow();

// ========== CLOCK ==========
setInterval(() => {
    const clock = $('clock');
    if (clock) {
        clock.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
    }
}, 1000);

// ========== GRAIN EFFECT ==========
let grainAnim;
function startGrain() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    (function render() {
        const img = ctx.createImageData(canvas.width, canvas.height);
        for (let i = 0; i < img.data.length; i += 4) {
            const v = Math.random();
            img.data[i] = v * 100 + 60;
            img.data[i+1] = v * 45 + 35;
            img.data[i+2] = v * 135 + 90;
            img.data[i+3] = 185;
        }
        ctx.putImageData(img, 0, 0);
        grainAnim = requestAnimationFrame(render);
    })();
}
function stopGrain() { cancelAnimationFrame(grainAnim); }

// ========== CINEMA ==========
let currentProject = null;

function openCinema(projectKey) {
    const p = projects[projectKey];
    if (!p) {
        print(`Project not found: ${projectKey}`, 'dim');
        return;
    }
    
    currentProject = p;
    cinemaTitle.textContent = p.name;
    cinemaTagline.textContent = p.tagline;
    cinemaTech.innerHTML = p.tech.map(t => `<span class="tech-tag">[${t}]</span>`).join(' ');
    
    // Reset states
    grain.classList.remove('fade');
    videoLayer.classList.remove('show');
    cinema.classList.remove('revealed');
    projectVideo.style.display = 'none';
    projectImage.style.display = 'none';
    
    // Set up media
    if (p.video) {
        projectVideo.querySelector('source').src = p.video;
        projectVideo.load();
        projectVideo.style.display = 'block';
    } else if (p.image) {
        projectImage.src = p.image;
        projectImage.style.display = 'block';
    }
    
    cinema.classList.add('active');
    startGrain();
    
    // Reveal sequence
    setTimeout(() => {
        grain.classList.add('fade');
        videoLayer.classList.add('show');
        cinema.classList.add('revealed');
        if (p.video) {
            projectVideo.play().catch(() => {});
        }
    }, 2500);
}

function closeCinema() {
    cinema.classList.remove('active', 'revealed');
    stopGrain();
    projectVideo.pause();
    currentProject = null;
}

// ========== DIRECT COMMANDS (work without AI) ==========
function handleDirectCommand(message) {
    const msg = message.toLowerCase().trim();
    
    // Show commands
    if (msg === 'show battlearena' || msg === 'show battle arena' || msg === 'battle arena' || msg === 'battlearena') {
        print('Initializing...', 'dim', 0);
        setTimeout(() => renderProjectBlock(projects.battlearena), 400);
        setTimeout(() => openCinema('battlearena'), 2000);
        return true;
    }
    if (msg === 'show whyme' || msg === 'whyme') {
        print('Initializing...', 'dim', 0);
        setTimeout(() => renderProjectBlock(projects.whyme), 400);
        setTimeout(() => openCinema('whyme'), 2000);
        return true;
    }
    if (msg === 'show freedhome' || msg === 'freedhome') {
        print('Initializing...', 'dim', 0);
        setTimeout(() => renderProjectBlock(projects.freedhome), 400);
        setTimeout(() => openCinema('freedhome'), 2000);
        return true;
    }
    
    // Projects list
    if (msg === 'projects' || msg === 'ls') {
        print('&nbsp;', '', 0, false);
        print('PROJECTS:', 'bright', 100);
        let delay = 200;
        Object.entries(projects).forEach(([key, p]) => {
            print(`  ${key.padEnd(14)} ${p.name}`, '', delay);
            delay += 100;
        });
        print('&nbsp;', '', delay, false);
        print('Type "show [name]" to view', 'dim', delay + 100);
        return true;
    }
    
    // Help
    if (msg === 'help' || msg === '?') {
        print('&nbsp;', '', 0, false);
        print('COMMANDS:', 'bright', 100);
        print('  projects ......... list all projects', '', 200);
        print('  show [name] ...... open project cinema', '', 300);
        print('  clear ............ clear screen', '', 400);
        print('&nbsp;', '', 500, false);
        print('Or just ask me anything!', 'dim', 600);
        return true;
    }
    
    // Clear
    if (msg === 'clear' || msg === 'cls') {
        output.innerHTML = '';
        printQueue = [];
        isTyping = false;
        return true;
    }
    
    return false; // Not a direct command, use AI
}

// ========== AI CHAT ==========
let isWaiting = false;

async function sendMessage(message) {
    if (!message.trim() || isWaiting) return;
    
    // Show user message
    printInstant(`▸ ${message}`, 'user-msg');
    
    // Check for direct commands first (works without AI)
    if (handleDirectCommand(message)) {
        return;
    }
    
    // Show loading state
    isWaiting = true;
    input.disabled = true;
    inputLoader.classList.add('active');
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, sessionId })
        });
        
        const data = await response.json();
        
        if (data.error) {
            print(data.error, 'error', 0);
        } else {
            // Render AI response in styled block
            await renderAIResponse(data.reply);
            
            // Show project data block if available
            if (data.projectData) {
                setTimeout(() => {
                    renderProjectBlock(data.projectData);
                }, 300);
            }
            
            // Check if we should show cinema mode
            if (data.showProject && projects[data.showProject]) {
                setTimeout(() => {
                    openCinema(data.showProject);
                }, 2000);
            }
        }
    } catch (error) {
        console.error('Chat error:', error);
        // Fallback message when API is not available
        print("I'm running in offline mode. Try these commands:", 'dim', 0);
        print('  help, projects, show [name], clear', 'dim', 100);
    } finally {
        isWaiting = false;
        input.disabled = false;
        inputLoader.classList.remove('active');
        input.focus();
    }
}

// ========== EVENT LISTENERS ==========
input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && input.value.trim()) {
        sendMessage(input.value);
        input.value = '';
    }
});

// Suggestion buttons
document.querySelectorAll('.suggest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const question = btn.dataset.question;
        sendMessage(question);
    });
});

// Cinema close
$('close').addEventListener('click', closeCinema);
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && cinema.classList.contains('active')) {
        closeCinema();
    }
});

// Focus input on click
document.addEventListener('click', e => {
    if (!cinema.classList.contains('active') && 
        !e.target.closest('.suggest-btn') && 
        !e.target.closest('.color-picker') &&
        !bootOverlay.classList.contains('active')) {
        input.focus();
    }
});

// ========== COLOR PICKER SYSTEM ==========
const colorPicker = $('color-picker');
const pickerToggle = $('picker-toggle');
const hueSlider = $('hue-slider');
const satSlider = $('sat-slider');
const lightSlider = $('light-slider');
const colorPreview = $('color-preview');
const presetButtons = document.querySelectorAll('.preset');

// Current HSL values
let currentHue = 17;
let currentSat = 52;
let currentLight = 43;

function hexToHSL(hex) {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function generatePalette(baseHex) {
    const hsl = hexToHSL(baseHex);
    
    return {
        primary: baseHex,
        primaryBright: hslToHex(hsl.h, Math.min(hsl.s + 10, 100), Math.min(hsl.l + 15, 80)),
        primaryDim: hslToHex(hsl.h, Math.max(hsl.s - 5, 40), Math.max(hsl.l - 15, 40)),
        primaryMuted: hslToHex(hsl.h, Math.max(hsl.s - 20, 30), Math.max(hsl.l - 25, 30)),
        primaryDark: hslToHex(hsl.h, Math.max(hsl.s - 30, 20), Math.max(hsl.l - 35, 20)),
        primaryDarker: hslToHex(hsl.h, Math.max(hsl.s - 40, 15), Math.max(hsl.l - 45, 15)),
        accent: baseHex,
        accentDim: hslToHex(hsl.h, Math.max(hsl.s - 10, 35), Math.max(hsl.l - 10, 45)),
        highlight: hslToHex(hsl.h, Math.min(hsl.s + 5, 100), Math.min(hsl.l + 10, 75)),
        highlightDim: hslToHex(hsl.h, Math.max(hsl.s - 15, 35), Math.max(hsl.l - 15, 40)),
    };
}

function hexToRGB(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
}

function applyTheme(baseColor, updateSliders = true) {
    const palette = generatePalette(baseColor);
    const root = document.documentElement;
    
    root.style.setProperty('--primary', palette.primary);
    root.style.setProperty('--primary-bright', palette.primaryBright);
    root.style.setProperty('--primary-dim', palette.primaryDim);
    root.style.setProperty('--primary-muted', palette.primaryMuted);
    root.style.setProperty('--primary-dark', palette.primaryDark);
    root.style.setProperty('--primary-darker', palette.primaryDarker);
    root.style.setProperty('--primary-rgb', hexToRGB(palette.primary));
    
    updateDynamicStyles(palette);
    localStorage.setItem('themeColor', baseColor);
    
    // Update sliders to match the color
    if (updateSliders) {
        const hsl = hexToHSL(baseColor);
        currentHue = hsl.h;
        currentSat = hsl.s;
        currentLight = hsl.l;
        hueSlider.value = currentHue;
        satSlider.value = currentSat;
        lightSlider.value = currentLight;
        updateSliderGradients();
    }
    
    // Update preview
    if (colorPreview) {
        colorPreview.style.background = baseColor;
        colorPreview.style.boxShadow = `0 0 10px ${baseColor}, inset 0 0 20px rgba(0,0,0,0.3)`;
    }
    
    presetButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color.toLowerCase() === baseColor.toLowerCase());
    });
}

function updateSliderGradients() {
    // Update saturation slider gradient
    satSlider.style.background = `linear-gradient(to right, 
        hsl(${currentHue}, 20%, ${currentLight}%), 
        hsl(${currentHue}, 100%, ${currentLight}%))`;
    
    // Update brightness slider gradient
    lightSlider.style.background = `linear-gradient(to right, 
        hsl(${currentHue}, ${currentSat}%, 40%), 
        hsl(${currentHue}, ${currentSat}%, 80%))`;
}

function applyFromSliders() {
    const hex = hslToHex(currentHue, currentSat, currentLight);
    applyTheme(hex, false);
}

function updateDynamicStyles(palette) {
    let styleEl = document.getElementById('dynamic-theme-styles');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'dynamic-theme-styles';
        document.head.appendChild(styleEl);
    }
    
    styleEl.textContent = `
        .custom-cursor {
            background: ${palette.primary} !important;
            box-shadow: 0 0 4px ${palette.primary}, 0 0 10px ${palette.primary}cc, 0 0 20px ${palette.primary}66 !important;
        }
        .custom-cursor.clickable {
            box-shadow: 0 0 6px ${palette.primary}, 0 0 15px ${palette.primary}e0, 0 0 30px ${palette.primary}80 !important;
        }
        .mouse-glow {
            background: radial-gradient(circle, ${palette.primary}40 0%, ${palette.primary}20 30%, ${palette.primaryDim}10 50%, transparent 70%) !important;
        }
        .abs-line {
            background: linear-gradient(90deg, transparent, ${palette.primary}, transparent) !important;
            box-shadow: 0 0 4px ${palette.primary}66 !important;
        }
        .abs-line.v1, .abs-line.v2, .abs-line.v3, .abs-line.v4 {
            background: linear-gradient(180deg, transparent, ${palette.primary}, transparent) !important;
        }
        .corner-bracket::before, .corner-bracket::after {
            background: ${palette.primary} !important;
            box-shadow: 0 0 6px ${palette.primary}cc, 0 0 12px ${palette.primaryDim}66 !important;
        }
        .float-label {
            color: ${palette.primaryDim} !important;
            text-shadow: 0 0 4px ${palette.primaryDim}, 0 0 10px ${palette.primaryMuted}80 !important;
        }
        .header {
            color: ${palette.primaryDim} !important;
            text-shadow: 0 0 4px ${palette.primaryDim}, 0 0 12px ${palette.primaryMuted}80 !important;
        }
        .output {
            color: ${palette.primary} !important;
            text-shadow: 0 0 2px ${palette.primary}, 0 0 8px ${palette.primary}99, 0 0 16px ${palette.primaryDim}66 !important;
        }
        .output::-webkit-scrollbar-thumb {
            background: ${palette.primary}66 !important;
        }
        .line.dim {
            color: ${palette.primaryDim} !important;
            text-shadow: 0 0 3px ${palette.primaryDim}, 0 0 10px ${palette.primaryMuted}80 !important;
        }
        .line.bright {
            color: ${palette.primaryBright} !important;
            text-shadow: 0 0 3px ${palette.primaryBright}, 0 0 12px ${palette.primary}cc, 0 0 20px ${palette.primaryDim}66 !important;
        }
        .line.user-msg {
            color: ${palette.primaryBright} !important;
            text-shadow: 0 0 3px ${palette.primaryBright}, 0 0 10px ${palette.primary}cc !important;
        }
        .line.ai-response {
            color: ${palette.primary} !important;
            text-shadow: 0 0 2px ${palette.primary}, 0 0 8px ${palette.primary}99 !important;
        }
        .ai-block {
            border-left-color: ${palette.primaryDim} !important;
            background: ${palette.primary}08 !important;
        }
        .ai-block .ai-content {
            color: #a8a8b0 !important;
            text-shadow: none !important;
        }
        .ai-block .typing-cursor {
            color: #a8a8b0 !important;
            text-shadow: none !important;
        }
        .line.error {
            color: #ff4444 !important;
            text-shadow: 0 0 3px #ff4444, 0 0 10px #ff444480 !important;
        }
        .ascii {
            color: ${palette.primaryDark} !important;
            text-shadow: 0 0 2px ${palette.primaryDark}80, 0 0 6px ${palette.primaryDarker}40 !important;
        }
        .prompt {
            color: ${palette.primary} !important;
            text-shadow: 0 0 3px ${palette.primary}, 0 0 10px ${palette.primary}cc !important;
        }
        .input {
            color: ${palette.primary} !important;
            text-shadow: 0 0 2px ${palette.primary}, 0 0 8px ${palette.primary}99 !important;
            caret-color: ${palette.primaryBright} !important;
        }
        .input::placeholder {
            color: ${palette.primaryDark} !important;
        }
        .suggest-btn {
            color: ${palette.primaryMuted} !important;
            border-color: ${palette.primaryDark} !important;
            text-shadow: 0 0 3px ${palette.primaryMuted}80 !important;
        }
        .suggest-btn:hover {
            color: ${palette.primary} !important;
            border-color: ${palette.primary} !important;
            text-shadow: 0 0 3px ${palette.primary}, 0 0 10px ${palette.primary}99 !important;
            background: ${palette.primary}15 !important;
        }
        .typing-cursor {
            color: ${palette.primary} !important;
            text-shadow: 0 0 3px ${palette.primary}, 0 0 10px ${palette.primary}cc !important;
        }
        .boot-screen {
            color: ${palette.primary} !important;
            text-shadow: 0 0 3px ${palette.primary}, 0 0 10px ${palette.primary}99 !important;
        }
        .boot-line.dim {
            color: ${palette.primaryMuted} !important;
            text-shadow: 0 0 3px ${palette.primaryMuted}, 0 0 8px ${palette.primaryDark}80 !important;
        }
        .particle {
            background: ${palette.primary} !important;
            box-shadow: 0 0 4px ${palette.primary}, 0 0 10px ${palette.primary}99 !important;
        }
        .particle.small {
            box-shadow: 0 0 3px ${palette.primary}, 0 0 6px ${palette.primary}80 !important;
        }
        .particle.large {
            background: ${palette.primaryBright} !important;
            box-shadow: 0 0 6px ${palette.primaryBright}, 0 0 15px ${palette.primary}cc !important;
        }
        .color-picker {
            border-color: ${palette.primaryMuted} !important;
        }
        .picker-header {
            background: ${palette.primary}1a !important;
            border-bottom-color: ${palette.primaryDark} !important;
            color: ${palette.primaryDim} !important;
        }
        .picker-toggle {
            color: ${palette.primary} !important;
        }
        .picker-row label {
            color: ${palette.primaryDim} !important;
        }
        .picker-row input[type="color"] {
            border-color: ${palette.primaryDark} !important;
        }
        .input-loader .loader-dot {
            background: ${palette.primary} !important;
        }
        .cinema-info .tech-tag {
            color: ${palette.primaryDim} !important;
        }
    `;
}

pickerToggle.addEventListener('click', () => {
    colorPicker.classList.toggle('collapsed');
});

// HSL Slider event listeners
hueSlider.addEventListener('input', (e) => {
    currentHue = parseInt(e.target.value);
    updateSliderGradients();
    applyFromSliders();
});

satSlider.addEventListener('input', (e) => {
    currentSat = parseInt(e.target.value);
    updateSliderGradients();
    applyFromSliders();
});

lightSlider.addEventListener('input', (e) => {
    currentLight = parseInt(e.target.value);
    updateSliderGradients();
    applyFromSliders();
});

presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        applyTheme(btn.dataset.color);
    });
});

// ========== START ==========
const DEFAULT_THEME = '#a55536';

// Force clear old theme and apply new default
localStorage.removeItem('themeColor');
applyTheme(DEFAULT_THEME);

initParticles();
document.addEventListener('DOMContentLoaded', runBootSequence);
