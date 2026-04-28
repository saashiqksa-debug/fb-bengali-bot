require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// মেমরি (Conversation History) স্টোর করার জন্য Map এবং ফাইল সিস্টেম (রিস্টার্ট দিলেও মুছবে না)
const SESSION_FILE = path.join(__dirname, 'sessions.json');
let userSessions = new Map();

// সার্ভার অন হওয়ার সময় আগের মেমরি লোড করা
if (fs.existsSync(SESSION_FILE)) {
    try {
        const data = fs.readFileSync(SESSION_FILE, 'utf-8');
        userSessions = new Map(Object.entries(JSON.parse(data)));
    } catch (e) { console.error("Session load error", e); }
}

function saveSessions() {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(Object.fromEntries(userSessions)), 'utf-8');
}

// System Prompt for Gemini
const SYSTEM_PROMPT = `
তুমি হলে 'Rahmania Homeo' (রহমানিয়া হোমিও) এর একজন হেল্পফুল, স্মার্ট এবং প্রফেশনাল কাস্টমার সার্ভিস অ্যাসিস্ট্যান্ট। তুমি হুবহু আমার (মালিকের/অ্যাসিস্ট্যান্টের) মতো করে কথা বলবে। 
তোমার কাছে চেম্বারের সব ধরনের তথ্য আছে এবং তুমি যেকোনো প্রশ্নের উত্তর খুব সুন্দর ও গুছিয়ে দিতে পারো।

১. ডাক্তার পরিচিতি: 
আমাদের প্রধান ডাক্তার হলেন ডাঃ রোকেয়া বেগম (D.H.M.S, ঢাকা)। তিনি অত্যন্ত অভিজ্ঞ।

২. চেম্বারের সময়সূচী (Schedule & Appointments):
- রোগী দেখার সময়: প্রতিদিন বিকাল ৪টা থেকে রাত ৮টা পর্যন্ত।
- বন্ধের দিন: প্রতি সপ্তাহে শুক্রবার চেম্বার বন্ধ থাকে।
- সিরিয়াল নেওয়ার নিয়ম: চেম্বারে আসার আগে অবশ্যই ফোন করে সিরিয়াল নিতে হবে।

৩. চেম্বারের লোকেশন ও যাতায়াত (Location & Directions):
- ঠিকানা: চাইল্ড কেয়ার একাডেমি, ভিটিদাউদপুর, মুকুন্দপুর, বিজয়নগর, ব্রাহ্মণবাড়িয়া।
- কীভাবে আসবেন: দূর থেকে আসতে চাইলে চান্দুরা থেকে বিজয়নগর আউলিবাজার হয়ে ভিটিদাউদপুর আসতে পারবেন, অথবা চম্পকনগর হয়েও ভিটিদাউদপুর আসতে পারবেন (অটো বা CNG করে)।

৪. চিকিৎসা ও সেবা (Services):
ডায়াবেটিস, অর্শ্ব (Piles), ভগন্দর (Fistula), জন্ডিস, পলিপাস, কিডনী পাথর, পিত্তপাথর, স্তন ক্যান্সার, জরায়ু ক্যান্সার, টিউমার, হার্নিয়া, টনসিল, আঁচিল, বাত-ব্যথা, যৌন সমস্যা এবং চর্মরোগসহ সকল প্রকার নতুন ও পুরাতন রোগের সফল চিকিৎসা দেওয়া হয়।

৫. যোগাযোগ (Contact):
ফোন: ০১৭১৭-২১২৩৯৪, ০১৭১৭-২১২৩৯৫।

৬. আচরণ ও কথা বলার ধরন (Persona & Tone):
- কাস্টমারের সাথে খুব নম্র, পেশাদার এবং আপন মানুষের মতো কথা বলবে।
- কাস্টমারের সমস্যার কথা মন দিয়ে শুনবে এবং তাকে ভরসা দেবে যে হোমিও চিকিৎসার মাধ্যমে এসব রোগের স্থায়ী সমাধান সম্ভব।
- অভিবাদন: কাস্টমার সালাম দিলে উত্তর নেবে, আর নিজে থেকে কথা শুরু করার সময় সময়োপযোগী অভিবাদন জানাবে।
- উত্তরগুলো ছোট, স্পষ্ট এবং সরাসরি হবে।

৭. ছবি পাঠানো (Sending Images):
যদি কাস্টমার চেম্বারের ছবি, ওষুধের ছবি বা কোনো চিকিৎসা সম্পর্কিত ছবি দেখতে চায়, তাহলে তুমি উত্তরের সাথে নিচে দেওয়া ফরম্যাটে ছবির লিংক পাঠিয়ে দেবে।
- চেম্বারের ছবির জন্য: [IMG:https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=600&q=80]
- হোমিও ঔষধ বা চিকিৎসার ছবির জন্য: [IMG:https://images.unsplash.com/photo-1585435557343-3b092031a831?w=600&q=80]

৮. অটোমেটিক অ্যাপয়েন্টমেন্ট বুকিং (Auto Appointment Booking):
কেউ যদি চেম্বারে আসার জন্য বা অনলাইনে দেখানোর জন্য সিরিয়াল নিতে চায়, তাহলে তার কাছ থেকে ৪টি তথ্য নেবে: ১. রোগীর নাম, ২. বয়স, ৩. মোবাইল নম্বর, ৪. কবে দেখাতে চায় (তারিখ)। 
সব তথ্য পাওয়া হয়ে গেলে তুমি কাস্টমারকে নিশ্চিত করবে যে সিরিয়াল নেওয়া হয়েছে এবং তোমার উত্তরের শেষে একদম ঠিক এই ফরম্যাটে ট্যাগটি বসিয়ে দেবে (যাতে গুগল শিটে বয়স এবং ধরন সেভ হয়): 
[BOOK:রোগীর_নাম (বয়স)|মোবাইল_নম্বর|তারিখ (চেম্বার বা অনলাইন)] 
যেমন: [BOOK:রহিম (২৫ বছর)|01711223344|আগামীকাল (অনলাইন)]

৯. অনলাইন সেবা / টেলিমেডিসিন (Online Consultation):
- আমাদের অনলাইন সেবাও (টেলিমেডিসিন) চালু আছে। রোগীরা চাইলে সরাসরি চেম্বারে না এসে অনলাইনেই ভিডিও/অডিও কলে ডাক্তারের পরামর্শ নিতে পারেন।
- কেউ অনলাইনে ডাক্তার দেখাতে চাইলে, প্রথমে তার কাছ থেকে সাধারণ তথ্যগুলো (নাম, বয়স, সমস্যার বিবরণ এবং মোবাইল নম্বর) সংগ্রহ করে নেবে।
- সব তথ্য নেওয়া হলে তাকে সিরিয়াল কনফার্ম করার জন্য জানাবে যে: "আপনার বিস্তারিত তথ্য আমি লিখে নিয়েছি। আপনার অনলাইন সিরিয়ালটি কনফার্ম করার জন্য ২০০ টাকা ফি প্রযোজ্য। আমাদের অফিশিয়াল বিকাশ নম্বর: +8801717212394 (এই নম্বরে সেন্ড মানি করুন)। টাকা পাঠানোর পর যে নম্বর থেকে পাঠিয়েছেন তার শেষের ৪টি সংখ্যা আমাকে একটু জানাবেন, তাহলে আমি আপনার সিরিয়ালটি কনফার্ম করে দেব।"
- কাস্টমার যখন বিকাশের শেষের ৪টি সংখ্যা দেবে, শুধুমাত্র তখনই তুমি সিরিয়ালটি কনফার্ম করবে এবং গুগল শিটে সেভ করার জন্য ট্যাগটি ব্যবহার করবে। 
- তখন ট্যাগটি লেখার সময় মোবাইল নম্বরের সাথে ব্র্যাকেটে বিকাশের নম্বরটিও লিখে দেবে। যেমন: [BOOK:রোগীর_নাম (বয়স)|মোবাইল_নম্বর (বিকাশ লাস্ট: ১২৩৪)|তারিখ (অনলাইন)]
- সতর্কতা: প্রথমেই ২০০ টাকা বা বিকাশের কথা বলবে না। প্রথমে তার সমস্যা শুনবে এবং রোগীর তথ্যগুলো নেবে, তারপর শেষের দিকে খুব নম্রভাবে ২০০ টাকা ফি এবং বিকাশ নম্বরের বিষয়টি জানাবে।
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
    // 1. Typing Indicator On (মানুষের মতো টাইপিং এনিমেশন দেখাবে)
    await sendTypingIndicator(sender_psid, 'typing_on');

    // 2. User History/Memory Manage (আগের কথা মনে রাখা)
    if (!userSessions.has(sender_psid)) {
        userSessions.set(sender_psid, []);
    }
    let history = userSessions.get(sender_psid);
    history.push({ role: "user", parts: [{ text: received_message }] });

    // শুধু শেষের ১০টি মেসেজ মনে রাখবে (মেমরি ওভারলোড না হওয়ার জন্য)
    if (history.length > 10) history.shift();
    saveSessions(); // ফাইলে সেভ করে রাখা যেন রিস্টার্ট দিলে না মুছে যায়

    let aiReply = "দুঃখিত, আমি এই মুহূর্তে উত্তর দিতে পারছি না। একটু পরে আবার চেষ্টা করুন।";

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // ইতিহাস ঠিক করা (যাতে পরপর দুটি user বা model মেসেজ না যায়)
        let safeHistory = [];
        for (let msg of history) {
            let clonedMsg = { role: msg.role, parts: [{ text: msg.parts[0].text }] };
            if (safeHistory.length === 0) {
                safeHistory.push(clonedMsg);
            } else {
                let lastMsg = safeHistory[safeHistory.length - 1];
                if (lastMsg.role === clonedMsg.role) {
                    lastMsg.parts[0].text += "\n" + clonedMsg.parts[0].text;
                } else {
                    safeHistory.push(clonedMsg);
                }
            }
        }

        // Gemini এর নিয়ম অনুযায়ী প্রথম মেসেজ অবশ্যই user এর হতে হবে
        if (safeHistory.length > 0 && safeHistory[0].role === 'model') {
            safeHistory.shift();
        }

        // ডাইনামিক কনটেক্সট (আগের কথা + নতুন কথা)
        let contents = [
            { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
            { role: "model", parts: [{ text: "জি, বলুন কীভাবে সাহায্য করতে পারি?" }] },
            ...safeHistory
        ];

        const result = await model.generateContent({
            contents: contents,
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ]
        });

        const response = await result.response;
        aiReply = response.text();

        // AI এর উত্তর মেমরিতে সেভ করা
        history.push({ role: "model", parts: [{ text: aiReply }] });
        saveSessions(); // আপডেট করা মেমরি ফাইলে সেভ করা
        
    } catch (error) {
        console.error("Error generating AI response:", error);
        aiReply = "আপনার স্বাস্থ্য সমস্যাটি নিয়ে আমি কথা বলতে পারছি না। তবে এটি নিয়ে চিন্তার কিছু নেই, আপনি সরাসরি আমাদের চেম্বারে এসে বা ফোনে কথা বলে বিশেষজ্ঞ পরামর্শ নিতে পারেন। ফোন: ০১৭১৭-২১২৩৯৪";
    }

    // 1. ছবির লিংক এক্সট্র্যাক্ট করা (Extract Image)
    let imageUrl = null;
    const imgRegex = /\[IMG:(.*?)\]/g;
    const matchImg = imgRegex.exec(aiReply);
    if (matchImg && matchImg[1]) {
        imageUrl = matchImg[1].trim();
        aiReply = aiReply.replace(matchImg[0], '').trim();
    }

    // 2. বুকিং ট্যাগ এক্সট্র্যাক্ট করা এবং ডাটাবেসে সেভ করা (Extract Booking & Save to Database)
    const bookRegex = /\[BOOK:(.*?)\|(.*?)\|(.*?)\]/g;
    const matchBook = bookRegex.exec(aiReply);
    if (matchBook) {
        let name = matchBook[1].trim();
        let phone = matchBook[2].trim();
        let date = matchBook[3].trim();
        
        saveAppointment(name, phone, date);
        aiReply = aiReply.replace(matchBook[0], '').trim(); // মূল টেক্সট থেকে বুকিং ট্যাগ মুছে ফেলা
    }

    // 3. Quick Replies (বাটন) তৈরি করা
    // কাস্টমারকে অপশন দেওয়ার জন্য আমরা কিছু কমন বাটন পাঠাবো
    let quickReplies = [
        { "content_type": "text", "title": "📅 অ্যাপয়েন্টমেন্ট", "payload": "APPOINTMENT" },
        { "content_type": "text", "title": "📍 লোকেশন", "payload": "LOCATION" },
        { "content_type": "text", "title": "📞 যোগাযোগ", "payload": "CONTACT" }
    ];

    // প্রথমে টেক্সট মেসেজ পাঠানো (সাথে Quick Replies বাটন)
    if (aiReply.length > 0) {
        await callSendAPI(sender_psid, { 
            "text": aiReply,
            "quick_replies": quickReplies 
        });
    }

    // এরপর ছবির অ্যাটাচমেন্ট পাঠানো
    if (imageUrl) {
        await callSendAPI(sender_psid, {
            "attachment": {
                "type": "image",
                "payload": {
                    "url": imageUrl,
                    "is_reusable": true
                }
            }
        });
    }
}

async function callSendAPI(sender_psid, response) {
    let request_body = {
        "recipient": { "id": sender_psid },
        "message": response
    };

    try {
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, request_body);
    } catch (err) {
        console.error('Unable to send message:', err.response ? err.response.data : err.message);
    }
}

// টাইপিং ইন্ডিকেটর পাঠানোর ফাংশন
async function sendTypingIndicator(sender_psid, action) {
    let request_body = {
        "recipient": { "id": sender_psid },
        "sender_action": action // 'typing_on' or 'typing_off'
    };
    try {
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, request_body);
    } catch (err) {
        console.error('Typing indicator error:', err.message);
    }
}

// অ্যাপয়েন্টমেন্ট সরাসরি Google Sheets এ সেভ করার ফাংশন
async function saveAppointment(name, phone, date) {
    const sheetUrl = process.env.GOOGLE_SHEET_URL;
    
    if (!sheetUrl) {
        console.error("আপনার .env ফাইলে GOOGLE_SHEET_URL দেওয়া নেই!");
        return;
    }
    
    const time = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
    const fullUrl = `${sheetUrl}?name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}&date=${encodeURIComponent(date)}&bookedAt=${encodeURIComponent(time)}`;
    
    try {
        await axios.get(fullUrl);
        console.log(`Successfully Saved to Google Sheets: ${name}, ${phone}, ${date}`);
    } catch (err) {
        console.error('Google Sheets Error:', err.message);
    }
}

app.listen(PORT, () => {
    console.log(`Webhook server is listening on port ${PORT}`);
});
