"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Root error component for Next.js App Router.
 * This catches errors in the root layout and its children.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("[RootError]", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        textAlign: "center",
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text-primary)",
      }}
    >
      <h1 style={{ fontSize: "var(--text-4xl)", marginBottom: "1rem" }}>
        Something went wrong
      </h1>
      <p
        style={{
          fontSize: "var(--text-lg)",
          color: "var(--color-text-secondary)",
          marginBottom: "2rem",
          maxWidth: "500px",
        }}
      >
        We apologize for the inconvenience. A critical error occurred, but don&apos;t worry — your gifts are safe.
      </p>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="secondary" onClick={() => (window.location.href = "/")}>
          Go home
        </Button>
      </div>
    </div>
  );
}
