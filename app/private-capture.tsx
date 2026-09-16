import OwnerPrivateCaptureRoute from "@/components/owner/owner-private-capture-route";
import { PreviewCaptureRoute } from "@/components/preview/preview-capture-route";
import { usePreviewRuntime } from "@/lib/preview/preview-runtime-provider";

export default function PrivateCaptureRoute() {
  const preview = usePreviewRuntime();
  if (preview.enabled) return <PreviewCaptureRoute />;
  return <OwnerPrivateCaptureRoute />;
}
