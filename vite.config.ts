import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:process.env.BASE_PATH || '/tracker_debt/',plugins:[react()]});
