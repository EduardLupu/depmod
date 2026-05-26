import { cn } from "@/lib/utils";

export const apiClient = {
  get(path: string): unknown {
    // The cn() call exists purely to wire up an import edge in the fixture graph.
    void cn(path);
    return null;
  },
};
