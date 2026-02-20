const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');

const app = express();

// --- BULLETPROOF CORS FIX ---
app.use(cors()); 
app.use(express.json());

// 1. CONFIGURATION
const PORT = process.env.PORT || 3001;

const sessionPath = process.env.TEMP 
    ? path.join(process.env.TEMP, 'ssi_whatsapp_auth') 
    : path.join(__dirname, '.wwebjs_auth');

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "ssi-session",
        dataPath: sessionPath
    }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014590913-alpha.html',
    },
    puppeteer: {
        headless: true,
        // --- NATIVE BROWSER FIX ---
        // On Railway, this will be "chromium" from nixpacks.toml
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-zygote',
            '--disable-gpu',
            '--disable-features=site-per-process' 
        ],
    }
});

let isClientReady = false;
let latestQR = null;

// 2. EVENTS
client.on('qr', (qr) => {
    console.clear();
    console.log('--- SCAN THE QR CODE BELOW ---');
    latestQR = qr; 
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ SUCCESS: WhatsApp is ONLINE');
    isClientReady = true;
    latestQR = null; 
});

client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failure:', msg);
    isClientReady = false;
});

client.on('disconnected', (reason) => {
    console.log('❌ Client was logged out', reason);
    isClientReady = false;
    client.destroy().then(() => {
        client.initialize();
    });
});

// 3. START ENGINE
console.log('🚀 Initializing WhatsApp engine...');
client.initialize().catch(err => {
    console.error("Init Error:", err.message);
});

// 4. API ROUTES
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.get('/api/status', (req, res) => {
    res.json({ success: true, ready: isClientReady });
});

app.get('/api/get-qr', (req, res) => {
    if (isClientReady) {
        return res.json({ success: true, ready: true, qr: null });
    }
    res.json({ success: true, ready: false, qr: latestQR });
});

app.post('/api/logout', async (req, res) => {
    try {
        await client.logout();
        isClientReady = false;
        latestQR = null;
        res.json({ success: true, message: "Logged out successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/send', async (req, res) => {
    if (!isClientReady) return res.status(503).json({ error: 'WhatsApp not ready' });
    const { phone, message } = req.body;
    try {
        let num = phone.toString().replace(/\D/g, '');
        if (num.length === 10) num = '91' + num;
        await client.sendMessage(`${num}@c.us`, message);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/', (req, res) => {
    res.send(`
        <div style="text-align:center; padding:50px; font-family: sans-serif;">
            <h1>SSI WhatsApp Server</h1>
            <h2 style="color: ${isClientReady ? 'green' : 'red'}">
                Status: ${isClientReady ? 'ONLINE' : 'OFFLINE / LOADING'}
            </h2>
        </div>
    `);
});

app.listen(PORT, '0.0.0.0', () => console.log(`📡 Server running on port ${PORT}`));