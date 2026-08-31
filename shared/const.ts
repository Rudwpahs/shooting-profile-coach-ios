export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

/**
 * Legacy V1 personal-pose cloud persistence is disabled product-wide. Shared so
 * the Firestore boundary and the tRPC/SQL boundary refuse with the same code.
 */
export const LEGACY_CLOUD_SAVE_DISABLED = "legacy_cloud_save_disabled";
