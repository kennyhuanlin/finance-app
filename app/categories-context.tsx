"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  dedupeCategories,
  hasDuplicateCategory,
} from "./lib/categories";
import {
  createCategory,
  deleteCategory as deleteSheetCategory,
  getCategories,
  updateCategory as updateSheetCategory,
} from "./lib/googleSheets";

export type CategoryType = "income" | "expense";

export type Category = {
  id: string;
  name: string;
  emoji: string;
  type: CategoryType;
  color: string;
};

type CategoriesContextValue = {
  categories: Category[];
  isLoadingCategories: boolean;
  categoriesReady: boolean;
  categoriesError: string;
  ensureCategories: (timeoutMs?: number) => Promise<Category[]>;
  refreshCategories: () => Promise<void>;
  addCategory: (category: Omit<Category, "id">) => Promise<void>;
  updateCategory: (category: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
};

const CategoriesContext = createContext<CategoriesContextValue | null>(null);
const CATEGORY_CACHE_KEY = "finance-categories-v1";
const CATEGORY_CACHE_TTL = 5 * 60 * 1000;
type CategoryCache = { categories: Category[]; timestamp: number };
let memoryCache: CategoryCache | undefined;
let pendingCategories: Promise<Category[]> | undefined;

function normalizeCategory(
  category: Record<string, unknown>,
  index: number,
): Category {
  const type = category.type === "income" ? "income" : "expense";

  return {
    id: String(category.id ?? `cat-sheet-${index}`),
    name: String(category.name ?? ""),
    emoji: String(category.emoji ?? "📦"),
    type,
    color: String(category.color ?? "#64748b"),
  };
}

function readCategoryCache() {
  if (memoryCache && Date.now() - memoryCache.timestamp < CATEGORY_CACHE_TTL) {
    console.info("categories loaded", { source: "memory" });
    return memoryCache.categories;
  }
  memoryCache = undefined;
  if (typeof window === "undefined") return null;
  const stored = sessionStorage.getItem(CATEGORY_CACHE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as CategoryCache;
    if (parsed && Date.now() - parsed.timestamp < CATEGORY_CACHE_TTL) {
      memoryCache = parsed;
      console.info("categories loaded", { source: "sessionStorage" });
      return parsed.categories;
    }
  } catch {
    // Invalid browser cache is ignored and replaced by the network response.
  }
  sessionStorage.removeItem(CATEGORY_CACHE_KEY);
  return null;
}

function loadCategoriesFromNetwork() {
  if (pendingCategories) return pendingCategories;
  pendingCategories = getCategories<Record<string, unknown>>()
    .then((sheetCategories) =>
      dedupeCategories(
        sheetCategories.map((category, index) =>
          normalizeCategory(category, index),
        ),
      ),
    )
    .then((categories) => {
      memoryCache = { categories, timestamp: Date.now() };
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(CATEGORY_CACHE_KEY, JSON.stringify(memoryCache));
        } catch {
          // The memory cache remains available when browser storage is blocked.
        }
      }
      console.info("categories loaded", { source: "network" });
      return categories;
    })
    .finally(() => {
      pendingCategories = undefined;
    });
  return pendingCategories;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  const signal = AbortSignal.timeout(timeoutMs);
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("分類資料載入逾時")), {
        once: true,
      });
    }),
  ]);
}

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>(() =>
    readCategoryCache() ?? [],
  );
  const [isLoadingCategories, setIsLoadingCategories] = useState(
    () => !memoryCache,
  );
  const [categoriesError, setCategoriesError] = useState("");

  const refreshCategories = useCallback(async () => {
    try {
      setCategories(await loadCategoriesFromNetwork());
      setCategoriesError("");
    } catch (error) {
      setCategoriesError(
        error instanceof Error ? error.message : "分類載入失敗",
      );
      if (!memoryCache) setCategories([]);
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    loadCategoriesFromNetwork()
      .then((loaded) => {
        if (!isMounted) return;
        setCategories(loaded);
        setCategoriesError("");
      })
      .catch((error) => {
        if (!isMounted) return;
        setCategoriesError(
          error instanceof Error ? error.message : "分類載入失敗",
        );
      })
      .finally(() => {
        if (isMounted) setIsLoadingCategories(false);
      });
    return () => {
      isMounted = false;
    };
  }, [refreshCategories]);

  const ensureCategories = useCallback(async (timeoutMs = 2000) => {
    const cached = readCategoryCache();
    if (cached?.length) return cached;
    const loaded = await withTimeout(loadCategoriesFromNetwork(), timeoutMs);
    setCategories(loaded);
    setCategoriesError("");
    setIsLoadingCategories(false);
    return loaded;
  }, []);

  const value = useMemo<CategoriesContextValue>(
    () => ({
      categories,
      isLoadingCategories,
      categoriesReady: !isLoadingCategories && categories.length > 0,
      categoriesError,
      ensureCategories,
      refreshCategories,
      addCategory: async (category) => {
        const nextCategory = {
          ...category,
          name: category.name.trim(),
        };

        if (
          hasDuplicateCategory(categories, {
            type: nextCategory.type,
            name: nextCategory.name,
          })
        ) {
          throw new Error("此分類已存在");
        }

        await createCategory({
          id: `cat-${Date.now()}`,
          name: nextCategory.name,
          emoji: nextCategory.emoji,
          type: nextCategory.type,
          color: nextCategory.color,
        });
        await refreshCategories();
      },
      updateCategory: async (category) => {
        await updateSheetCategory(category.id, {
          id: category.id,
          name: category.name.trim(),
          emoji: category.emoji,
          type: category.type,
          color: category.color,
        });
        await refreshCategories();
      },
      deleteCategory: async (id) => {
        await deleteSheetCategory(id);
        await refreshCategories();
      },
    }),
    [
      categories,
      categoriesError,
      ensureCategories,
      isLoadingCategories,
      refreshCategories,
    ],
  );

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  const context = useContext(CategoriesContext);

  if (!context) {
    throw new Error("useCategories must be used within CategoriesProvider");
  }

  return context;
}
