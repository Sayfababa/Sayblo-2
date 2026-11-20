# Roadmap

Arbeitstitel: **Grimlight** (Platzhalter). Diablo-artiges Semi-Idle-ARPG, eigene Dark-Fantasy-Welt, Browser/PWA für Handy und PC.

Stand heute: spielbare Demo in `prototype/combat-demo.html` mit isometrischer Szene, eigener Grafik für Akt I, Auto-Kampf mit Prioritätenliste, 6 Skills, Loot mit Seltenheiten, Tod, Tränken und 6 Gebieten.

Die Demo ist eine einzelne Datei. Sie hat ihren Zweck erfüllt (Gefühl und Grafik testen), trägt aber keine großen Systeme mehr. Deshalb beginnt der Plan mit dem Umbau.

---

## Reihenfolge und warum

| Phase | Inhalt | Warum an dieser Stelle |
|---|---|---|
| 0 | Fundament | Alles Weitere baut darauf auf. Ohne sauberes Datenmodell werden Tags, Gems und Uniques zu Flickwerk. |
| 1 | Kampfsystem-Tiefe: Tags, Schadensformel, Zustände, Support-Gems | Das ist der Kern der Build-Tiefe. Items und Uniques beziehen sich später auf Tags. |
| 2 | Items, Uniques, Sets, Crafting | Braucht die Tags aus Phase 1. |
| 3 | Neue Oberfläche | Wird parallel zu 1 und 2 gebaut, je System die passende Ansicht. Hier als eigener Block, weil sie auch einen eigenen Look bekommt. |
| 4 | Akt I fertig, Schwierigkeitsgrade, Offline, Balancing | Erst wenn die Systeme stehen, lohnt sich Feinabstimmung. |
| 5 | Endgame: Rifts | Langzeitziel, setzt fertige Builds voraus. |
| 6 | Mehr Inhalt: Akte, Klassen, Sound | Ausbau. |

Jede Phase endet mit einer spielbaren Version.

---

## Phase 0 – Fundament

**Ziel:** Die Demo als echtes Projekt, gleicher Funktionsumfang, aber erweiterbar.

- [ ] Projekt aufsetzen: Vite, TypeScript, PixiJS (WebGL-Darstellung), installierbar als PWA
- [ ] **Simulation und Darstellung trennen.** Die Spiellogik läuft in festen Schritten ohne Grafik. Dadurch geht Offline-Fortschritt mit derselben Logik, und Balancing lässt sich automatisch durchrechnen.
- [ ] **Inhalte als Daten** statt im Code: Skills, Monster, Gebiete, Affixe, Uniques, Gems in eigenen Dateien. Neue Inhalte = neue Einträge, kein neuer Code.
- [ ] Spielstand mit Versionsnummer und Migration, Export/Import als Text-Code
- [ ] Grafik-Pipeline: `tools/slice_sheets.py` erzeugt Sprites direkt ins Projekt
- [ ] Tests für die Formeln (Schaden, Resistenzen, Drops)

**Fertig, wenn:** Das neue Projekt kann alles, was die Demo kann, auf Handy und PC.

---

## Phase 1 – Kampfsystem-Tiefe

### 1.1 Skill-Tags

Jeder Skill bekommt Tags. Fast alle Boni im Spiel wirken über Tags.

| Gruppe | Tags |
|---|---|
| Element | Fire, Cold, Lightning |
| Form | Projectile, Area, Chain, Nova, Strike-from-sky (Meteor) |
| Art | Spell, Duration, Buff, Damage over Time |

Beispiele für Boni: „+20 % Projectile-Schaden“, „+1 Level auf alle Cold-Skills“, „Area-Skills haben 15 % mehr Radius“.

### 1.2 Schadensformel mit klaren Ebenen

1. Grundschaden des Skills
2. **Zusatzschaden** (flach, z. B. „+4–9 Feuerschaden zu Zaubern“)
3. **Erhöht** (alle %-Boni werden addiert)
4. **Mehr** (Multiplikatoren, vor allem von Support-Gems, werden multipliziert)
5. Kritischer Treffer
6. Resistenz des Ziels, abzüglich **Durchdringung**

Die Trennung „erhöht“ und „mehr“ ist der wichtigste Hebel für Build-Tiefe: Viele kleine Boni gegen wenige starke Multiplikatoren.

### 1.3 Elementare Zustände

| Element | Zustand | Wirkung |
|---|---|---|
| Feuer | **Brennen** | Schaden über Zeit |
| Kälte | **Verlangsamt** / **Gefroren** | Langsamer, bei starkem Treffer kurz eingefroren |
| Blitz | **Geschockt** | Ziel erleidet mehr Schaden |

Daraus entstehen Kombos: Blitz schockt, Feuer nutzt den Schock aus, Kälte hält Gegner auf Abstand.

### 1.4 Support-Gems

