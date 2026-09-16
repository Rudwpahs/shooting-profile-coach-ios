import OwnerPrivateAnalysisRoute from "@/components/owner/owner-private-analysis-route";
import { PreviewAnalysisRoute } from "@/components/preview/preview-analysis-route";
import { usePreviewRuntime } from "@/lib/preview/preview-runtime-provider";

export default function PrivateAnalysisRoute() {
  const preview = usePreviewRuntime();
  if (preview.enabled) return <PreviewAnalysisRoute />;
  return <OwnerPrivateAnalysisRoute />;
}
