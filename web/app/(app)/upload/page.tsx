import { UploadForm } from "@/components/upload/UploadForm";

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-black dark:text-white">Analyse your batting</h1>
      <UploadForm />
    </div>
  );
}
