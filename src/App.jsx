import { useEffect, useState } from 'react';
import styles from './App.module.css';

function App() {
	const [count, setCount] = useState(0);

	useEffect(() => {
		setInterval(() => {
			setCount((prev) => prev + 1);
		}, 1000);
	}, []);

	return <div className={styles.app}>Компонент на React. Счетчик: {count}</div>;
}

export default App;
