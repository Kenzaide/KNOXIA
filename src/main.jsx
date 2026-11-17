import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { MaterialsProvider } from './materials.jsx';
import './index.css';
import './profile.css'; // loaded after index.css so its rules win ties
import './reviewer.css';
import './fc.css'; // flashcards and quizzes
import './quiz.css'; // quiz taking and results (Patches 13 and 14)
import './progress.css'; // study progress (Patch 15)
import './friends.css'; // friends (Patch 16)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><BrowserRouter><MaterialsProvider><App /></MaterialsProvider></BrowserRouter></React.StrictMode>
);
