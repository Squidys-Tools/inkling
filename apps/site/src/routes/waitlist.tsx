import * as stylex from "@stylexjs/stylex";
import { color, font, radius } from "@inkling/ui/tokens.stylex";
import { ClerkProvider, useWaitlist } from "@clerk/tanstack-react-start";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { page } from "../layout/page.ts";
import { seo } from "../layout/seo.ts";
import { action, type } from "../parts/type.ts";

export const Route = createFileRoute("/waitlist")({
  head: () =>
    seo({
      title: "Beta waitlist · inkling",
      description:
        "Leave your email and inkling will write once, when a stable beta is ready for people to try.",
      path: "/waitlist",
    }),
  component: Waitlist,
});

// Mounted here rather than in the root route, so Clerk's script loads only on this page.
// A build without the key (a fresh clone) still prerenders; the form is just not offered.
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function Waitlist() {
  return (
    <main {...stylex.props(page.column, styles.main)}>
      <h1 {...stylex.props(type.display, styles.title)}>
        Get an email when a stable beta is ready.
      </h1>
      <p {...stylex.props(type.lede)}>
        Leave your address and we will write once, when a stable beta is ready for people to try. We
        use it for that and nothing else.
      </p>
      {publishableKey ? (
        // Clerk renders only in the browser, so the prerendered page has no form until it loads.
        <ClientOnly>
          <ClerkProvider publishableKey={publishableKey} waitlistUrl="/waitlist">
            <WaitlistForm />
          </ClerkProvider>
        </ClientOnly>
      ) : (
        <p {...stylex.props(type.body)}>The waitlist is not open on this build.</p>
      )}
    </main>
  );
}

function WaitlistForm() {
  const { waitlist } = useWaitlist();
  const [status, setStatus] = useState<"idle" | "sending" | "joined" | "failed">("idle");

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const emailAddress = new FormData(event.currentTarget).get("emailAddress");
    if (typeof emailAddress !== "string") return;
    setStatus("sending");
    try {
      const { error } = await waitlist.join({ emailAddress });
      setStatus(error ? "failed" : "joined");
    } catch {
      setStatus("failed");
    }
  }

  if (status === "joined") {
    return (
      <p role="status" {...stylex.props(type.body)}>
        Thanks. You are on the list, and we will email you when a stable beta is ready.
      </p>
    );
  }

  const sending = status === "sending";
  return (
    <form onSubmit={join} {...stylex.props(styles.form)}>
      <label htmlFor="waitlist-email" {...stylex.props(styles.label)}>
        Email address
      </label>
      <div {...stylex.props(styles.row)}>
        <input
          id="waitlist-email"
          name="emailAddress"
          type="email"
          autoComplete="email"
          required
          disabled={sending}
          {...stylex.props(styles.input)}
        />
        <button type="submit" disabled={sending} {...stylex.props(action.primary, styles.submit)}>
          {sending ? "Sending" : "Notify me"}
        </button>
      </div>
      {status === "failed" && (
        <p role="alert" {...stylex.props(type.small, styles.error)}>
          That did not go through. Check the address and try again.
        </p>
      )}
    </form>
  );
}

const styles = stylex.create({
  main: { display: "flex", flexDirection: "column", gap: "32px", paddingTop: "72px" },
  title: { maxWidth: "18ch" },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxWidth: "560px",
    marginTop: "8px",
  },
  label: { color: color.muted, fontSize: "14px" },
  row: { display: "flex", flexWrap: "wrap", gap: "12px" },
  input: {
    boxSizing: "border-box",
    flex: "1 1 260px",
    minWidth: 0,
    height: "48px",
    paddingInline: "18px",
    borderRadius: radius.round,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.borderStrong,
    backgroundColor: color.sunken,
    color: color.inkStrong,
    fontFamily: font.body,
    fontSize: "16px",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "3px",
  },
  submit: {
    borderStyle: "none",
    fontFamily: "inherit",
    cursor: "pointer",
    opacity: { default: null, ":disabled": 0.6 },
  },
  error: { color: color.danger },
});
