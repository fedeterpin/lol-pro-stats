"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";

// "Back" respects where the user came from (search → home, leaderboards →
// leaderboards, etc.). If there's no in-site history (direct entry or shared
// link) we fall back to home.
export default function BackLink() {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="back"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/");
      }}
    >
      ← {t("common.back")}
    </button>
  );
}
