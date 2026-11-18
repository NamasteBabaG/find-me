import { cropStyle, type PhotoCrop } from "@/domain/photo-frame";

/**
 * The parent's photo as they framed it, in a round sticker: the stored crop is
 * applied to the original, so the summary shows the face the parent chose and
 * not the middle of the photograph.
 */
export function FramedPhoto({ src, crop, size, className }: { src: string; crop: PhotoCrop | null; size: number | "100%"; className?: string }) {
  return (
    <span className={`framed-photo${className ? ` ${className}` : ""}`} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className={crop ? "framed-photo__cropped" : undefined} style={crop ? cropStyle(crop) : undefined} />
    </span>
  );
}
