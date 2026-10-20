"use client";

import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";

interface Post {
  id: string;
  author: string;
  text: string;
  at: string;
}

const KEY = "ob-community-posts";

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("Trader");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "[]") as Post[];
      setPosts(saved);
      const user = JSON.parse(localStorage.getItem("ob-user") || "null") as {
        name?: string;
      } | null;
      if (user?.name) setAuthor(user.name);
    } catch {
      /* ignore */
    }
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const post: Post = {
      id: crypto.randomUUID(),
      author,
      text: text.trim(),
      at: new Date().toISOString(),
    };
    const next = [post, ...posts].slice(0, 50);
    setPosts(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    setText("");
  };

  return (
    <div>
      <SiteHeader solid />
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Community</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Share setups and lessons. Posts stay in your browser (local demo).
        </p>

        <form
          onSubmit={submit}
          className="mt-6 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="field"
            placeholder="Display name"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="field min-h-24"
            placeholder="Setup notes — no tips selling"
          />
          <button
            type="submit"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          >
            Post
          </button>
        </form>

        <ul className="mt-6 space-y-3">
          {posts.length === 0 && (
            <li className="text-sm text-[var(--muted)]">No posts yet.</li>
          )}
          {posts.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="text-xs text-[var(--muted)]">
                <strong className="text-[var(--fg)]">{p.author}</strong> ·{" "}
                {new Date(p.at).toLocaleString("en-IN")}
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap">{p.text}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
