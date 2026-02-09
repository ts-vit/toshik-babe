import React, { useCallback, useRef, useState } from "react";
import { SendHorizonal, Paperclip, X } from "lucide-react";
import type { Attachment, AttachmentMimeType } from "@toshik-babe/shared";

const ACCEPTED_MIME_TYPES: Set<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

interface ChatInputProps {
  onSend: (text: string, attachments?: Attachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** Convert a File to a base64-encoded Attachment. */
function fileToAttachment(file: File): Promise<Attachment | null> {
  return new Promise((resolve) => {
    if (!ACCEPTED_MIME_TYPES.has(file.type)) {
      resolve(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip the "data:<mime>;base64," prefix.
      const base64 = dataUrl.split(",")[1];
      if (!base64) {
        resolve(null);
        return;
      }
      resolve({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: file.type as AttachmentMimeType,
        data: base64,
        name: file.name || "image",
      });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/** Extract image files from a DataTransfer (paste or drop). */
function extractImageFiles(dt: DataTransfer): File[] {
  const files: File[] = [];
  for (let i = 0; i < dt.files.length; i++) {
    const f = dt.files[i];
    if (f && ACCEPTED_MIME_TYPES.has(f.type)) {
      files.push(f);
    }
  }
  return files;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Message Toshik Babe...",
}: ChatInputProps): React.JSX.Element {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (files: File[]) => {
    const results = await Promise.all(files.map(fileToAttachment));
    const valid = results.filter((a): a is Attachment => a !== null);
    if (valid.length > 0) {
      setAttachments((prev) => [...prev, ...valid]);
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = value.trim();
      if ((!text && attachments.length === 0) || disabled) return;
      onSend(text, attachments.length > 0 ? attachments : undefined);
      setValue("");
      setAttachments([]);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.style.height = "auto";
          inputRef.current.focus();
        }
      });
    },
    [value, disabled, onSend, attachments],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!e.clipboardData) return;
      const files = extractImageFiles(e.clipboardData);
      if (files.length > 0) {
        e.preventDefault();
        void addFiles(files);
      }
    },
    [addFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!e.dataTransfer) return;
      const files = extractImageFiles(e.dataTransfer);
      if (files.length > 0) {
        void addFiles(files);
      }
    },
    [addFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      void addFiles(Array.from(files));
      // Reset so the same file can be selected again.
      e.target.value = "";
    },
    [addFiles],
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  const canSend = !disabled && (value.trim().length > 0 || attachments.length > 0);

  return (
    <div
      className="border-t border-border bg-background px-4 py-3"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="max-w-3xl mx-auto">
        {/* Image preview strip */}
        {attachments.length > 0 && (
          <div className="flex gap-2 pb-2 overflow-x-auto">
            {attachments.map((att) => (
              <ImagePreview
                key={att.id}
                attachment={att}
                onRemove={() => removeAttachment(att.id)}
              />
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />

          {/* Attach button */}
          <button
            type="button"
            disabled={disabled}
            aria-label="Attach image"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 shrink-0"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <textarea
            ref={inputRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50 py-1.5 max-h-[200px]"
          />

          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={!canSend}
            aria-label="Send message"
            className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            <SendHorizonal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Thumbnail preview of an attached image with a remove button. */
function ImagePreview({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}): React.JSX.Element {
  const src = `data:${attachment.type};base64,${attachment.data}`;

  return (
    <div className="relative group shrink-0">
      <img
        src={src}
        alt={attachment.name}
        className="h-16 w-16 object-cover rounded-lg border border-border"
      />
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label={`Remove ${attachment.name}`}
      >
        <X className="h-3 w-3" />
      </button>
      <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[9px] text-white text-center truncate px-1 rounded-b-lg">
        {attachment.name}
      </span>
    </div>
  );
}
