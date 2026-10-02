import { Redirect } from "expo-router";

/** An address the app does not know goes to Home instead of an unmatched-route page. */
export default function NotFoundRoute() {
  return <Redirect href="/" />;
}
