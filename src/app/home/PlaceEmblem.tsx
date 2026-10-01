import React, { type ReactNode } from "react";

// Small travel illustrations, drawn independently of the game's paintings.
// The same paper, rounded ink and sun accent are used throughout the site.
const sun = "var(--sun, #f6c848)";
const sea = "#86bec5";
const leaf = "#9dc9b0";
const coral = "#e8a18b";
const violet = "#b9abd3";
const paper = "#fffaf0";

const emblems: Record<string, ReactNode> = {
  newyork: <>
    <path d="M39 109V83h16v26m49 0V72h16v37" fill={sea} />
    <path d="M69 106l4-42h16l6 42z" fill={leaf} />
    <path d="M74 64l-9-14-9-16 7-4 13 21m12 13 15 13-5 7-15-10" fill={leaf} />
    <path d="M56 30l-3-10 6 3 4-9 3 11-4 8z" fill={sun} />
    <circle cx="81" cy="53" r="10" fill={leaf} />
    <path d="M69 48l-3-5 9 1 5-9 4 9 11-2-4 7m-17 20 9 27m-18 14h35v8H65z" fill={leaf} />
    <path d="M44 91h5m0 8h-5m67-17h4m0 10h-4M76 56h7" />
  </>,
  amazon: <>
    <path d="M33 107q47-28 94 0v11H33z" fill={leaf} />
    <path d="M56 105V57m0 18Q25 75 36 50q18-8 20 25m0-11q-8-38 17-31 7 18-17 31m1 10q32-33 39-9-9 15-39 9" fill={leaf} />
    <path d="M70 95h43l-9 14H81z" fill={coral} />
    <path d="M87 93V62l21 31z" fill={sun} />
    <path d="M36 118q8-7 16 0t16 0m30 0q8-7 16 0t14 0M103 42q10-8 16 2m-19 0q-5-6-11-1" />
  </>,
  paris: <>
    <path d="M39 111h82m-66 0 18-66h14l18 66M79 45V25h4v20" />
    <path d="M70 55h20l5 19H65zm-9 35h38l7 21H92q-12-29-24 0H54z" fill={sun} />
    <path d="M65 74h30M69 61l23 13m-20-6 17-13M64 90l31-16M67 79l27 11M77 30h10" />
    <path d="M32 72q-5-12 4-16 8-4 13 4 8-6 14 3" stroke={sea} />
    <path d="M112 42v12m-6-6h12" stroke={coral} />
  </>,
  marrakech: <>
    <path d="M39 110V43h16V29h13v81m40 0V29h13v81" fill={coral} />
    <path d="M48 110V55h64v55H94V80q0-19-14-24-14 5-14 24v30z" fill={sun} />
    <path d="M73 108V83q0-9 7-15 7 6 7 15v25" fill={sea} />
    <path d="M39 43h16m0-8h13m40 0h13M48 94h18m28 0h18M55 49h50" />
    <path d="M28 111q3-20 9-20m88 20q-3-20-9-20" stroke={leaf} />
    <path d="M80 29v11m-5-6h10" stroke={coral} />
  </>,
  giza: <>
    <circle cx="106" cy="37" r="12" fill={sun} stroke="none" />
    <path d="M29 109l36-59 39 59z" fill={sun} />
    <path d="M65 50l9 59h30z" fill={coral} />
    <path d="M87 109l19-34 26 34z" fill={paper} />
    <path d="M106 75l7 34h19z" fill={coral} />
    <path d="M27 117h106M39 99h25m-15-17h18m-10-16h10m48 33h8" />
    <path d="M35 42v11m-5-6h10" stroke={sea} />
  </>,
  tokyo: <>
    <path d="M43 111V55h9v56m56 0V55h9v56" fill={coral} />
    <path d="M34 45q46 11 92 0v11q-46 7-92 0zM39 68h82v8H39z" fill={coral} />
    <path d="M62 38V24h34v14l9 5H53z" fill={sea} />
    <path d="M67 29h26M76 76v28h8V76" />
    <circle cx="123" cy="90" r="6" fill={violet} />
    <circle cx="31" cy="91" r="6" fill={violet} />
    <path d="M30 108h100M115 28l4-7m-9 8-5-5" stroke={coral} />
  </>,
  greatwall: <>
    <path d="M24 108l30-57 21 30 17-44 45 71" fill={leaf} stroke="none" />
    <path d="M32 108l26-9 26-34 21 8 22 29v13l-24-26-16-7-26 33-29 6z" fill={paper} />
    <path d="M76 73V50h26v25M70 50l18-15 19 15z" fill={coral} />
    <path d="M79 73V59h6v8h9v-8h6m-62 46v8m13-13v9m15-26 8 7m34-12-7 8m17 0-7 8" />
  </>,
  sydney: <>
    <path d="M29 102h102v9H29z" fill={coral} />
    <path d="M37 100q-2-24 13-38l14 38z" fill={paper} />
    <path d="M58 100q-7-39 10-57l17 57z" fill={paper} />
    <path d="M80 100q-4-34 15-50l15 50z" fill={paper} />
    <path d="M106 100q0-23 15-31l7 31z" fill={paper} />
    <path d="M30 119q9-7 18 0t18 0 18 0 18 0 18 0 13 0" stroke={sea} />
    <path d="M107 30q6-7 12 0 6-7 12 0" />
  </>,
  antarctica: <>
    <path d="M27 113l15-28 15 17 19-42 25 40 19-19 15 32z" fill={sea} />
    <path d="M60 94l16-34 20 33-11-6-9 8-8-8z" fill={paper} />
    <path d="M48 104q-10-23 1-35 17-9 22 14l-2 23z" fill="var(--ink, #29253b)" />
    <ellipse cx="59" cy="90" rx="9" ry="16" fill={paper} />
    <path d="M60 77l13 4-12 5M48 108h10m4 0h10" fill={sun} />
    <circle cx="60" cy="72" r="1.5" fill={paper} stroke="none" />
    <path d="M115 36v16m-7-12 14 8m0-8-14 8" stroke={sea} />
  </>,
  castlegate: <>
    <path d="M39 112V57h22v55m38 0V57h22v55M62 111V70h36v41" fill={violet} />
    <path d="M34 57l16-24 16 24m28 0 16-24 16 24" fill={coral} />
    <path d="M71 112V91a9 9 0 0 1 18 0v21" fill={paper} />
    <path d="M47 66v10m60-10v10M50 33V22l14 6-14 5m60 0V21l14 6-14 6" fill={sun} />
    <path d="M38 113h84" />
  </>,
  fairyforest: <>
    <path d="M45 109V51m0 16q-27-11-19-26 17-6 19 26m1-7q-6-35 13-30 14 17-13 30m0 19q24-27 32-8-7 15-32 8" fill={leaf} />
    <path d="M64 85q20-34 42-3z" fill={coral} />
    <path d="M77 85l-3 26h24l-4-26" fill={paper} />
    <circle cx="83" cy="76" r="4" fill={paper} />
    <circle cx="98" cy="77" r="3" fill={paper} />
    <path d="M107 50l7-11 5 11 11 6-11 4-5 11-7-11-10-4z" fill={sun} />
    <path d="M32 115h78" />
  </>,
  dragoncave: <>
    <path d="M29 114V75q0-50 50-50t50 50v39H29z" fill={violet} />
    <path d="M45 114V77q0-34 34-34t34 34v37" fill={paper} />
    <path d="M57 105q35 13 34-12 23-1 22-18l-23-5-7-19-12 12-10-5 4 18q-14 5-6 19l10-2 2 13" fill={leaf} />
    <path d="M89 64l7-10 4 15m-37 32-8 6M34 71l12 4m62-33-8 10" fill={sun} />
    <circle cx="88" cy="79" r="2" fill="var(--ink, #29253b)" />
  </>,
  icepalace: <>
    <path d="M33 112V79h18V61h19v51m19 0V61h20v18h18v33" fill={sea} />
    <path d="M70 112V51h19v61M64 51l16-26 16 26M46 61l15-22 14 22M85 61l14-22 15 22" fill={paper} />
    <path d="M75 112V92h10v20M39 85v12m78-12v12M78 60v11" />
    <path d="M118 34v14m-6-11 12 8m0-8-12 8" stroke={sea} />
  </>,
  underwater: <>
    <path d="M45 85q-6-35 14-39l12 28q-7-42 10-43 16 3 7 43l16-28q18 7 9 39l-23 19H66z" fill={violet} />
    <path d="M45 85q35 34 68 0M70 74l6 21m12-21-4 21" />
    <circle cx="79" cy="84" r="13" fill={paper} />
    <path d="M31 115V89m0 11-8-9m8 2 8-9m84 31V98m0 7 9-8" stroke={coral} />
    <circle cx="39" cy="49" r="4" fill="none" stroke={sea} />
    <circle cx="121" cy="34" r="6" fill="none" stroke={sea} />
  </>,
  cloudcity: <>
    <path d="M41 95V66h22v32m8-2V43h22v54m8 0V66h19v30" fill={violet} />
    <path d="M66 43l16-22 16 22M37 66l15-19 15 19m31 0 12-17 13 17" fill={sun} />
    <path d="M78 52v9m8 9v9m-38-4v9m62-9v9" />
    <path d="M37 113q-19-11-8-23 9-6 18 1 8-23 23-11 9-11 23 2 24-8 28 11 20 11 5 20z" fill={paper} />
    <path d="M41 120h26m28 0h23" stroke={sea} />
  </>,
  sweetworkshop: <>
    <path d="M57 78h49l-8 35H65z" fill={violet} />
    <path d="M53 78q-7-13 6-19 0-17 16-17 10-16 19-2 21 0 19 19 13 4 7 19z" fill={coral} />
    <path d="M75 87v17m13-17v17M67 62h5m18-5h5m3 12h6" stroke={paper} />
    <circle cx="32" cy="71" r="11" fill={sun} />
    <path d="M32 82v27m-6-40q9-11 13 0m-6-13V43h4v14" />
  </>,
  giantlibrary: <>
    <path d="M32 50h19v60H32z" fill={coral} />
    <path d="M51 41h17v69H51z" fill={sea} />
    <path d="M71 41l14-5 19 70-14 4z" fill={violet} />
    <path d="M34 59h15m4-7h13M81 50l10-3" />
    <path d="M42 85q19-13 39-3 19-10 38 3v30q-20-11-38-2-20-9-39 2z" fill={paper} />
    <path d="M81 83v29M50 93l20-2m-20 9 20-2m21-7 19 2m-19 5 19 2" />
    <path d="M117 30v12m-6-6h12" stroke={sun} />
  </>,
  nightcarnival: <>
    <circle cx="80" cy="64" r="34" fill={paper} />
    <path d="M80 30v68M46 64h68M56 40l48 48m0-48L56 88M60 116l20-52 20 52" />
    <path d="M54 116h52" />
    <circle cx="80" cy="30" r="7" fill={coral} />
    <circle cx="48" cy="64" r="7" fill={sun} />
    <circle cx="112" cy="64" r="7" fill={violet} />
    <circle cx="80" cy="97" r="7" fill={sea} />
    <circle cx="80" cy="64" r="6" fill={sun} />
    <path d="M124 23q-7 15 7 15-20 10-19-7 0-6 12-8" fill={sun} />
  </>,
  dinovalley: <>
    <path d="M24 100l24-41 32 41" fill={coral} />
    <path d="M39 76l9-17 12 16-9-4-5 8z" fill={paper} />
    <path d="M34 98q23 5 26-18 10-10 22-3l8-32q-3-13 12-14 18 4 14 13l-14 3-1 40q1 13-13 16l-2 14H75l-1-16-10 2-3 14H50l4-20" fill={leaf} />
    <circle cx="109" cy="37" r="2" fill="var(--ink, #29253b)" />
    <path d="M32 119h96" />
  </>,
  pyramids: <>
    <circle cx="84" cy="41" r="18" fill={sun} />
    <path d="M41 111V59l9-15 9 15v52m44 0V59l9-15 9 15v52" fill={coral} />
    <path d="M38 112h24m38 0h24M50 60v9m-4 13h8m58-20v10m-4 14h8" />
    <path d="M65 111V91q1-20 17-20 9 1 15 8l-9 13-1 19z" fill={sun} />
    <path d="M76 79l3 13h11M66 104h20m-9-5v12m-9-49h28" />
  </>,
  tournament: <>
    <path d="M46 50l68 53M113 49l-65 54" strokeWidth="4" />
    <path d="M47 48l-10-9 12-13 11 9m52 11 11-11-12-12-11 11" fill={coral} />
    <path d="M51 51h58v33q-4 26-29 36-26-10-29-36z" fill={sun} />
    <path d="M61 62h38v20q-2 17-19 26-17-9-19-26z" fill={paper} />
    <path d="M80 66l4 13 13 1-10 8 3 13-10-7-10 7 3-13-10-8 13-1z" fill={sea} />
  </>,
  piratecove: <>
    <path d="M34 93h95l-14 23H52z" fill={coral} />
    <path d="M77 91V26m0 14 30 4-2 40H77M72 40L42 81h30z" fill={paper} />
    <path d="M77 26l25 5-25 9" fill={sun} />
    <circle cx="91" cy="61" r="7" fill={violet} />
    <path d="M85 72l13-12m-13 0 13 12M30 124q9-6 18 0t18 0 18 0 18 0 18 0" stroke={sea} />
  </>,
  wildwest: <>
    <path d="M42 109V72h77v37M48 72V51h65v21" fill={coral} />
    <path d="M42 51l38-20 39 20" fill={sun} />
    <path d="M48 61h64M71 108V80h19v28M80 80v28" />
    <path d="M22 111V73q0-8 7-8t7 8v38m-7-23-10-5V74m10 21 13-7V78" fill={leaf} />
    <path d="M63 48h33M54 85h8m38 0h9" />
    <path d="M34 117h94" />
  </>,
  steamrail: <>
    <path d="M40 91V62h38v29m-43-29h47v-9H35z" fill={sea} />
    <path d="M78 74h35v25H37V87h41z" fill={coral} />
    <path d="M88 74V53h11v21m-14-21h17v-8H85z" fill={sun} />
    <path d="M46 68h23v16H46z" fill={paper} />
    <circle cx="52" cy="103" r="10" fill={sun} />
    <circle cx="89" cy="103" r="10" fill={sun} />
    <path d="M52 103h37M113 93l17 16h-22M33 119h100M93 35q-14-11-1-14 16-6 16 7" />
  </>,
  futurecity: <>
    <path d="M48 112V70h18v42m35 0V79h20v33" fill={sea} />
    <path d="M71 112V44l11-20 12 20v68" fill={violet} />
    <ellipse cx="83" cy="66" rx="35" ry="9" fill={paper} />
    <path d="M83 76v36m-29-32h7m43 9h12M39 114h91M82 39v11" />
    <path d="M109 35l13-7 12 10-11 4z" fill={sun} />
    <path d="M123 42l-10 8m-1-13-10 5" stroke={coral} />
  </>,
  robotlab: <>
    <path d="M56 78h50v33H56z" fill={sea} />
    <rect x="48" y="40" width="66" height="40" rx="12" fill={paper} />
    <path d="M81 40V28m-23 59-17 13m63-13 17 13M68 111v8m26-8v8" />
    <circle cx="81" cy="24" r="5" fill={sun} />
    <circle cx="67" cy="58" r="7" fill={violet} />
    <circle cx="96" cy="58" r="7" fill={violet} />
    <path d="M72 70h18M76 92h10v10H76z" fill={sun} />
    <path d="M29 50v12m-6-6h12" stroke={coral} />
  </>,
  beyondstars: <>
    <path d="M58 88q-3-39 21-58 27 17 29 51L86 97z" fill={paper} />
    <path d="M71 39l8-9 14 10M58 79l-18 22 22 1m39-25 21 18-23 9M66 100l-2 22 16-18" fill={coral} />
    <circle cx="83" cy="66" r="11" fill={sea} />
    <ellipse cx="120" cy="39" rx="18" ry="5" transform="rotate(-25 120 39)" fill="none" />
    <circle cx="120" cy="39" r="8" fill={violet} />
    <path d="M37 38v12m-6-6h12M109 119l4-8 4 8" stroke={sun} />
  </>,
};

export function hasPlaceEmblem(place: string): boolean {
  return Object.hasOwn(emblems, place);
}

export function PlaceEmblem({ place }: { place: string }) {
  return <svg className="place-emblem" viewBox="0 0 160 140" fill="none" aria-hidden="true" focusable="false">
    <path d="M27 74c-4-32 17-53 53-53 34-2 60 23 55 57-1 28-23 49-54 47-34 2-55-20-54-51z" fill="var(--wc-sky, #f4eddf)" opacity=".65" />
    <circle cx="80" cy="75" r="57" stroke="var(--ink, #29253b)" opacity=".09" strokeDasharray="2 5" />
    <path d="M17 59h16M14 66h17m100 35h15m-12 7h16" stroke="var(--ink, #29253b)" strokeWidth="1.5" strokeLinecap="round" opacity=".16" />
    <g stroke="var(--ink, #29253b)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {hasPlaceEmblem(place) ? emblems[place] : <><circle cx="80" cy="75" r="31" fill={paper} /><path d="M80 47l11 28-11 28-11-28z" fill={sun} /><path d="M80 47v56" /></>}
    </g>
    <circle cx="24" cy="101" r="3" fill={sun} />
    <path d="M137 57v8m-4-4h8" stroke={sun} strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
