import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { MaterialsProvider } from './materials.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><BrowserRouter><MaterialsProvider><App /></MaterialsProvider></BrowserRouter></React.StrictMode>
);
