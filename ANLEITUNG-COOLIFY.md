# Wortraten mit Coolify – Klick für Klick

Gleiches Prinzip wie bei Vier Gewinnt: **GitHub → Coolify → Docker-Container → deine Domain mit HTTPS.**
Dauer: ca. 15 Minuten, wenn Vier Gewinnt schon läuft.

## 1. GitHub-Repository

1. github.com → **„+“ → „New repository“**
   - Name: `wortraten`, Sichtbarkeit **Public**, Häkchen bei „Add a README“ → **Create repository**
2. **„Add file“ → „Upload files“**
3. Die **Inhalte** des entpackten Ordners `wortraten` hineinziehen:
   `Dockerfile`, `package.json`, `server.js`, `words.js` und den Ordner `public`
4. **„Commit changes“**

Prüfen: `public` enthält 3 Dateien (`index.html`, `app.js`, `style.css`).

## 2. Subdomain beim Domain-Anbieter

| Typ | Name | Wert |
|---|---|---|
| A | `wort` | DEINE-SERVER-IP |

→ `wort.deine-domain.de`, wirksam nach 5–60 Minuten.

## 3. In Coolify anlegen

1. **Projects** → dein Projekt (z. B. „Spiele“) → **production**
2. **„+ New“ → „Public Repository“** → `https://github.com/DEIN-NAME/wortraten` → **Check repository**
3. **Build Pack: „Dockerfile“** → **Continue**
4. **Configuration → General**
   - **Domains:** `https://wort.deine-domain.de` (mit `https://`)
   - **Ports Exposes:** `3000`
   - **Save**
5. **Deploy**

**Unterschied zu Vier Gewinnt:** Kein *Persistent Storage* nötig. Die Spielhistorie liegt im Browser jedes Spielers, nicht auf dem Server.

## 4. Testen

`https://wort.deine-domain.de` öffnen → Namen eingeben → **Neues Spiel starten** → Link an Mitspieler schicken.

## Spielregeln

- Einer gibt ein Wort vor (oder drückt **Zufallswort**), der andere rät Buchstaben.
- Jeder falsche Buchstabe baut ein Teil am Fahrrad. Nach 10 Fehlern ist es fertig und die Runde verloren. Ganzes Wort raten geht jederzeit, ein falscher Versuch kostet 2 Fehler.
- **Revanche** tauscht die Rollen; der Punktestand läuft mit.
- ß wird automatisch zu SS. Umlaute (Ä, Ö, Ü) sind eigene Tasten.

## Eigene Zufallswörter

In `words.js` auf GitHub: Stift-Symbol → Zeilen im Format `['WORT','Tipp'],` ergänzen → **Commit** → in Coolify **Redeploy**.
