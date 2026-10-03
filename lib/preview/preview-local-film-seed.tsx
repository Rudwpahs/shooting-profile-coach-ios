import { useEffect } from "react";

import { createBrowserPreviewLocalFilmSeedPorts, seedPreviewLocalFilmShots } from "@/lib/dev/preview-local-film-seed";

/**
 * Mounted once by the web preview runtime: if a local-only preview folder is
 * served next to the bundle, its clips become device-local film shots on
 * first load. On the public Pages site there is no folder and this renders
 * nothing and changes nothing.
 */
export function PreviewLocalFilmSeed() {
  useEffect(() => {
    const ports = createBrowserPreviewLocalFilmSeedPorts();
    if (!ports) return;
    void seedPreviewLocalFilmShots(ports).catch(() => undefined);
  }, []);
  return null;
}
