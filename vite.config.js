import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), cssInjectedByJsPlugin()],
	build: {
		minify: false,
		outDir: 'build',
		rollupOptions: {
			input: 'src/main.jsx',
			output: {
				inlineDynamicImports: true,
				entryFileNames: `build.userscript.js`,
			},
			treeshake: true,
		},
	},

	server: {
		port: 3000, // порт для локальной разработки
		host: '0.0.0.0', // для доступа с других устройств
		proxy: {
			'*': {
				target: 'https://gwars.io',
				changeOrigin: true,
				secure: false,
			},
		},
	},
});
