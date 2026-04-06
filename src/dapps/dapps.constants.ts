export type StoredDAppCategory = string;

export interface StoredDAppTab {
  id: StoredDAppCategory;
  label: string;
  order: number;
  enabled: boolean;
}

export interface StoredDApp {
  id: string;
  name: string;
  description: string;
  icon: string;
  categories: StoredDAppCategory[];
  order: number;
  url: string;
  featured?: boolean;
  createdAt: string;
  updatedAt: string;
}
