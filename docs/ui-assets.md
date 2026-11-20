# Neue Oberfläche: Vorschlag und Grafik-Liste

Stand: Phase 3, Umbau der Menüs (Hero, Skills, Bag, Town) zu einer Dark-Fantasy-Oberfläche passend zu den Lebens-/Mana-Kugeln.

## 1. Befund (Screenshots Handy 390×844 und PC 1440×900)

- Die Szene mit Kugeln, Skill-Leiste und Ortsschild wirkt schon wie ein Spiel. Alles darüber sieht nach Web-Formular aus: dünne CSS-Ränder, graue Standard-Knöpfe, native `<select>`-Felder, gestrichelte Platzhalter.
- **Handy:** Menüs bedecken den ganzen Bildschirm, der Schließen-Knopf sitzt oben rechts (mit dem Daumen schwer erreichbar). Der Skills-Reiter ist sehr lang: Baum, Details, Gems und Prioritätenliste in einer Spalte.
- **Bag:** Ausrüstungsplätze sind leere Kästen mit Text. Das 10×6-Raster hat ca. 34 px pro Feld, ein Stab im 1×3-Feld ist winzig, weil das Bild schräg liegt und quadratisch eingepasst wird.
- **Prioritätenliste:** zwei native Selects pro Platz plus kleine ↑/↓-Knöpfe.
- **PC:** Menü als rechte Spalte, gut. Tooltips sind dort aber in die Spalte eingebaut statt neben dem Item zu schweben.

## 2. Vorschlag für den neuen Look

**Grundidee:** gealterte Bronze auf dunklem Stein, dieselben Dornen-/Filigranformen wie die Kugelrahmen. Farbe kommt nur aus Element und Seltenheit (Glühen), alles andere bleibt gedämpft.

### Gemalt (neue Bilder)

| Teil | Wofür | Technik im Code |
|---|---|---|
| Panel-Rahmen | Hintergrund jedes Menüs | CSS `border-image` (9-Slice), Innenfläche = Steintextur |
| Tooltip-Rahmen | Item- und Skill-Tooltips | 9-Slice, Innenfläche halbtransparent dunkel |
| Karten-Rahmen (schmal) | Prioritäten-Karten, Gruppen, Dropdown-Listen | 9-Slice |
| Titel-Schild, Trennlinie, Schließen-Knopf | Überschriften, Abschnitte | 3-Slice bzw. Einzelbild |
| Knopf normal / aktiv / gesperrt | alle Knöpfe | 3-Slice (Enden fest, Mitte gestreckt) |
| Reiter normal / aktiv + 4 Reiter-Symbole | untere Leiste | Bild + Symbol + kleiner Text |
| Inventarfeld, Ausrüstungsrahmen, 5 Platz-Silhouetten | Bag, Paperdoll | Feld gekachelt, Rahmen 9-Slice |
| Skill-Knoten eckig (aktiv) / rund (passiv), Level-Plakette | Skill-Baum, Skill-Leiste | Rahmen über dem Icon |
| Gem-Fassung leer / gesperrt, 17 Gem-Icons | Sockel, Bag | Einzelbilder |
| 9 Skill-Icons | ersetzen die Platzhalter | wie die 7 vorhandenen |
| 16 kleine Symbole | Gold, Punkte, Schwierigkeit, Barriere, Zustände, Einstellungen, Log, Sortieren, Verkaufen, Schloss | Einzelbilder |
| Steintextur (nahtlos) | Panel-Hintergrund | gekachelt |

### Bleibt im Code

- Alle Texte und Zahlen (Englisch, gut lesbar, skalierbar).
- **Zustände als Effekt statt als eigenes Bild:** Auswahl = goldenes Glühen, gesperrt = entsättigt + dunkler, lernbar = pulsierender Rand, Seltenheit = farbiger Schein im Feld (weiß/blau/gelb/orange). So brauchen wir pro Element nur ein Bild.
- Leisten (EP, Abklingzeit), Hervorhebung freier Felder, Linien im Skill-Baum (als leuchtende Bronze-Linie per CSS).
- Eigene Dropdowns, Ziehen zum Umsortieren, Mehrfachauswahl, Tooltip-Position.
- Licht und Partikel (wie bisher); für die Oberfläche sind **keine Effektbilder auf Schwarz** nötig.

