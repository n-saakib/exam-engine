"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

interface UploadResult {
  accepted: Array<{ name: string; setId: string; setTitle: string }>;
  rejected: Array<{ name: string; reason: string }>;
}

interface UploadVariables {
  files: FileList | File[];
}

/**
 * Upload one or more `.json` question-set files via `POST /api/catalog/upload`
 * (multipart/form-data). Returns accepted/rejected breakdown. Invalidates set
 * lists and diagnostics on success.
 */
export function useUploadSets() {
  const queryClient = useQueryClient();

  return useMutation<UploadResult, Error, UploadVariables>({
    mutationFn: async ({ files }: UploadVariables) => {
      const formData = new FormData();
      const list = files instanceof FileList ? Array.from(files) : files;
      for (const file of list) {
        formData.append("files", file);
      }
      const res = await fetch("/api/catalog/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(data.error?.message ?? "Upload failed");
      }
      return res.json() as Promise<UploadResult>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sets"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.diagnostics() });
    },
  });
}
