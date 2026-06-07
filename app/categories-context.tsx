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
  refreshCategories: () => Promise<void>;
  addCategory: (category: Omit<Category, "id">) => Promise<void>;
  updateCategory: (category: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
};

const CategoriesContext = createContext<CategoriesContextValue | null>(null);

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

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

  const refreshCategories = useCallback(async () => {
    await Promise.resolve();
    setIsLoadingCategories(true);

    try {
      const sheetCategories = await getCategories<Record<string, unknown>>();
      setCategories(
        dedupeCategories(
          sheetCategories.map((category, index) =>
            normalizeCategory(category, index),
          ),
        ),
      );
    } catch {
      setCategories([]);
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshCategories();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [refreshCategories]);

  const value = useMemo<CategoriesContextValue>(
    () => ({
      categories,
      isLoadingCategories,
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
    [categories, isLoadingCategories, refreshCategories],
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
