# Neue Oberfläche: Vorschlag und Grafik-Liste

Stand: Phase 3, Umbau der Menüs (Hero, Skills, Bag, Town) zu einer Dark-Fantasy-Oberfläche passend zu den Lebens-/Mana-Kugeln.

## 1. Befund (Screenshots Handy 390×844 und PC 1440×900)

- Die Szene mit Kugeln, Skill-Leiste und Ortsschild wirkt schon wie ein Spiel. Alles darüber sieht nach Web-Formular aus: dünne CSS-Ränder, graue Standard-Knöpfe, native `<select>`-Felder, gestrichelte Platzhalter.
- **Handy:** Menüs bedecken den ganzen Bildschirm, der Schließen-Knopf sitzt oben rechts (mit dem Daumen schwer erreichbar). Der Skills-Reiter ist sehr lang: Baum, Details, Gems und Prioritätenliste in einer Spalte.
- **Bag:** Ausrüstungsplätze sind leere Kästen mit Text. Das 10×6-Raster hat ca. 34 px pro Feld, ein Stab im 1×3-Feld ist winzig, weil das Bild schräg liegt und quadratisch eingepasst wird.
- **Prioritätenliste:** zwei native Selects pro Platz plus kleine ↑/↓-Knöpfe.
- **PC:** Menü als rechte Spalte, gut. Tooltips sind dort aber in die Spalte eingebaut statt neben dem Item zu schweben.


## 2. Zielbild (Rückmeldung vom Owner)

Referenz ist der klassische ARPG-Look der frühen 2000er in Remaster-Qualität: **schwer, matt, grau, verwittert**. Nicht 1:1 nachbauen (keine Formen, Statuen, Ornamente oder Symbole aus Diablo übernehmen), aber in diese Richtung.

### Warum es jetzt „nach KI“ aussieht

- Zu viel glänzende Bronze, Dornen-Filigran und eingesetzte Edelsteine an jeder Ecke.
- Zu viel Sättigung und Glühen, alles leuchtet gleich stark.
- Warmes Braun überall statt neutralem, kaltem Grau.
- Flache CSS-Kästen ohne Tiefe: keine Vertiefungen, keine Fasen, keine Steinstruktur.

### Wie das Zielbild funktioniert

- **Material:** verwitterter dunkelgrauer Stein (Granit/Schiefer) mit eingemeißeltem gotischem Maßwerk (Spitzbögen, Vierpässe), dazu geschwärztes Schmiedeeisen mit Nieten. Bronze/Gold nur sparsam als Akzent (Titeltext, kleine Kappen).
- **Tiefe statt Linien:** Rahmen sind dicke, gefaste Steinkanten. Inhalte liegen in **dunklen, eingelassenen Mulden** (Inventar-Raster, Textfelder, Ausrüstungsplätze).
- **Leere Ausrüstungsplätze** zeigen eine blasse, eingeprägte Silhouette (Stab, Kapuze, Robe …) als Steinrelief.
- **Farbe fast nur über Inhalt:** Item-Bilder, Seltenheits-Tönung im Feld (dunkles Blau/Gelb/Orange als Hintergrund des Felds, wie eingefärbtes Glas), rote Markierung für „nicht nutzbar“. Rahmen bleiben grau.
- **Schrift:** Kapitälchen-Serife in gebrochenem Beige/Gold für Titel, helles Grau für Fließtext, kein reines Weiß.
- **Wenig Licht:** kein Glühen an Rahmen. Aktive Elemente werden nur etwas heller; Auswahl = dünner, warmer Rand.
- **Schließen-Knopf:** kleines eisernes Quadrat mit rotem X.

### Aufteilung Grafik / Code

| Gemalt | Im Code |
|---|---|
| Panel-Rahmen (dicker Stein, 9-Slice), Kopfleiste mit Titelfeld, Mulden-Rahmen, Tooltip-Rahmen (Eisen) | Texte, Zahlen, Schrift |
| Knöpfe, Reiter, kleiner Eisenknopf, Schließen-Knopf, Dropdown-Pfeil | Seltenheits-Tönung, Auswahlrand, gesperrt = dunkler/entsättigt |
| Ausrüstungs-Mulde, Silhouetten als Steinrelief, Skill-Knoten eckig/rund, Gem-Fassungen | Inventar-Raster (schwarze Felder, feine graue Linien, Innenschatten) |
| HUD-Konsole aus Stein unten (verbindet die Kugeln, trägt Skill-Leiste und EP-Leiste) | EP-/Abklingbalken, Hervorhebung freier Felder |
| Steintextur nahtlos, Icons, Gems, 9 Skill-Icons | Dropdowns, Ziehen, Mehrfachauswahl, Tooltip-Position |

