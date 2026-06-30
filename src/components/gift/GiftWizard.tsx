"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createGiftSchema, type CreateGiftInput } from "@/types/schemas";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { TemplateSelector } from "./TemplateSelector";
import { WizardProgress } from "./WizardProgress";
import { GiftPreviewCard } from "./GiftPreviewCard";
import { BLANK_TEMPLATE, type GiftTemplate } from "@/lib/giftTemplates";
import styles from "./GiftWizard.module.css";

// Step indices
const STEP_OCCASION = 0;
const STEP_RECIPIENT = 1;
const STEP_AMOUNT = 2;
const STEP_UNLOCK = 3;
const STEP_REVIEW = 4;

/** sessionStorage key for wizard draft state. */
const WIZARD_STORAGE_KEY = "lumigift:gift-wizard-draft";

/**
 * Shape persisted to sessionStorage.
 * Deliberately excludes any payment card data — only non-sensitive
 * gift metadata is stored.
 */
interface WizardDraft {
  step: number;
  templateId: string;
  formValues: Partial<CreateGiftInput>;
}

function loadDraft(): WizardDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WizardDraft;
  } catch {
    return null;
  }
}

function saveDraft(draft: WizardDraft): void {
  if (typeof window === "undefined") return;
  try {
    // Strip any payment card fields before persisting (security guardrail).
    const { paymentProvider: _pp, ...safeValues } = draft.formValues as Record<string, unknown>;
    void _pp; // intentionally ignored
    window.sessionStorage.setItem(
      WIZARD_STORAGE_KEY,
      JSON.stringify({ ...draft, formValues: safeValues })
    );
  } catch {
    // Storage quota exceeded or private-browsing restriction — fail silently.
  }
}

function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function GiftWizard() {
  const [step, setStep] = useState(STEP_OCCASION);
  const [template, setTemplate] = useState<GiftTemplate>(BLANK_TEMPLATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True after the initial hydration from sessionStorage has run. */
  const [hydrated, setHydrated] = useState(false);

  const {
    register,
    watch,
    handleSubmit,
    trigger,
    getValues,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CreateGiftInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createGiftSchema) as any,
    defaultValues: { paymentProvider: "paystack" },
    mode: "onTouched",
  });

  // ── Hydrate from sessionStorage on mount ─────────────────────────────────
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      // Restore form fields (unlockAt is stored as a string; convert back to Date).
      const values = { ...draft.formValues };
      if (values.unlockAt && typeof values.unlockAt === "string") {
        values.unlockAt = new Date(values.unlockAt) as unknown as string;
      }
      reset({ paymentProvider: "paystack", ...values });
      setStep(draft.step);
      // Restore template if it was non-blank
      if (draft.templateId && draft.templateId !== BLANK_TEMPLATE.id) {
        // Template name/label isn't critical for re-render; the form values hold
        // the suggestedMessage so we just note the id here.
        setTemplate({ ...BLANK_TEMPLATE, id: draft.templateId });
      }
    }
    setHydrated(true);
  }, [reset]);

  const recipientPhone = watch("recipientPhone");
  const watchedUnlockAt = watch("unlockAt");

  // ── Persist draft to sessionStorage whenever relevant fields change ───────
  useEffect(() => {
    // Don't save until hydration is complete (avoid overwriting with empty state).
    if (!hydrated) return;
    // Don't persist anything while on the initial template-selection step with
    // no data entered yet.
    const values = getValues();
    const hasData =
      values.recipientName ||
      values.recipientPhone ||
      values.amountNgn ||
      values.message ||
      step > STEP_OCCASION;

    if (!hasData) return;

    saveDraft({
      step,
      templateId: template.id,
      formValues: values,
    });
  });

  function handleTemplateSelect(tpl: GiftTemplate) {
    setTemplate(tpl);
    if (tpl.suggestedMessage) {
      setValue("message", tpl.suggestedMessage);
    }
    setStep(STEP_RECIPIENT);
  }

  async function next(fields: (keyof CreateGiftInput)[]) {
    const valid = await trigger(fields);
    if (valid) setStep((s) => s + 1);
  }

  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  /** Called when the user explicitly abandons the wizard. */
  function handleCancel() {
    clearDraft();
    reset({ paymentProvider: "paystack" });
    setStep(STEP_OCCASION);
    setTemplate(BLANK_TEMPLATE);
    setError(null);
  }

  const onSubmit = async (data: CreateGiftInput) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      // Clear draft on successful submission before redirecting to payment.
      clearDraft();
      window.location.href = json.data.paymentUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      {step > STEP_OCCASION && <WizardProgress currentStep={step} />}

      {step === STEP_OCCASION && (
        <TemplateSelector onSelect={handleTemplateSelect} />
      )}

      {step === STEP_RECIPIENT && (
        <div className={styles.stepContent}>
          <h2 className={styles.stepTitle}>Who is this gift for?</h2>
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
            label="Recipient's Email (optional — for email notifications)"
            type="email"
            placeholder="amara@example.com"
            error={errors.recipientEmail?.message}
            {...register("recipientEmail")}
          />
          <div className={styles.nav}>
            <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
            <Button variant="secondary" onClick={back}>Back</Button>
            <Button onClick={() => next(["recipientName", "recipientPhone"])}>Next</Button>
          </div>
        </div>
      )}

      {step === STEP_AMOUNT && (
        <div className={styles.stepContent}>
          <h2 className={styles.stepTitle}>Amount &amp; Message</h2>
          <Input
            label="Gift Amount (₦)"
            type="number"
            placeholder="5000"
            min={500}
            error={errors.amountNgn?.message}
            {...register("amountNgn", { valueAsNumber: true })}
          />
          <div className="input-group">
            <label className="input-label" htmlFor="message">
              Personal Message (optional)
            </label>
            <textarea
              id="message"
              className="input"
              rows={4}
              placeholder="Write something heartfelt…"
              {...register("message")}
            />
            {errors.message && (
              <span className="input-error-msg">{errors.message.message}</span>
            )}
          </div>
          <div className={styles.nav}>
            <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
            <Button variant="secondary" onClick={back}>Back</Button>
            <Button onClick={() => next(["amountNgn"])}>Next</Button>
          </div>
        </div>
      )}

      {step === STEP_UNLOCK && (
        <div className={styles.stepContent}>
          <h2 className={styles.stepTitle}>When should it unlock?</h2>
          <DateTimePicker
            label="Unlock Date & Time"
            id="unlockAt"
            error={errors.unlockAt?.message}
            selectedDate={watchedUnlockAt}
            recipientPhone={recipientPhone}
            {...register("unlockAt")}
          />
          <div className={styles.nav}>
            <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
            <Button variant="secondary" onClick={back}>Back</Button>
            <Button onClick={() => next(["unlockAt"])}>Review Gift</Button>
          </div>
        </div>
      )}

      {step === STEP_REVIEW && (
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <h2 className={styles.stepTitle}>Review your gift</h2>
          <GiftPreviewCard
            data={getValues()}
            template={template}
            onEdit={(targetStep) => setStep(targetStep)}
          />
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.nav}>
            <Button type="button" variant="secondary" onClick={handleCancel}>Cancel</Button>
            <Button type="button" variant="secondary" onClick={back}>Back</Button>
            <Button type="submit" loading={loading}>Continue to Payment</Button>
          </div>
        </form>
      )}
    </div>
  );
}
