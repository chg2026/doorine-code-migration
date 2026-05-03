// Companion stub to pages/_error.tsx. Required so Next.js doesn't synthesize
// its own _app — the synthesized version is what triggers the React-null
// useContext crash during 404 prerender.
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
