import { lazy, Suspense } from "react";
import { BrowserGame } from "./hosts/browser/BrowserGame";

const AuthoringPreviewHost = lazy(() => import("./authoring/AuthoringPreviewHost"));

export default function App() {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("authoring") === "1") {
    return (
      <Suspense fallback={null}>
        <AuthoringPreviewHost />
      </Suspense>
    );
  }
  return <BrowserGame />;
}
