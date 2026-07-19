<p align="center">
  <img src=".github/hero-mockup.png" alt="Links: die Plain-Markdown-State-Dateien eines Projekts (AGENTS.md, state/current.md). Rechts: ein KI-Agent, der daraus bootet und exakt dort weitermacht, wo die letzte Session aufgehört hat." width="800">
</p>

<p align="center">
  <a href="README.md">English</a> · <b>Deutsch</b>
</p>

# Truss

**Projektgedächtnis für KI-Agenten: ein Ordner aus reinem Markdown, der Vision, Entscheidungen, Phasen und aktuellen Stand hält - jede Session macht dort weiter, wo die letzte aufgehört hat, statt bei null zu beginnen.** **Keine API-Keys. Truss ruft nie ein Modell auf; es läuft über das KI-Abo, das du ohnehin bezahlst.**

[![CI](https://github.com/KornLabs/truss/actions/workflows/ci.yml/badge.svg)](https://github.com/KornLabs/truss/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Node](https://img.shields.io/badge/node-%E2%89%A5%2020-brightgreen.svg)](https://nodejs.org) ![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)

> Dies ist die deutsche Übersetzung der [englischen README](README.md) (Stand: `1.0.0-alpha.6`). Bei Abweichungen ist die englische Version maßgeblich.

> Ein Truss (Fachwerkträger) ist ein leichtes Gerüst aus Streben, das die Last einer Struktur trägt und ihre Form hält, ohne selbst das Gebäude zu sein. Truss tut dasselbe für ein Projekt, das mit KI-Agenten gebaut wird: ein dünner Rahmen, auf dem deine Arbeit ruht — nie ihr Ersatz.

## Was ist Truss

Jede neue Session mit einem Coding-Agenten beginnt bei null. Du erklärst das Projekt erneut, der Agent liest das halbe Repo, und die Entscheidung vom Dienstag wird am Donnerstag anders getroffen. Je länger ein Projekt läuft, desto undurchsichtiger.

Viele Tools geben Agenten ein Gedächtnis. Truss optimiert zwei Dinge: 1. Das Gedächtnis hat Struktur, und 2. der Pflichtanteil bleibt klein. Es ist eine dünne Schicht aus reinem Markdown, die neben deinem Code liegt und als Gedächtnis des Projekts dient. Jede Session durchläuft denselben Loop:

1. **Boot.** Der Agent liest eine Datei, `AGENTS.md`: was das Projekt ist, in welcher Phase es sich befindet, welche wenigen State-Dateien zu laden sind und wo alles Weitere liegt. Dieses Pflicht-Boot-Set umfasst etwa 3,8k geschätzte Tokens.
2. **Arbeit.** Er zieht nur die Dateien heran, die die Aufgabe braucht. Eine generierte Map mit Token-Schätzung pro Datei sagt ihm, wo er nachschauen muss — er schlägt nach, statt zu suchen.
3. **Rückschreiben.** Sobald ein Stück Arbeit fertig ist — nicht erst am Session-Ende — hält er kurz fest, was sich geändert hat: Fokus und nächste Schritte in `state/current.md`, Entscheidungen in `state/decisions.md`, änderungen an Vision/Idee in `VISION.md`.

Die nächste Session setzt exakt dort an. Truss baut auf der offenen [AGENTS.md](https://agents.md)-Konvention auf; Claude Code, Cowork, Codex, Gemini CLI, Copilot und Cursor booten alle aus derselben Datei.

Das Herz der Boot-Datei ist ihre Load-Order. Das ist der echte §1, den ein Agent sieht: [`AGENTS.md`](.truss/baseline/AGENTS.md):

```text
## 1 Load order

1. This file — fully, every session.
2. `state/current.md` — focus, next actions, blockers.
3. `VISION.md` — once per session.
4. `state/decisions.md` — before making or proposing any decision; if your
   task touches an open question, also load `state/open-decisions.md`.
5. `state/profile.md` — project language, tools, style.
6. The phase block's read list, then the one domain file your task belongs to.

Load the smallest context that can answer the task. Stop as soon as it is
unambiguous.
```

## Was Truss dir bringt

**Ein Projekt, das sich erinnert:** `VISION.md` ist der Anker — Problem, Idee, Prinzipien, Constraints —, von jedem Agenten einmal pro Session gelesen. Rolle und Ziel des Projekts hängen damit nie von deinem Prompt ab. Drumherum halten State-Dateien den aktuellen Fokus, jede Entscheidung samt Begründung, offene Fragen und die Phase, in der du bist — jede in ihrer eigenen Datei mit definierter Form. `state/decisions.md` wird supersedet, nie gelöscht: Du kannst nachvollziehen, warum das Projekt so ist, wie es ist.

**Ein Agent, der weiß, wo alles liegt:** Die Routing-Tabelle der Boot-Datei und eine generierte `state/map.md` (mit Token-Schätzung pro Datei) sagen dem Agenten, welche Datei was enthält. Er öffnet, was die Aufgabe braucht, und sonst nichts — statt das Repo in jeder Session neu zu scannen.

**Sessions, die bei der Aufgabe bleiben:** Das Pflicht-Boot-Set liegt bei etwa 3,8k Tokens; alles Weitere lädt nur bei Bedarf. Das Fenster bleibt frei für die eigentliche Arbeit — Sessions leben länger, degradieren später und kosten weniger.

**Präferenzen einmal gesetzt statt in jedem Prompt wiederholt:** Wie kritisch soll der Agent mit deinem Input umgehen? Bei Unklarheit nachfragen oder selbst eine Lösung wählen? Subagenten für Recherche einsetzen oder alles selbst erledigen? Jede Einstellung einmal setzen (`truss set`), und jede künftige Session hält sich daran.

**Struktur Unterstützung:** Eine kleine CLI ohne Abhängigkeiten stützt das System: Sie prüft, ob die Dateien ihrer Struktur noch folgen, warnt, wenn State driftet oder eine Datei ihren Fokus verliert, und hält generierte Blöcke synchron. Sie berichtet nur — jede Warnung lässt die Entscheidung bei dir und dem Agenten.

**Ein Mensch in der Schleife, wo es zählt:** Agenten arbeiten; du entscheidest. Schritte, die nur ein Mensch gehen kann, landen in `HUMAN-TODOS.md`, Phasenwechsel gehören dir allein, und offene Fragen warten in `state/open-decisions.md` als Briefings mit Optionen und Trade-offs, statt still entschieden zu werden.

**Ein Rahmen, der über bestehenden Code passt:** Der Overlay-Modus bettet eine Codebasis mit unangetasteter Git-Historie unter den Workspace, oder du markierst ein vorhandenes Verzeichnis als Code-Root. Nützlich, wenn ein Team-Repo Vision, Gedächtnis und Leitplanken bekommen soll, ohne dass sich am Repo selbst etwas ändert.

## Wann Truss glänzt

Truss ist daraus entstanden, kontrolliert Agent-First zu arbeiten. Bevor gebaut wird: die Idee ausarbeiten, recherchieren und validieren, dann auf diesem Fundament planen und bauen. Am meisten zahlt es sich in langlaufenden Projekten aus, wenn sich Anforderungen verschieben oder eine echte Planungsphase dem Code vorausgeht — das Gedächtnis macht Kurswechsel bewusst und nachvollziehbar.

Als Overlay diszipliniert es bestehende Repos: `VISION.md` benennt Rolle und Ziel, und jeder Agent arbeitet innerhalb davon. Das hilft innerhlab Teams — und besonders dann, wenn das Ticket die Aufgabe ist und neben dem Ticket nichts anderes entstehen soll.

## Quickstart

Voraussetzung: **Node ≥ 20**. Keine weiteren Abhängigkeiten, kein Build-Schritt, keine Installation.

Truss umschließt dein Projekt auf zwei Arten: **Drop-in:** legt den Workspace neben deinen bestehenden Code in denselben Ordner; **Overlay:** bettet deinen Code darunter in `repo/` ein. Die Schritte unten zeigen Drop-in; Overlay folgt [weiter unten](#bestehende-codebasis-overlay).

Dieses Repo ist die _Quelle_ des `.truss/`-Engine-Ordners. Kopiere genau diesen einen Ordner in ein eigenes Projekt und führe `init` dort aus. Alles andere, README und Doku eingeschlossen, wird nicht benötigt.

Führe folgende Befehle aus:

**macOS / Linux:**

```bash
# In einem leeren oder bestehenden Projektverzeichnis:

# 1. Engine hineinlegen — nur den .truss/-Ordner, sonst nichts.
git clone --depth 1 https://github.com/KornLabs/truss.git /tmp/truss
cp -R /tmp/truss/.truss ./.truss && rm -rf /tmp/truss

# 2. Frischen Workspace neben der Engine scaffolden.
node .truss/bin/truss.mjs init

# 3. Den von init ausgegebenen Boot-Prompt in dein KI-Tool kopieren, deine
#    Idee dahinter einfügen und die erste Session starten.

# Optional: Workspace-Gesundheit jederzeit prüfen.
node .truss/bin/truss.mjs doctor
```

**Windows (PowerShell):**

```powershell
# In einem leeren oder bestehenden Projektverzeichnis:

# 1. Engine hineinlegen.
git clone --depth 1 https://github.com/KornLabs/truss.git $env:TEMP\truss
Copy-Item -Recurse $env:TEMP\truss\.truss .\.truss
Remove-Item -Recurse -Force $env:TEMP\truss

# 2. Frischen Workspace neben der Engine scaffolden.
node .truss/bin/truss.mjs init

# 3. Den von init ausgegebenen Boot-Prompt in dein KI-Tool kopieren, deine
#    Idee dahinter einfügen und die erste Session starten.

# Optional: Workspace-Gesundheit jederzeit prüfen.
node .truss/bin/truss.mjs doctor
```

`init` scaffoldet nicht und lässt dich vor einer leeren Seite sitzen. Es endet mit deinen nächsten Schritten und einem **fertigen Boot-Prompt:** in dein KI-Tool einfügen, Idee anhängen, und der Agent interviewt dich zu einer echten `VISION.md`, statt dir ein leeres Template zu überlassen (gekürzt; CLI-Ausgabe ist englisch):

```text
  Next steps:
    1. Start with the boot prompt below — the agent interviews you to turn your
       idea into VISION.md and state/profile.md (no blank-template filling).
    2. Run: node .truss/bin/truss.mjs doctor

  Boot prompt for your AI tool:
    "Read AGENTS.md fully, then follow §1 load order. This is a fresh project.
     First turn my idea into VISION.md and state/profile.md by interviewing me,
     one question at a time.  My idea: ⟨paste your idea, role, and goal here⟩"
```

Hat das Projekt bereits eine marker-freie `AGENTS.md`, stoppt `init`, bevor es etwas schreibt. Prüfe die Datei und starte erneut mit `--adopt-agents`, um sie als Präambel zu behalten und den Truss-Router anzuhängen.

Die Produktdokumentation lebt innerhalb der Engine unter [`.truss/docs/`](.truss/docs/) — verfügbar in jedem Projekt, das Truss übernommen hat und nie in Kollision mit deinem eigenen `docs/`.

Optionales Komfort-Alias:

```bash
# bash / zsh
alias truss='node .truss/bin/truss.mjs'
```

```powershell
# PowerShell
function truss { node .truss/bin/truss.mjs @args }
```

```cmd
rem cmd.exe
doskey truss=node .truss/bin/truss.mjs $*
```

### Bestehende Codebasis (Overlay)

Lege einen Truss-Workspace an und hole deinen Code unter `repo/` hinein:

```bash
node .truss/bin/truss.mjs init --overlay --name "My Project" --lang German \
  --repo /path/to/code            # lokaler Pfad → symlinked, URL → geklont
```

> **Windows-Hinweis:** Symlinks erfordern den Entwicklermodus (oder eine erhöhte Shell). Schlägt das Symlinken fehl, übergib stattdessen eine Git-URL — das Repo wird unter `repo/` geklont.

Das richtet einen Import-first-Phasenfluss ein (`ingest → operate`), bettet deinen Code mit eigener Git-Historie unter `repo/` ein (hier gitignored, so vermischen sich Commits nie) und startet eine `ingest`-Phase, die dich erst nach dem Kontext fragt, den der Code nicht verraten kann, und ihn dann sichtet. Overlay-Init erhält eine bestehende `.gitignore` und ergänzt `repo/`. Kompletter Walkthrough: [.truss/docs/overlay.md](.truss/docs/overlay.md).

Liegt bereits ein Code-Verzeichnis im Workspace (etwa ein getracktes Submodul)? Lass es, wo es ist, und wähle es explizit aus:

```bash
node .truss/bin/truss.mjs init --overlay --name "My Project" --lang German \
  --code-root product
```

Truss trägt `code-root: product` in `state/profile.md` ein; Checks, Branch-Status, Phasen-Evidenz, `map` und `repo-map` teilen sich dann diese eine Grenze. Das ändert nur, welches bestehende Verzeichnis als Code gilt: Workspace, `.truss/` und State-Dateien bleiben, wo sie sind.

### Was dein Agent braucht

Eine Berechtigung zählt: **Terminal-/Befehlsausführung** im Workspace, damit der Agent `doctor`, `render`, `set` und `map` selbst ausführen kann. Auto-Run für `node .truss/bin/truss.mjs`-Befehle zu erlauben ergibt die glattesten Lösung und Sessions.

Es ist nichts Pflicht. Ohne Terminal-Zugriff degradiert Truss zu reinem Markdown: Der Agent liest weiterhin `AGENTS.md`, aktualisiert State-Dateien und folgt den Phasenregeln von Hand — und bietet dir die Befehle typischerweise zur manuellen Ausführung an. Was du verlierst ist Automatik: `doctor` fängt keinen Drift, `render` frischt keine generierten Blöcke auf.

## Design-Entscheidungen

Truss ist mit Absicht klein. Folgende sind die Entscheidungen, die es geformt haben und was dir jede einzelne bringt:

### Wahrheit lebt in Dateien

1. **Reines Markdown ist die einzige Quelle der Wahrheit.** Keine Datenbank, kein versteckter State, kein Server. Ein Workspace ist ein Ordner aus Text, den du lesen, editieren, diffen und versionieren kannst und jeder Agent kann Truss nutzen.
2. **Jeder Fakt hat genau ein Zuhause.** Verlinken, nie kopieren. Zwei Dateien mit derselben Wahrheit gelten als Bug, und die Referenz-Checks fangen ihn. Agenten hören auf, widersprüchliche Kopien abzugleichen, weil es keine gibt.
3. **Eine Boot-Datei, offener Standard.** `AGENTS.md` folgt der [agents.md](https://agents.md)-Konvention; `CLAUDE.md`, `GEMINI.md`, `.cursorrules` und der Copilot-Stub sind Einzeiler, die auf sie zeigen.
4. **Strukturierte IDs, nie wiederverwendet.** `D-NNN` Entscheidungen, `OD-NNN` offene Fragen, `HT-NNN` Human-To-dos, `R-NNN` Risiken, `L-NNN` Learnings. Entscheidungen werden supersedet, nie gelöscht. Jede Behauptung im Workspace führt zu genau einem nummerierten Eintrag samt Begründung zurück.

### Kontext ist ein Budget

1. **Das Pflicht-Boot-Set bleibt klein.** Etwa 3,8k geschätzte Tokens beim Scaffold; der Kontext-Check des `doctor` misst es und warnt ab ~9k (bis 15k "watch, >15k cleanup empfholen"). Systeme, die ihr ganzes Regelwerk in jede Session schicken, verbrauchen das Fenster, bevor die Arbeit beginnt; Truss spart es für die Aufgabe.
2. **Den kleinsten Kontext laden, der die Aufgabe beantwortet — dann stoppen.** Die Routing-Tabelle sagt, wo Information lebt; die generierte `state/map.md` ergänzt Token-Schätzungen pro Datei. Domain-Wissen lädt bei Bedarf, nicht per Default.
3. **Kontrolliertes Vergessen.** Überholtes wandert mit einer einzeiligen Invalidierungsnotiz nach `archive/`. Längen-Checks warnen, wenn eine State-Datei ihren Fokus verliert, und ein Hygiene-Check markiert Domain-Dateien, die lange unberührt blieben. Der Workspace bleibt aktuell, statt zu akkumulieren.
4. **Präferenzen statt Prompt-Wiederholung.** Kritikalität, Nachfragen vs. selbst entscheiden, Subagent-Einsatz, Commit-Verhalten, Antwortstil: jede ist eine Einstellung in einem generierten Block, geändert über `truss set`, beachtet von jeder künftigen Session.

<p align="center">
  <img src=".github/dashboard-context-budget.png" alt="Truss-Dashboard — Boot-Metadaten: Truss-Pflichtlektüre und Aufschlüsselung pro Datei" width="820">
  <br>
  <sub>Die Dashboard-Sicht auf das Pflicht-Boot-Set, Datei für Datei.</sub>
</p>

### Menschen entscheiden, Skripte berichten

9. **Skripte prüfen und berichten; sie entscheiden nie.** `doctor` ist read-only. Schreibzugriffe laufen über explizite, schmale Befehle (`set`, `render`, `phase`), und jeder Befund ist eine Warnung, auf die du und der Agent reagieren — keine Aktion, die für dich ausgeführt wird.
10. **Phasenwechsel sind human-only.** Ein Projekt durchläuft Phasen, die weiten oder verengen, was ein Agent tun darf. Sehen die Exit-Kriterien erfüllt aus, führt der Agent den Gate-Check aus, schreibt dir eine Zusammenfassung und stoppt. Du schaltest die Phase weiter. Agenten pflegen den Phasenplan, wenn sich Anforderungen ändern — aber sie dürfen nie ihre eigenen aktiven Leitplanken lockern. Und um die Mechanik offen zu benennen: Phasen sind Empfehlungen an den Agenten, und dein Prompt sticht sie — bitte direkt um etwas, und der Agent tut es. Ohne widersprechenden Prompt hält die Phase zuverlässig.
11. **Menschliche Arbeit wird geroutet, nicht verloren.** Alles, was **nur du** tun kannst, wird ein `HT-NNN`-Eintrag in `HUMAN-TODOS.md`. Unentschiedene Fragen werden Briefings in `state/open-decisions.md` mit Optionen und Trade-offs — sie warten auf deine Entscheidung, statt still entschieden zu werden.
12. **Truss ist ein transparentes Nudge-System, kein Enforcement.** Phasengrenzen und harte Regeln sind Verhaltensanweisungen an den Agenten. Truss berichtet Evidenz — Grammatik, uncommittete Änderungen an verbotenen Pfaden, Exit-Artefakte —, aber es authentifiziert keine Akteure und fängt keine Schreibzugriffe ab, und die Doku sagt das unumwunden. Bringt dein Agent-Host eine Enforcement-Grenze mit, fügt sich Truss ein.

### Leicht durch Konstruktion

13. **Subscription-first.** Truss ruft nie ein Modell auf. Dein Agent denkt über den Plan, den du ohnehin bezahlst — genau das hält Truss kostenlos im Betrieb und wirklich tool-agnostisch.
14. **Null Abhängigkeiten.** Node ≥ 20 ist die einzige Voraussetzung. Kein `npm install`, kein Lockfile, kein Build-Schritt — und eine Codebasis, die klein genug ist, um sie zu auditieren, bevor du einen Agenten darauf loslässt.
15. **Struktur wächst mit beobachtetem Bedarf.** Domain-Dateien entstehen, wenn ein Thema sich eine verdient. Kein vorsorglicher Backlog, keine leeren Ordner, keine Index-Dateien pro Verzeichnis.
16. **Das Dashboard ist eine Sicht, keine zweite Wahrheit.** Es rendert dasselbe Markdown, bindet nur an `127.0.0.1` und schreibt über eine token-geschützte CLI-Whitelist (oder gar nicht, mit `--read-only`). Nichts läuft im Hintergrund.
17. **Overlay lässt dein Repo in Ruhe.** Eingebetteter Code behält seine eigene Git-Historie; eine `code-root`-Einstellung zieht eine Grenze, die Checks, Maps und Branch-Status gemeinsam nutzen. Truss umschließt das Projekt, es absorbiert es nicht.
18. **Ein Kontrollwort als Session-Kanarienvogel.** Standardmäßig beginnt jede Agenten-Antwort mit `` `TRUSS — ` ``. Verschwindet der Marker mitten in der Session, degradiert der Kontext — Zeit für eine neue Session. Wort ändern oder abschalten: `truss set control-word <wort|off>`.
19. **Prompts sind Mandate, keine Methodenskripte.** Die mitgelieferte Prompt-Library im Dashboard (`plan`, `implement`, `research`, `critique`, `resume`, `handover`, …) benennt Mandat und Ergebnislatte in wenigen Zeilen und überlässt die Methode dem Agenten — die Hausregeln stehen bereits in `AGENTS.md`.

## Wie es funktioniert

`init` scaffoldet einen Workspace aus Markdown-Dateien um die versteckte `.truss/`-Engine:

```text
my-project/
├── AGENTS.md          # Boot-Datei — jeder Agent liest sie zuerst
├── VISION.md          # Problem, Idee, Prinzipien, Constraints
├── README.md          # menschliches Onboarding
├── HUMAN-TODOS.md     # Dinge, die nur ein Mensch tun kann (HT-NNN)
├── state/             # Fokus, Entscheidungen, Phasen, Profil, Learnings
├── docs/              # Konventionen, Protokolle, Git, Import
├── context/           # Domain-Dateien, entstehen bei Bedarf
└── .truss/            # die Engine (read-only für Agenten)
```

Eine Session in der Praxis: Der Agent bootet nach Load-Order, führt `truss status` als zeitlichen Anker aus (Datum, Phase, Health, Branch), sagt, was er vorhat, und legt los — jede Antwort mit dem Kontrollwort vorangestellt. Zurückgeschrieben wird fortlaufend: Jede fertige Arbeitseinheit landet in `state/current.md` und ihren Dateien, sobald sie abgeschlossen ist. Das Session-Ende ist ein Sicherheitsnetz — Stand prüfen, Übriges routen und per `doctor` bestätigen, dass der Workspace noch mit sich selbst übereinstimmt.

Phasen geben der Arbeit eine Form. Ein frischer Workspace startet mit dem Seed `discover → validate → plan → build`; das Kickoff schneidet ihn auf das Projekt zu, und Agenten restrukturieren den Plan, wenn sich Anforderungen ändern — immer mit Entscheidungseintrag und Notiz an dich. Jede Phase deklariert, was erlaubt ist, was verboten, welche Dateien zu lesen sind und welche Exit-Kriterien das Gate prüft. Alternative Lebensläufe liegen als [Phase-Profile](.truss/phase-profiles/README.md) bei; das volle Denkmodell steht in [concepts.md](.truss/docs/concepts.md).

## Deine Seite des Loops

Die CLI existiert primär für den Agenten. Deine Schnittstelle ist das **Dashboard** — plus eine Handvoll Befehle, die sich zu kennen lohnt.

`node .truss/bin/truss.mjs dashboard` startet ein lokales Kontrollzentrum über demselben Markdown: aktueller Fokus und Phase, deine offenen To-dos, Entscheidungen, die auf deine Enscheidung warten, die Größe des Pflicht-Boot-Sets (Lightweight / Growing / Heavy — eine Lesart der Workspace-Struktur, nicht deines Codes), Präferenzen, die Prompt-Library und alle Drift-Warnungen. Es bindet nur an `127.0.0.1` und schreibt über eine token-geschützte CLI-Whitelist — oder read-only mit `--read-only`.

<p align="center">
  <img src=".github/dashboard-overview.png" alt="Truss-Dashboard — Übersicht: aktueller Fokus, Phase, Human-To-dos, offene Entscheidungen und Boot-Metadaten auf einen Blick" width="820">
</p>

Die Befehle, die du wirklich tippen wirst (vollständige Referenz: [.truss/docs/cli.md](.truss/docs/cli.md)):

| Befehl | Wann du ihn nutzt |
| --- | --- |
| `init` | einmal, um den Workspace zu scaffolden |
| `dashboard` | um das Projekt zu sehen und zu steuern, ohne Dateien zu öffnen |
| `status` | ein Fünf-Zeilen-Snapshot im Terminal |
| `set <key> <value>` | eine Agenten-Präferenz ändern (geht auch im Dashboard) |
| `doctor` | Agenten führen ihn routinemäßig aus; du, wenn du neugierig bist |

## Dokumentation

| Doc | Lies sie für |
| --- | --- |
| [.truss/docs/concepts.md](.truss/docs/concepts.md) | das Modell — Dateien, State-Layer, Phasen, Checks, Präferenzen |
| [.truss/docs/cli.md](.truss/docs/cli.md) | Befehlsreferenz und Flags |
| [.truss/docs/architecture.md](.truss/docs/architecture.md) | wie die Engine gebaut ist (Contributors) |
| [.truss/prompts/README.md](.truss/prompts/README.md) | die Prompt-Library |
| [.truss/phase-profiles/README.md](.truss/phase-profiles/README.md) | alternative Lebensläufe |
| [.truss/dashboard/README.md](.truss/dashboard/README.md) | das lokale Dashboard |

## Contributing

Issues und Pull Requests sind willkommen. Halte die **Null-Abhängigkeiten**-Regel intakt, lass die Test-Suite laufen (`cd .truss && node --test`), bevor du einen PR öffnest, und halte Änderungen klein und fokussiert. Für größere Ideen öffne zuerst ein Issue, damit wir uns über die Richtung einig werden.

## Status

`1.0.0-alpha.6`. Für dich heißt das: Engine und Test-Suite sind stabil, und Truss ist auf echten Projekten im täglichen Einsatz — du kannst es gefahrlos an einem deiner Projekte ausprobieren.

## License

[MIT](LICENSE) © 2026 Niklas Korn
