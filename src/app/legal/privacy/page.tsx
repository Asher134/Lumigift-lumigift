import { getLatestLegalDocument } from "@/server/services/legal.service";

export const metadata = {
  title: "Privacy Policy - Lumigift",
  description: "Lumigift Privacy Policy",
};

export default async function PrivacyPage() {
  const doc = await getLatestLegalDocument("privacy");

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
      {doc ? (
        <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: doc.content }} />
      ) : (
        <p>Privacy Policy not found.</p>
      )}
    </div>
  );
}
