import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';

// Module-level boot stamp — survives React re-renders and StrictMode remounts
// but resets on every full browser/Vite page reload. Displayed on Login so we
// can confirm whether a blank = React cycle (stamp stays) or full reload (stamp changes).
window.__DL_BOOT__ = window.__DL_BOOT__ || new Date().toLocaleTimeString();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
