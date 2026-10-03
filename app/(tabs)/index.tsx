import { useRouter } from "expo-router";
import { useState } from "react";

import { HomeFeed } from "@/components/home/home-feed";
import { ScreenContainer } from "@/components/screen-container";
import { TopBar } from "@/components/ui/top-bar";
import { useFilmShots } from "@/hooks/use-film-shots";
import { useLatestRepresentativeProfile } from "@/hooks/use-latest-representative-profile";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { FORMPATH_FLAGS } from "@/lib/feature-flags";
import { useFirebaseAuth } from "@/lib/firebase-auth";
import { useProfile } from "@/lib/profile-store";
import { getPracticeFocus } from "@/lib/recommendation";
import { setReelHandoff } from "@/lib/reels/reel-handoff";
import { homeReelItems } from "@/lib/reels/reel-sources";

const FALLBACK_WIDTH = 375;
const MAX_WIDTH = 680;
const GOAL_LABELS = { consistency: "일관성", range: "거리", release: "릴리스", rhythm: "리듬" } as const;

/**
 * 홈 answers three things in one glance: what I can do now (촬영), what my
 * motion looks like now (my latest skeleton), and what to look at next (the
 * anonymous reference). This route only wires auth, flags and navigation;
 * the feed is `HomeFeed`. The install-free web preview renders this same
 * route; only the auth and data source behind the hooks differ.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useProfile();
  const { user, loading: authLoading } = useFirebaseAuth();
  const latest = useLatestRepresentativeProfile(user, authLoading);
  // My own footage on this device; there is no pose analysis behind it, so it plays as film in Reels.
  const filmShots = useFilmShots();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const width = Math.min(measuredWidth || FALLBACK_WIDTH, MAX_WIDTH);

  return (
    <ScreenContainer
      containerClassName="bg-background"
      onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}
    >
      <TopBar wordmark="Hoop Hub" />
      <HomeFeed
        filmShots={filmShots.shots}
        filmShotsStatus={filmShots.status}
        focusTitle={getPracticeFocus(profile.goal).title}
        goalLabel={GOAL_LABELS[profile.goal]}
        latest={latest}
        onOpenAnalysis={(profileId) => router.push(`/private-analysis/${profileId}` as never)}
        onOpenCapture={() => router.push("/private-capture" as never)}
        onOpenProfile={() => router.navigate("/profile" as never)}
        onOpenReel={(reelId) => {
          // Hand Reels what Home is already showing, so it opens on the same item without a second fetch.
          setReelHandoff({ items: homeReelItems(latest, ANONYMOUS_POSE_REFERENCES, filmShots.shots), startId: reelId });
          router.push(`/reels?start=${encodeURIComponent(reelId)}` as never);
        }}
        onOpenReference={() => router.push("/library" as never)}
        onRetryFilmShots={filmShots.reload}
        reference={ANONYMOUS_POSE_REFERENCES[0]}
        viewerEnabled={FORMPATH_FLAGS.representative4DViewer}
        width={width}
      />
    </ScreenContainer>
  );
}
