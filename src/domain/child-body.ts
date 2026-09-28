import { validChildAge } from "./child-appearance";

/** Drawing guidance, not a measurement of an individual child's height.
 * Age controls anatomy independently of the identity portrait's body. */
export function childBodyDirection(age: number): string {
  if (!validChildAge(age)) throw Error("A confirmed body age is required");
  const stage = age <= 3
    ? "Toddler: compact torso, short arms and legs, a naturally larger head-to-body ratio and a small supported stance."
    : age <= 5
      ? "Preschool: short child limbs, small narrow shoulders and a compact torso; taller and less baby-like than a toddler."
      : age <= 7
        ? "Early school age: longer arms and legs and a taller body than a preschooler at the same depth, with a smaller head-to-body ratio; still narrow child shoulders and small hands."
        : "School age: visibly taller and longer-limbed than a five-year-old at the same depth, with a longer torso and smaller head-to-body ratio; child shoulders, hands and feet, without adult musculature or mature chest. Do not shrink this child into a preschool body.";
  return `BODY AGE CONTRACT: ${age} years. ${stage} Use this stated age for standing height, torso length, shoulder breadth, arm and leg lengths, hands, feet and head-to-body ratio. The portrait supplies facial identity and hair ONLY; neither its body nor the replaced person's age/proportions is a body template. Compare physical height with people and fixed objects at the SAME ground depth. Pose may bend or occlude the body without changing its implied standing height. Preserve the authored support and camera distance. Do not change facial identity, enlarge the head, uniformly resize a toddler, or move forward to simulate growth. Judge only visible anatomy; never invent hidden limbs.`;
}
