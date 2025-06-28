import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';

const root = document.createElement('div');
root.id = 'react';

const container = document.querySelector('.gw-container');
console.log(container);
container.append(root);

createRoot(document.querySelector('#react')).render(<App />);

console.log(1);
