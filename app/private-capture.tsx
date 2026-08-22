import { Redirect, useRouter } from "expo-router";

import { CaptureSession } from "@/components/shooting-profile/capture-session";
import { FORMPATH_FLAGS } from "@/lib/feature-flags";

export default function PrivateCaptureRoute() {
  const router = useRouter();
  if (!FORMPATH_FLAGS.captureV2) return <Redirect href="/profile" />;

  const close = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/profile");
  };
  return <CaptureSession onClose={close} />;
}