### Bedienung mit einer Hand (Handy)

- Menü als **Bottom-Sheet**: geht von unten bis ca. 80 % der Höhe auf, die Karte bleibt oben sichtbar. Schließen durch erneutes Tippen auf den aktiven Reiter oder Wischen nach unten; das ✕ bleibt zusätzlich.
- Untere Leiste mit **Symbol + kurzem Wort**, Felder mindestens 48 px hoch.
- Aktionsknöpfe (Equip, Sell, Socket, Level up) stehen **unten im Tooltip** bzw. in einer Aktionsleiste direkt über der Reiterleiste, also im Daumenbereich.
- Skills bekommt zwei Unterreiter: **Tree** und **Priority**, statt alles untereinander.
- PC: rechte Spalte bleibt, Tooltip schwebt neben dem Item (Hover zeigt, Klick hält fest).

### Strukturelle Verbesserungen, die schon vor den Bildern gehen

1. Eigene Dropdowns statt nativer Selects in der Prioritätenliste (große Einträge mit Skill-Icon bzw. Bedingungs-Text).
2. Ziehen zum Umsortieren der Prioritäten (Griff links, Pointer-Events, funktioniert mit Finger und Maus); ↑/↓ bleibt als Rückfall.
3. Tooltip als schwebendes Overlay auf dem PC, als Bottom-Sheet-Karte auf dem Handy.
4. Mehrfachauswahl zum Verkaufen (Auswahlmodus, Summe anzeigen, ein Knopf „Sell N · X gold“).
5. Größere Item-Bilder im Raster: Stäbe werden beim Schneiden senkrecht gedreht (`item-*-tall.png`) und füllen das 1×3-Feld; Rüstung und Helm füllen ihr Feld ohne quadratischen Rand.
6. Skills-Reiter in Tree/Priority teilen, Bottom-Sheet-Layout auf dem Handy.

## 3. Grafik-Liste mit Prompts

### Allgemeine Regeln für alle Sheets

- **Stil-Referenz mitgeben:** `assets/sheets/orbs.png` (für Rahmen/Knöpfe) bzw. `assets/sheets/skill-icons.png` (für Icons). Dann passen Bronze und Malstil.
- **Gerade Frontansicht, keine Perspektive** (anders als Figuren, die isometrisch sind). Oberflächenteile sind flach.
- **Raster:** Objekte gleichmäßig in einem Raster mit N Spalten × M Zeilen, jedes mittig in seiner Zelle, viel Abstand, nichts berührt den Zellrand oder ein Nachbarobjekt. Das Schneide-Skript teilt das Bild in gleich große Zellen.
- **Hintergrund:** reines Grün `#00FF00` (wie die vorhandenen Sheets). Ausnahme: die grünen Gems kommen auf **Magenta** `#FF00FF`, sonst schneidet der Green-Screen sie weg.
- **9-Slice-Rahmen:** Ecken verziert, die geraden Kanten dazwischen **schlicht und gleichförmig** (keine Verzierung in der Kantenmitte), Innenfläche ebenfalls reines Grün. Nur so lässt sich der Rahmen auf jede Größe strecken.
- Kein Text, keine Buchstaben, keine Zahlen in den Bildern.
- Format: so groß wie das Tool kann (1536×1024 bzw. 1024×1024 reicht). Dateiname exakt wie angegeben, ablegen in `assets/sheets/`.
- Falls die drei Knopf-Zustände nicht zusammenpassen: dann nehme ich nur „normal“ und erzeuge aktiv/gesperrt per Code.

Gemeinsamer Stil-Satz (steht in jedem Prompt):

> dark fantasy ARPG user interface asset, aged dark bronze and blackened iron with thorn-like filigree, small inset gemstones, painterly semi-realistic, muted desaturated colors, soft light from top-left, flat front view, no perspective, no text, no letters, no numbers

---

