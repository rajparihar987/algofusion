const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
    patientId: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        default: 'Unknown Patient'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Patient', patientSchema);
