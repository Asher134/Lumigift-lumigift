import { getLatestLegalDocument } from "@/server/services/legal.service";

export const metadata = {
  title: "Terms of Service - Lumigift",
  description: "Lumigift Terms of Service",
};

export default async function ToSPage() {
  const doc = await getLatestLegalDocument("tos");

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
      {doc ? (
        <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: doc.content }} />
      ) : (
        <p>Terms of Service not found.</p>
      )}
    </div>
  );
}
