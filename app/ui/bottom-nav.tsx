"use client";

import Link from "next/link";

type Active = "home" | "add" | "investments" | "settings";

const items = [
  { id: "home", label: "首頁", href: "/", icon: HomeIcon },
  { id: "add", label: "記帳", href: "/transactions", icon: ReceiptIcon },
  {
    id: "investments",
    label: "投資",
    href: "/investments",
    icon: TrendingIcon,
  },
  { id: "settings", label: "設定", href: "/settings", icon: SettingsIcon },
] as const;

export default function BottomNav({ active }: { active: Active }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/80 bg-white/90 px-5 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_32px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:hidden">
      <div className="mx-auto grid max-w-xl grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex flex-col items-center gap-1 text-xs font-medium ${
                isActive ? "text-slate-950" : "text-slate-400"
              }`}
            >
              <span
                className={`grid h-9 w-12 place-items-center rounded-full transition-colors ${
                  isActive
                    ? "bg-slate-950 text-white"
                    : "bg-transparent text-slate-400"
                }`}
                aria-hidden="true"
              >
                <Icon />
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function IconFrame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function HomeIcon() {
  return (
    <IconFrame>
      <path d="m3.5 10.5 8.5-7 8.5 7" />
      <path d="M5.5 9v10.5h13V9M9.5 19.5v-6h5v6" />
    </IconFrame>
  );
}

function ReceiptIcon() {
  return (
    <IconFrame>
      <path d="M6 3.5h12v17l-2-1.5-2 1.5-2-1.5-2 1.5L8 19l-2 1.5v-17Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </IconFrame>
  );
}

function TrendingIcon() {
  return (
    <IconFrame>
      <path d="M4 19.5V14M10 19.5V9M16 19.5V4.5" />
      <path d="m4 10 5-4 4 2 7-5" />
      <path d="M16.5 3H20v3.5" />
    </IconFrame>
  );
}

function SettingsIcon() {
  return (
    <IconFrame>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.5v-.1A1.7 1.7 0 0 0 8.4 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.2V9.5h.1A1.7 1.7 0 0 0 4 8.4a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.46 3.6l.06.06A1.7 1.7 0 0 0 8.4 4a1.7 1.7 0 0 0 1-.6A1.7 1.7 0 0 0 9.8 2.3v-.1h4.1v.1A1.7 1.7 0 0 0 15 4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.4a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4.1h-.1a1.7 1.7 0 0 0-1.7 1.1Z" />
    </IconFrame>
  );
}
