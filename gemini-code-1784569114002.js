const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

let qrCodeData = '';

client.on('qr', (qr) => {
    qrCodeData = qr;
    console.log('QR RECEIVED', qr);
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
});

client.initialize();

// n8n থেকে রিসিভ করার API Endpoint
app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;
    try {
        const chatId = number + "@c.us";
        await client.sendMessage(chatId, message);
        res.status(200).json({ success: true, response: "Message sent successfully!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});