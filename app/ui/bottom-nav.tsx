"use client";

import {
  ChartNoAxesColumnIncreasing,
  House,
  Receipt,
  Settings,
} from "lucide-react";
import Link from "next/link";

type Active = "home" | "add" | "investments" | "settings";

const items = [
  { id: "home", label: "首頁", href: "/", icon: House },
  { id: "add", label: "記帳", href: "/transactions", icon: Receipt },
  {
    id: "investments",
    label: "投資",
    href: "/investments",
    icon: ChartNoAxesColumnIncreasing,
  },
  { id: "settings", label: "設定", href: "/settings", icon: Settings },
] as const;

export default function BottomNav({ active }: { active: Active }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(15,23,42,0.07)] sm:hidden">
      <div className="mx-auto grid h-[82px] max-w-xl grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`group flex flex-col items-center justify-center gap-1 text-sm font-medium transition-colors ${
                isActive
                  ? "text-[#0B132B]"
                  : "text-[#94A3B8] hover:text-slate-700"
              }`}
            >
              <span
                className={`grid h-14 w-14 place-items-center rounded-full transition-colors ${
                  isActive
                    ? "bg-[#0B132B] text-white"
                    : "bg-transparent text-[#94A3B8] group-hover:text-slate-700"
                }`}
                aria-hidden="true"
              >
                <Icon size={24} strokeWidth={2.5} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
