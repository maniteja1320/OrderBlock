"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"guest" | "user">("guest");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const finish = (profile: { name: string; email?: string; phone?: string }) => {
    localStorage.setItem("ob-user", JSON.stringify(profile));
    router.push("/terminal");
  };

  return (
    <div>
      <SiteHeader solid />
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Preview the terminal with guest login, or continue as a user.
        </p>

        <div className="mt-6 flex rounded-lg border border-[var(--border)] p-1">
          <button
            type="button"
            onClick={() => setMode("guest")}
            className={`flex-1 rounded-md py-2 text-sm ${
              mode === "guest" ? "bg-[var(--surface-2)] font-medium" : ""
            }`}
          >
            Guest Login
          </button>
          <button
            type="button"
            onClick={() => setMode("user")}
            className={`flex-1 rounded-md py-2 text-sm ${
              mode === "user" ? "bg-[var(--surface-2)] font-medium" : ""
            }`}
          >
            User Login
          </button>
        </div>

        {mode === "guest" ? (
          <div className="mt-6 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-xs text-[var(--muted)]">
              Guest Login: we only need your WhatsApp number (stored locally in
              this demo).
            </p>
            <label className="block text-xs text-[var(--muted)]">
              WhatsApp number
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                placeholder="9876543210"
              />
            </label>
            {!sent ? (
              <button
                type="button"
                disabled={phone.replace(/\D/g, "").length < 10}
                onClick={() => setSent(true)}
                className="w-full rounded-md bg-[var(--accent)] py-2.5 text-sm font-medium text-white disabled:opacity-40"
              >
                Send 4-digit code
              </button>
            ) : (
              <>
                <p className="text-xs text-emerald-600">
                  Demo code: <strong>1234</strong>
                </p>
                <label className="block text-xs text-[var(--muted)]">
                  Enter code
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                    placeholder="1234"
                    maxLength={4}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (code === "1234") {
                      finish({ name: "Guest", phone });
                    } else {
                      alert("Invalid code. Use 1234 for demo.");
                    }
                  }}
                  className="w-full rounded-md bg-[var(--accent)] py-2.5 text-sm font-medium text-white"
                >
                  Continue to terminal
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="mt-6 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-xs text-[var(--muted)]">
              User Login: we only receive your name, email and profile photo
              (local demo — no Google OAuth keys required).
            </p>
            <label className="block text-xs text-[var(--muted)]">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-[var(--muted)]">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                if (!name || !email) return;
                finish({ name, email });
              }}
              className="w-full rounded-md bg-[var(--accent)] py-2.5 text-sm font-medium text-white"
            >
              Continue with email
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          Or skip straight to the{" "}
          <Link href="/terminal" className="text-[var(--accent)] underline">
            live terminal
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
