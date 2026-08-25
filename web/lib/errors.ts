/**
 * Maps internal errors (Supabase auth/db/storage errors, network failures) to
 * short, human-readable messages. Never surfaces raw database errors, stack
 * traces, or secret-adjacent detail to the user.
 */
export function toUserMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message);

    if (/invalid login credentials/i.test(message)) {
      return "That email or password isn't right. Try again.";
    }
    if (/user already registered/i.test(message)) {
      return "An account with that email already exists — try logging in instead.";
    }
    if (/email not confirmed/i.test(message)) {
      return "Please confirm your email before logging in — check your inbox.";
    }
    if (/password should be at least/i.test(message)) {
      return "Your password needs to be at least 6 characters.";
    }
    if (/rate limit/i.test(message)) {
      return "Too many attempts — please wait a moment and try again.";
    }
    if (/jwt|token|session/i.test(message)) {
      return "Your session has expired — please log in again.";
    }
    if (/network|fetch failed/i.test(message)) {
      return "Couldn't reach the server — check your connection and try again.";
    }
  }

  return "Something went wrong. Please try again.";
}
