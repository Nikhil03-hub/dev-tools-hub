import { useEffect, useState } from "react";
import { setToastListener } from "../lib/toastBus";
import { CheckCircle2 } from "lucide-react";

export default function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout>;
    setToastListener((m) => {
      setMessage(m);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setMessage(null), 1600);
    });
    return () => {
      setToastListener(null);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!message) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-raised/95 px-4 py-2 text-sm text-ink shadow-pop backdrop-blur animate-slide-up">
        <CheckCircle2 className="h-4 w-4 text-ok" strokeWidth={2} />
        {message}
      </div>
    </div>
  );
}
