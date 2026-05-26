"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { categories as initialCategories } from "./data";

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
  addCategory: (category: Omit<Category, "id">) => void;
  updateCategory: (category: Category) => void;
  deleteCategory: (id: string) => void;
};

const CategoriesContext = createContext<CategoriesContextValue | null>(null);

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>(
    initialCategories as Category[],
  );

  const value = useMemo<CategoriesContextValue>(
    () => ({
      categories,
      addCategory: (category) => {
        setCategories((current) => [
          {
            ...category,
            id: `cat-${Date.now()}`,
          },
          ...current,
        ]);
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
    [categories],
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