### Sheet 1 – `ui-frames.png` (3 Spalten × 2 Zeilen, Querformat 3:2, Grün)

| Zelle | Inhalt |
|---|---|
| 1 | großer Panel-Rahmen (9-Slice) |
| 2 | Tooltip-Rahmen (9-Slice, feiner) |
| 3 | schmaler Karten-Rahmen (9-Slice, schlicht) |
| 4 | Titel-Schild (breite Plakette, 3-Slice) |
| 5 | Trennlinie mit kleinem Mittelstein |
| 6 | runder Schließen-Knopf |

> Sprite sheet of 6 user interface frame pieces arranged in a grid of 3 columns and 2 rows, each piece centered in its own cell with wide empty space around it, nothing touching, on a solid pure green #00FF00 background. Dark fantasy ARPG user interface asset, aged dark bronze and blackened iron with thorn-like filigree, small inset gemstones, painterly semi-realistic, muted desaturated colors, soft light from top-left, flat front view, no perspective, no text, no letters, no numbers. Row 1: (1) a large square panel frame with heavy ornate thorned bronze corners each holding a small dark red gem, the straight edges between the corners are plain uniform bronze bars without any ornament so the frame can be stretched, the inside of the frame is empty solid pure green; (2) a thinner square tooltip frame with delicate bronze filigree corners and plain uniform thin edges, inside empty solid pure green; (3) a simple narrow square frame of dark iron with small bronze corner caps and plain uniform edges, inside empty solid pure green. Row 2: (4) a wide horizontal bronze title plaque with ornate pointed end caps and a plain uniform middle section, dark recessed center; (5) a thin horizontal ornamental divider line of bronze with a tiny gem in the middle and tapering ends; (6) a small round bronze button with a dark iron center and an engraved X shaped cross.

### Sheet 2 – `ui-buttons.png` (3 × 2, Querformat 3:2, Grün)

| Zelle | Inhalt |
|---|---|
| 1–3 | breiter Knopf: normal / aktiv / gesperrt |
| 4–5 | Reiter der unteren Leiste: normal / aktiv |
| 6 | kleiner quadratischer Knopf (für +, Pfeile, Sortieren) |

> Sprite sheet of 6 user interface buttons arranged in a grid of 3 columns and 2 rows, each centered in its own cell with wide empty space around it, nothing touching, on a solid pure green #00FF00 background. Dark fantasy ARPG user interface asset, aged dark bronze and blackened iron with thorn-like filigree, painterly semi-realistic, muted desaturated colors, soft light from top-left, flat front view, no perspective, no text, no letters, no numbers. Row 1 shows the same wide rectangular button three times, with ornate bronze end caps on the left and right and a plain uniform middle section of dark stone: (1) normal state, dark and calm; (2) active state, the same button with a warm ember-orange glow along its edges and a slightly brighter face; (3) disabled state, the same button dull grey, desaturated and slightly cracked. Row 2: (4) a bottom-bar tab: a wide flat dark stone plate with a bronze top edge and small bronze corners, empty center, calm; (5) the same tab in active state with a golden glow along its top edge and a brighter face; (6) a small square button of dark stone with a bronze rim and small corner studs, empty center.

### Sheet 3 – `ui-sockets.png` (4 × 2, Querformat 3:2, Grün)

| Zelle | Inhalt |
|---|---|
| 1 | Inventarfeld (wird gekachelt) |
| 2 | Ausrüstungsrahmen (9-Slice) |
| 3 | Skill-Knoten eckig (aktive Skills, auch Skill-Leiste) |
| 4 | Skill-Knoten rund (passive Skills) |
| 5 | Gem-Fassung leer |
| 6 | Gem-Fassung gesperrt |
| 7 | Level-Plakette (für Zahlen) |
| 8 | Dropdown-Pfeil-Knopf |

