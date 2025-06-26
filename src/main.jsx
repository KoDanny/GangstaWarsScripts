import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { arr, foo } from './module1.js';

const root = document.createElement('div');
root.id = 'react';
document.body.appendChild(root);

const getRoot = () =>
	createRoot(document.querySelector('#react')).render(
		<StrictMode>
			<App></App>
			{console.log('TEST')}
			{console.log('TEST31000')}
		</StrictMode>
	);
const permission = null;

const uniqKey = Symbol('Bonanno');
window.getUniqueBananaKey = () => uniqKey;
console.log();
window[uniqKey] = () => ({
	foo: foo(arr),
	getRoot,
});

console.log(window[uniqKey]);
