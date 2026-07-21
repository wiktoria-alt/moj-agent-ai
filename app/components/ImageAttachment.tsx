"use client";

import {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  useRef,
  useState,
} from "react";

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

export type AttachedImage = {
  dataUrl: string;
  name: string;
  size: number;
  type: string;
};

function validateImageFile(file: File) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    return "Obsługuję tylko PNG, JPG, JPEG, GIF i WEBP.";
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return "Max 4MB. Zrób screenshot fragmentu.";
  }

  return null;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Nie udało się wczytać obrazu."));
    reader.readAsDataURL(file);
  });
}

export function useImageAttachment() {
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [attachmentError, setAttachmentError] = useState("");
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const dragDepthRef = useRef(0);

  async function attachImageFile(file: File | null | undefined) {
    if (!file) {
      return;
    }

    const validationError = validateImageFile(file);

    if (validationError) {
      setAttachmentError(validationError);
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAttachedImage({
        dataUrl,
        name: file.name || "Screenshot",
        size: file.size,
        type: file.type,
      });
      setAttachmentError("");
    } catch {
      setAttachmentError("Nie udało się wczytać obrazu.");
    }
  }

  function clearAttachedImage() {
    setAttachedImage(null);
    setAttachmentError("");
  }

  function handlePaste(event: ClipboardEvent<HTMLElement>) {
    const imageItem = Array.from(event.clipboardData.items).find((item) =>
      item.type.startsWith("image/"),
    );

    if (!imageItem) {
      return;
    }

    const file = imageItem.getAsFile();
    if (file) {
      event.preventDefault();
      void attachImageFile(file);
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    void attachImageFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function hasImageFile(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.items).some((item) =>
      item.type.startsWith("image/"),
    );
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    if (!hasImageFile(event)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingImage(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!hasImageFile(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingImage(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setIsDraggingImage(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    if (!hasImageFile(event)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingImage(false);
    void attachImageFile(
      Array.from(event.dataTransfer.files).find((file) =>
        file.type.startsWith("image/"),
      ),
    );
  }

  return {
    attachedImage,
    attachmentError,
    clearAttachedImage,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileInputChange,
    handlePaste,
    isDraggingImage,
    setAttachmentError,
  };
}

export function ImageAttachmentPreview({
  attachedImage,
  onRemove,
}: {
  attachedImage: AttachedImage | null;
  onRemove: () => void;
}) {
  if (!attachedImage) {
    return null;
  }

  return (
    <div className="image-attachment-preview">
      <img alt={attachedImage.name} src={attachedImage.dataUrl} />
      <div>
        <strong>📎 Screenshot - zadaj pytanie o ten obraz</strong>
        <span>{attachedImage.name}</span>
      </div>
      <button aria-label="Usuń obraz" onClick={onRemove} type="button">
        ×
      </button>
    </div>
  );
}

export function ImageDropOverlay({ isVisible }: { isVisible: boolean }) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="image-drop-overlay">
      <span>Upuść obraz</span>
    </div>
  );
}
