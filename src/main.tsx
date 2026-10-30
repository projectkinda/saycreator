import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/home.css';
import './styles/videos.css';
import './styles/capture.css';
import './styles/workspace.css';
import './styles/images.css';
import './styles/assets.css';
import './styles/calendar.css';
import './styles/branding.css';
import './styles/analytics.css';
import './styles/settings.css';
import './styles/help.css';
import './styles/refresh.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
