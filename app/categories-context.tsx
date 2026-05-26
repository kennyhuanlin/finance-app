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
import { createCategory, getCategories } from "./lib/googleSheets";

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
  updateCategory: (category: Category) => void;
  deleteCategory: (id: string) => void;
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
      updateCategory: (category) => {
        setCategories((current) =>
          current.map((item) => (item.id === category.id ? category : item)),
        );
      },
      deleteCategory: (id) => {
        setCategories((current) => current.filter((item) => item.id !== id));
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
