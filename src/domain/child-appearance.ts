/** Parent-supplied age in the reference photo; never inferred from a name. */
export const CHILD_AGES = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function validChildAge(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 2 && value <= 10;
}

/** Unknown legacy ages remain unknown, rather than silently making everyone eight. */
export function childAgeDirection(ageYears?: number | null): string {
  if (ageYears != null && !validChildAge(ageYears)) throw new Error("Invalid child age");
  const age = ageYears == null
    ? "Preserve the young age visible in the original child reference; the exact age was not supplied."
    : `The parent states that this child is ${ageYears} years old in the photograph. Preserve that age in the face AND the whole body in every pose.`;
  const stage = "Use age-appropriate child proportions, narrow shoulders, small hands and a softly rounded youthful face. No mature jawline, adult musculature, adult torso proportions or adult fashion-model posing. Preserve the age differences between a toddler, a preschooler and a school-age child; do not make a school-age child into a toddler with a huge head.";
  return `${age} ${stage} Identity and age come from the child reference, not from the adults nearby. Do not infer gender from the name or add makeup to imply it.`;
}
