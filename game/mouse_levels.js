"use strict";

// ---------- The rat and the cheese (Chemistry corner): data ----------
// Node-readable like levels.js: no DOM at the top level, so tests (and later the voice tool) can load it.

// Every item that can go in a slot. `slot` is where it goes; the numbers drive machine_sim.js:
//   heat:   power  (+ melts ice, 0 nothing, - keeps it frozen)
//   guard:  heatPass (share of the heat that gets through), drips ("aside" | "soak" | "through"), soak (drops it holds)
//   weight: mass (the ice cube weighs 3)
const PARTS = {
  candle:  { slot: "heat",   label: "נר",            power: 1,  fact: "נר דולק נותן חום." },
  fan:     { slot: "heat",   label: "מאוורר",        power: 0,  fact: "מאוורר מזיז אוויר." },
  icepack: { slot: "heat",   label: "שקית קרח",      power: -1, fact: "שקית קרח קרה מאוד." },
  tray:    { slot: "guard",  label: "מגש מתכת",      heatPass: 0.9, drips: "aside", fact: "מתכת מעבירה חום, והמגש משופע – טיפות מחליקות ממנו הצידה." },
  board:   { slot: "guard",  label: "קרש עץ",        heatPass: 0,   drips: "aside", fact: "עץ כמעט לא מעביר חום." },
  sponge:  { slot: "guard",  label: "ספוג",          heatPass: 0.8, drips: "soak", soak: 5, fact: "ספוג סופג מים – עד שהוא מתמלא." },
  metal:   { slot: "weight", label: "משקולת מתכת",   mass: 2,    fact: "משקולת מתכת – כבדה!" },
  cotton:  { slot: "weight", label: "צמר גפן",       mass: 0.2,  fact: "צמר גפן – קל מאוד." },
  feather: { slot: "weight", label: "נוצה",          mass: 0.03, fact: "נוצה – כמעט לא שוקלת כלום." },
};

// Two ways to play: with hints the professor guides every step; without, he only says what happened.
const MOUSE_MODES = {
  hints: { label: "עם רמזים", note: "הפרופסור יעזור לכם בכל שלב" },
  plain: { label: "בלי רמזים", note: "תגלו הכול לבד" },
};

// A level opens one slot at a time. Each stage shows its own slot and its own cards; a run whose outcome is
// the stage's `discover` opens the next stage (it is part of learning, not a mistake). Lines come in two
// versions: { hints, plain }.
const MOUSE_LEVELS = [
  {
    id: 1,
    title: "הגשר המורם",
    iceMass: 3,
    slots: ["heat", "guard", "weight"],
    deck: ["candle", "fan", "icepack", "tray", "board", "sponge", "metal", "cotton", "feather"],
    stages: [
      {
        slot: "heat",
        discover: "doused",
        intro: {
          hints: "העכברוש רעב! הגבינה מעבר לגשר – אבל הגשר מורם. החבל שלו קשור למאזניים, ועל הכף יש קוביית קרח כבדה. נתחיל: צריך להמיס את הקרח. מה ממיס קרח? גררו משהו אל מתחת לקרח ומשכו את הידית!",
          plain: "העכברוש רעב! הגבינה מעבר לגשר – אבל הגשר מורם. גררו חפץ למקום הנכון במכונה, משכו את הידית ותראו מה קורה.",
        },
        hint: "רמז: כדי להמיס קרח צריך חום. מה כאן נותן חום?",
      },
      {
        slot: "guard",
        discover: "no_weight",
        intro: {
          hints: "יפה! הנר התחיל להמיס את הקרח – אבל הטיפות נפלו עליו וכיבו את הלהבה. צריך משהו בין הנר לקרח: שיעביר את החום, אבל יסיט את הטיפות הצידה.",
          plain: "הנר התחיל להמיס את הקרח – אבל המים כיבו אותו! חסר עוד משהו…",
        },
        hint: "רמז: מתכת מעבירה חום, ומגש משופע מוביל את הטיפות לדלי.",
      },
      {
        slot: "weight",
        discover: null,
        intro: {
          hints: "מצוין! כל הקרח נמס והמים זרמו לדלי. אבל הגשר עדיין למעלה – הכף השנייה ריקה. צריך לשים עליה משהו כבד, כדי שהמאזניים ייטו.",
          plain: "כל הקרח נמס והמים זרמו לדלי – אבל הגשר לא זז. חסר עוד משהו…",
        },
        hint: "רמז: איזה חפץ הכי כבד?",
      },
    ],
    // What the professor says after a run, by outcome (see Simulator.outcome in machine_sim.js).
    outcomes: {
      win: {
        hints: "הצלחתם! הנר המיס את הקרח, המים טפטפו החוצה דרך החורים, והמשקולת הכבדה הכריעה את המאזניים – והגשר ירד!",
        plain: "הצלחתם! הגשר ירד!",
      },
      empty_heat: { hints: "שום דבר לא קרה… הקרח נשאר מוצק. מה יכול להמיס אותו?", plain: "שום דבר לא קרה…" },
      fan: { hints: "המאוורר מזיז אוויר, אבל לא מחמם. כדי להמיס קרח צריך חום!", plain: "המאוורר הסתובב – אבל הקרח לא נמס." },
      cold: { hints: "בררר! שקית קרח רק שומרת על הקרח קפוא. כדי להמיס צריך חום.", plain: "הקרח נשאר קפוא." },
      blocked: {
        hints: "קרש העץ חסם את החום! עץ לא מעביר חום טוב, אז הקרח לא נמס. צריך משהו שמעביר חום – כמו מתכת.",
        plain: "הנר דלק – אבל הקרח לא נמס.",
      },
      doused: {
        hints: "פססס! המים טפטפו על הנר וכיבו את הלהבה – מים מקררים את האש. צריך משהו שיסיט את הטיפות הצידה, אבל יעביר את החום.",
        plain: "פססס! המים כיבו את הנר.",
      },
      soaked: {
        hints: "הספוג ספג קצת מים, אבל כשהתמלא – המים טפטפו דרכו על הנר וכיבו אותו!",
        plain: "הספוג ספג מים – ואז המים כיבו את הנר.",
      },
      no_weight: {
        hints: "הקרח נמס והמים יצאו – אבל הכף השנייה ריקה! צריך לשים עליה משהו שיכריע את המאזניים.",
        plain: "הקרח נמס – אבל הגשר לא זז.",
      },
      cotton: { hints: "צמר גפן קל מאוד – יש לו מעט מסה, אז הכף כמעט לא זזה. צריך משהו כבד יותר!", plain: "הכף כמעט לא זזה." },
      feather: { hints: "נוצה כמעט לא שוקלת כלום! צריך משהו עם הרבה מסה.", plain: "הכף כמעט לא זזה." },
    },
    summary: ["חום ממיס קרח: מוצק ← נוזל", "מים מכבים אש", "מתכת מעבירה חום, עץ לא", "כבד מכריע קל: מסה"],
    lesson: "כשקרח נמס המסה לא נעלמת – המים רק זורמים למקום אחר. לכן הכף התרוממה רק כשהמים טפטפו החוצה.",
  },
];
