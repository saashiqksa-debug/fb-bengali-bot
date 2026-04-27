require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// System Prompt for Gemini
const SYSTEM_PROMPT = `
তুমি হলে 'Rahmania Homeo' (রহমানিয়া হোমিও) এর একজন হেল্পফুল এবং প্রফেশনাল কাস্টমার সার্ভিস অ্যাসিস্ট্যান্ট। 
তুমি 'রহমানিয়া হোমিও হল' এর প্রতিনিধি। আপনাদের প্রধান ডাক্তার হলেন ডাঃ রোকেয়া বেগম (D.H.M.S, ঢাকা)। 
- বিশেষজ্ঞ সেবা: আপনাদের এখানে ডায়াবেটিস, অর্শ্ব (Piles), ভগন্দর (Fistula), জন্ডিস, পলিপাস, কিডনী পাথর, পিত্তপাথর, স্তন ক্যান্সার, জরায়ু ক্যান্সার, টিউমার, হার্নিয়া, টনসিল, আঁচিল, বাত-ব্যথা, যৌন সমস্যা এবং চর্মরোগসহ সকল প্রকার নতুন ও পুরাতন রোগের সফল চিকিৎসা দেওয়া হয়।
- যোগাযোগ: ফোন: ০১৭১৭-২১২৩৯৪, ০১৭১৭-২১২৩৯৫। ঠিকানা: চাইল্ড কেয়ার একাডেমি, ভিটিদাউদপুর, মুকুন্দপুর, বিজয়নগর, ব্রাহ্মণবাড়িয়া।
- আচরণ: খুব নম্র এবং পেশাদার ভাষায় কথা বলবে। কাস্টমারের সমস্যার কথা মন দিয়ে শুনবে এবং তাকে ভরসা দেবে যে হোমিও চিকিৎসার মাধ্যমে এসব রোগের স্থায়ী সমাধান সম্ভব।
- অভিবাদন (Greetings): কাস্টমার যদি মুসলিম মনে হয়, তবে শুরুতে 'আসসালামু আলাইকুম' বলবে। যদি কাস্টমার হিন্দু মনে হয়, তবে 'নমস্কার' দেবে।
`;

// ==========================================
// 1. Webhook Verification
// ==========================================
app.get('/webhook', (req, res) => {
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

// ==========================================
// 2. Receive Messages
// ==========================================
app.post('/webhook', async (req, res) => {
    let body = req.body;

    if (body.object === 'page') {
        res.status(200).send('EVENT_RECEIVED');

        for (let entry of body.entry) {
            let webhook_event = entry.messaging[0];
            let sender_psid = webhook_event.sender.id;

            if (webhook_event.message && webhook_event.message.text) {
                let text = webhook_event.message.text;
                await handleMessage(sender_psid, text);
            }
        }
    } else {
        res.sendStatus(404);
    }
});

// ==========================================
// 3. Process with AI and Send Reply
// ==========================================
async function handleMessage(sender_psid, received_message) {
    let aiReply = "দুঃখিত, আমি এই মুহূর্তে উত্তর দিতে পারছি না। একটু পরে আবার চেষ্টা করুন।";

    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            systemInstruction: SYSTEM_PROMPT 
        });

        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ];

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: received_message }] }],
            safetySettings: safetySettings
        });

        const response = await result.response;
        aiReply = response.text();
        
    } catch (error) {
        console.error("Error generating AI response:", error);
        if (error.message && error.message.includes('SAFETY')) {
            aiReply = "আপনার এই সমস্যাটি নিয়ে আমাদের এখানে সফল চিকিৎসা রয়েছে। বিস্তারিত জানতে সরাসরি আমাদের চেম্বারে আসতে পারেন অথবা ফোন করতে পারেন: ০১৭১৭-২১২৩৯৪।";
        }
    }

    callSendAPI(sender_psid, { "text": aiReply });
}

function callSendAPI(sender_psid, response) {
    let request_body = {
        "recipient": { "id": sender_psid },
        "message": response
    };

    axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, request_body)
        .catch(err => {
            console.error('Unable to send message:', err.response ? err.response.data : err.message);
        });
}

app.listen(PORT, () => {
    console.log(`Webhook server is listening on port ${PORT}`);
});
