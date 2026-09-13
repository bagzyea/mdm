/// <reference types="vite/client" />

/**
 * Vite's `import.meta.env` typings. Without this reference the compiler reports
 * "Property 'env' does not exist on type 'ImportMeta'" wherever VITE_* variables are
 * read, which is why `vite build` (which does not typecheck) succeeded while
 * `tsc --noEmit` did not.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_LOG_LEVEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
