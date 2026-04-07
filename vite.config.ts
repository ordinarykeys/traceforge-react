import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function pickVendorChunk(id: string): string | undefined {
  const normalized = id.replace(/\\/g, '/')

  if (!normalized.includes('/node_modules/')) {
    return undefined
  }

  const inPkg = (name: string) => normalized.includes(`/node_modules/${name}/`)

  if (
    inPkg('react') ||
    inPkg('react-dom') ||
    inPkg('zustand') ||
    inPkg('i18next') ||
    inPkg('react-i18next')
  ) {
    return 'vendor-react-runtime'
  }

  if (
    normalized.includes('/node_modules/@tauri-apps/') ||
    normalized.includes('/node_modules/@tauri-apps')
  ) {
    return 'vendor-tauri'
  }

  if (
    inPkg('katex') ||
    inPkg('marked') ||
    inPkg('marked-highlight') ||
    inPkg('highlight.js') ||
    inPkg('dompurify')
  ) {
    return 'vendor-markdown-runtime'
  }

  if (
    normalized.includes('/node_modules/@radix-ui/') ||
    normalized.includes('/node_modules/@base-ui/') ||
    inPkg('lucide-react') ||
    inPkg('sonner') ||
    inPkg('@uiw/react-codemirror') ||
    inPkg('@codemirror/lang-javascript') ||
    inPkg('@monaco-editor/react')
  ) {
    return 'vendor-ui'
  }

  if (inPkg('crypto-js') || inPkg('buffer')) {
    return 'vendor-crypto-core'
  }

  if (inPkg('node-forge') || inPkg('sm-crypto')) {
    return 'vendor-crypto-legacy'
  }

  if (
    inPkg('@noble/hashes') ||
    inPkg('@noble/secp256k1') ||
    inPkg('@noble/ed25519') ||
    inPkg('@scure/base') ||
    inPkg('@scure/bip39') ||
    inPkg('bs58') ||
    inPkg('bech32')
  ) {
    return 'vendor-crypto-modern'
  }

  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: true,
        manualChunks: pickVendorChunk,
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