### Layout

- **PC:** Menüs als feste Steintafeln links (Hero/Skills) und rechts (Bag), Karte dazwischen sichtbar. Bodenkonsole aus Stein mit den Kugeln an den Enden.
- **Handy:** eine Steintafel als Bottom-Sheet (bis ca. 80 % Höhe), unten die Reiterleiste als Teil der Steinkonsole. Schließen durch erneutes Tippen auf den Reiter, Wischen nach unten oder das ✕. Aktionsknöpfe unten im Daumenbereich. Skills mit Unterreitern **Tree** / **Priority**.

### Strukturelle Verbesserungen, die schon vor den Bildern gehen

1. Eigene Dropdowns statt nativer Selects in der Prioritätenliste.
2. Ziehen zum Umsortieren der Prioritäten (Pointer-Events, Finger und Maus), ↑/↓ als Rückfall.
3. Tooltip als schwebendes Overlay auf dem PC, als Karte unten auf dem Handy.
4. Mehrfachauswahl zum Verkaufen („Sell N · X gold“).
5. Stäbe beim Schneiden senkrecht drehen (`item-*-tall.png`), damit sie das 1×3-Feld füllen.
6. Farbpalette und CSS schon auf neutrales Grau, Mulden mit Innenschatten, Kapitälchen-Titel umstellen; die Bilder ersetzen dann nur noch Ränder und Flächen.

## 3. Grafik-Liste mit Prompts

### Allgemeine Regeln

- **Reihenfolge:** zuerst nur **Sheet 1** generieren und mir zeigen. Wenn der Look stimmt, das Ergebnis als **Stil-Referenz** für alle weiteren Sheets anhängen.
- Den Screenshot aus Diablo **nicht** als Referenzbild in den Generator geben, sonst kopiert er Formen und Ornamente. Die Prompts beschreiben die Richtung in eigenen Worten.
- **Gerade Frontansicht, keine Perspektive.**
- **Raster:** Objekte gleichmäßig in N Spalten × M Zeilen, jedes mittig in seiner Zelle, viel Abstand, nichts berührt den Zellrand.
- **Hintergrund:** reines Grün `#00FF00`. Ausnahme: grüne Gems auf Magenta `#FF00FF`.
- **9-Slice-Rahmen:** Ecken dürfen verziert sein, die geraden Kanten dazwischen müssen **gleichförmig** sein (keine Verzierung in der Kantenmitte), Innenfläche reines Grün.
- Kein Text, keine Buchstaben, keine Zahlen.
- Wenn der Generator negative Prompts kann: `glossy, shiny, glowing, gemstones, gold filigree, thorns, neon, saturated colors, cartoon, plastic, text`.

Gemeinsamer Stil-Satz (steht in jedem UI-Prompt):

> dark gothic medieval game interface asset, heavy weathered dark grey stone and blackened wrought iron, carved gothic tracery, worn chipped edges, dust in the crevices, matte realistic material, dim even lighting from top-left, low saturation, cold grey tones, restrained ornament, solid and heavy, flat front view, no perspective, not glossy, no glow, no gemstones, no gold, no text, no letters, no numbers

---

### Sheet 1 – `ui-frames.png` (3 × 2, Querformat 3:2, Grün) – **zuerst**

| Zelle | Inhalt |
|---|---|
| 1 | großer Panel-Rahmen, dicker Stein (9-Slice) |
| 2 | Kopfleiste: Steinbalken mit eingelassenem Titelfeld (3-Slice) |
| 3 | Mulden-Rahmen: eingelassene dunkle Vertiefung (9-Slice) |
| 4 | Tooltip-Rahmen, dünnes Eisen (9-Slice) |
| 5 | Trennleiste aus Eisen |
| 6 | Schließen-Knopf |

