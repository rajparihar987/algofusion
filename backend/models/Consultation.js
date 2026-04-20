const mongoose = require('mongoose');

const medicalReportSchema = new mongoose.Schema({
    symptoms: [String],
    diagnosis: String,
    prescription: String
}, { _id: false });

const consultationSchema = new mongoose.Schema({
    patientId: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    transcription: String,
    language: String,
    chatLog: [{
        role: String,
        text: String
    }],
    englishReport: medicalReportSchema,
    nativeReport: medicalReportSchema
});

module.exports = mongoose.model('Consultation', consultationSchema);
