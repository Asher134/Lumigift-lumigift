"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { OtpInput } from "@/components/auth/OtpInput";
import { useCsrf } from "@/hooks/useCsrf";
import { useValidation } from "@/hooks/useValidation";
import styles from "./page.module.css";

type Step = "phone" | "otp";

function validatePhone(value: string): string | undefined {
  if (!value) return "Phone number is required";
  if (!/^\+?[1-9]\d{9,14}$/.test(value)) return "Enter a valid phone number (e.g. +2348012345678)";
}

function validateOtp(value: string): string | undefined {
  if (!value) return "OTP is required";
  if (!/^\d{6}$/.test(value)) return "OTP must be exactly 6 digits";
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const phoneValidation = useValidation(["phone"]);
  const otpValidation = useValidation(["otp"]);

  const phoneError = phoneValidation.isTouched("phone") ? validatePhone(phone) : undefined;
  const otpError = otpValidation.isTouched("otp") ? validateOtp(otp) : undefined;

  const { csrfFetch } = useCsrf();
  const errorId = useId();
  const statusId = useId();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    phoneValidation.touchAll();
    if (validatePhone(phone)) return;
    setLoading(true);
    setSubmitError(null);
    try {
      const res = await csrfFetch("/api/v1/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setStep("otp");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    otpValidation.touchAll();
    if (validateOtp(otp)) return;
    setLoading(true);
    setSubmitError(null);
    try {
      const result = await signIn("credentials", { phone, otp, redirect: false });
      if (result?.error) throw new Error("Invalid OTP. Please try again.");
      router.push("/dashboard");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const stepLabel =
    step === "phone"
      ? "Step 1 of 2: Enter your phone number"
      : "Step 2 of 2: Enter the verification code";

  return (
    <div className={styles.page}>
      <div className={`container container--sm ${styles.inner}`}>
        <div className="card">
          <p id={statusId} className="sr-only" aria-live="polite" aria-atomic="true">
            {stepLabel}
          </p>

          {/* ARIA live region for inline field errors */}
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {phoneError ?? otpError ?? submitError ?? ""}
          </div>

          <h1 className={styles.title}>
            {step === "phone" ? "Sign in to Lumigift" : "Enter your OTP"}
          </h1>
          <p className={styles.subtitle} id={`${statusId}-desc`}>
            {step === "phone"
              ? "Enter your phone number to receive a one-time code."
              : `We sent a 6-digit code to ${phone}.`}
          </p>

          {step === "phone" ? (
            <form
              onSubmit={handleSendOtp}
              className={styles.form}
              noValidate
              aria-label="Phone number sign-in form"
              aria-describedby={`${statusId}-desc`}
            >
              <Input
                label="Phone Number"
                type="tel"
                placeholder="+2348012345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => phoneValidation.onBlur("phone")}
                autoComplete="tel"
                error={phoneError ?? submitError ?? undefined}
              />
              <Button
                type="submit"
                fullWidth
                loading={loading}
                disabled={loading || !!validatePhone(phone)}
              >
                Send Code
              </Button>
            </form>
          ) : (
            <form
              onSubmit={handleVerifyOtp}
              className={styles.form}
              noValidate
              aria-label="OTP verification form"
              aria-describedby={`${statusId}-desc`}
            >
              <OtpInput
                value={otp}
                onChange={setOtp}
                error={otpError ?? submitError ?? undefined}
                disabled={loading}
              />
              <Button
                type="submit"
                fullWidth
                loading={loading}
                disabled={loading || !!validateOtp(otp)}
              >
                Verify &amp; Sign In
              </Button>
              <button
                type="button"
                className="btn btn--ghost btn--sm btn--full"
                onClick={() => {
                  setStep("phone");
                  setSubmitError(null);
                }}
                aria-label="Go back and change your phone number"
              >
                Change number
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