> Sprite sheet of 6 game interface frame pieces arranged in a grid of 3 columns and 2 rows, each piece centered in its own cell with wide empty space around it, nothing touching, on a solid pure green #00FF00 background. Dark gothic medieval game interface asset, heavy weathered dark grey stone and blackened wrought iron, carved gothic tracery, worn chipped edges, dust in the crevices, matte realistic material, dim even lighting from top-left, low saturation, cold grey tones, restrained ornament, solid and heavy, flat front view, no perspective, not glossy, no glow, no gemstones, no gold, no text, no letters, no numbers. Row 1: (1) a large square panel frame made of a thick bevelled border of carved dark grey stone, the four corners carry small carved gothic tracery blocks with iron rivets, the straight edges between the corners are plain uniform bevelled stone so the frame can be stretched, the inside of the frame is empty solid pure green; (2) a wide horizontal header bar of dark stone with a recessed dark rectangular title field in the middle, small carved scroll ends on the left and right, the middle section is plain and uniform; (3) a square recessed well: a sunken dark stone border with a strong inner shadow, as if cut into the stone, thin plain uniform edges, inside empty solid pure green. Row 2: (4) a thin square frame of blackened wrought iron with small riveted corner caps and plain uniform thin edges, inside empty solid pure green; (5) a thin horizontal bar of blackened iron with small rivets at both ends; (6) a small square button of blackened iron with a bevelled edge and a dark red X engraved in the center.

### Sheet 2 – `ui-buttons.png` (3 × 2, Querformat 3:2, Grün)

| Zelle | Inhalt |
|---|---|
| 1–3 | breiter Knopf: normal / gedrückt / gesperrt |
| 4–5 | Reiter: normal / aktiv |
| 6 | kleiner quadratischer Eisenknopf |

> Sprite sheet of 6 game interface buttons arranged in a grid of 3 columns and 2 rows, each centered in its own cell with wide empty space around it, nothing touching, on a solid pure green #00FF00 background. Dark gothic medieval game interface asset, heavy weathered dark grey stone and blackened wrought iron, worn chipped edges, matte realistic material, dim even lighting from top-left, low saturation, cold grey tones, restrained ornament, flat front view, no perspective, not glossy, no glow, no gemstones, no gold, no text, no letters, no numbers. Row 1 shows the same wide rectangular button three times: a dark slate plate with a bevelled blackened iron rim, small iron end caps on the left and right, the middle section plain and uniform. (1) normal; (2) pressed: the same button slightly lighter and sunken in; (3) disabled: the same button darker, flat and dusty. Row 2: (4) a tab: a flat dark stone plate with a thin iron top edge and square iron corners, empty center; (5) the same tab active: slightly lighter stone and a faint warm dull brass line along the top edge; (6) a small square button of blackened iron with a bevelled rim and four rivets, empty dark center.

### Sheet 3 – `ui-sockets.png` (4 × 2, Querformat 3:2, Grün)

| Zelle | Inhalt |
|---|---|
| 1 | Ausrüstungs-Mulde (9-Slice) |
| 2 | Skill-Knoten eckig (aktiv, auch Skill-Leiste) |
| 3 | Skill-Knoten rund (passiv) |
| 4 | Gem-Fassung leer |
| 5 | Gem-Fassung gesperrt |
| 6 | Level-Plakette |
| 7 | Dropdown-Pfeil-Knopf |
| 8 | Eck-Ornament (Deko für große Tafeln) |

> Sprite sheet of 8 game interface pieces arranged in a grid of 4 columns and 2 rows, each centered in its own cell with wide empty space around it, nothing touching, on a solid pure green #00FF00 background. Dark gothic medieval game interface asset, heavy weathered dark grey stone and blackened wrought iron, worn chipped edges, matte realistic material, dim even lighting from top-left, low saturation, cold grey tones, restrained ornament, flat front view, no perspective, not glossy, no glow, no gemstones, no gold, no text, no letters, no numbers. Row 1: (1) a square equipment slot: a deep recessed well in dark grey stone with a bevelled rim and a dark textured floor, plain uniform edges; (2) a square icon frame of blackened iron with a bevelled edge and small rivets in the corners, inside empty solid pure green; (3) a round icon frame, a ring of blackened iron with four small rivets, inside empty solid pure green; (4) an empty round socket: a dark hollow cup set into an iron mount with four short prongs. Row 2: (5) the same socket closed by a riveted iron plate with a small keyhole; (6) a small round iron disc with a flat dark center; (7) a small square iron button with a bevelled rim and an engraved downward pointing chevron; (8) a carved gothic stone corner ornament shaped like an L, with pointed arch tracery.

