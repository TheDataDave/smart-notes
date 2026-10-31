import React from 'react';
import ReactDOM from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles.css';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);