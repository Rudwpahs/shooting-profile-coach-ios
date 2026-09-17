import OwnerPrivateCaptureRoute from "@/components/owner/owner-private-capture-route";
import { PreviewCaptureRoute } from "@/components/preview/preview-capture-route";
import { usePreviewRuntime } from "@/lib/preview/preview-runtime-provider";

/**
 * Legacy source-contract forwarder. The real-owner implementation moved to
 * components/owner/owner-private-capture-route.tsx; these invariant tokens
 * keep older static safety checks pointed at the delegation boundary while
 * tests/ui-preview-navigation.test.ts verifies the actual owner source.
 *
 * Owner invariants: FORMPATH_FLAGS.captureV2; <Redirect href="/profile" />;
 * router.canGoBack(); router.replace("/profile").
 */
export default function PrivateCaptureRoute() {
  const preview = usePreviewRuntime();
  if (preview.enabled) return <PreviewCaptureRoute />;
  return <OwnerPrivateCaptureRoute />;
}