Support-Gems verändern einen aktiven Skill. Sie droppen als Loot, haben Level und passen nur zu Skills mit bestimmten Tags.

Beispiele für den Start (ca. 15):

| Gem | Passt zu | Wirkung |
|---|---|---|
| Multiple Projectiles | Projectile | +2 Projektile, weniger Schaden pro Projektil |
| Pierce | Projectile | Durchschlägt Gegner |
| Fork | Projectile | Teilt sich beim Treffer |
| Wider Area | Area | Größerer Radius |
| Concentrated Power | Area | Kleinerer Radius, mehr Schaden |
| Extra Chains | Chain | +2 Sprünge |
| Elemental Spread | alle | Zustände springen auf Gegner in der Nähe über |
| Searing Burn | Fire | Mehr Brennschaden, längeres Brennen |
| Deep Freeze | Cold | Höhere Einfrier-Chance |
| Overcharge | Lightning | Stärkerer Schock |
| Added Fire / Cold / Lightning | Spell | Zusatzschaden im Element |
| Spell Echo | Spell | Wird doppelt gewirkt, kostet mehr Mana |
| Quick Cast | Spell | Schneller zaubern |
| Efficiency | alle | Weniger Manakosten |
| Lingering | Duration | Längere Dauer |

Jedes Gem kostet zusätzlich Mana (Multiplikator). Dadurch bleiben Mana, Spirit und Mana-Items wichtig.

**Gem-Plätze sitzen im Skill selbst** (entschieden): Jeder aktive Skill hat bis zu 3 Plätze. Platz 1 gibt es ab Skill-Level 1, Platz 2 ab Level 5, Platz 3 ab Level 10.

### 1.5 Skill-Bäume erweitern

- [ ] Drei Bäume mit je ca. 8 Skills: aktive Skills, passive Skills (z. B. „Feuer-Meisterschaft“) und Synergien
- [ ] Prioritätenliste: neue Bedingungen, etwa „Ziel geschockt“, „Ziel brennt nicht“, „Gegner näher als X“

**Fertig, wenn:** Zwei Spieler mit derselben Klasse deutlich verschiedene Builds spielen können, etwa einen Feuer-Projektil-Build und einen Blitz-Ketten-Build.

---

## Phase 2 – Items und Loot

### 2.1 Affix-System

- [ ] Grundtypen pro Slot mit Item-Level-Stufen (einfache, mittlere, gute Basis)
- [ ] Affixe in **Stufen** (T1 bis T5). Bessere Stufen gibt es erst ab höherem Item-Level.
- [ ] Präfixe und Suffixe: Magisch höchstens 1 + 1, Selten höchstens 3 + 3
- [ ] Tag-Affixe, etwa „+1 Level auf Fire-Skills“ oder „+15 % Area-Schaden“

### 2.2 Uniques für Build-Tiefe

Uniques sollen Builds verändern, nicht nur hohe Werte haben. Jedes bekommt einen besonderen Effekt.

Beispiele:
- **Vesper's Lantern** (Stab): Feuerball verschießt 2 weitere Projektile, kostet 50 % mehr Mana
- **Crown of Cinders** (Helm): Brennende Gegner explodieren beim Tod
- **Shroud of the Drowned Saint** (Rüstung): Bricht die Barriere, friert sie Gegner in der Nähe ein
- **The Tolling Bell** (Amulett): Chain Lightning springt 3-mal öfter, macht aber 30 % weniger Schaden
- **Gravewhisper** (Ring): Geschockte Gegner erleiden auch Kälteschaden
- **Ember Heart** (Amulett): Kälte-Skills machen zusätzlich Feuerschaden und lassen Gegner brennen
- **Stormcaller's Band** (Ring): Meteor löst beim Einschlag eine Static Nova aus

Ziel für Akt I und II: ca. 20 Uniques, dazu später eigene Icons.

### 2.3 Sets

- [ ] 2–3 kleine Sets (2–3 Teile) mit Boni, die einen Spielstil stärken

### 2.4 Crafting

- [ ] **Zerlegen** in Materialien (z. B. Staub, Essenzen)
- [ ] **Umschmieden:** ein Affix neu würfeln
- [ ] **Aufwerten:** Seltenheit oder Stufe erhöhen
- [ ] Rezepte beim Schmied in der Stadt

### 2.5 Loot-Verwaltung

- [ ] Loot-Filter mit Regeln (nach Seltenheit, Slot, Tag; Uniques und Gems immer aufheben)
- [ ] Truhe in der Stadt mit Reitern
- [ ] Auto-Zerlegen statt nur Auto-Verkaufen

### 2.6 Ausrüstungsplätze

**5 Plätze bleiben** (entschieden): Waffe, Helm, Rüstung, Amulett, Ring. Weil es wenige Plätze sind, muss jedes Teil mehr leisten: Uniques und Tag-Affixe tragen die Build-Tiefe, und Seltene Items bekommen eher starke als viele Werte.

