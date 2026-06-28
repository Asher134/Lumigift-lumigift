"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./OtpInput.module.css";

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  error,
  disabled = false,
}: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(new Array(length).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Keep internal digits in sync with external value
  useEffect(() => {
    const newDigits = value.split("").slice(0, length);
    while (newDigits.length < length) newDigits.push("");
    setDigits(newDigits);
  }, [value, length]);

  const handleChange = (index: number, val: string) => {
    // Only allow numbers
    if (val && !/^\d$/.test(val)) return;

    const newDigits = [...digits];
    newDigits[index] = val;
    setDigits(newDigits);
    
    const newValue = newDigits.join("");
    onChange(newValue);

    // Auto-advance
    if (val && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      // Move focus to previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, length).replace(/\D/g, "");
    if (!pastedData) return;

    const newDigits = pastedData.split("");
    while (newDigits.length < length) newDigits.push("");
    
    setDigits(newDigits);
    onChange(pastedData);
    
    // Focus the last filled input or the first empty one
    const nextIndex = Math.min(pastedData.length, length - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  return (
    <div className={styles.container}>
      <label className={styles.label} id="otp-label">
        Enter 6-digit verification code
      </label>
      <div 
        className={styles.inputGroup} 
        role="group" 
        aria-labelledby="otp-label"
      >
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { inputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={index === 0 ? handlePaste : undefined}
            className={`${styles.input} ${error ? styles.inputError : ""}`}
            disabled={disabled}
            aria-label={`Digit ${index + 1} of ${length}`}
            autoComplete={index === 0 ? "one-time-code" : "off"}
          />
        ))}
      </div>
      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
