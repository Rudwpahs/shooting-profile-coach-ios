import { Redirect } from "expo-router";

/** Legacy route retained for old links; the supported product motion surface is Explore. */
export default function MotionRoute() {
  return <Redirect href="/explore" />;
}