> Sprite sheet of 8 user interface pieces arranged in a grid of 4 columns and 2 rows, each centered in its own cell with wide empty space around it, nothing touching, on a solid pure green #00FF00 background. Dark fantasy ARPG user interface asset, aged dark bronze and blackened iron with thorn-like filigree, painterly semi-realistic, muted desaturated colors, soft light from top-left, flat front view, no perspective, no text, no letters, no numbers. Row 1: (1) a single square inventory cell: recessed dark stone with a thin bevelled bronze edge, flat and simple, it will be tiled; (2) a square equipment slot frame with ornate bronze corners and plain uniform edges, inside empty solid pure green; (3) a square skill icon frame of bronze with small thorned corners, inside empty solid pure green; (4) a round skill icon frame, a bronze ring with four small thorns, inside empty solid pure green. Row 2: (5) an empty round gem socket, a bronze setting with prongs around a dark hollow; (6) the same gem socket closed and locked, covered by a dark iron plate with a small keyhole; (7) a small round bronze medallion with a flat dark center for a number; (8) a small square dark iron button with a bronze rim and an engraved downward pointing chevron.

### Sheet 4 – `ui-glyphs.png` (3 × 3, quadratisch, Grün)

Einfarbige Bronze-Symbole: die 4 Reiter der unteren Leiste und die 5 Silhouetten für leere Ausrüstungsplätze.

> Sprite sheet of 9 emblem icons arranged in a grid of 3 columns and 3 rows, each centered in its own cell with wide empty space around it, nothing touching, on a solid pure green #00FF00 background. All icons are simple bold silhouettes in engraved aged bronze, single color, slightly embossed, readable at small size, flat front view, no background shape, no frame, no text. Row 1: (1) a hooded sorceress head and shoulders (hero), (2) an open spellbook with a glowing rune on the page (skills), (3) a leather satchel with a buckle (bag). Row 2: (4) a small gothic town gate with a lantern (town), (5) a long wizard staff standing upright, (6) a pointed hood seen from the front (helm). Row 3: (7) a robe seen from the front (armor), (8) a pendant amulet on a chain, (9) a plain ring seen at a slight angle.

### Sheet 5 – `ui-icons.png` (4 × 4, quadratisch, Grün)

> Sprite sheet of 16 small game icons arranged in a grid of 4 columns and 4 rows, each centered in its own cell with wide empty space around it, nothing touching, on a solid pure green #00FF00 background. Dark fantasy ARPG icons, painterly semi-realistic, muted desaturated colors with a little glow, soft light from top-left, readable at small size, no frame, no text, no letters, no numbers. Row 1: (1) three stacked gold coins, (2) a glowing golden four-pointed star (skill point), (3) a small bronze arrow pointing up inside a circle (attribute point), (4) a single lit candle (normal difficulty). Row 2: (5) a cracked skull with cold blue glowing eyes (nightmare difficulty), (6) a horned skull wreathed in red flames (hell difficulty), (7) a pale blue translucent hexagonal magic shield (barrier), (8) a small orange flame (burning). Row 3: (9) a pale blue snowflake (chilled), (10) a solid ice crystal block (frozen), (11) a violet lightning bolt (shocked), (12) a bronze cogwheel (settings). Row 4: (13) a rolled parchment scroll with a quill (log), (14) three stacked horizontal bars of decreasing length (sort), (15) a small leather coin pouch (sell), (16) an iron padlock (locked).

### Sheet 6 – `skill-icons-2.png` (3 × 3, quadratisch, Grün)

Gleicher Stil wie `skill-icons.png`: quadratische Malerei mit Bronzerahmen. **Unbedingt `skill-icons.png` als Stil-Referenz anhängen.** Aktive Skills hell und dynamisch, passive eher als Symbol/Rune.

> Sprite sheet of 9 square skill icons arranged in a grid of 3 columns and 3 rows, evenly spaced with green gaps, on a solid pure green #00FF00 background. Each icon is a square dark fantasy painting with a thin ornate bronze frame with small corner spikes, painterly semi-realistic, dramatic glow on a dark smoky background, no text. Lightning is always violet, never yellow. Row 1 (fire, orange-red on dark ember background): (1) a ring of flames bursting out of cracked ground; (2) an open hand with a steady flame hovering above the palm; (3) glowing embers and rising sparks on dark coals. Row 2 (cold, icy blue on dark blue background): (4) sharp ice crystals exploding outward in all directions from a center; (5) a single glowing ice crystal rune carved into frozen stone; (6) frozen ground seen from above with deep frosty cracks. Row 3 (lightning, violet on dark purple background): (7) a violet lightning bolt striking down from dark clouds; (8) small violet sparks arcing between three glowing points; (9) a violet glowing lightning rune carved into dark stone.

