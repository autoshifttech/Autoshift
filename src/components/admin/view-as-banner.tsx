"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";

const KEY = "autoshift.viewAs";

interface ViewAs {
  name: string;
  from: string;
}

function read(): ViewAs | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const name = params.get("viewAs");
    if (name) {
      const v = { name, from: params.get("from") || "/admin/businesses" };
      window.sessionStorage.setItem(KEY, JSON.stringify(v));
      return v;
    }
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ViewAs) : null;
  } catch {
    return null;
  }
}

/** Shown in the business app while an admin is viewing a workspace read-only. */
export function ViewAsBanner() {
  const [v, setV] = useState<ViewAs | null>(null);
  // sessionStorage only exists in the browser, so read it after mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setV(read());
  }, []);
  if (!v) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#10211c] px-4 py-2 text-center text-xs text-white sm:text-sm">
      <Eye className="size-4 text-[#c9f27a]" />
      <span>
        Viewing <strong>{v.name}</strong> as admin · read-only
      </span>
      <button
        type="button"
        className="font-semibold text-[#c9f27a] underline underline-offset-2 hover:no-underline"
        onClick={() => {
          try {
            window.sessionStorage.removeItem(KEY);
          } catch {}
          window.location.href = v.from;
        }}
      >
        Back to admin
      </button>
    </div>
  );
}
