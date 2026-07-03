import Link from "next/link";
import BottomNav from "../ui/bottom-nav";

const settings = [
  {
    href: "/categories",
    icon: "▦",
    title: "分類管理",
    description: "管理收入與支出分類",
  },
  {
    href: "/recurring",
    icon: "↻",
    title: "固定收支",
    description: "管理固定支出、收入與分期",
  },
  {
    href: "/analytics",
    icon: "⌁",
    title: "分析",
    description: "查看收支結構與趨勢",
  },
];

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 sm:px-6">
        <header>
          <p className="text-sm font-medium text-indigo-500">Preferences</p>
          <h1 className="mt-1 text-3xl font-semibold">設定</h1>
          <p className="mt-2 text-sm text-slate-500">整理記帳規則與查看分析</p>
        </header>
        <section className="overflow-hidden rounded-[30px] border border-white/80 bg-white/85 px-5 shadow-sm shadow-slate-200/80">
          {settings.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 border-b border-slate-100 py-5 last:border-0"
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-50 text-xl text-indigo-600">
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{item.title}</span>
                <span className="mt-1 block text-sm text-slate-400">{item.description}</span>
              </span>
              <span className="text-slate-300">›</span>
            </Link>
          ))}
        </section>
      </section>
      <BottomNav active="settings" />
    </main>
  );
}
