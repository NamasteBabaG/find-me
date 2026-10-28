import sharp from 'sharp';

const MAX_BYTES=5*1024*1024;
/** Preserve every accepted historical byte. Oversized native PNG evidence is
 * encoded losslessly with adaptive filters, retaining dimensions, alpha and all
 * pixels. It must still fit the original admission bound; no resizing or lossy
 * fallback can hide seams or reduce face evidence. Purchases bind the final bytes.
 */
export async function boundedVisualEvidencePng(png:Buffer):Promise<Buffer>{
  if(png.length<=MAX_BYTES)return png;
  const metadata=await sharp(png,{limitInputPixels:25_000_000}).metadata();
  if(metadata.format!=='png'||(metadata.pages??1)!==1||(metadata.orientation??1)!==1)throw Error('VISUAL_EVIDENCE: single native PNG required');
  const packed=await sharp(png,{limitInputPixels:25_000_000}).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
  if(packed.length>MAX_BYTES)throw Error('VISUAL_EVIDENCE: native lossless context exceeds the original byte bound');
  return packed;
}
