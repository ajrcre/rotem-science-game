# מגיני האנרגיה ⚡👽

משחק דו-ממדי בעברית שמלמד על אנרגיה: סוגי אנרגיה, מקורות וממירים. הגרפיקה בסגנון אנימציה של שנות ה-30.
החייזרים תוקפים, וכדי לבנות נשקים צריך להרכיב שרשרת המרות אנרגיה, שלב אחרי שלב.

## מוקאפ
מגישים את התיקייה עם שרת מקומי ופותחים את `mockup/index.html`:

```bash
python3 -m http.server 8000
# http://localhost:8000/mockup/
```

## ייצור גרפיקה
הגרפיקה נוצרת עם Gemini (`gemini-3-pro-image`). צריך להגדיר את המשתנה `GEMINI_API_KEY` בסביבה.

```bash
python3 tools/generate_assets.py            # רק נכסים חסרים
python3 tools/generate_assets.py sparky     # נכס מסוים
python3 tools/generate_assets.py --force    # הכול מחדש
```

הספרייטים נוצרים על רקע מג'נטה, והסקריפט מסיר את הרקע אוטומטית. הקבצים נשמרים ב-`assets/art/`.

## ייצור צלילים
אפקטי הקול מסונתזים בקוד (numpy, בלי מפתח API) בסגנון סרטים מצוירים של שנות ה-30, ונשמרים ב-`assets/sfx/`.

```bash
python3 tools/generate_sounds.py            # רק צלילים חסרים
python3 tools/generate_sounds.py boom       # צליל מסוים
python3 tools/generate_sounds.py --force    # הכול מחדש
```

כפתור 🔊 בפינת המסך משתיק ומחזיר את הצלילים.

### צלילים מציאותיים (ניסוי)
`tools/fetch_sounds.py` מביא צלילים חלופיים משני מקורות: ElevenLabs (יצירה מטקסט, דורש `ELEVENLABS_API_KEY` ומנוי בתשלום לשימוש מסחרי) וחבילות Kenney (רישיון CC0). הפרומפטים והמיפוי נמצאים ב-`tools/sfx_manifest.json`. כל הצלילים עוברים חיתוך שקט, המרה למונו 44.1kHz ואיזון עוצמה, ונשמרים ב-`assets/sfx_candidates/`.

```bash
python3 tools/fetch_sounds.py elevenlabs             # צלילים חסרים
python3 tools/fetch_sounds.py kenney boom            # צליל מסוים
python3 tools/fetch_sounds.py elevenlabs --force     # עיבוד מחדש מהמטמון, בלי קריאות API
python3 tools/fetch_sounds.py elevenlabs --refetch   # יצירה חדשה (עולה קרדיטים)
```

להשוואה: `mockup/sfx_compare.html` מנגן את הצליל הנוכחי מול כל המועמדים ומייצא את הבחירות.
