import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import Reception from './components/Reception';
import ConsultationRoom from './components/ConsultationRoom';

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <nav className="navbar">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <div className="logo">
              <Activity color="#00ffcc" size={32} />
              <span>Vocai</span>Care
            </div>
          </Link>
          <div className="flex-row">
            <span className="subtitle" style={{ margin: 0, fontSize: '0.9rem' }}>Smart Hospital Assistant</span>
          </div>
        </nav>

        <main>
          <Routes>
            <Route path="/" element={<Reception />} />
            <Route path="/consultation/:patientId" element={<ConsultationRoom />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
