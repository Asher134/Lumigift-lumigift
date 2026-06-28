"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createGiftSchema } from "@/types/schemas";
import type { CreateGiftInput } from "@/types/schemas";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { GiftPreview } from "./GiftPreview";
import { VoiceNoteRecorder } from "./VoiceNoteRecorder";
import { useState, useCallback, useEffect, useRef } from "react";
import { useCsrf } from "@/hooks/useCsrf";
import { formatNGN, formatUSDC } from "@/lib/currency";
import styles from "./CreateGiftForm.module.css";

const MESSAGE_MAX = 280;
const MESSAGE_WARN_THRESHOLD = 20;

type Step = "form" | "preview";

export function CreateGiftForm() {
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usdcEquivalent, setUsdcEquivalent] = useState("…");
  const [rateData, setRateData] = useState<{ rate: number; lastUpdated: number; stale: boolean } | null>(null);
  const [fetchingRate, setFetchingRate] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [showUnregisteredWarning, setShowUnregisteredWarning] = useState(false);
  const [recipientRegistered, setRecipientRegistered] = useState<boolean | null>(null);
  const [voiceNoteBlob, setVoiceNoteBlob] = useState<Blob | null>(null);
  const [voiceNoteUrl, setVoiceNoteUrl] = useState<string | null>(null);

  const { csrfFetch } = useCsrf();

  const {
    register,
    watch,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<CreateGiftInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createGiftSchema) as any,
    defaultValues: { paymentProvider: "paystack", recipientIsRegistered: true },
    mode: "onBlur",
  });

  const recipientPhone = watch("recipientPhone");
  const watchedUnlockAt = watch("unlockAt");
  const amountNgn = watch("amountNgn");
  const messageValue = watch("message") ?? "";
  const messageLength = messageValue.length;

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchRate = useCallback(async (signal?: AbortSignal) => {
    try {
      setFetchingRate(true);
      const res = await fetch("/api/v1/exchange-rate", { signal });
      if (!res.ok) throw new Error("Failed to fetch rate");
      const json = await res.json();
      setRateData({
        rate: json.data.rate,
        lastUpdated: json.data.cachedAt ?? json.data.timestamp,
        stale: json.data.stale ?? false,
      });
      setRateError(null);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      console.error("[CreateGiftForm] rate fetch error:", err);
      setRateError("Unable to fetch live exchange rate");
    } finally {
      if (!debounceTimeoutRef.current) {
        setFetchingRate(false);
      }
    }
  }, []);

  // Fetch rate on mount and every 60s
  useEffect(() => {
    fetchRate();
    const interval = setInterval(() => {
      if (!debounceTimeoutRef.current) {
        fetchRate();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchRate]);

  // Debounced fetch when amountNgn changes
  useEffect(() => {
    if (!amountNgn || amountNgn <= 0) {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setFetchingRate(false);
      return;
    }

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setFetchingRate(true);

    debounceTimeoutRef.current = setTimeout(async () => {
      debounceTimeoutRef.current = null;
      await fetchRate(controller.signal);
    }, 400);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      controller.abort();
    };
  }, [amountNgn, fetchRate]);

  // Update USDC equivalent when amount or rate changes
  useEffect(() => {
    if (amountNgn && rateData?.rate) {
      const usdc = amountNgn / rateData.rate;
      setUsdcEquivalent(usdc.toFixed(2));
    } else {
      setUsdcEquivalent("…");
    }
  }, [amountNgn, rateData]);

  const handleVoiceNote = useCallback((blob: Blob | null) => {
    setVoiceNoteBlob(blob);
    if (!blob) setVoiceNoteUrl(null);
  }, []);

  const autoResizeTextarea = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const uploadVoiceNote = async (): Promise<string | null> => {
    if (!voiceNoteBlob) return null;
    const form = new FormData();
    form.append("file", voiceNoteBlob, "voice-note.webm");
    const res = await csrfFetch("/api/v1/uploads", { method: "POST", body: form });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.url ?? null;
  };

  // Step 1 → Step 2: fetch USDC estimate then show preview
  const onFormSubmit = async (data: CreateGiftInput) => {
    setError(null);
    try {
      // Check if recipient is registered (GET — no CSRF needed)
      const checkRes = await fetch(`/api/v1/users?phone=${encodeURIComponent(data.recipientPhone)}`);
      if (checkRes.ok) {
        const checkJson = await checkRes.json();
        setRecipientRegistered(checkJson.data?.exists ?? false);
        if (!checkJson.data?.exists) {
          setShowUnregisteredWarning(true);
          return; // Don't proceed to preview yet
        }
      } else {
        // If check fails, assume registered to not block
        setRecipientRegistered(true);
      }

      // Upload voice note if present
      if (voiceNoteBlob) {
        const url = await uploadVoiceNote();
        setVoiceNoteUrl(url);
      }
    } catch {
      // non-critical
    }
    setStep("preview");
  };

  const onProceedUnregistered = async () => {
    setShowUnregisteredWarning(false);
    try {
      if (voiceNoteBlob) {
        const url = await uploadVoiceNote();
        setVoiceNoteUrl(url);
      }
    } catch {
      // non-critical
    }
    setStep("preview");
  };

  const onCancelUnregistered = () => {
    setShowUnregisteredWarning(false);
  };

  const onConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = getValues();
      const res = await csrfFetch("/api/v1/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          recipientIsRegistered: recipientRegistered ?? true,
          ...(voiceNoteUrl ? { voiceNoteUrl } : {}),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        setError(errorData.error || "Failed to create gift");
        return;
      }

      const json = await res.json();
      const { paymentUrl } = json.data;

      // Redirect to payment
      window.location.href = paymentUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (step === "preview") {
    return (
      <GiftPreview
        data={getValues()}
        usdcEquivalent={usdcEquivalent}
        onEdit={() => setStep("form")}
        onConfirm={onConfirm}
        loading={loading}
        error={error}
      />
    );
  }

  return (
    <>
      <form className={styles.form} onSubmit={handleSubmit(onFormSubmit as Parameters<typeof handleSubmit>[0])} noValidate>
        <h2 className={styles.title}>Send a Gift</h2>

        <Input
          label="Recipient's Name"
          placeholder="e.g. Amara"
          error={errors.recipientName?.message}
          {...register("recipientName")}
        />

        <Input
          label="Recipient's Phone"
          type="tel"
          placeholder="+2348012345678"
          error={errors.recipientPhone?.message}
          {...register("recipientPhone")}
        />

        <Input
          label="Gift Amount (₦)"
          type="number"
          placeholder="5000"
          min={500}
          max={500000}
          error={errors.amountNgn?.message}
          {...register("amountNgn", { valueAsNumber: true })}
        />

        <div className={styles.conversion}>
          {amountNgn > 0 && (
            <div className={styles.conversionValue}>
              ≈ {formatUSDC(usdcEquivalent)}
              {fetchingRate && <span className={styles.refreshing}>⌛</span>}
            </div>
          )}
          {rateData && (
            <div className={styles.conversionRate}>
              Rate: {formatNGN(rateData.rate)}/USDC · Last updated {new Date(rateData.lastUpdated).toLocaleTimeString()}
              {rateData.stale && <span className={styles.stale}> · Rate may be outdated</span>}
            </div>
          )}
          {rateError && <div className={styles.error}>{rateError}</div>}
        </div>

        <p className="input-hint">
          Min {formatNGN(500)} · Max {formatNGN(500000)} · Daily limit {formatNGN(1000000)}
        </p>

        <DateTimePicker
          label="Unlock Date & Time"
          id="unlockAt"
          error={errors.unlockAt?.message}
          selectedDate={watchedUnlockAt}
          recipientPhone={recipientPhone}
          {...register("unlockAt")}
        />

        <div>
          <label className={styles.label} htmlFor="occasion">Occasion (optional)</label>
          <select
            id="occasion"
            className={styles.select}
            {...register("occasion")}
          >
            <option value="general">🎁 General</option>
            <option value="birthday">🎂 Birthday</option>
            <option value="valentine">❤️ Valentine&apos;s Day</option>
            <option value="anniversary">💍 Anniversary</option>
            <option value="graduation">🎓 Graduation</option>
            <option value="christmas">🎄 Christmas</option>
          </select>
        </div>

        <DateTimePicker
          label="Schedule Notification (optional)"
          id="notifyAt"
          error={errors.notifyAt?.message}
          selectedDate={watch("notifyAt")}
          recipientPhone={recipientPhone}
          {...register("notifyAt")}
        />

        <div>
          <Textarea
            label="Personal Message (optional)"
            id="message"
            rows={3}
            placeholder="Write something heartfelt…"
            error={errors.message?.message}
            style={{ overflow: "hidden", resize: "none" }}
            onInput={autoResizeTextarea}
            {...register("message")}
          />
          <span
            className={styles.charCounter}
            data-warning={messageLength >= MESSAGE_MAX - MESSAGE_WARN_THRESHOLD}
            aria-live="polite"
            aria-label={`${messageLength} of ${MESSAGE_MAX} characters used`}
          >
            {messageLength}/{MESSAGE_MAX}
          </span>
        </div>

        <VoiceNoteRecorder onVoiceNote={handleVoiceNote} disabled={loading} />

        <Button type="submit" fullWidth>
          Preview Gift →
        </Button>
      </form>

      {showUnregisteredWarning && (
        <Modal
          title="Unregistered Recipient"
          description="This phone number has not been linked to a Lumigift account yet. The recipient will receive an SMS invitation and must register before claiming the gift."
          onClose={onCancelUnregistered}
        >
          <p>The recipient's phone number is not registered with Lumigift. They will receive an SMS invitation to claim the gift, but must register first.</p>
          <div className={styles.modalActions}>
            <Button onClick={onCancelUnregistered} variant="secondary">
              Cancel
            </Button>
            <Button onClick={onProceedUnregistered}>
              Proceed
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
// .