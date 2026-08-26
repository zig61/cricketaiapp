import { UploadForm } from "@/components/upload/UploadForm";
import { isDemoMode } from "@/lib/demo";

export default async function UploadPage() {
  const demo = await isDemoMode();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display mb-6 text-2xl font-semibold text-[var(--foreground)]">
        Analyse your batting
      </h1>
      <UploadForm demo={demo} />
    </div>
  );
}
