// src/main.jsx — the entry point.
// This is the first JS that runs. Its only job: find the <div id="root"> in
// index.html and tell React to render our <App> component inside it.
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode is a dev-only helper that warns about common mistakes.
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
