"use client";

import { useRouter } from "next/navigation";

// "Back" respects where the user came from (search → home, leaderboards →
// leaderboards, etc.). If there's no in-site history (direct entry or shared
// link) we fall back to home.
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
