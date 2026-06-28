"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createGroupGiftSchema, type CreateGroupGiftInput } from "@/types/schemas";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import styles from "./CreateGiftForm.module.css";

export function GroupGiftForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateGroupGiftInput>({
    resolver: zodResolver(createGroupGiftSchema),
  });

  const onSubmit = async (data: CreateGroupGiftInput) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gifts/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setShareUrl(json.data.shareUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (shareUrl) {
    return (
      <div className={styles.form}>
        <h2 className={styles.title}>Group Gift Created! 🎉</h2>
        <p>Share this link so others can contribute:</p>
        <Input label="Share Link" value={shareUrl} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
        <Button
          onClick={() => navigator.clipboard.writeText(shareUrl)}
          variant="secondary"
        >
          Copy Link
        </Button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <h2 className={styles.title}>Create Group Gift</h2>

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
        label="Target Amount (₦)"
        type="number"
        placeholder="20000"
        min={500}
        error={errors.targetAmountNgn?.message}
        {...register("targetAmountNgn", { valueAsNumber: true })}
      />

      <Input
        label="Contribution Deadline"
        type="datetime-local"
        error={errors.deadline?.message}
        {...register("deadline")}
      />

      <Input
        label="Gift Unlock Date & Time"
        type="datetime-local"
        error={errors.unlockAt?.message}
        {...register("unlockAt")}
      />

      <div className="input-group">
        <label className="input-label" htmlFor="message">
          Personal Message (optional)
        </label>
        <textarea
          id="message"
          className="input"
          rows={3}
          placeholder="Write something heartfelt…"
          {...register("message")}
        />
        {errors.message && (
          <span className="input-error-msg">{errors.message.message}</span>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <Button type="submit" fullWidth loading={loading}>
        Create Group Gift
      </Button>
    </form>
  );
}