### Sheet 4 – `ui-glyphs.png` (3 × 3, quadratisch, Grün)

4 Reiter-Symbole und 5 Silhouetten für leere Ausrüstungsplätze, alle als blasses Steinrelief.

> Sprite sheet of 9 emblem icons arranged in a grid of 3 columns and 3 rows, each centered in its own cell with wide empty space around it, nothing touching, on a solid pure green #00FF00 background. Each icon is a simple bold silhouette carved as a shallow relief in pale grey stone, single color, low contrast, worn edges, matte, readable at small size, flat front view, no background shape, no frame, no glow, no text. Row 1: (1) a hooded sorceress head and shoulders, (2) an open book with a rune on the page, (3) a leather satchel with a buckle. Row 2: (4) a small gothic gatehouse with a pointed arch, (5) a long staff standing upright with a crooked head, (6) a pointed hood seen from the front. Row 3: (7) a long robe seen from the front, (8) a pendant amulet on a chain, (9) a plain ring seen at a slight angle.

### Sheet 5 – `ui-icons.png` (4 × 4, quadratisch, Grün)

> Sprite sheet of 16 small game icons arranged in a grid of 4 columns and 4 rows, each centered in its own cell with wide empty space around it, nothing touching, on a solid pure green #00FF00 background. Dark gothic medieval game icons, matte painterly realistic, muted low saturation colors, dim light from top-left, readable at small size, no frame, no glow halo, no text, no letters, no numbers. Row 1: (1) three stacked worn gold coins, (2) a pale four-pointed star carved in stone (skill point), (3) an upward arrow carved in stone inside a circle (attribute point), (4) a single lit tallow candle (normal difficulty). Row 2: (5) a cracked grey skull with faint cold blue eyes (nightmare difficulty), (6) a blackened horned skull with dull red embers in the eyes (hell difficulty), (7) a translucent pale blue hexagonal ward (barrier), (8) a small dull orange flame (burning). Row 3: (9) a pale blue snowflake (chilled), (10) a block of grey-blue ice (frozen), (11) a dull violet lightning bolt (shocked), (12) an iron cogwheel (settings). Row 4: (13) a rolled parchment with a quill (log), (14) three stacked iron bars of decreasing length (sort), (15) a small worn leather coin pouch (sell), (16) an old iron padlock (locked).

### Sheet 6 – `skill-icons-2.png` (3 × 3, quadratisch, Grün)

`skill-icons.png` als Stil-Referenz anhängen, damit es zu den vorhandenen 7 passt; etwas gedämpfter.

> Sprite sheet of 9 square skill icons arranged in a grid of 3 columns and 3 rows, evenly spaced with green gaps, on a solid pure green #00FF00 background. Each icon is a square dark fantasy painting with a thin dark bronze frame, painterly semi-realistic, dark smoky background, muted colors with a focused glow only on the main motif, no text. Lightning is always violet, never yellow. Row 1 (fire, dull orange-red on dark ember background): (1) a ring of flames bursting out of cracked ground; (2) an open hand with a small flame above the palm; (3) glowing embers and rising sparks on dark coals. Row 2 (cold, pale ice blue on dark blue-grey background): (4) sharp ice crystals bursting outward in all directions from a center; (5) a single ice rune carved into frozen stone; (6) frozen ground seen from above with deep frosty cracks. Row 3 (lightning, violet on dark purple-grey background): (7) a violet lightning bolt striking down from dark clouds; (8) small violet sparks arcing between three points; (9) a violet lightning rune carved into dark stone.

Reihenfolge = Searing Burst, Pyromancy, Kindling, Ice Nova, Cold Mastery, Permafrost, Thunderstrike, Conductivity, Storm Mastery.

### Sheet 7 – `gems-element.png` (3 × 2, Querformat 3:2, Grün)

