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
