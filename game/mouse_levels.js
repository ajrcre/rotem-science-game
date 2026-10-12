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

const MOUSE_LEVELS = [
  {
    id: 1,
    title: "הגשר המורם",
    iceMass: 3,
    // Slots in the scene, and the cards on the tray (in tray order).
    slots: ["heat", "guard", "weight"],
    deck: ["candle", "fan", "icepack", "tray", "board", "sponge", "metal", "cotton", "feather"],
    intro: "העכברוש רעב! הגבינה מחכה מעבר לגשר – אבל הגשר מורם. החבל שלו קשור למאזניים, ועל הכף יש קוביית קרח כבדה. בחרו חפצים מהמגש, ומשכו את הידית!",
    ready: "מוכנים? משכו את הידית ונראה מה המכונה עושה!",
    // What the professor says after a run, by outcome (see Outcome in machine_sim.js).
    outcomes: {
      win:        "הצלחתם! הנר המיס את הקרח, המים טפטפו החוצה דרך החורים, והמשקולת הכבדה הכריעה את המאזניים – והגשר ירד!",
      empty_heat: "שום דבר לא קרה… הקרח נשאר מוצק. מה יכול להמיס אותו?",
      fan:        "המאוורר מזיז אוויר, אבל לא מחמם. כדי להמיס קרח צריך חום!",
      cold:       "בררר! שקית קרח רק שומרת על הקרח קפוא. כדי להמיס צריך חום.",
      blocked:    "קרש העץ חסם את החום! עץ לא מעביר חום טוב, אז הקרח לא נמס. צריך משהו שמעביר חום – כמו מתכת.",
      doused:     "פססס! המים טפטפו על הנר וכיבו את הלהבה – מים מקררים את האש. צריך משהו שיסיט את הטיפות הצידה, אבל יעביר את החום.",
      soaked:     "הספוג ספג קצת מים, אבל כשהתמלא – המים טפטפו דרכו על הנר וכיבו אותו!",
      no_weight:  "הקרח נמס והמים יצאו – אבל הכף השנייה ריקה! צריך לשים עליה משהו שיכריע את המאזניים.",
      cotton:     "צמר גפן קל מאוד – יש לו מעט מסה, אז הכף כמעט לא זזה. צריך משהו כבד יותר!",
      feather:    "נוצה כמעט לא שוקלת כלום! צריך משהו עם הרבה מסה.",
    },
    hint: "רמז: הנר ממיס את הקרח, מגש מתכת מעביר את החום ומסיט את הטיפות, ומשהו כבד מכריע את המאזניים.",
    summary: ["חום ממיס קרח: מוצק ← נוזל", "מים מכבים אש", "מתכת מעבירה חום, עץ לא", "כבד מכריע קל: מסה"],
    lesson: "כשקרח נמס המסה לא נעלמת – המים רק זורמים למקום אחר. לכן הכף התרוממה רק כשהמים טפטפו החוצה.",
  },
];