> Sprite sheet of 6 cut gemstones arranged in a grid of 3 columns and 2 rows, each centered in its own cell with wide empty space around it, nothing touching, on a solid pure green #00FF00 background. Dark medieval game item icons, painterly realistic, slightly rough natural facets, deep colors, a soft inner light, dim light from top-left, flat front view, no setting, no frame, no text. Row 1: (1) a deep red ruby cut in the shape of a flame with a dull ember light inside; (2) a red ruby in a simple rounded cut; (3) a jagged pale ice-blue crystal cluster with frost. Row 2: (4) a pale ice-blue stone in a simple rounded cut; (5) a violet amethyst cut in a zigzag shape with a faint inner spark; (6) a violet amethyst in a simple rounded cut.

Reihenfolge = Searing Burn, Added Fire, Deep Freeze, Added Cold, Overcharge, Added Lightning.

### Sheet 8 – `gems-general.png` (4 × 3, Querformat 4:3, **Magenta**)

> Sprite sheet of 11 cut deep green gemstones arranged in a grid of 4 columns and 3 rows (the last cell stays empty), each centered in its own cell with wide empty space around it, nothing touching, on a solid pure magenta #FF00FF background. Dark medieval game item icons, painterly realistic, deep emerald and jade green, slightly rough natural facets, a soft inner light, dim light from top-left, flat front view, no setting, no frame, no text, no pink or purple in the gems. Each gem has a clearly different shape. Row 1: (1) three small teardrop gems fanned out and fused at the base; (2) a long thin needle-shaped crystal pointing diagonally; (3) a Y-shaped forked crystal; (4) a wide flat round gem with concentric ring facets. Row 2: (5) a small dense octahedron with a bright core; (6) two oval gems joined by a tiny iron chain link; (7) a gem with cracks radiating outward and small shards breaking away; (8) a gem with a faint translucent ghost copy of itself offset behind it. Row 3: (9) a slim hourglass-shaped crystal; (10) a smooth teardrop-shaped gem; (11) an oval gem with swirling mist trapped inside; (12) empty.

Reihenfolge = Multiple Projectiles, Pierce, Fork, Wider Area, Concentrated Power, Extra Chains, Elemental Spread, Spell Echo, Quick Cast, Efficiency, Lingering.

### Sheet 9 – `ui-hud.png` (2 × 2, quadratisch, Grün)

Die Steinkonsole unten im Kampfbild, an deren Enden die vorhandenen Kugeln sitzen.

> Sprite sheet of 4 game interface pieces arranged in a grid of 2 columns and 2 rows, each centered in its own cell with wide empty space around it, nothing touching, on a solid pure green #00FF00 background. Dark gothic medieval game interface asset, heavy weathered dark grey stone and blackened wrought iron, carved gothic tracery, worn chipped edges, matte realistic material, dim even lighting from top-left, low saturation, cold grey tones, flat front view, no perspective, not glossy, no glow, no gemstones, no text. (1) a wide horizontal stone console segment, plain uniform carved stone with a thin iron rail along the top, it will be tiled horizontally; (2) the left end of that console: a heavy carved stone pillar end with a round cradle on top where a glass orb will sit, the cradle is empty solid pure green inside; (3) a narrow horizontal recessed trough in dark stone for a progress bar, plain uniform middle, small iron end caps; (4) a carved gothic stone arch window piece, a pointed arch with tracery, used as decoration.

### Bild 10 – `ui-bg-stone.png` (quadratisch, kein Green Screen)

> seamless tileable texture, flat front view, weathered dark grey granite stone surface, rough with small pits, faint scratches and subtle cracks, dust, very dark and low contrast, cold neutral grey, even dim lighting, matte, no objects, no carvings, no text

Wird beim Schneiden nahtlos gemacht und abgedunkelt.

---

## 4. Nach dem Generieren (meine Seite)

- Sheets in `tools/slice_sheets.py` eintragen, Magenta-Key ergänzen, 9-Slice-Ränder ausmessen und als CSS-Variablen ablegen.
- Die 7 vorhandenen und 9 neuen Skill-Icons bekommen zusätzlich eine Version ohne gemalten Rahmen (innen beschnitten), damit sie in die Eisenrahmen passen.
- Stäbe als hochkant gedrehte Variante für das 1×3-Feld.
- Gem-Icons ersetzen die im Code gezeichneten Steine.
- Die Kugelrahmen (`orbs.png`, Bronze mit Steinen) passen später evtl. nicht mehr ganz; wenn die Konsole steht, entscheiden wir, ob wir die Rahmen schlichter neu generieren.

