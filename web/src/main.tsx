import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from '@/lib/i18n';
import './index.css';
import {initializeMonitoring} from './monitoring/runtime';
import {MonitoringErrorBoundary} from './monitoring/ErrorBoundary';

initializeMonitoring();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MonitoringErrorBoundary>
    <I18nProvider>
      <App />
    </I18nProvider>
    </MonitoringErrorBoundary>
  </StrictMode>
);
