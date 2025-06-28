import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { Module1 } from './index1.jsx';
import { Module2 } from './index2.jsx';

const root = document.createElement('div');
root.id = 'react';

const container = document.querySelector('.gw-container');
console.log(container);
container.append(root);

createRoot(document.querySelector('#react')).render(
	<>
		<Module1 />
		<Module2 />
		<App />
	</>
);
console.log(1);
console.log('WORK', 1);
