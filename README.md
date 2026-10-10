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
אפקטי הקול במשחק נוצרו ב-ElevenLabs (יצירת צלילים מטקסט) ונשמרים ב-`assets/sfx/` כ-MP3. לכל צליל יש שתי גרסאות, והמשחק בוחר אחת באקראי ומשנה מעט את הגובה בכל השמעה, כדי שצלילים חוזרים לא יישמעו זהים. הרשימה נמצאת ב-`assets/sfx/variants.json`.

הפרומפטים נמצאים ב-`tools/sfx_manifest.json`. `tools/fetch_sounds.py` מייצר את הצלילים (דורש `ELEVENLABS_API_KEY`, ומנוי בתשלום לשימוש מסחרי), חותך שקט, ממיר למונו 44.1kHz ומאזן עוצמה. התוצאות נשמרות ב-`assets/sfx_candidates/`:

```bash
python3 tools/fetch_sounds.py elevenlabs boom        # צליל חסר או מסוים
python3 tools/fetch_sounds.py elevenlabs --force     # עיבוד מחדש מהמטמון, בלי קריאות API
python3 tools/fetch_sounds.py elevenlabs boom --refetch   # יצירה חדשה (עולה קרדיטים)
python3 tools/fetch_sounds.py promote elevenlabs     # העברה למשחק (MP3 + variants.json)
```

אפשר גם להביא חלופות בקוד פתוח מ-Kenney (רישיון CC0): `python3 tools/fetch_sounds.py kenney`. את כל הגרסאות אפשר להשוות ב-`mockup/sfx_compare.html`.

הצלילים המסונתזים הישנים (`tools/generate_sounds.py`) נשמרו ב-`assets/sfx_synth/` לצורך השוואה.

כפתור 🔊 בפינת המסך משתיק ומחזיר את הצלילים.

## קריינות
פרופסור וולט מדבר בקול "Crazy Scientist" מ-ElevenLabs (מודל `eleven_v3`, שתומך בעברית). צריך להגדיר את המשתנה `ELEVENLABS_API_KEY` בסביבה.
הטקסטים נלקחים ישירות מ-`mockup/levels.js` (דרך node), והקבצים נשמרים ב-`assets/voice/`.

```bash
python3 tools/generate_voice.py             # רק שורות חדשות או שהשתנו
python3 tools/generate_voice.py intro_1     # שורה מסוימת
python3 tools/generate_voice.py --force     # הכול מחדש
python3 tools/generate_voice.py --list      # הצגת כל השורות בלי להקליט
```

`assets/voice/manifest.json` שומר את הטקסט שממנו הוקלטה כל שורה, כך שעריכת שורה ב-`levels.js` והרצה חוזרת מקליטות רק אותה.
