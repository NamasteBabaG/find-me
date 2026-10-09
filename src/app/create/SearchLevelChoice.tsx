"use client";

import { tf } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { recommendedSearchLevel, SEARCH_LEVELS, type SearchLevel } from "@/domain/search-level";

/**
 * Explorers or Detectives, under the child's name. Two answers of equal weight:
 * neither is the lesser choice, and neither is chosen until the parent chooses.
 * Native radios inside a fieldset give the group its name, arrow keys and the
 * announced state; the card is the whole tap target.
 */
export function SearchLevelChoice({ value, onChange, ageYears, describedBy, invalid = false, disabled = false }: {
  value: SearchLevel | null; onChange: (level: SearchLevel) => void; ageYears?: number | null;
  describedBy?: string; invalid?: boolean; disabled?: boolean;
}) {
  const { t } = useI18n();
  const copy = t.create.level;
  // A badge only: the age suggests, the parent decides.
  const recommended = recommendedSearchLevel(ageYears);
  return (
    <fieldset className={`level-choice${invalid ? " level-choice--invalid" : ""}`} aria-describedby={describedBy} disabled={disabled}>
      <legend className="level-choice__title">{copy.title}</legend>
      <div className="level-choice__options">
        {SEARCH_LEVELS.map(level => {
          const card = copy[level];
          const checked = value === level;
          return (
            <label key={level} className={`fm-card fm-card--selectable level-card${checked ? " fm-card--selected" : ""}`} data-level={level}>
              <input type="radio" className="level-card__input" name="searchLevel" value={level} checked={checked} onChange={() => onChange(level)} />
              <span className="level-card__check" aria-hidden="true" />
              <span className="level-card__art" aria-hidden="true"><SearchLevelArt level={level} /></span>{" "}
              <span className="level-card__name">{card.name}</span>{" "}
              <span className="level-card__ages">{card.ages}</span>{" "}
              <span className="level-card__line">{card.line}</span>
              {recommended === level ? <>{" "}<span className="level-card__badge">{tf(copy.recommended, { age: ageYears! })}</span></> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * One family with the board tools (ToolIcon): the same chunky round stroke, the
 * same lens and the same sun spark. Binoculars and discovery sparks for
 * Explorers, a magnifier and footprints for Detectives. No child figure, so no
 * card reads as a gender or a person.
 */
export function SearchLevelArt({ level }: { level: SearchLevel }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className="level-art" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {level === "explorers" ? (
        <>
          <g {...stroke} strokeWidth={3}>
            <path className="level-art__glass" d="M8.5 29.5 11 16.4A3.4 3.4 0 0 1 14.3 13.6h2.4a3.4 3.4 0 0 1 3.3 2.8l1.8 10.4" />
            <path className="level-art__glass" d="M39.5 29.5 37 16.4a3.4 3.4 0 0 0-3.3-2.8h-2.4a3.4 3.4 0 0 0-3.3 2.8l-1.8 10.4" />
            <circle className="level-art__lens" cx="15" cy="32" r="8" />
            <circle className="level-art__lens" cx="33" cy="32" r="8" />
            <path d="M23 32h2M21.6 21.5h4.8" />
            <path d="M11.4 30.2a4.2 4.2 0 0 1 2.4-2.3M29.4 30.2a4.2 4.2 0 0 1 2.4-2.3" strokeWidth={2.2} />
          </g>
          <path className="level-art__spark" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" d="M40.5 3.5l1.5 3.9 3.9 1.5-3.9 1.5-1.5 3.9-1.5-3.9-3.9-1.5 3.9-1.5z" />
          <path className="level-art__spark" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" d="M6.5 5.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" />
        </>
      ) : (
        <>
          <g {...stroke}>
            <circle className="level-art__lens" cx="22" cy="19" r="11.5" strokeWidth={3} />
            <path d="M16.6 13.2a7.4 7.4 0 0 1 5.2-2.5" strokeWidth={2.2} />
            <path d="M13.8 27.6 5.6 35.8" strokeWidth={5.6} />
          </g>
          <g className="level-art__step">
            <g transform="rotate(24 33 40)"><ellipse cx="33" cy="38.2" rx="2.4" ry="3.3" /><ellipse cx="33" cy="43.6" rx="1.8" ry="1.6" /></g>
            <g transform="rotate(24 41 30)"><ellipse cx="41" cy="28.2" rx="2.4" ry="3.3" /><ellipse cx="41" cy="33.6" rx="1.8" ry="1.6" /></g>
          </g>
          <path className="level-art__spark" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" d="M40.5 4.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" />
        </>
      )}
    </svg>
  );
}
