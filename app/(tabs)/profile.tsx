import OwnerProfileTab from "@/components/profile/owner-profile-tab";
import { PreviewProfileContent } from "@/components/preview/preview-profile-content";
import { usePreviewRuntime } from "@/lib/preview/preview-runtime-provider";

export default function PersonalProfileTab() {
  const preview = usePreviewRuntime();
  if (preview.enabled) return <PreviewProfileContent />;
  return <OwnerProfileTab />;
}
