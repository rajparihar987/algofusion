import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Mic, UserPlus, LogIn, Volume2 } from 'lucide-react';

const Reception = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [systemMessage, setSystemMessage] = useState('Welcome to VocaiCare. Are you a new or returning patient?');
  const [patientId, setPatientId] = useState('');
  const [newPatientName, setNewPatientName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [askingForName, setAskingForName] = useState(false);
  
  const navigate = useNavigate();
  const recognitionRef = useRef(null);

  useEffect(() => {
    // Speak welcome message
    speak(systemMessage);
    
    // Setup Speech Recognition
    if ('webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-IN'; 

      recognitionRef.current.onresult = (event) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        processReceptionInput(transcript);
      };
    } else {
      setSystemMessage("Your browser doesn't support speech recognition.");
    }
  }, [transcript]);

  const speak = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-IN';
      window.speechSynthesis.speak(utterance);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setTranscript('');
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const processReceptionInput = async (text) => {
    if (!text) return;
    const lowerText = text.toLowerCase();
    
    try {
      if (askingForName) {
         setSystemMessage(`Creating record for ${text}...`);
         speak(`Creating record for ${text}...`);
         setIsProcessing(true);
         const res = await axios.post('http://localhost:5005/api/patient', { isNewPatient: true, name: text });
         const newId = res.data.patient.patientId;
         setSystemMessage(`Your new Patient ID is ${newId}. Transferring you to consultation.`);
         speak(`Your new Patient ID is ${newId}. Please proceed to the doctor.`);
         setTimeout(() => navigate(`/consultation/${newId}`), 3500);
         setAskingForName(false);
         return;
      }

      if (lowerText.includes('new')) {
        setSystemMessage("Please say your full name.");
        speak("Please state your full name.");
        setAskingForName(true);
        // automatically restart listening after TTS
        setTimeout(() => {
            if (recognitionRef.current) {
                setTranscript('');
                recognitionRef.current.start();
                setIsListening(true);
            }
        }, 2000);

      } else if (lowerText.match(/\d{6}/)) {
        // Extract 6 digit ID
        const matchedId = lowerText.match(/\d{6}/)[0];
        setSystemMessage(`Checking records for ID ${matchedId}...`);
        speak("Checking your records.");
        setIsProcessing(true);
        
        const res = await axios.post('http://localhost:5005/api/patient', { isNewPatient: false, patientId: matchedId });
        
        if (res.data.success) {
          setSystemMessage(`Records found for ${res.data.patient.name}. Proceeding to consultation.`);
          speak(`Welcome back, ${res.data.patient.name}. Please proceed to the doctor.`);
          setTimeout(() => navigate(`/consultation/${matchedId}`), 3000);
        }

      } else {
        setSystemMessage("I didn't catch that. Say 'new patient' or say your 6-digit patient ID.");
        speak("I didn't catch that. Say new patient, or state your six digit patient ID.");
      }
    } catch (err) {
      console.error(err);
      setSystemMessage("Sorry, there was an error connecting to our system.");
      speak("Sorry, there was a system error.");
    } finally {
      setIsProcessing(false);
    }
  };

  const manualCheckIn = async (isNew) => {
    try {
      setIsProcessing(true);
      if (isNew) {
         if (!newPatientName.trim()) {
            setSystemMessage("Please enter a name first.");
            setIsProcessing(false);
            return;
         }
         setSystemMessage("Creating manual record...");
         const res = await axios.post('http://localhost:5005/api/patient', { isNewPatient: true, name: newPatientName });
         const newId = res.data.patient.patientId;
         navigate(`/consultation/${newId}`);
      } else {
         if (!patientId || patientId.length !== 6) {
             setSystemMessage("Please enter a valid 6-digit ID");
             setIsProcessing(false);
             return;
         }
         const res = await axios.post('http://localhost:5005/api/patient', { isNewPatient: false, patientId });
         if (res.data.success) {
            navigate(`/consultation/${patientId}`);
         }
      }
    } catch(err) {
       setSystemMessage("Patient ID not found or server error.");
       setIsProcessing(false);
    }
  };

  return (
    <div className="dashboard-grid">
      <div className="glass-panel flex-col" style={{ justifyContent: 'center' }}>
        <h1 className="gradient-text">Reception Desk</h1>
        <p className="subtitle">Voice AI Patient Intake System</p>
        
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <div style={{ minHeight: '80px', marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--accent-color)' }}>{systemMessage}</h3>
            {transcript && <p style={{ fontStyle: 'italic', opacity: 0.8 }}>"{transcript}"</p>}
          </div>

          <button 
            className={`btn ${isListening ? 'btn-danger' : 'btn-primary'}`} 
            onClick={toggleListening}
            style={{ padding: '1.5rem', borderRadius: '50%' }}
            disabled={isProcessing}
          >
            {isListening ? (
               <div className="listening-indicator"></div>
            ) : (
               <Mic size={32} />
            )}
          </button>
          <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>
            {isListening ? 'Listening...' : 'Tap to speak'}
          </p>
        </div>
      </div>

      <div className="glass-panel flex-col">
        <h2>Manual Override</h2>
        <p className="subtitle">If voice intake fails, use this panel.</p>
        
        <div style={{ marginTop: '2rem' }}>
          <h3>Existing Patient</h3>
          <div className="flex-row" style={{ marginTop: '1rem' }}>
            <input 
              type="text" 
              placeholder="Enter 6-digit Patient ID" 
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              maxLength={6}
              disabled={isProcessing}
              style={{ marginBottom: '0' }}
            />
            <button className="btn btn-outline" onClick={() => manualCheckIn(false)} disabled={isProcessing}>
              <LogIn size={20} /> Login
            </button>
          </div>
        </div>

        <div style={{ marginTop: '3rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2rem' }}>
           <h3>Register New Profile</h3>
           <div className="flex-col" style={{ gap: '1rem', marginTop: '1rem' }}>
              <input 
                type="text" 
                placeholder="Enter Patient Full Name" 
                value={newPatientName}
                onChange={(e) => setNewPatientName(e.target.value)}
                disabled={isProcessing}
                style={{ marginBottom: '0' }}
              />
              <button className="btn btn-primary" onClick={() => manualCheckIn(true)} disabled={isProcessing}>
                  <UserPlus size={20} /> Create New Profile
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Reception;
