require('dotenv').config(); // For loading environment variables
const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const fs = require('fs');
const qrcode = require('qrcode');
const app = express();
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Serve static files like HTML
app.use(express.static(path.join(__dirname, 'views')));

// Use LocalAuth for session persistence
const client = new Client({
    authStrategy: new LocalAuth(),
});

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Store conversation history in-memory
let conversationHistory = {};

// Function to retrieve and update conversation history
async function getAIResponse(prompt, userId) {
    try {
        if (!conversationHistory[userId]) {
            conversationHistory[userId] = [];
        }

        conversationHistory[userId].push({ role: 'user', message: prompt });

        const conversation = conversationHistory[userId].map((entry) => `${entry.role}: ${entry.message}`).join("\n");
        const fullPrompt = conversation + "\nuser: " + prompt;

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent([fullPrompt]);

        if (result.response && result.response.text) {
            const aiText = await result.response.text();
            conversationHistory[userId].push({ role: 'ai', message: aiText });

            const footer = "\n\nPowered by Forou.tech";
            return aiText + footer;
        } else {
            return 'I couldn’t generate a response. Please try again.';
        }
    } catch (err) {
        console.error('Error fetching AI response:', err);
        return 'There was an error generating a response.';
    }
}

client.on('qr', (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
        if (err) {
            console.error('Error generating QR code:', err);
            return;
        }

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>WhatsApp QR Code</title>
        </head>
        <body>
            <h1>Scan the QR Code to Connect to WhatsApp</h1>
            <img src="${url}" alt="QR Code" />
        </body>
        </html>
        `;

        fs.writeFileSync(path.join(__dirname, 'views', 'qr.html'), html);
    });
});

client.on('ready', () => {
    console.log('WhatsApp client is ready!');
});

client.on('authenticated', () => {
    console.log('Authenticated successfully!');
});

client.on('auth_failure', (msg) => {
    console.error('Authentication failed:', msg);
});

client.on('disconnected', (reason) => {
    console.error('Client disconnected:', reason);
});

client.on('message', async (msg) => {
    const response = await getAIResponse(msg.body, msg.from);
    client.sendMessage(msg.from, response)
        .then(() => console.log(`Response sent to ${msg.from}`))
        .catch((err) => console.error(`Error sending message: ${err}`));
});

client.initialize();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'qr.html'));
});

// Keep the server active
setInterval(() => {
    console.log('Waiting for incoming messages...');
    client.getChats()
        .then(chats => console.log(`Currently tracking ${chats.length} chats`))
        .catch(err => console.error('Error retrieving chats:', err));
}, 5000); // Adjust the interval (e.g., every 5 minutes)

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
