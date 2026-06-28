"use client";

import { useRouter } from "next/navigation";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import { useOnboarding } from "@/hooks/useOnboarding";

export function OnboardingWrapper() {
  const router = useRouter();
  const { show, complete, skip } = useOnboarding();

  const handleComplete = async () => {
    await complete();
    router.push("/send");
  };

  if (!show) return null;

  return <OnboardingModal onComplete={handleComplete} onSkip={skip} />;
}
