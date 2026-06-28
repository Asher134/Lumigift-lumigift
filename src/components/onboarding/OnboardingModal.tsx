"use client";

import { useState } from "react";
import styles from "./OnboardingModal.module.css";

interface OnboardingModalProps {
  onComplete: () => void;
  onSkip: () => void;
}

const STEPS = [
  {
    emoji: "🎁",
    title: "Send a time-locked gift",
    body: "Choose an amount, pick a surprise unlock date, and send it. The recipient won't see the value until the moment you choose.",
  },
  {
    emoji: "🔒",
    title: "Completely hidden until unlock",
    body: "Your gift is locked on the Stellar blockchain. No one — not even us — can reveal it early. The surprise is guaranteed.",
  },
  {
    emoji: "🚀",
    title: "Ready to send your first gift?",
    body: "It takes less than 2 minutes. Pay in Naira, your recipient receives USDC on Stellar.",
  },
];

export function OnboardingModal({ onComplete, onSkip }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Welcome to Lumigift">
      <div className={styles.modal}>
        <button
          className={styles.skip}
          onClick={onSkip}
          aria-label="Skip onboarding"
        >
          Skip
        </button>

        <div className={styles.emoji} aria-hidden="true">{current.emoji}</div>
        <h2 className={styles.title}>{current.title}</h2>
        <p className={styles.body}>{current.body}</p>

        <div className={styles.dots} aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`${styles.dot} ${i === step ? styles.dotActive : ""}`}
              aria-hidden="true"
            />
          ))}
        </div>

        <div className={styles.actions}>
          {step > 0 && (
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </button>
          )}
          <button
            className="btn btn--primary"
            onClick={() => (isLast ? onComplete() : setStep((s) => s + 1))}
          >
            {isLast ? "Send my first gift →" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
