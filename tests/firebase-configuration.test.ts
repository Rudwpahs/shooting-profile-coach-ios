import { describe, expect, it } from "vitest";

describe("Firebase public client configuration", () => {
  it("accepts the configured API key at Firebase Identity Toolkit without creating an account", async () => {
    const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
    expect(apiKey).toBeTruthy();

    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const payload = await response.json() as { error?: { message?: string } };

    // Empty credentials must fail validation, but a valid Firebase key must reach
    // the Identity Toolkit instead of returning API_KEY_INVALID.
    expect(response.status).toBe(400);
    expect(payload.error?.message).not.toBe("API_KEY_INVALID");
    expect(payload.error?.message).toBeTruthy();
  });
});
