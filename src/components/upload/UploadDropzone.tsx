"use client";

import { useCallback, useRef, useState } from "react";
import { useUploadSets } from "@/hooks/useUploadSets";

interface UploadDropzoneProps {
  /** Called after a successful upload with the accepted/rejected breakdown. */
  onComplete?: (result: {
    accepted: Array<{ name: string; setId: string; setTitle: string }>;
    rejected: Array<{ name: string; reason: string }>;
  }) => void;
  /** Called on upload error. */
  onError?: (err: Error) => void;
}

/**
 * Minimal drag-and-drop upload component for `.json` question-set files.
 * Wired to `useUploadSets()` — UI is completed in F8. This component is
 * the reusable primitive that F8 can compose and style further.
 */
export function UploadDropzone({ onComplete, onError }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutate, isPending } = useUploadSets();

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      mutate(
        { files },
        {
          onSuccess: (result) => onComplete?.(result),
          onError: (err) => onError?.(err),
        },
      );
    },
    [mutate, onComplete, onError],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) handleFiles(e.target.files);
    },
    [handleFiles],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload question set JSON files"
      aria-disabled={isPending}
      data-dragging={isDragging ? "true" : undefined}
      className="upload-dropzone"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        multiple
        className="sr-only"
        disabled={isPending}
        onChange={handleInputChange}
      />
      {isPending ? (
        <span>Uploading...</span>
      ) : (
        <span>Drop .json files here or click to browse</span>
      )}
    </div>
  );
}
