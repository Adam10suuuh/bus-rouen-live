"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // L'installation PWA reste optionnelle si le navigateur bloque le service worker.
    });
  }, []);

  return null;
}