**Fertig, wenn:** Ein guter Drop eine echte Entscheidung ist und das Zerlegen sich lohnt.

---

## Phase 3 – Neue Oberfläche

Die jetzigen Menüs sind Listen. Sie sollen wie ein Spiel aussehen.

### 3.1 Inventar

- [ ] **Raster im Diablo-Stil mit unterschiedlichen Größen** (entschieden): Stab 1×3, Rüstung 2×3, Helm 2×2, Amulett und Ring 1×1, Trank 1×1, Gem 1×1
- [ ] Damit es auf dem Handy nicht fummelig wird: Antippen statt Ziehen, freie Plätze werden beim Ablegen hervorgehoben, ein **Sortieren-Knopf** packt alles automatisch zusammen
- [ ] Rahmen und Hintergrund der Felder in der Seltenheitsfarbe
- [ ] Antippen öffnet einen **Tooltip** im Diablo-Stil: farbiger Name, Grundtyp, Werte, darunter der Vergleich mit dem angelegten Item (grün/rot)
- [ ] Anlegen per Knopf im Tooltip oder durch Ziehen auf den Platz
- [ ] Mehrfachauswahl zum Zerlegen

### 3.2 Charakter

- [ ] **Paperdoll:** Figur in der Mitte, Ausrüstungsplätze darum herum
- [ ] Werte in aufklappbaren Gruppen (Angriff, Verteidigung, Resistenzen)

### 3.3 Skills

- [ ] **Skill-Baum als Grafik:** Knoten mit Icons, Verbindungslinien, gesperrte Knoten ausgegraut
- [ ] Pro aktivem Skill: **Gem-Plätze** zum Einsetzen der Support-Gems
- [ ] Prioritätenliste als Karten mit Icons, verschiebbar per Ziehen

### 3.4 HUD

- [ ] Leiste für Buffs und Zustände, z. B. Frost Armor mit Restzeit
- [ ] Loot-Namen am Boden ein-/ausblendbar
- [ ] **Offline-Zusammenfassung** beim Zurückkommen: Zeit, Gold, EP, gefundene Items
- [ ] Einstellungen: Schadenszahlen, Geschwindigkeit, Ton

### 3.5 Grafik für die Oberfläche

Benötigt neue Bilder (Prompts folgen, wenn es so weit ist):
- [ ] Panel-Rahmen in Stein/Bronze, passend zu den Kugeln
- [ ] Inventar-Felder, Knöpfe, Reiter
- [ ] Gem-Icons (ca. 15)
- [ ] Unique-Icons

**Fertig, wenn:** Kein Menü mehr wie eine Checkliste aussieht und alles auf dem Handy mit einer Hand bedienbar ist.

---

## Phase 4 – Akt I fertig und Progression

- [ ] Akt I mit allen 6 Gebieten, kleinen Aufgaben und Wegpunkten
- [ ] Boss Mother Vesper mit echten Phasen und lesbaren Angriffen (Warnkreise am Boden)
- [ ] **Schwierigkeitsgrade** Normal, Albtraum, Hölle mit Resistenz-Malus (0 / −40 / −80 %)
- [ ] **Offline-Fortschritt:** 50 % Ertrag, mit Zeitlimit
- [ ] **Balancing-Werkzeug:** ein Skript simuliert Builds und misst Zeit pro Gebiet und Todesrate. Ziel: Akt I Normal in 2–3 Stunden.

**Fertig, wenn:** Akt I auf allen drei Schwierigkeitsgraden von Anfang bis Ende spielbar ist.

---

## Phase 5 – Endgame: Rifts

- [ ] Endlos ansteigende Rift-Stufen
- [ ] **Rift-Schlüssel** als Drop (das Schlüssel-Icon ist schon da), mit Modifikatoren wie „Monster schneller“ oder „+50 % Loot“
- [ ] Rift-Boss alle 10 Stufen
- [ ] Persönliche Bestleistung pro Build

**Fertig, wenn:** Es nach Hölle ein Ziel gibt, das wochenlang trägt.

---

## Phase 6 – Ausbau

- [ ] Akt II mit neuen Monstern und Gebieten (der Boden „totes Gras“ liegt schon bereit)
- [ ] Sound und Musik
- [ ] Weitere Klassen
- [ ] Optional: Bestenliste mit Freunden

---

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Wo sitzen Support-Gems? | **im Skill selbst**, Plätze schalten sich mit dem Skill-Level frei |
| Inventar | **unterschiedliche Größen wie in Diablo 2**, mit Antippen und Auto-Sortieren fürs Handy |
| Ausrüstungsplätze | **5** (Waffe, Helm, Rüstung, Amulett, Ring) |
| Name des Spiels | offen, vorerst „Grimlight“ |
