import { actions } from "astro:actions";
import { useEffect, useState } from "preact/hooks";

/**
 * Demo island (issue #57): on mount it calls the `greet` Astro Action over RPC
 * and renders the result. This proves the full chain end-to-end — a hydrated
 * island reaches typed server code (`src/actions` → `src/server`), which reads a
 * Cloudflare binding and runs an Effect program — without any of that server
 * code entering the client bundle (it arrives only via `astro:actions`).
 */
export default function ServerCheck() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    actions
      .greet({ name: "island" })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        else setMessage(data.message);
      })
      .catch((cause: unknown) => {
        // A rejected promise is a transport failure, distinct from the Action's
        // typed `error`; surface it rather than sitting on "Loading…" forever.
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return <p data-testid="server-check-error">{error}</p>;
  }
  return <p data-testid="server-check-message">{message ?? "Loading…"}</p>;
}
