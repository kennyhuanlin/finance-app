export type CategoryLike = {
  name: string;
  type: string;
  emoji?: string;
};

export function normalizeCategoryName(name: string) {
  return name.trim().toLowerCase();
}

export function getCategoryDedupeKey(category: CategoryLike) {
  return `${category.type}:${normalizeCategoryName(category.name)}`;
}

export function dedupeCategories<T extends CategoryLike>(categories: T[]) {
  const seen = new Set<string>();

  return categories.filter((category) => {
    const key = getCategoryDedupeKey(category);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function hasDuplicateCategory<T extends CategoryLike>(
  categories: T[],
  category: CategoryLike,
) {
  const targetKey = getCategoryDedupeKey(category);

  return categories.some((item) => getCategoryDedupeKey(item) === targetKey);
}

export function formatCategoryLabel(category: CategoryLike) {
  return `${category.emoji ? `${category.emoji} ` : ""}${category.name}`;
}
