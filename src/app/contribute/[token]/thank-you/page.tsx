export default function ThankYouPage() {
  return (
    <main style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "var(--space-4)", padding: "var(--space-8) var(--space-4)", textAlign: "center" }}>
      <h1 style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--font-bold)" }}>
        Thank you! 🎉
      </h1>
      <p style={{ color: "var(--color-text-secondary)", maxWidth: 400 }}>
        Your contribution was received. The recipient will be surprised on the unlock date!
      </p>
    </main>
  );
}
