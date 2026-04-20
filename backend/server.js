const express = require('express');
// Trigger restart for MongoDB recovery
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Groq = require('groq-sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5005;

app.use(cors({
  origin: "https://vocaicare.netlify.app",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    tls: true,
    tlsAllowInvalidCertificates: true
})
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

const Patient = require('./models/Patient');
const Consultation = require('./models/Consultation');

// --- API ENDPOINTS ---

app.post('/api/patient', async (req, res) => {
    try {
        const { patientId, isNewPatient, name } = req.body;
        if (isNewPatient) {
            const newId = Math.floor(100000 + Math.random() * 900000).toString();
            const newPatient = new Patient({ patientId: newId, name: name || 'Unknown Patient' });
            await newPatient.save();
            return res.json({ success: true, patient: newPatient, message: `New patient created with ID ${newId}` });
        } else {
            const patient = await Patient.findOne({ patientId });
            if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });
            const history = await Consultation.find({ patientId }).sort({ date: -1 });
            return res.json({ success: true, patient, history, message: `Welcome back` });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/patient/:id', async (req, res) => {
    try {
        const patient = await Patient.findOne({ patientId: req.params.id });
        if (!patient) return res.status(404).json({ message: 'Not found' });
        const history = await Consultation.find({ patientId: req.params.id }).sort({ date: -1 });
        res.json({ patient, history });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1. LIVE Audio Streaming Endpoint (No Final DB Savings here)
app.post('/api/consultation/transcribe_chunk', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file || !process.env.GROQ_API_KEY) {
            return res.status(400).json({ error: 'Missing audio or GROQ_API_KEY' });
        }

        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const tempFilePath = path.join(os.tmpdir(), `audio-chunk-${Date.now()}.webm`);
        fs.writeFileSync(tempFilePath, req.file.buffer);

        // Low temperature prevents AI hallucination on silent background noise
        const transcriptionRes = await groq.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: "whisper-large-v3",
            prompt: "డాక్టర్, ഡോക്ടർ, டாக்டர், ਡਾਕਟਰ, मरीज, डॉक्टर, तपासणी, blood pressure, fever.",
            temperature: 0.0,
            response_format: "verbose_json"
        });

        fs.unlinkSync(tempFilePath);
        
        let text = transcriptionRes.text.trim();
        
        // Anti-hallucination standard filters for silence chunks
        const nullPhrases = ['thanks for watching', 'thank you', 'subtitles', 'amara.org', 'मरीज', 'डॉक्टर', 'तपासणी', 'డాక్టర్', 'டாக்டர்'];
        if (nullPhrases.some(phrase => text.toLowerCase().includes(phrase)) && text.length < 50) {
            text = "";
        }

        res.json({ text, language: transcriptionRes.language });

    } catch (err) {
        console.error("Chunk Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Final Analysis Endpoint (Takes the Live Transcript fully populated)
app.post('/api/consultation/analyze_discussion', async (req, res) => {
    try {
        const { patientId, transcriptText } = req.body;
        
        if (!transcriptText || !process.env.GROQ_API_KEY) {
            return res.status(400).json({ error: 'Missing transcript data' });
        }

        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        
        const prompt = `You are a professional Medical AI Scribe.
I have a passively recorded RAW live transcript from a consultation between a primary Doctor and Patient.
The conversation dynamically features deep code-switching across various Pan-Indian spoken languages (e.g. Hindi, Marathi, Telugu, Tamil, Malayalam, Punjabi, Gujarati, etc.).

RAW LIVE TRANSCRIPT SUBTITLES:
"${transcriptText}"

Task:
1. Reconstruct the chaotic raw transcript into an array of strictly bifurcated back-and-forth chat (chatLog). Extract who is contextually speaking (Doctor vs Patient).
2. Create an "englishReport" formatting their concerns precisely into English.
3. Create a "nativeReport" strictly localized/translated entirely into the SPECIFIC dominant native language/alphabet the patient was speaking for their personal ease.

Output ONLY A RAW JSON OBJECT below matching the exact schema properties:
{
  "language": "identified spoken language",
  "chatLog": [
       { "role": "Doctor", "text": "..." },
       { "role": "Patient", "text": "..." }
  ],
  "englishReport": { "symptoms": ["..."], "diagnosis": "...", "prescription": "..." },
  "nativeReport": { "symptoms": ["...", "..."], "diagnosis": "...", "prescription": "..." }
}`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "system", content: prompt }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        const responseJson = JSON.parse(chatCompletion.choices[0]?.message?.content);

        const newConsultation = new Consultation({
            patientId,
            transcription: transcriptText,
            language: responseJson.language || "hi",
            chatLog: responseJson.chatLog || [],
            englishReport: responseJson.englishReport || {},
            nativeReport: responseJson.nativeReport || {}
        });
        await newConsultation.save();

        res.json({ success: true, ai_response: responseJson });

    } catch (err) {
        console.error("Analysis Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
