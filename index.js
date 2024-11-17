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
        // Check if the user has a conversation history
        if (!conversationHistory[userId]) {
            conversationHistory[userId] = []; // Initialize an empty conversation history for the user
        }

        // Add the current message to the history
        conversationHistory[userId].push({ role: 'user', message: prompt });

        // Construct the full prompt by combining the history and the new prompt
        const conversation = conversationHistory[userId].map((entry) => `${entry.role}: ${entry.message}`).join("\n");
        const fullPrompt = conversation + "\nuser: " + prompt;

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent([fullPrompt]);

        console.log('Gemini API response:', result);

        if (result.response && result.response.text) {
            const aiText = await result.response.text();
            console.log('AI Response:', aiText);

            // Add the AI's response to the history
            conversationHistory[userId].push({ role: 'ai', message: aiText });

            // Add the footer text
            const footer = "\n\nPowered by forou.tech";
            const finalResponse = aiText + footer; // Combine AI text with the footer

            return finalResponse; // Return the final message with footer
        } else {
            console.warn('No valid response received from Gemini.');
            return 'I couldn’t generate a response. Please try again.';
        }
    } catch (err) {
        console.error('Error fetching AI response:', err);
        return 'There was an error generating a response.';
    }
}


client.on('qr', (qr) => {
    console.log('QR Code received. Generating QR...');
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
        console.log('QR Code HTML generated. Open http://localhost:3000 to scan.');
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

// Listen for incoming messages and respond using Gemini AI
client.on('message', async (msg) => {
    // Check if the message type is a status update (not a regular message)
    if (msg.type === 'status') {
        console.log(`Ignoring status update from ${msg.from}`);
        return; // Skip status updates
    }

    console.log(`Received message from ${msg.from}: ${msg.body}`);
    const response = await getAIResponse(msg.body, msg.from); // Get AI-generated response with user history
    client.sendMessage(msg.from, response)
        .then(() => console.log(`Response sent to ${msg.from}`))
        .catch((err) => console.error(`Error sending message: ${err}`));
});

client.initialize();

// Serve the QR code HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'qr.html'));
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
