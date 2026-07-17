<p align="center">
  <img src=".github/hero-mockup.png" alt="Links: die Plain-Markdown-State-Dateien eines Projekts (AGENTS.md, state/current.md). Rechts: ein KI-Agent, der daraus bootet und exakt dort weitermacht, wo die letzte Session aufgehört hat." width="800">
</p>

<p align="center">
  <a href="README.md">English</a> · <b>Deutsch</b>
</p>

# Truss

**Eine Schicht, die über deinem Projekt liegt und alles enthält, was ein KI-Agent für die Arbeit daran braucht — Vision, Pläne, Phasen, aktuellen Stand, Entscheidungen und Doku — als reines Markdown.**
**Arbeitsorientiert by Design: Der Agent lädt nur den Kontext, den eine Aufgabe braucht, und weiß immer, wo der Rest zu finden ist — so bleibt das Kontextfenster leicht, statt im gesamten Repo zu ertrinken.**
**Keine API-Keys, keine Verbrauchsabrechnung: Es läuft über das KI-Abo, das du ohnehin schon bezahlst.**

[![CI](https://github.com/KornLabs/truss/actions/workflows/ci.yml/badge.svg)](https://github.com/KornLabs/truss/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2020-brightgreen.svg)](https://nodejs.org)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)

> Dies ist die deutsche Übersetzung der [englischen README](README.md)
> (Stand: `1.0.0-alpha.5`). Bei Abweichungen ist die englische Version
> maßgeblich.

Jede KI-Coding-Session beginnt bei null. Kontext verstreut sich, Entscheidungen
geraten in Vergessenheit, und Konsistenz hängt davon ab, dass du das Projekt
jedes Mal neu erklärst. Truss löst das mit einem einzigen Ordner, der neben
deinem Code liegt und als dessen Gedächtnis dient. Ein Agent öffnet eine
einzige Boot-Datei — `AGENTS.md` — und weiß sofort, was das Projekt ist, in
welcher Phase es sich befindet, woran gerade gearbeitet wird und wo alles
Weitere zu finden ist. Die deterministischen Boot-Metadaten umfassen
standardmäßig etwa 3,8k geschätzte Tokens; aufgabenbezogene Domain- und
Quelldateien werden bei Bedarf geladen.

Richte ein beliebiges AGENTS.md-fähiges Tool darauf — Claude Code, Cowork,
Codex, Gemini CLI, Copilot, Cursor —, starte es im Projektordner, und es macht
exakt dort weiter, wo die letzte Session aufgehört hat. Agenten-getrieben, aber
du triffst die Entscheidungen: Eine winzige CLI ohne Abhängigkeiten prüft die
Struktur und legt dir offene Entscheidungen vor.

> Ein Truss (Fachwerkträger) ist ein leichtes Gerüst aus Streben, das die Last
> eines Bauwerks trägt und seine Form hält — ohne selbst das Gebäude zu sein.
> Truss tut dasselbe für ein Projekt, das mit KI-Agenten gebaut wird: ein
> dünner Rahmen, auf dem deine Arbeit ruht, niemals ihr Ersatz.

## Prinzipien

- **Dateien sind die einzige Quelle der Wahrheit.** Alles, was ein Agent
  braucht, liegt als reines Markdown vor, das du lesen, bearbeiten und diffen
  kannst. Keine Datenbank, kein Lock-in.
- **Skripte prüfen und berichten — sie entscheiden nie.** Die CLI validiert
  die Struktur und macht Drift sichtbar; Menschen und Agenten treffen die
  Entscheidungen.
- **Subscription-first.** Truss ruft selbst nie ein Modell auf — das tut dein
  Agent, über den Plan, den du bereits hast. Genau das hält es kostenlos im
  Betrieb und wirklich Tool-agnostisch.
- **Null Abhängigkeiten.** Node ≥ 20 ist die einzige Voraussetzung. Kein
  `npm install`.
- **Tool-agnostisch.** Aufgebaut auf der offenen
  [AGENTS.md](https://agents.md)-Konvention; einzeilige Adapter-Stubs verweisen
  Claude, Gemini, Cursor und Copilot auf dieselbe Boot-Datei.
- **Arbeitsorientierter, aufgabenbezogener Kontext.** Das ist das zentrale
  Designziel, kein Nebeneffekt. Jede Session bootet aus `AGENTS.md`, das dem
  Agenten eine geordnete Ladeliste und eine einzige Anweisung übergibt: _Lade
  den kleinsten Kontext, der die Aufgabe beantworten kann, dann stopp._ Eine
  Routing-Tabelle (§2) plus eine generierte `state/map.md` routen Truss'
  operatives Markdown, sodass der Agent Domainwissen bei Bedarf laden kann,
  statt alles auf einmal aufzunehmen. Quelldateien und der aufgabenbezogene
  Domainkontext bleiben in der Verantwortung des Agent-Tools. Die
  verpflichtenden Truss-Boot-Metadaten umfassen beim Scaffold etwa 3,8k
  geschätzte Tokens; der Kontext-Check von `doctor` (`CX`) misst dieses
  Boot-Set plus explizite `read:`-Ziele der Phase und warnt ab ~9k. Er ist
  keine Messung des gesamten Task-Kontexts, der Task-Kosten oder der
  Task-Qualität.

**Portabler Guardrail-Vertrag.** Phasen-Limits, Human-only-Übergänge und
Subagenten-Vererbung sind Verhaltensanweisungen. Truss meldet Grammatik,
nicht committete Evidenz zu verbotenen Pfaden und Exit-Artefakte, aber es
authentifiziert nicht den Akteur und fängt keine Dateischreibvorgänge ab.
Behandle diese Regeln als beratend, sofern dein Agent-Host keine eigene
Durchsetzungsgrenze hinzufügt.

## Der Vergleich

|                            | **Truss**                                                       | Reines `AGENTS.md`                   | Schwere Agent-Frameworks                          |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------- |
| Setup                      | Einen `.truss/`-Ordner kopieren, `init` ausführen                | Datei von Hand schreiben & pflegen   | Deps installieren, konfigurieren, teils ein Service |
| Abhängigkeiten             | Keine — nur Node ≥ 20                                            | Keine                                | Viele (npm/PyPI, Lockfiles)                        |
| Betriebskosten             | **Keine — dein bestehendes Abo, keine API-Keys**                 | Keine                                | Oft getaktete API-Keys / Token-Kosten              |
| Gedächtnis über Sessions   | Strukturiertes Markdown: Kontext, Entscheidungen, Phasen         | Eine flache Datei, die du kuratierst | Framework-DB oder gehosteter Store                 |
| Drift-Erkennung            | `doctor` prüft, ob die Dateien noch zusammenpassen               | Keine                                | Unterschiedlich                                    |
| Guardrails                 | Beratende Phasen + Changed-Path- und Exit-Reports                | Keine                                | Oft vollständig autonom                            |
| Wer entscheidet            | Menschen & Agenten; Skripte berichten nur                        | Du                                   | Das Framework handelt ggf. selbst                  |
| Tool-agnostisch            | Ja — AGENTS.md-Standard (Claude, Gemini, Cursor, Copilot)        | Ja                                   | Meist an eine Runtime gebunden                     |
| Lock-in                    | Keiner — reine, git-diffbare Dateien                             | Keiner                               | Framework + teils gehosteter State                 |
| Verpflichtende Boot-Metadaten | ~3,8k geschätzte Tokens                                        | Was immer du in die Datei schreibst  | Kann schwergewichtig sein                          |

## Schnellstart

Erfordert **Node ≥ 20** — keine weiteren Abhängigkeiten, kein Build-Schritt.

Truss umhüllt dein Projekt auf zwei Arten: **Drop-in** legt den Workspace
_neben_ deinen bestehenden Code (beide im selben Ordner), während **Overlay**
deinen Code _darunter_ in `repo/` einbettet. In beiden Fällen ist Truss die
Schicht, auf der deine Arbeit ruht — die folgenden Schritte behandeln Drop-in;
siehe [Overlay](.truss/docs/overlay.md) für eine bestehende Codebasis.

Truss ist ein **Drop-in**: Du kopierst den `.truss/`-Engine-Ordner in dein
Projekt und führst dann `init` aus, um den Workspace zu scaffolden. Dieses Repo
ist die _Quelle_ dieses Ordners — führe `init` nicht innerhalb des Klons aus;
kopiere `.truss/` in ein eigenes Projekt (alles andere hier, README und Doku
eingeschlossen, ist Dokumentation, die im Quell-Repo bleibt).

**macOS / Linux:**

```bash
# In einem leeren oder bestehenden Projektverzeichnis:

# 1. Engine ablegen — nur den .truss/-Ordner, sonst nichts.
git clone --depth 1 https://github.com/KornLabs/truss.git /tmp/truss
cp -R /tmp/truss/.truss ./.truss && rm -rf /tmp/truss

# 2. Frischen Workspace neben der Engine scaffolden.
node .truss/bin/truss.mjs init

# 3. Den von init ausgegebenen Boot-Prompt in dein KI-Tool kopieren, deine Idee
#    dahinter einfügen — fertig. Der Agent interviewt dich zur VISION.md.

# Optional: Workspace-Gesundheit jederzeit prüfen.
node .truss/bin/truss.mjs doctor
```

Hat das Projekt bereits eine markerfreie `AGENTS.md`, stoppt `init`, bevor es
irgendetwas schreibt. Prüfe die Datei und führe dann `init` erneut mit
`--adopt-agents` aus, um sie als Präambel zu behalten und den Truss-Router
anzuhängen. Overlay-Init bewahrt eine bestehende `.gitignore` und ergänzt
`repo/`.

**Windows (PowerShell):**

```powershell
# In einem leeren oder bestehenden Projektverzeichnis:

# 1. Engine ablegen.
git clone --depth 1 https://github.com/KornLabs/truss.git $env:TEMP\truss
Copy-Item -Recurse $env:TEMP\truss\.truss .\.truss
Remove-Item -Recurse -Force $env:TEMP\truss

# 2. Frischen Workspace neben der Engine scaffolden.
node .truss/bin/truss.mjs init

# 3. Den von init ausgegebenen Boot-Prompt in dein KI-Tool kopieren, deine Idee
#    dahinter einfügen — fertig. Der Agent interviewt dich zur VISION.md.

# Optional: Workspace-Gesundheit jederzeit prüfen.
node .truss/bin/truss.mjs doctor
```

`init` scaffoldet nicht und lässt dich dann vor einer leeren Seite sitzen. Es
endet mit deinen nächsten Schritten und einem **fertigen Boot-Prompt zum
Einfügen** — ab damit in dein KI-Tool, Idee ergänzen, und der Agent interviewt
dich zu einer echten `VISION.md`, statt dich ein leeres Template ausfüllen zu
lassen (gekürzt):

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

Die Produktdokumentation reist mit der Engine unter
[`.truss/docs/`](.truss/docs/) mit und ist damit in jedem Projekt verfügbar,
das Truss übernommen hat — dem Agenten nicht im Weg und niemals in Konflikt
mit deiner eigenen `docs/`.

Optionaler Komfort-Alias:

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

Du arbeitest an einer **bestehenden** Codebasis? Lege einen Truss-Workspace an
und hole deinen Code dann unter `repo/` hinein:

```bash
node .truss/bin/truss.mjs init --overlay --name "My Project" --lang English \
  --repo /path/to/code            # lokaler Pfad → Symlink, oder eine URL → Klon
```

> **Hinweis für Windows:** Das Anlegen von Symlinks erfordert den
> Entwicklermodus (oder eine erhöhte Shell). Schlägt der Symlink fehl, übergib
> stattdessen eine Git-URL — das Repo wird dann unter `repo/` geklont.

Das richtet einen Import-first-Phasenablauf ein (`ingest → operate`), bettet
deinen Code unter `repo/` ein (eigene Git-Historie, hier gitignored, damit sich
Commits nie mischen) und startet eine `ingest`-Phase, die dich zuerst nach dem
Kontext fragt, den der Code nicht verraten kann, und den Code dann sichtet.
Vollständiger Walkthrough:
[.truss/docs/overlay.md](.truss/docs/overlay.md).

Es gibt bereits ein Code-Verzeichnis innerhalb des Workspace (zum Beispiel ein
getracktes Submodul)? Lass es, wo es ist, und wähle es explizit aus:

```bash
node .truss/bin/truss.mjs init --overlay --name "My Project" --lang English \
  --code-root product
```

Truss vermerkt `code-root: product` in `state/profile.md`; Checks,
Branch-Status, Phasen-Evidenz, `map` und `repo-map` teilen sich dann diese eine
Grenze. Das ändert nur, welches bestehende Verzeichnis als Code behandelt
wird: Es verschiebt weder den Workspace noch `.truss/` oder die State-Dateien.
Der Pfad muss relativ sein, bereits innerhalb des Workspace existieren und
außerhalb der Truss-verwalteten Top-Level-Verzeichnisse liegen.

## Agent-Setup

Truss braucht ein KI-Tool mit **Terminal-/Befehlsausführungs**-Berechtigung im
Workspace (um `truss doctor`, `render`, `set` auszuführen) und
**Lese-/Schreibzugriff** auf die Workspace-Dateien. Ohne Terminalzugriff bleibt
das System funktionsfähig — Agenten können die Markdown-Dateien weiterhin
lesen und schreiben —, aber die CLI-Validierung und die generierten Blöcke
aktualisieren sich nicht automatisch.

> **Tipp:** Erlaube Auto-Run für `node .truss/bin/truss.mjs`-Befehle für das
> reibungsloseste Erlebnis. Die CLI schreibt nie außerhalb des Workspace.

### Kein Terminalzugriff?

Truss funktioniert weiterhin als reines Markdown: Ein Agent kann `AGENTS.md`
lesen, State-Dateien aktualisieren und die Phasenregeln von Hand befolgen. Was
verloren geht, sind mechanische Validierung und generierte Updates: `doctor`
kann keinen Drift erkennen, `render` kann generierte Blöcke nicht auffrischen,
`set` kann Präferenzen nicht sicher ändern, und `map` kann die
Domain-Übersicht nicht neu aufbauen. Behandle den Workspace in diesem Modus
als manuell gepflegt und bitte den Agenten, explizit zu sagen, wenn die
CLI-Validierung nicht gelaufen ist.

## Session-Health-Marker

Standardmäßig setzt Truss ein **Kontrollwort** (`TRUSS`), das der Agent jeder
Antwort voranstellt: `` `TRUSS — ` ``. Verschwindet der Marker mitten in der
Session, ist das ein Signal, dass der Kontext degradieren könnte — ein
einfacher, sichtbarer Kanarienvogel für die Session-Gesundheit. Du kannst das
Wort ändern (`truss set control-word MYWORD`) oder komplett deaktivieren
(`truss set control-word off`).

## Funktionsweise

`init` scaffoldet einen Workspace aus Markdown-Dateien rund um die verborgene
`.truss/`-Engine:

```
my-project/
├── AGENTS.md          # Boot-Datei — jeder Agent liest sie zuerst
├── VISION.md          # Problem, Idee, Prinzipien, Constraints
├── README.md          # Onboarding für Menschen
├── HUMAN-TODOS.md     # Dinge, die nur ein Mensch tun kann (HT-NNN)
├── state/             # aktueller Fokus, Entscheidungen, Phasen, Profil, Learnings
├── docs/              # Konventionen, Protokolle, Git, Import
├── context/           # Domain-Dateien, bei Bedarf erstellt
└── .truss/            # die Engine (read-only für Agenten)
```

Der Loop eines Agenten ist immer derselbe: `AGENTS.md` lesen, die wenigen
State-Dateien laden, auf die sie verweist, die Arbeit erledigen,
`state/current.md` aktualisieren, stoppen. Der `doctor`-Befehl der CLI prüft,
ob die Dateien noch zueinander passen, und meldet jeden Drift.

Ein Projekt durchläuft **Phasen**, die erweitern oder eingrenzen, was ein Agent
in jedem Stadium tun darf. `discover → validate → plan → build` ist der Seed,
mit dem ein frischer Workspace startet; der Kickoff formt daraus einen
projektspezifischen Plan, und Agenten restrukturieren den Plan, wenn sich
Anforderungen ändern (immer mit Entscheidungseintrag und einer Notiz an dich).
Der Phasenwechsel selbst bleibt bewusst Human-only. (Alternative Seeds gibt es
als [Phase-Profile](.truss/phase-profiles/README.md).)

## Befehle

Ausführen als `node .truss/bin/truss.mjs <command>` (oder `truss <command>` mit
dem Alias). Vollständige Referenz: [.truss/docs/cli.md](.truss/docs/cli.md).

| Befehl                                             | Was er tut                                                |
| -------------------------------------------------- | --------------------------------------------------------- |
| `init [--name --lang --overlay --adopt-agents]`    | Preflight und Scaffold eines Workspace                     |
| `status`                                           | kompakte Workspace-Statusübersicht                         |
| `doctor [--gate] [--json] [--html] [--fix-prompt]` | Workspace-Gesundheit prüfen                                |
| `render`                                           | Phasenblock in AGENTS.md aus `state/phases.md` synchronisieren |
| `phase [<id>] [--override-gate]`                   | Phasen auflisten oder aktive Phase gaten und wechseln      |
| `set <key> <value>`                                | eine Agent-Präferenz ändern                                |
| `map`                                              | die `state/map.md`-Domain-Übersicht neu generieren (mit Token-Schätzung pro Datei) |
| `dashboard`                                        | das lokale Web-Dashboard starten                           |
| `prompt <save\|reset\|delete> <id>`                | eigene Prompts verwalten                                   |
| `help`                                             | Befehle auflisten                                          |

## Dashboard (optional)

Ein optionales lokales Kontrollzentrum über demselben Markdown — standardmäßig
schreibfähig über eine Token-geschützte CLI-Whitelist, oder read-only mit
`--read-only`. Nichts läuft im Hintergrund, und die Null-Abhängigkeiten-Regel
bleibt gewahrt. Starte es mit `node .truss/bin/truss.mjs dashboard` (bindet
ausschließlich an `127.0.0.1`). Es zeigt den aktuellen Fokus und die Phase,
offene Entscheidungen, Truss-Boot-Metadaten, die Prompt-Bibliothek und
jeglichen Drift — in derselben Gesundheitssprache wie die CLI (Lightweight /
Growing / Heavy — eine Einschätzung der _Workspace-Struktur_, nicht deines
Codes).

<p align="center">
  <img src=".github/dashboard-overview.png" alt="Truss-Dashboard — Übersicht: aktueller Fokus, Phase, Human-To-dos, offene Entscheidungen und Boot-Metadaten auf einen Blick" width="820">
  <br><br>
  <img src=".github/dashboard-context-budget.png" alt="Truss-Dashboard — Boot-Metadaten: verpflichtende Truss-Lektüre und Aufschlüsselung pro Datei" width="820">
</p>

## Dokumentation

Die verlinkte Dokumentation liegt auf Englisch vor.

| Doc                                                                 | Lies sie für                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [.truss/docs/concepts.md](.truss/docs/concepts.md)                  | das Modell — Dateien, State-Layer, Phasen, Checks, Präferenzen       |
| [.truss/docs/cli.md](.truss/docs/cli.md)                            | Befehlsreferenz und Flags                                            |
| [.truss/docs/architecture.md](.truss/docs/architecture.md)          | wie die Engine gebaut ist (Contributors)                             |
| [.truss/prompts/README.md](.truss/prompts/README.md)                | die Prompt-Bibliothek                                                |
| [.truss/phase-profiles/README.md](.truss/phase-profiles/README.md)  | alternative Lifecycles                                               |
| [.truss/dashboard/README.md](.truss/dashboard/README.md)            | das lokale Dashboard                                                 |

## Mitwirken

Issues und Pull Requests sind willkommen. Bitte halte die
**Null-Abhängigkeiten**-Regel ein, führe vor einem PR die Test-Suite aus
(`cd .truss && node --test`) und halte Änderungen klein und fokussiert. Für
größere Ideen öffne zuerst ein Issue, damit wir uns über die Richtung einig
werden.

## Status

`1.0.0-alpha.5`. Engine und Test-Suite sind stabil; API und Datei-Grammatik
können sich vor `1.0.0` noch ändern.

## Lizenz

[MIT](LICENSE) © 2026 Niklas Korn
