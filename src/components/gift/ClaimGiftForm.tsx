"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import styles from "./ClaimGiftForm.module.css";

// Client-side form only needs the public key + secret key fields.
// nonce and signature are obtained and computed at submit time.
const formSchema = z.object({
  recipientStellarKey: z
    .string()
    .length(56, "Stellar public key must be exactly 56 characters")
    .regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar public key format"),
  recipientStellarSecret: z
    .string()
    .length(56, "Stellar secret key must be exactly 56 characters")
    .regex(/^S[A-Z2-7]{55}$/, "Invalid Stellar secret key format"),
});

type FormValues = z.infer<typeof formSchema>;

interface ClaimGiftFormProps {
  giftId: string;
}

export function ClaimGiftForm({ giftId }: ClaimGiftFormProps) {
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
  });

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    setSubmitError(null);
    try {
      // 1. Fetch challenge nonce from server
      const challengeRes = await fetch(`/api/v1/gifts/${giftId}/challenge`);
      const challengeJson = await challengeRes.json();
      if (!challengeJson.success) throw new Error(challengeJson.error ?? "Failed to get challenge");
      const { nonce } = challengeJson.data as { nonce: string; expiresAt: string };

      // 2. Sign the nonce with the recipient's Stellar secret key (client-side)
      // Dynamic import so the Stellar SDK bundle is only loaded on this path.
      const { Keypair } = await import("@stellar/stellar-sdk");
      const keypair = Keypair.fromSecret(data.recipientStellarSecret);
      const nonceBytes = Buffer.from(nonce, "hex");
      const signature = keypair.sign(nonceBytes).toString("hex");

      // 3. Submit the claim with proof of key ownership
      const res = await fetch(`/api/v1/gifts/${giftId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          giftId,
          recipientStellarKey: data.recipientStellarKey,
          nonce,
          signature,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setJobId(json.data.jobId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to claim gift");
    } finally {
      setLoading(false);
    }
  };

  if (jobId) {
    return (
      <div className={styles.success} role="status" aria-live="polite">
        <p>🎉 Gift claim submitted!</p>
        <p className={styles.txHash}>Job ID: {jobId}</p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <h2 className={styles.title}>Claim Your Gift</h2>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {errors.recipientStellarKey?.message ??
          errors.recipientStellarSecret?.message ??
          submitError ??
          ""}
      </div>

      <Input
        label="Your Stellar Public Key"
        placeholder="G…"
        error={errors.recipientStellarKey?.message}
        autoComplete="off"
        {...register("recipientStellarKey")}
      />

      <Input
        label="Your Stellar Secret Key"
        placeholder="S…"
        type="password"
        error={errors.recipientStellarSecret?.message}
        autoComplete="off"
        {...register("recipientStellarSecret")}
      />

      {submitError && (
        <p className={styles.error} role="alert">
          {submitError}
        </p>
      )}

      <Button type="submit" fullWidth loading={loading} disabled={!isValid || loading}>
        Claim Gift
      </Button>
    </form>
  );
}
// .