import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './lib/theme';
import App from './App';
import { AuthProvider, ToastProvider } from './lib/data';
import { MarketProvider } from './lib/market';
import { ConfirmProvider } from './ui/kit';
import './styles.css';
import './styles-v3.css';
import './styles-v4.css';
import './styles-v5.css';
import './styles-v6.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <MarketProvider>
            <App />
          </MarketProvider>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  </StrictMode>,
);
