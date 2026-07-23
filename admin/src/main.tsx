import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../src/index.css';
import AdminApp from './AdminApp';

ReactDOM.createRoot(document.getElementById('admin-root')!).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>
);
