import { notFound } from "next/navigation";
import { getGroupGiftByToken } from "@/server/services/group-gift.service";
import { ContributeForm } from "@/components/gift/ContributeForm";

interface Props {
  params: { token: string };
  searchParams: { error?: string };
}

export default async function ContributePage({ params, searchParams }: Props) {
  const gift = await getGroupGiftByToken(params.token);
  if (!gift) notFound();

  return (
    <main style={{ display: "flex", justifyContent: "center", padding: "var(--space-8) var(--space-4)" }}>
      {searchParams.error === "payment_failed" && (
        <p style={{ color: "var(--color-error)", marginBottom: "var(--space-4)" }}>
          Payment failed. Please try again.
        </p>
      )}
      <ContributeForm gift={gift} />
    </main>
  );
}
