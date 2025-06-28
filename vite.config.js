import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), cssInjectedByJsPlugin()],
	// optimizeDeps: {
	// 	noDiscovery: true,
	// 	include: [],
	// },
	build: {
		minify: true,
		outDir: 'build',
		clear: false,
		rollupOptions: {
			input: ['src/main.jsx', 'src/index1.jsx', 'src/index2.jsx'],
			output: {
				// inlineDynamicImports: true,
				entryFileNames: `modules/[name].userscript.js`,
				chunkFileNames: `assets/[name].js`,
				assetFileNames: `assets/[name].[ext]`,
			},
			treeshake: true,
		},
	},
});
