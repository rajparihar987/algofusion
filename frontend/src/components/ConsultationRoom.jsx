import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Mic, FileText, Activity, Clock, LogOut, Square, Download, MessageSquare, Radio } from 'lucide-react';
import html2pdf from 'html2pdf.js';

const ConsultationRoom = () => {
  const { patientId } = useParams();
  const navigate = useNavigate();
  
  const [patient, setPatient] = useState(null);
  const [history, setHistory] = useState([]);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [timer, setTimer] = useState(0);
  
  // Changed liveTranscript to handle a single evolving text block rather than map array
  const [liveTranscript, setLiveTranscript] = useState('');
  const [finalReport, setFinalReport] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  
  const nativeReportRef = useRef(null);
  const englishReportRef = useRef(null);

  useEffect(() => {
    fetchPatientData();
    setupAudioRecording();
    return () => clearInterval(timerRef.current);
  }, [patientId]);

  const fetchPatientData = async () => {
    try {
      const res = await axios.get(`http://localhost:5005/api/patient/${patientId}`);
      setPatient(res.data.patient);
      setHistory(res.data.history || []);
    } catch(err) {
      console.error(err);
      navigate('/');
    }
  };

  const setupAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      // Triggered every N milliseconds (timeslice)
      mediaRecorderRef.current.ondataavailable = async (event) => {
        if (event.data.size > 0) {
           // We push into array to build the continuous WebM file
           audioChunksRef.current.push(event.data);
           await processAccumulatedAudio();
        }
      };

    } catch (err) {
      console.error("Audio permission error: ", err);
      alert("Microphone permission denied. Cannot record audio.");
    }
  };

  // Process the cumulative WebM blob every few seconds
  const processAccumulatedAudio = async () => {
      try {
          // Creates a perfectly playable combined blob matching all past+current chunks!
          const currentAudioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('audio', currentAudioBlob, 'accumulated.webm');
          
          const res = await axios.post('http://localhost:5005/api/consultation/transcribe_chunk', formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
          });

          const { text } = res.data;
          
          if (text && text.trim().length > 0) {
              setLiveTranscript(text);
          }
      } catch (err) {
          console.error("Live processing error: ", err);
      }
  };

  const startSession = () => {
    if (!mediaRecorderRef.current) return;
    
    setFinalReport(null);
    setLiveTranscript('');
    audioChunksRef.current = [];
    
    // Start pushing accumulating chunks every 5000ms natively.
    mediaRecorderRef.current.start(5000);
    setIsRecording(true);
    setTimer(0);
    
    timerRef.current = setInterval(() => {
        setTimer(prev => prev + 1);
    }, 1000);
  };

  const endSession = async () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    
    // Stop implicitly calls ondataavailable one last time for final trailing bytes
    mediaRecorderRef.current.stop();
    setIsRecording(false);
    clearInterval(timerRef.current);
    
    setIsProcessing(true);

    // Give it 2.5 seconds to await the final processAccumulatedAudio Promise
    setTimeout(() => {
        finalizeConsultationReport();
    }, 2500);
  };

  // Pulls the latest fully translated transcript string
  const finalizeConsultationReport = async () => {
      setLiveTranscript((currentFullTranscript) => {
          
          axios.post('http://localhost:5005/api/consultation/analyze_discussion', { 
              patientId, 
              transcriptText: currentFullTranscript 
          })
          .then(res => {
             const { ai_response } = res.data;
             setFinalReport({
                english: ai_response.englishReport,
                native: ai_response.nativeReport,
                chatLog: ai_response.chatLog,
                transcription: currentFullTranscript
             });
             fetchPatientData();
          })
          .catch(err => {
             console.error("Bifurcation Failed", err);
             alert("AI Processing failed: " + (err.response?.data?.error || err.message));
          })
          .finally(() => {
             setIsProcessing(false);
          });
          
          return currentFullTranscript;
      });
  };

  const formatTime = (secs) => {
      const mins = Math.floor(secs / 60);
      const remainingSecs = secs % 60;
      return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  const downloadPDF = (lang) => {
      const element = lang === 'english' ? englishReportRef.current : nativeReportRef.current;
      const opt = {
        margin:       1,
        filename:     `Diagnosis_${patientId}_${lang.toUpperCase()}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
      };
      html2pdf().set(opt).from(element).save();
  };

  const transcriptEndRef = useRef(null);
  useEffect(() => {
      if (transcriptEndRef.current) {
          transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
  }, [liveTranscript]);

  return (
    <div>
      <div className="navbar" style={{ paddingBottom: '1rem', borderBottom: 'none' }}>
         <div className="flex-row">
            <h2>Patient: <span style={{ color: 'var(--secondary-color)' }}>{patient?.name}</span></h2>
            <span className="tag">ID: {patientId}</span>
         </div>
         <button className="btn btn-outline" onClick={() => navigate('/')}><LogOut size={16}/> Leave Room</button>
      </div>

      <div className="dashboard-grid">
        <div className="glass-panel flex-col" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="flex-row" style={{ justifyContent: 'space-between' }}>
             <h3><Activity size={20} style={{ display: 'inline', marginRight: '8px' }}/> Ambient AI Scribe</h3>
             {isRecording && <div className="listening-indicator" style={{ background: 'var(--danger)'}}></div>}
          </div>
          
          <div style={{ 
              flex: 1, 
              background: 'rgba(0,0,0,0.3)', 
              borderRadius: '12px', 
              padding: '1.5rem',
              height: '400px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: isRecording ? 'inset 0 0 15px rgba(255, 68, 68, 0.2)' : 'none',
              border: isRecording ? '1px solid var(--danger)' : '1px solid rgba(255,255,255,0.1)',
              transition: 'all 0.3s',
              overflow: 'hidden'
           }}>
             
             {!isRecording && !isProcessing && !finalReport && (
                <div style={{ margin: 'auto', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)' }}>
                      Record a multi-lingual session. Subtitles will flawlessly **Stream Live** here while you talk!
                    </p>
                </div>
             )}

             {isRecording && (
                <div className="flex-row" style={{ justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px', marginBottom: '10px' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)' }}>
                         <Radio size={20} className="pulse" /> <span style={{ fontWeight: 600 }}>LIVE SUBTITLES</span>
                     </div>
                     <span style={{ fontWeight: 'bold' }}>{formatTime(timer)}</span>
                </div>
             )}

             {isProcessing && (
                <div style={{ margin: 'auto', textAlign: 'center' }}>
                   <div className="listening-indicator" style={{ background: 'var(--secondary-color)', width: '40px', height: '40px', margin: 'auto' }}></div>
                   <p style={{ color: 'var(--text-light)', marginTop: '20px' }}>Analyzing transcript and building bifurcated chat...</p>
                </div>
             )}

             {/* Live Subtitle Transcript Scroll Area */}
             {isRecording && (
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {!liveTranscript ? (
                        <p style={{fontStyle: 'italic', color: '#666'}}>Listening...</p>
                    ) : (
                        <div style={{ padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '2px solid var(--accent-color)' }}>
                            {liveTranscript}
                        </div>
                    )}
                    <div ref={transcriptEndRef} />
                </div>
             )}

             {/* Final Bifurcated Chat UI */}
             {finalReport && !isRecording && !isProcessing && (
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }}>
                    <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '0.5rem', marginBottom: '1rem', color: 'var(--accent-color)' }}><MessageSquare size={18} style={{display:'inline'}}/> Final Bifurcated Dialogue</h3>
                    {finalReport.chatLog && finalReport.chatLog.map((chat, idx) => (
                       <div key={idx} style={{ 
                           alignSelf: chat.role.toLowerCase() === 'doctor' ? 'flex-end' : 'flex-start',
                           background: chat.role.toLowerCase() === 'doctor' ? 'var(--secondary-color)' : 'rgba(255,255,255,0.1)',
                           padding: '0.8rem 1.2rem',
                           borderRadius: chat.role.toLowerCase() === 'doctor' ? '18px 18px 0px 18px' : '18px 18px 18px 0px',
                           maxWidth: '100%',
                           marginBottom: '1rem'
                       }}>
                          <strong style={{ display: 'block', fontSize: '0.8rem', opacity: 0.7, marginBottom: '4px' }}>
                             {chat.role}
                          </strong>
                          {chat.text}
                       </div>
                    ))}
                    {(!finalReport.chatLog || finalReport.chatLog.length === 0) && (
                        <p style={{color: 'var(--text-muted)'}}>No bifurcated discussion could be derived.</p>
                    )}
                </div>
             )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
             {!isRecording ? (
                <button 
                  className="btn btn-primary" 
                  onClick={startSession}
                  disabled={isProcessing}
                  style={{ width: '100%', padding: '1.2rem', gap: '10px' }}
                >
                  <Mic size={20} /> Record Consultation
                </button>
             ) : (
                <button 
                  className="btn btn-danger" 
                  onClick={endSession}
                  style={{ width: '100%', padding: '1.2rem', gap: '10px' }}
                >
                  <Square size={20} fill="currentColor" /> End Stream & Process
                </button>
             )}
          </div>
        </div>

        <div className="flex-col" style={{ gap: '2rem' }}>
           <div className="glass-panel" style={{ flex: 1 }}>
              <h3><FileText size={20} style={{ display: 'inline', marginRight: '8px' }}/> Useful Diagnostics Insight</h3>
              
              {!finalReport ? (
                 <p style={{ color: 'var(--text-muted)' }}>The seamlessly extracted dual-language prescription will generate here after the session is stopped.</p>
              ) : (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '1rem' }}>
                    
                    {/* Native Report Side */}
                    <div style={{ borderLeft: '3px solid var(--accent-color)', paddingLeft: '1rem', position: 'relative' }}>
                       <button onClick={() => downloadPDF('native')} className="btn btn-outline" style={{ position: 'absolute', right: 0, top: 0, padding: '0.4rem' }}><Download size={16} /></button>
                       <div ref={nativeReportRef} style={{ padding: '0.5rem', background: 'var(--bg-dark)'}}>
                           <h2 style={{ color: '#00ffcc', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>Medical Report</h2>
                           <h4 style={{ color: '#fff', marginTop: '1rem' }}>Patient: {patient?.name} (ID: {patientId})</h4>
                           <div style={{ marginTop: '0.5rem' }}>
                              <p><strong>Diagnosis:</strong> {finalReport.native.diagnosis}</p>
                              <p style={{ marginTop: '0.5rem' }}><strong>Symptoms:</strong> {finalReport.native.symptoms?.join(', ')}</p>
                              <div style={{ background: 'rgba(0,255,204,0.05)', padding: '1rem', borderRadius: '8px', marginTop: '0.5rem' }}>
                                 <p><strong>Prescription Instructions:</strong></p>
                                 <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'Inter', color: '#ccc' }}>{finalReport.native.prescription}</pre>
                              </div>
                           </div>
                       </div>
                    </div>

                    {/* English Report Side */}
                    <div style={{ borderLeft: '3px solid var(--secondary-color)', paddingLeft: '1rem', position: 'relative' }}>
                       <button onClick={() => downloadPDF('english')} className="btn btn-outline" style={{ position: 'absolute', right: 0, top: 0, padding: '0.4rem' }}><Download size={16} /></button>
                       <div ref={englishReportRef} style={{ padding: '0.5rem', background: 'var(--bg-dark)'}}>
                           <h2 style={{ color: '#2e9cca', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>Clinical Report</h2>
                           <h4 style={{ color: '#fff', marginTop: '1rem' }}>Patient: {patient?.name} (ID: {patientId})</h4>
                           <div style={{ marginTop: '0.5rem' }}>
                              <p><strong>Diagnosis:</strong> {finalReport.english.diagnosis}</p>
                              <p style={{ marginTop: '0.5rem' }}><strong>Symptoms:</strong> {finalReport.english.symptoms?.join(', ')}</p>
                              <div style={{ background: 'rgba(46,156,202,0.05)', padding: '1rem', borderRadius: '8px', marginTop: '0.5rem' }}>
                                 <p><strong>Prescription:</strong></p>
                                 <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'Inter', color: '#ccc' }}>{finalReport.english.prescription}</pre>
                              </div>
                           </div>
                       </div>
                    </div>

                 </div>
              )}
           </div>

           <div className="glass-panel">
              <h3><Clock size={20} style={{ display: 'inline', marginRight: '8px' }}/> Past Consultations</h3>
              {history.length === 0 ? (
                 <p style={{ color: 'var(--text-muted)' }}>No past visits recorded.</p>
              ) : (
                 <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                    {history.map((hist, idx) => (
                       <div key={idx} style={{ 
                          padding: '1rem', 
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          marginBottom: '0.5rem'
                       }}>
                          <span className="tag">{new Date(hist.date).toLocaleDateString()}</span>
                          <strong>{hist.englishReport?.diagnosis || 'Historical Consultation'}</strong>
                       </div>
                    ))}
                 </div>
              )}
           </div>

        </div>
      </div>
    </div>
  );
};

export default ConsultationRoom;
