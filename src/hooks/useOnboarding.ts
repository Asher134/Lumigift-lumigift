"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "lumigift_onboarding_done";

/**
 * Manages onboarding state.
 * - Shows modal on first login (no localStorage flag + server says not completed)
 * - Persists completion to server and localStorage
 * - Exposes `retrigger()` for the settings page
 */
export function useOnboarding() {
  const [show, setShow] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Fast path: already done locally
    if (localStorage.getItem(STORAGE_KEY)) {
      setChecked(true);
      return;
    }

    // Check server (handles new devices / cleared storage)
    fetch("/api/v1/onboarding")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && !json.data.completed) {
          setShow(true);
        } else {
          localStorage.setItem(STORAGE_KEY, "1");
        }
      })
      .catch(() => {
        // Non-critical — don't block the app
      })
      .finally(() => setChecked(true));
  }, []);

  const complete = async () => {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, "1");
    await fetch("/api/v1/onboarding", { method: "POST" }).catch(() => {});
  };

  const skip = () => {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, "1");
    fetch("/api/v1/onboarding", { method: "POST" }).catch(() => {});
  };

  const retrigger = () => {
    localStorage.removeItem(STORAGE_KEY);
    setShow(true);
  };

  return { show, checked, complete, skip, retrigger };
}
