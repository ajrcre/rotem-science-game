# המעבדה של פרופסור מדעני 🧪⚡

אוסף משחקי מדע בעברית, בסגנון אנימציה של שנות ה-30. המשחק נפתח במסך פתיחה, ואחריו מגיעים למעבדה של פרופסור מדעני. כל פינה במעבדה פותחת משחק אחר.

## המעבדה
המעבדה היא איור אחד שלם (`assets/art/lab_hub.jpg`). כל פינה נגזרת מתוכו לשכבה נפרדת שמונחת בדיוק מעל האיור, כך שבמנוחה רואים תמונה אחת. כשהעכבר מצביע על פינה, רק השכבה שלה זזה וזוהרת.
הפינות מוגדרות ב-`LAB_CORNERS` שב-`game/lab.js`. כדי להוסיף משחק מוסיפים לפינה מסך `open`. פינה בלי `open` מוצגת כ"בקרוב".

```bash
python3 tools/generate_assets.py lab_hub     # האיור המלא
python3 tools/cut_lab_layers.py              # גזירת הפינות (Gemini מסמן כל פינה, והגזירה נעשית מהאיור המקורי)
python3 tools/cut_lab_layers.py --reuse      # גזירה מחדש מהמסכות השמורות, בלי קריאות API
```

## מגיני האנרגיה ⚡👽
המשחק הראשון במעבדה (פינת האנרגיה) מלמד על אנרגיה: סוגי אנרגיה, מקורות וממירים.
החייזרים תוקפים, וכדי לבנות נשקים צריך להרכיב שרשרת המרות אנרגיה, שלב אחרי שלב.

## הרצה
מגישים את התיקייה עם שרת מקומי ופותחים את `game/index.html`:

```bash
python3 -m http.server 8000
# http://localhost:8000/game/
```

המשחק הוא עמוד אחד (כדי שהצלילים לא ייקטעו בין מסכים), אבל לכל מסך יש כתובת משלו: `#lab`, `#energy`, `#credits`. אפשר לשלוח קישור ישיר, וכפתור "חזרה" בדפדפן עובר בין המסכים. מסך הפתיחה תמיד מופיע ראשון, כי הדפדפן לא משמיע צלילים לפני הקשה ראשונה.

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

אפשר גם להביא חלופות בקוד פתוח מ-Kenney (רישיון CC0): `python3 tools/fetch_sounds.py kenney`. את כל הגרסאות אפשר להשוות ב-`game/sfx_compare.html`.

הצלילים המסונתזים הישנים (`tools/generate_sounds.py`) נשמרו ב-`assets/sfx_synth/` לצורך השוואה.

כפתור 🔊 בפינת המסך משתיק ומחזיר את הצלילים.

## מוזיקה
שני קטעי רקע נוצרו ב-Suno. המקורות שמורים ב-`assets/music_src/`:
- `suno_lab_2.mp3` מתנגן בלולאה בחדר המעבדה ובמפת השלבים, אבל לא בתוך השלב עצמו.
- `suno_lab_1.mp3` מלווה את מסך הקרדיטים.

`tools/prepare_music.py` הופך כל קטע ללולאה חלקה: 2 השניות האחרונות מתמזגות בתחילת הקטע. הסקריפט גם מאזן עוצמה ושומר את הקבצים ב-`assets/music/`:

```bash
python3 tools/prepare_music.py
```

המוזיקה יורדת בעוצמה בזמן שהפרופסור מדבר. במעבדה מתנגנים גם צלילי אווירה אקראיים מ-ElevenLabs, כמו בעבוע, ניצוצות וקיטור (`amb_*` ב-`tools/sfx_manifest.json`), מכיוון הפינה שאליה הם שייכים.

## קריינות
פרופסור מדעני מדבר בקול "Crazy Scientist" מ-ElevenLabs (מודל `eleven_v3`, שתומך בעברית). צריך להגדיר את המשתנה `ELEVENLABS_API_KEY` בסביבה.
הטקסטים נלקחים ישירות מ-`game/levels.js` ומ-`game/lab.js` (דרך node), והקבצים נשמרים ב-`assets/voice/`.

```bash
python3 tools/generate_voice.py             # רק שורות חדשות או שהשתנו
python3 tools/generate_voice.py intro_1     # שורה מסוימת
python3 tools/generate_voice.py --force     # הכול מחדש
python3 tools/generate_voice.py --list      # הצגת כל השורות בלי להקליט
```

`assets/voice/manifest.json` שומר את הטקסט שממנו הוקלטה כל שורה, כך שעריכת שורה ב-`levels.js` והרצה חוזרת מקליטות רק אותה.
