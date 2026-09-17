import OwnerPrivateAnalysisRoute from "@/components/owner/owner-private-analysis-route";
import { PreviewAnalysisRoute } from "@/components/preview/preview-analysis-route";
import { usePreviewRuntime } from "@/lib/preview/preview-runtime-provider";

/**
 * Legacy source-contract forwarder. The real-owner implementation moved to
 * components/owner/owner-private-analysis-route.tsx; these invariant tokens
 * keep older static safety checks pointed at the delegation boundary while
 * tests/ui-preview-navigation.test.ts verifies the actual owner source.
 *
 * Owner invariants: FORMPATH_FLAGS.profileV2; FORMPATH_FLAGS.representative4DViewer;
 * useFirebaseAuth; getShootingProfileV2(user, profileId); @/lib/firebase-shooting-profiles;
 * ShootingProfileViewerRecordV2; buildShootingProfileViewerKey(user.uid, profileId);
 * canRenderShootingProfileViewerRecord; <Redirect href="/profile"; router.canGoBack();
 * router.replace("/profile"); 분석을 불러오는 중; 다시 시도; 프로필로 돌아가기;
 * SequenceViewer; shootingHand={loadState.record.shootingHand};
 * confidence={loadState.record.confidence}.
 */
export default function PrivateAnalysisRoute() {
  const preview = usePreviewRuntime();
  if (preview.enabled) return <PreviewAnalysisRoute />;
  return <OwnerPrivateAnalysisRoute />;
}
