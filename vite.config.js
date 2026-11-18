import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  compilerOptions: { experimental: { async: true } },
  kit: {
	adapter: adapter({ out: 'build' }),
	experimental: { remoteFunctions: true }
  },
  plugins: [
	tailwindcss(),
	sveltekit({
		adapter: adapter(),
		compilerOptions: {
			experimental: {
				async: true
			}
		},
		experimental: {
			remoteFunctions: true
		}
	})
	]
};