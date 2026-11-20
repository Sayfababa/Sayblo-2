# Grafik-Vorgaben (KI-generierte Bilder)

## Grundidee

KI-Bildgeneratoren erzeugen kaum zuverlässig dieselbe Figur über viele Animationsbilder und Blickrichtungen hinweg.
Deshalb gilt:

- **Eine Figur = ein Bild** (bzw. wenige Posen). Die Bewegung macht der Code: Wippen, Neigen, Strecken, Ausfallschritt, Spiegeln für links/rechts, Aufleuchten bei Treffern, Auflösen beim Tod.
- **Zauber, Licht und Partikel macht der Code**, nicht die Bilder.
- Alle Bilder brauchen **denselben Blickwinkel und dieselbe Lichtrichtung**, sonst wirkt die Welt zusammengewürfelt.

## Technische Vorgaben für jedes Bild

| Punkt | Vorgabe |
|---|---|
| Format | PNG mit **transparentem Hintergrund** |
| Blickwinkel | isometrisch, ca. 30° von oben (klassische ARPG-Ansicht) |
| Blickrichtung Figuren | nach **rechts unten** schauend (wird für links gespiegelt) |
| Licht | von **links oben**, eher düster, keine harten Schlagschatten (Schatten zeichnet der Code) |
| Stil | Dark Fantasy, gemalt/semi-realistisch, gedeckte Farben |
| Standpunkt | Füße der Figur **unten mittig** im Bild, wenig Rand |
| Kein Text | keine Schrift, kein Logo, kein Rahmen |

### Größen

| Art | Größe |
|---|---|
| Heldin, normale Monster | 256 × 256 |
| Große Monster, Boss | 512 × 512 |
| Bodentexturen (nahtlos kachelbar) | 512 × 512 |
| Deko (Steine, Bäume, Fackeln, Gräber …) | 256 × 256 |
| Item-Icons | 128 × 128 (gerade Draufsicht, kein Iso nötig) |

## Prompt-Vorlage

> isometric view, 30 degree top-down angle, dark fantasy ARPG game sprite, **[MOTIV]**, facing bottom-right, full body, feet at bottom center, soft light from top-left, muted desaturated colors, painterly, transparent background, no text, no frame, no ground shadow

Für Bodentexturen:

> seamless tileable texture, top-down, dark fantasy, **[BODEN]**, muted colors, no objects, no text

Tipp: Wenn das Tool es kann, ein fertiges Bild (z. B. die Heldin) als **Stil-Referenz** für alle weiteren nutzen.

## Liste für Akt I

### Heldin (Zauberin)
- [ ] Idle-Pose (steht, Stab in der Hand)
- [ ] Zauber-Pose (Stab erhoben)
- [ ] optional: 2 Laufposen (linkes / rechtes Bein vorn)

### Monster (je 1 Bild)
- [ ] Ember Imp – kleiner, gehörnter Feuerdämon, glühende Augen
- [ ] Bog Wraith – schwebender Moorgeist, bläulich, durchscheinend
- [ ] Spark Beetle – großer Käfer, gelbliche Funken auf dem Panzer
- [ ] Cinder Hound – Höllenhund mit glühender Glut im Fell
- [ ] Ashen Cultist – verhüllter Kultist in aschgrauer Robe, Feuer in der Hand
- [ ] Storm Crow – große Krähe mit Blitzen in den Federn
- [ ] Thunder Husk – massige, untote Hülle mit Blitzadern
- [ ] Frost Shade – hoher, schlanker Eisgeist
- [ ] Rime Ghoul – bleicher, gebückter Ghul mit Raureif
- [ ] Mother Vesper (Boss, 512) – große, bleiche Äbtissin, Heiligenschein, Robe

### Böden (nahtlos, je 1–2 Varianten)
- [ ] Gallows Field – dunkles Gras, Erdflecken
- [ ] Weeping Mire – Moor, Pfützen
- [ ] Cinder Hollow – verbrannte Erde, Glutrisse
- [ ] Stormwatch Ruins – Steinplatten, Ruinenboden
- [ ] Rimefrost Crypt – gefrorener Boden, Raureif
- [ ] The Pale Chapel – heller, alter Kapellenboden

### Deko
- [ ] Felsen (2–3 Varianten), toter Baum (2), Fackel, Grabstein, Säule (ganz/zerbrochen), Kerzenständer, Schilf, Eiskristall

### Item-Icons
- [ ] Stab, Helm, Rüstung, Amulett, Ring (je 1–3 Varianten)
- [ ] Gold, Heiltrank, Manatrank

## Ablage

Bilder einfach im Repo unter `assets/` ablegen, z. B. `assets/monsters/ember-imp.png`.
Dateinamen klein, mit Bindestrichen, ohne Leerzeichen.

### Skill-Icons (neu, bisher Platzhalter aus Effekt-Sprites)
128 × 128, gleicher Stil wie die vorhandenen Skill-Icons (Bronzerahmen):
- [ ] Searing Burst (Flammenring bricht aus dem Boden)
- [ ] Pyromancy (passiv: Flamme in offener Hand)
- [ ] Kindling (passiv: glimmende Glut, Funken)
- [ ] Ice Nova (Eiskristalle in alle Richtungen)
- [ ] Cold Mastery (passiv: Eiskristall-Rune)
- [ ] Permafrost (passiv: gefrorener Boden mit Rissen)
- [ ] Thunderstrike (violetter Blitz von oben)
- [ ] Conductivity (passiv: violette Funken springen zwischen Punkten)
- [ ] Storm Mastery (passiv: Blitz-Rune)

### Oberfläche, Gem-Icons, neue Skill-Icons
Fertige Prompts und Sheet-Aufteilung: siehe `docs/ui-assets.md`.

### Support-Gem-Icons (optional, derzeit in Code gezeichnet)
- [ ] 17 geschliffene Steine, 64 × 64, Farbe nach Element (rot, eisblau, violett, grün für allgemeine)
