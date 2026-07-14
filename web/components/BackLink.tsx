"use client";

import { useRouter } from "next/navigation";

// "Back" respeta de dónde vino el usuario (search → home, leaderboards →
// leaderboards, etc.). Si no hay historial dentro del sitio (entrada directa
// o link compartido) caemos a la home.
export default function BackLink() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="back"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/");
      }}
    >
      ← Back
    </button>
  );
}
