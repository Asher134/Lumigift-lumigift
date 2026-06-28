"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contributeSchema, type ContributeInput } from "@/types/schemas";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import type { GroupGift } from "@/types";
import styles from "./CreateGiftForm.module.css";

interface ContributeFormProps {
  gift: GroupGift;
}

export function ContributeForm({ gift }: ContributeFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContributeInput>({
    resolver: zodResolver(contributeSchema),
  });

  const onSubmit = async (data: ContributeInput) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gifts/group/${gift.id}/contribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      window.location.href = json.data.paymentUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const remaining = gift.targetAmountNgn - gift.collectedAmountNgn;
  const progressPct = Math.min(
    100,
    Math.round((gift.collectedAmountNgn / gift.targetAmountNgn) * 100)
  );

  return (
    <div className={styles.form}>
      <h2 className={styles.title}>
        Gift for {gift.recipientName} 🎁
      </h2>

      {gift.message && <p>{gift.message}</p>}

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span>₦{gift.collectedAmountNgn.toLocaleString()} raised</span>
          <span>Goal: ₦{gift.targetAmountNgn.toLocaleString()}</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{
            height: 8,
            borderRadius: 4,
            background: "var(--color-border)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progressPct}%`,
              background: "var(--color-primary)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <p style={{ fontSize: "var(--text-sm)", marginTop: 4 }}>
          ₦{remaining.toLocaleString()} still needed
        </p>
      </div>

      {gift.contributions.filter((c) => c.status === "success").length > 0 && (
        <div>
          <p style={{ fontWeight: "var(--font-semibold)", marginBottom: 4 }}>
            Contributors ({gift.contributions.filter((c) => c.status === "success").length})
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {gift.contributions
              .filter((c) => c.status === "success")
              .map((c) => (
                <li key={c.id} style={{ fontSize: "var(--text-sm)" }}>
                  {c.contributorName} — ₦{c.amountNgn.toLocaleString()}
                </li>
              ))}
          </ul>
        </div>
      )}

      {gift.status !== "open" ? (
        <p>
          {gift.status === "funded"
            ? "🎉 Target reached! This gift is fully funded."
            : "This group gift is no longer accepting contributions."}
        </p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <Input
              label="Your Name"
              placeholder="e.g. Chidi"
              error={errors.contributorName?.message}
              {...register("contributorName")}
            />

            <Input
              label="Your Phone (optional)"
              type="tel"
              placeholder="+2348012345678"
              error={errors.contributorPhone?.message}
              {...register("contributorPhone")}
            />

            <Input
              label="Amount (₦)"
              type="number"
              placeholder="2000"
              min={100}
              error={errors.amountNgn?.message}
              {...register("amountNgn", { valueAsNumber: true })}
            />

            {error && <p className={styles.error}>{error}</p>}

            <Button type="submit" fullWidth loading={loading}>
              Contribute via Paystack
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