## 5. Stand

| Sheet | Status |
|---|---|
| `ui-frames`, `ui-buttons`, `ui-sockets`, `ui-glyphs`, `ui-icons` | eingebaut |
| `gems-general` (Magenta), `ui-hud` (Konsole, Kugel-Säulen, EP-Rinne, Bogenfenster), `ui-bg-stone` | eingebaut (`ui-hud` wird über feste Bereiche statt Raster geschnitten, siehe `UI_BOXES`) |
| `skill-icons-2.png`, `gems-element.png` | generiert, Datei fehlt noch im Repo; bis dahin Platzhalter-Icons bzw. CSS-Steine. Danach in `src/ui/gemcolor.ts` (`GEM_ART`) die 6 Element-Gems ergänzen |

Neue Sheets einfach mit dem Namen aus der Tabelle in `assets/sheets/` legen und `python3 tools/slice_sheets.py` laufen lassen; fehlende Sheets werden übersprungen.

## 6. Übergabe an die nächste Sitzung

Stand auf Branch `claude/ui-assets` (Testversion https://claude.ai/artifact/LBgXfG93fk3jLj1qnTwc7k):
- Oberfläche aus Stein/Eisen fertig, neue düstere Heldin, Zoom ~0.62 (`ZOOM` in `src/render/scene.ts`), Dunkelheit mit Lichtradius (`AMBIENT_DARK`, `HERO_LIGHT`), Deko in Gruppen.
- Absicherung: fällt die Dunkelheit auf einem Gerät aus, läuft das Spiel ohne sie weiter; Offline-Aufholen rechnet höchstens 8 s.
- Ladebildschirm-Hänger behoben: Ursache war ein unvollständiges Hochladen der Testversion (geänderter Pixi-Chunk `RenderTargetSystem-*.js` fehlte). **Beim Veröffentlichen immer alle Dateien aus `dist-artifact/assets/` mit neuen Namen hochladen, nicht nur `index/init/browserAll/webworkerAll`.**
- Fehlende Dateien vom Owner: `skill-icons-2.png`, `gems-element.png`.
- Als Nächstes geplant: Gallows Field ausbauen mit `props-gallows.png` (hängende Laternen, Käfig, Zäune, Vogelscheuche …), `ground-decals.png`, dunklerem Boden; Laternen-Licht, Zaun-/Laternenreihen als Weg, kleine Szenen auf Lichtungen. Danach Monster im düsteren Stil. Prompts siehe letzter Chat bzw. hier ergänzen.

## 7. Gallows Field neu (realistisch, erste Karte)

Ziel: Die alten Bodentexturen und Deko-Sprites der ersten Karte fliegen raus und werden durch einen einheitlichen, realistischen Satz ersetzt. Der Look ist gerendert statt gemalt, wie späte 90er-ARPGs: Erde, nasses Holz, Rost und Knochen mit echter Materialstruktur, gedeckte Farben, keine Comic-Kanten. Wir übernehmen keine Formen oder Motive aus einem bestimmten Spiel.

### Regeln für alle Bilder dieser Karte

- Einheitliches Licht: weiches Mondlicht von **oben links**, nachts, kalt. Keine harten Schlagschatten ins Bild malen, die macht der Code.
- **Magenta `#FF00FF`** als Hintergrund für Props und Decals, nicht Grün, denn trockenes Gras und Moos sind grünlich und würden mit ausgeschnitten.
- Boden: **gerade Draufsicht** (90°, wie ein Foto von oben). Der Code kippt ihn selbst in die Schrägansicht.
- Props: **isometrische Schrägansicht, 30° von oben**, Objekt steht mittig unten in der Zelle.
- Kein Text, keine Rahmen.
- Negativ-Prompt (falls möglich): `cartoon, painterly, stylized, cel shading, outlines, saturated colors, glowing, fantasy colors, text, frame, cast shadow, perspective distortion`.

Gemeinsamer Stil-Satz:

> photorealistic pre-rendered 3D look, gritty dark medieval fantasy, physically realistic materials, rotten wood, rusted iron, wet soil, dry dead grass, bone, moss, cold moonlit night, soft light from top-left, low saturation, muted brown grey and dark olive tones, high detail but calm, no stylization

### Bild 1 – `ground-gallows-base.png` (quadratisch, 1024 × 1024, kein Hintergrund-Key)

> [Stil-Satz], seamless tileable ground texture, straight top-down orthographic view, trampled dead grass and dark damp soil, scattered small pebbles, a few dry leaves, uneven patches, low contrast, no large features, no objects, no paths, evenly lit, no shadows, no text

Wichtig: wenig Kontrast und keine auffälligen Einzelstücke, sonst sieht man die Wiederholung und es wird wieder körnig.

### Bild 2 – `ground-gallows-path.png` (quadratisch, 1024 × 1024)

> [Stil-Satz], seamless tileable ground texture, straight top-down orthographic view, muddy rutted cart track, packed dark earth with puddle stains, wheel ruts, thin sparse dead grass at the edges only, low contrast, no objects, evenly lit, no shadows, no text

Wird im Code als Weg über den Grundboden geblendet.

### Sheet 3 – `props-gallows.png` (4 × 3, Querformat 4:3, Magenta)

> [Stil-Satz], isometric view 30 degrees from above, game prop sprite sheet, 4 columns x 3 rows, each object centered in its cell with wide spacing, nothing touches the cell edges, flat pure magenta #FF00FF background, no ground plane, no cast shadows

| Zeile | Spalte 1 | Spalte 2 | Spalte 3 | Spalte 4 |
|---|---|---|---|---|
| 1 | Galgen aus dunklem Holz mit Strick | Laternenpfahl, schief, mit hängender Eisenlaterne (Glas dunkel, nicht leuchtend) | eiserner Hängekäfig an Holzgestell | toter, kahler Baum mit Strickresten |
| 2 | Holzzaun-Stück, kaputt, schräg | Grabkreuz aus Holz, schief | flacher Grabstein, verwittert, moosig | Haufen Knochen und Schädel |
| 3 | Dornenstrauch, trocken | Holzkarren, kaputt, ein Rad fehlt | Vogelscheuche in Lumpen | alter Steinbrunnen mit Holzbalken |

Die Laterne bewusst **nicht** leuchtend generieren, das Licht kommt aus dem Code (flackert, beleuchtet die Umgebung).

### Sheet 4 – `ground-decals.png` (3 × 2, Querformat 3:2, Magenta)

> [Stil-Satz], straight top-down view, flat ground decal sprites lying on the ground, 3 columns x 2 rows, soft feathered irregular edges that fade out, centered in each cell, flat pure magenta #FF00FF background, no objects standing up, no shadows

| Zeile | Spalte 1 | Spalte 2 | Spalte 3 |
|---|---|---|---|
| 1 | dunkle Schlammpfütze mit Wasserglanz | Fleck aus Asche und verkohltem Gras | vertrocknetes Blut, braun, eingetrocknet |
| 2 | Streu aus Laub und Zweigen | Risse in trockener Erde | Büschel hohes, totes Gras (flach von oben) |

### Danach (meine Seite)

- Alte Deko der ersten Karte (`rock`, `tree`, `grave`, `torch`, `gallows`, Gras) raus, neue Props mit Gruppen-Logik verteilen: Laternenpfähle als Reihe entlang des Wegs, Galgen und Käfige als kleine Szenen auf Lichtungen, Zäune in Reihen.
- Weg-Textur über eine weiche Rauschmaske einblenden, Decals einzeln drüberstreuen.
- Laternen bekommen flackerndes Licht im Dunkel.

**Stand:** eingebaut. `props-gallows` wird über feste Bereiche geschnitten (Reihen ungleich hoch), Magenta-Key nach Farbton (`key_magenta_strong`, `despill_red`). Weg = Rauschlinie (`pathD`/`pathW` in `scene.ts`) mit weicher Maske, Laternen/Zäune am Wegrand (`pathDecor`), Decals flach im Boden (`decals`). Zoom 0.75.
