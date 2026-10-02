import { useGlobalSearchParams, usePathname } from "expo-router";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { subscribeFilmSpaceWebMetrics } from "@/lib/film-space/web-metrics";

/**
 * Web preview outer shell. On a phone-width browser the real app fills the
 * viewport. On a desktop browser the real app runs inside a phone-sized
 * iframe of this same page, so every product component sees a genuine
 * phone viewport (window size, safe areas, dvh) without any layout change.
 * The framed app reports its route to the outer page, which mirrors it in
 * the address bar so refresh and sharing keep working.
 */

const DESKTOP_MIN_WIDTH = 768;
const PHONE_WIDTH = 390;
const PHONE_MAX_HEIGHT = 844;
const OUTER_PADDING = 24;
const ROUTE_MESSAGE = "hoophub-preview-route";

type RouteMessage = { type: typeof ROUTE_MESSAGE; href: string };

declare global {
  interface Window {
    __HOOPHUB_FILM_SPACE_METRICS__?: unknown;
  }
}

function isFramed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** Inside the frame: mirror the app's route to the outer page. Same origin only. */
function PreviewFrameRouteSync() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const serializedParams = JSON.stringify(params);
  useEffect(() => {
    if (typeof window === "undefined" || !isFramed()) return;
    const message: RouteMessage = { type: ROUTE_MESSAGE, href: window.location.href };
    window.parent.postMessage(message, window.location.origin);
  }, [pathname, serializedParams]);
  return null;
}

/** Outer page on desktop: a neutral stage with the real app in a phone-sized frame. */
function PreviewDesktopFrame() {
  const [src] = useState(() => window.location.href);
  const [height, setHeight] = useState(() => Math.min(PHONE_MAX_HEIGHT, window.innerHeight - OUTER_PADDING * 2));

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as Partial<RouteMessage> | null;
      if (!data || data.type !== ROUTE_MESSAGE || typeof data.href !== "string") return;
      try {
        const url = new URL(data.href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        const next = url.pathname + url.search + url.hash;
        if (next !== window.location.pathname + window.location.search + window.location.hash) {
          window.history.replaceState(null, "", next);
        }
      } catch {
        // A malformed route report is ignored; the frame keeps working.
      }
    };
    const onResize = () => setHeight(Math.min(PHONE_MAX_HEIGHT, window.innerHeight - OUTER_PADDING * 2));
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div data-hoophub-preview-shell="desktop" style={outerStyle}>
      <div style={{ ...deviceStyle, height }}>
        <iframe
          allow="autoplay; fullscreen; clipboard-read; clipboard-write"
          src={src}
          style={frameStyle}
          title="HoopHub 미리보기"
        />
      </div>
    </div>
  );
}

export function PreviewRuntimeRoot({ children }: { children: ReactNode }) {
  // The static HTML and the first client render are both empty, so the preview never hydrates
  // mismatched markup (icon glyphs and animation ids differ between Node and the browser); the real
  // app mounts client-side, inside the frame on desktop, straight away on a phone.
  const [mode, setMode] = useState<"hydrating" | "app" | "frame">("hydrating");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const unsubscribe = subscribeFilmSpaceWebMetrics((metrics) => {
      // QA tooling reads anonymous Film Space timing here; it holds counts and milliseconds only.
      window.__HOOPHUB_FILM_SPACE_METRICS__ = metrics;
    });
    if (isFramed()) {
      setMode("app");
      return unsubscribe;
    }
    // One-way: a window that is or becomes desktop-wide gets the frame; shrinking later keeps it, so the app never remounts.
    const decide = () => {
      if (window.innerWidth >= DESKTOP_MIN_WIDTH) {
        setMode("frame");
        window.removeEventListener("resize", decide);
      } else {
        setMode((current) => (current === "hydrating" ? "app" : current));
      }
    };
    decide();
    window.addEventListener("resize", decide);
    return () => {
      window.removeEventListener("resize", decide);
      unsubscribe();
    };
  }, []);

  if (mode === "hydrating") return null;
  if (mode === "frame") return <PreviewDesktopFrame />;
  return (
    <>
      {children}
      <PreviewFrameRouteSync />
    </>
  );
}

const outerStyle: CSSProperties = {
  alignItems: "center",
  background: "radial-gradient(circle at 50% 0%, #1b1d21 0%, #0b0c0e 60%, #07080a 100%)",
  boxSizing: "border-box",
  display: "flex",
  height: "100dvh",
  justifyContent: "center",
  padding: OUTER_PADDING,
  width: "100vw",
};

const deviceStyle: CSSProperties = {
  background: "#000",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 40,
  boxShadow: "0 30px 80px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.04)",
  overflow: "hidden",
  width: PHONE_WIDTH,
};

const frameStyle: CSSProperties = {
  border: "0",
  display: "block",
  height: "100%",
  width: "100%",
};
