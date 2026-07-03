"use client";

import Link from "next/link";

type Active = "home" | "add" | "investments" | "settings";

const items = [
  { id: "home", label: "首頁", href: "/", icon: "⌂" },
  { id: "add", label: "記帳", href: "/add", icon: "＋" },
  { id: "investments", label: "投資", href: "/investments", icon: "↗" },
  { id: "settings", label: "設定", href: "/settings", icon: "⚙" },
] as const;

export default function BottomNav({ active }: { active: Active }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/80 bg-white/90 px-5 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_32px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:hidden">
      <div className="mx-auto grid max-w-xl grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`flex flex-col items-center gap-1 text-xs font-medium ${
              active === item.id ? "text-slate-950" : "text-slate-400"
            }`}
          >
            <span className="text-xl leading-5" aria-hidden="true">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