Reihenfolge = Searing Burst, Pyromancy, Kindling, Ice Nova, Cold Mastery, Permafrost, Thunderstrike, Conductivity, Storm Mastery.

### Sheet 7 – `gems-element.png` (3 × 2, Querformat 3:2, Grün)

> Sprite sheet of 6 cut magic gemstones arranged in a grid of 3 columns and 2 rows, each centered in its own cell with wide empty space around it, nothing touching, on a solid pure green #00FF00 background. Dark fantasy ARPG item icons, painterly semi-realistic, glossy facets, inner glow, soft light from top-left, flat front view, no setting, no frame, no text. Row 1: (1) a deep red ruby cut in the shape of a flame with an ember glow inside; (2) a red ruby in a classic round brilliant cut; (3) a jagged pale ice-blue crystal cluster covered in frost. Row 2: (4) a pale ice-blue sapphire in a classic round brilliant cut; (5) a violet amethyst cut in a zigzag lightning bolt shape, crackling with tiny violet sparks; (6) a violet amethyst in a classic round brilliant cut.

Reihenfolge = Searing Burn, Added Fire, Deep Freeze, Added Cold, Overcharge, Added Lightning.

### Sheet 8 – `gems-general.png` (4 × 3, Querformat 4:3, **Magenta**)

Die allgemeinen Gems sind smaragdgrün und unterscheiden sich durch die Form. Deshalb Magenta-Hintergrund.

> Sprite sheet of 11 cut emerald-green magic gemstones arranged in a grid of 4 columns and 3 rows (the last cell stays empty), each centered in its own cell with wide empty space around it, nothing touching, on a solid pure magenta #FF00FF background. Dark fantasy ARPG item icons, painterly semi-realistic, deep emerald and jade green, glossy facets, inner glow, soft light from top-left, flat front view, no setting, no frame, no text, no pink or purple in the gems. Each gem has a clearly different shape. Row 1: (1) three small teardrop gems fanned out and fused at the base; (2) a long thin needle-shaped crystal pointing diagonally; (3) a Y-shaped forked crystal; (4) a wide flat round gem with concentric ring facets. Row 2: (5) a small very dense octahedron with a bright white-green core; (6) two oval gems joined by a tiny bronze chain link; (7) a gem with cracks radiating outward and small shards drifting away; (8) a gem with a faint translucent ghost copy of itself offset behind it. Row 3: (9) a slim hourglass-shaped crystal; (10) a smooth clear teardrop-shaped gem; (11) an oval gem with swirling green mist trapped inside; (12) empty.

Reihenfolge = Multiple Projectiles, Pierce, Fork, Wider Area, Concentrated Power, Extra Chains, Elemental Spread, Spell Echo, Quick Cast, Efficiency, Lingering.

### Bild 9 – `ui-bg-stone.png` (quadratisch, kein Green Screen)

> seamless tileable texture, flat front view, dark fantasy, worn dark slate stone with faint carved lines and subtle cracks, very dark and low contrast, muted cold grey-brown, even lighting, no objects, no text

Wird beim Schneiden nahtlos gemacht und abgedunkelt.

---

## 4. Nach dem Generieren (meine Seite)

- Alle Sheets in `tools/slice_sheets.py` eintragen; Magenta-Key ergänzen; 9-Slice-Ränder ausmessen und als CSS-Variablen ablegen.
- Die vorhandenen 7 Skill-Icons und die 9 neuen bekommen beim Schneiden zusätzlich eine Version ohne gemalten Rahmen (innen beschnitten), damit sie in die neuen Knotenrahmen passen.
- Stäbe als hochkant gedrehte Variante für das 1×3-Feld.
- Gem-Icons ersetzen die im Code gezeichneten Steine; Farbe für Labels bleibt.
