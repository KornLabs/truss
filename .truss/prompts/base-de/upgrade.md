Du schließt ein Truss-Versionsupgrade ab. `truss upgrade` hat die mechanische Hälfte bereits erledigt — die Engine ist getauscht, jede eindeutige Baseline-Änderung ist übernommen. Übrig ist die Hälfte, die ein Skript nicht entscheiden kann: Dateien, an denen die neue Baseline und dieses Projekt dieselbe Stelle geändert haben. Fertig = jeder Konflikt aufgelöst, keine `.truss-merge`-Datei mehr übrig, `doctor` sauber, und ein Absatz darüber, was sich an der Arbeitsweise dieses Workspace geändert hat.

## Deine Eingabe

- Aufgabe: {{INPUT}} (optional — die Versionen oder die Dateien, auf die du dich konzentrieren sollst)
- Randbedingungen: {{CONSTRAINTS}} (optional)
- Hinweise: {{POINTERS}} (optional — projektspezifische Abschnitte, die wortgleich überleben müssen)

**Dein Standard ist bewahren, nicht angleichen.** Eine Datei ist von der Baseline abgewichen, weil jemand das so entschieden hat. Du importierst neue Framework-Regeln in ein Projekt, du stellst kein Projekt auf Werkszustand zurück. Schreibe alle Freitexte in der Sprache aus `language:` in state/profile.md; ID-Token, Schlüssel/Feldnamen und feste Überschriften bleiben englisch (AGENTS.md §3).

**1. Orientieren.** Lies AGENTS.md und state/current.md. Finde das Backup, das das Upgrade als `.truss.bak-<alte-version>/` hinterlassen hat — `.truss.bak-<alt>/baseline/` ist der Stand, aus dem dieser Workspace einmal entstanden ist, `.truss/baseline/` ist der neue. Diese beiden Verzeichnisse sind die *einzige* Autorität darüber, was das Upgrade ändern will; vergleiche den Workspace niemals nur gegen die neue Baseline — sonst liest du jede bewusste Projektentscheidung als Abweichung.

**2. Bestand aufnehmen.** Der Upgrade-Report nennt drei Sorten Rest, und das sind nicht dieselben Aufgaben:
- **`CONFLICT`** — neben einer unangetasteten Originaldatei liegt eine `<datei>.truss-merge`. Auflösen (Stufe 3), danach die Seitendatei löschen.
- **`manual` / `FAILED`** — es wurde gar nichts geschrieben; die Notiz nennt den Grund (git fehlt, Binärdatei, Rechtefehler). Ursache beheben oder von Hand mergen, danach die Datei selbst prüfen.
- **`review`** — eine **Saatgut**-Datei (`state/*`, `VISION.md`, `README.md`). Das Upgrade hat sie bewusst nicht angefasst: ihr Inhalt gehört dem Projekt, nicht dem Framework. Vergleiche die beiden Baseline-Fassungen und übernimm nur eine *strukturelle* Änderung, die das Projekt wirklich braucht — ein neues Feld in `state/profile.md`, eine neue Abschnittsüberschrift. Übernimm nie Template-Prosa, und lass ein Template-Diff niemals an festgehaltene Einträge in `state/decisions.md` (AGENTS.md §5: eine Entscheidung wird nie gelöscht). Im Zweifel hier: liegen lassen und es sagen.

Halte für jede Datei die drei Fassungen auseinander: deine (die Workspace-Datei), alte Baseline, neue Baseline.

**3. Auflösen, Hunk für Hunk.** Die Frage ist nie „welche Seite ist besser", sondern **„was hat die Baseline hier geändert, und gilt diese Änderung für dieses Projekt?"**
- Bestimme zuerst die Absicht der Baseline: alte Baseline → neue Baseline. Nur dieser Diff ist das, was du importierst.
- Übertrage diese Absicht in die Formulierung des Projekts und behalte dessen Begriffe, ergänzte Abschnitte, `§2`-Tabellenzeilen und Beispiele. Eine umbenannte Regel wird umbenannt; ein neu geschriebener Absatz wird in der Stimme des Projekts neu geschrieben, nicht aus der Baseline kopiert.
- Inhalt, den das Projekt ergänzt hat und den die Baseline nie hatte: bedingungslos behalten.
- Inhalt, den die Baseline entfernt hat: nur entfernen, wenn das Projekt ihn nicht erweitert hat. Hat es das, sag es und frag nach.
- Fass die generierten Bänder (`truss:begin preferences`, `truss:begin phase`) nie von Hand an — `truss set` und `truss render` besitzen diesen Inhalt (AGENTS.md §5).
- Was du aus den drei Fassungen nicht entscheiden kannst: frag. Eine Rückfrage mit den drei Varianten ist besser als ein falscher Merge in AGENTS.md.

**4. Übernehmen.** Schreib das aufgelöste Ergebnis in die echte Datei und lösche danach die `.truss-merge`-Datei. Nirgends dürfen Konfliktmarker übrig bleiben.

**5. Die semantische Ebene prüfen.** Dateiinhalt ist nur ein Teil eines Versionswechsels. Lauf `node .truss/bin/truss.mjs doctor` und behandle jeden Fund als Upgrade-Aufgabe: eine `BL-03`-Warnung zu einem stillgelegten Präferenz-Key nennt den Ersatz in der Meldung — setz ihn mit `truss set`. Danach `truss render`, und `truss map`, falls sich der Dateibestand geändert hat. Wiederholen, bis sauber.

**6. Berichten.** In state/current.md eine `recently-done:`-Zeile, die den Versionsschritt benennt. An den Menschen ein Absatz: welche Regeln sich an der Arbeitsweise dieses Workspace geändert haben, was du gegen die Baseline behalten hast und warum, und wo du raten musstest. Wenn das Upgrade eine Regel ändert, die einer festgehaltenen Entscheidung widerspricht, eröffne ein `OD-NNN` — lass die neue Baseline niemals stillschweigend ein `D-NNN` überstimmen.

Sobald `doctor` sauber ist und der Mensch zufrieden, kann `.truss.bak-<alte-version>/` gelöscht werden. Überlass das dem Menschen.
