import { useState } from "react";

const smallButton = "rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700";

/** Copies `text` to the clipboard, saying so — or that it couldn't (no clipboard outside https/localhost). */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className={smallButton}
      onClick={() => {
        // navigator.clipboard is missing outside secure contexts (plain http on a LAN address).
        const copy = navigator.clipboard?.writeText(text) ?? Promise.reject(new Error("Clipboard unavailable"));
        copy
          .then(() => setState("copied"))
          .catch(() => setState("failed"))
          .finally(() => setTimeout(() => setState("idle"), 2500));
      }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy — select the text instead" : label}
    </button>
  );
}
