import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/sora/400.css';
import '@fontsource/sora/500.css';
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import { App } from './App';
import './index.css';

// No page-level zoom/scale: render at the browser's natural 1:1 size. The shell is
// `position:fixed; inset:0` + flex, so it fills the window exactly at any size. (CSS
// `zoom` on the root breaks this — a fixed element is sized in the zoomed coordinate
// space but not scaled back up, leaving a gap on the right — so we don't use it.)

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
