import sharp from 'sharp';
import { z } from 'zod';

const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
export const SemanticOutlineSchema = z.object({
  found: z.boolean(),
  reason: z.string().min(1).max(1000),
  // Exterior boundaries only: a face must never be punched out by colour similarity.
  polygons: z.array(z.array(point).min(3).max(96)).max(4),
  face: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().positive().max(.5), h: z.number().positive().max(.5) }).strict().nullable(),
}).strict();
export type SemanticOutline = z.infer<typeof SemanticOutlineSchema>;

/** Deterministic rasterization, not a generated alpha image. Model output is untrusted. */
export async function semanticAlpha(raw: unknown, width: number, height: number): Promise<Buffer> {
  const outline = SemanticOutlineSchema.parse(raw);
  if (!outline.found || !outline.face || outline.polygons.length === 0) throw Error('No confidently localized child');
  if (![width,height].every(n=>Number.isSafeInteger(n)&&n>=32&&n<=3840)) throw Error('Invalid mask dimensions');
  const face=outline.face;
  if(face.x+face.w>1||face.y+face.h>1)throw Error('Face outside image');
  if(face.w*width<4||face.h*height<4)throw Error('Face too small to validate');
  const paths=outline.polygons.map(points=>{
    let area=0;
    const cross=(a:{x:number;y:number},b:{x:number;y:number},c:{x:number;y:number})=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    for(let i=0;i<points.length;i++){
      const a=points[i]!,b=points[(i+1)%points.length]!;
      area+=a.x*b.y-b.x*a.y;
      for(let j=i+2;j<points.length;j++){
        if(i===0&&j===points.length-1)continue;
        const c=points[j]!,d=points[(j+1)%points.length]!;
        if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)throw Error('Self-intersecting outline');
      }
    }
    if(Math.abs(area)<.00002||Math.abs(area)>.8)throw Error('Implausible outline area');
    return `<polygon points="${points.map(p=>`${p.x*width},${p.y*height}`).join(' ')}" fill="white"/>`;
  });
  const png=await sharp(Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="black"/>${paths.join('')}</svg>`)).png().toBuffer();
  const alpha=await sharp(png).extractChannel(0).raw().toBuffer();
  // The inner face must already lie in a solid outline. Never fabricate skin or
  // fill an out-of-bounds face to make a malformed localization pass.
  for(let y=Math.ceil((face.y+face.h*.15)*height);y<Math.floor((face.y+face.h*.85)*height);y++){
    for(let x=Math.ceil((face.x+face.w*.15)*width);x<Math.floor((face.x+face.w*.85)*width);x++){
      if(alpha[y*width+x]!<250)throw Error('Outline cuts the protected face');
    }
  }
  return png;
}
