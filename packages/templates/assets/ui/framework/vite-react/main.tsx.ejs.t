---
to: src/main.tsx
---
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './providers/Root';
import { App } from './App';
import './globals.css';

const container = document.getElementById('root');
// A missing #root means index.html and this file disagree. Failing with that sentence beats
// "Cannot read properties of null", which sends you looking at React instead of the HTML.
if (!container) throw new Error('No #root element found in index.html.');

createRoot(container).render(
  <StrictMode>
    <Root>
      <App />
    </Root>
  </StrictMode>,
);
