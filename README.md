<p align="center"><img src="./app/assets/images/SealCircle.png" width="150px" height="150px" alt="aventium softworks"></p>

<h1 align="center">PlayClan Launcher</h1>

<em><h5 align="center">(A [Helios Launcher][fork]-ből forkolva)</h5></em>


<p align="center">Csatlakozz a PlayClan szerverére pár kattintással!</p>

![Képernyőkép 1](https://i.imgur.com/jUe0wkh.png)
![Képernyőkép 2](https://i.imgur.com/d2BFyhG.png)

## Funkciók

* 🔒 Teljes fiók kezelés.
  * Több fiók hozzáadása és váltás egy kattintással a fiókok között.
  * Microsoft + Mojang bejelentkezés, eredeti fiókok számára.
    * A bejelentkezési adatokat nem tároljuk, egyből továbbítjuk a Microsoftnak/Mojangnak.
  * PlayClan fiók bejelentkezés.
    * Automatikus bejelentkezés a szerverre.
    * Automatikus IP levédés amennyiben van beállítva a fiókodon.
* 📂 Hatékony fájl kezelés.
  * Automatikusan megkapod a kliens frissítéseket, amikor kiadjuk azokat.
  * A fájlok ellenőrizve vannak indítás előtt. A hibás fájlokat újra letöltjük.
* ☕ **Automatikus Java ellenőrzés.**
  * Ha nem kompatibilis Java verzió van telepítve, akkor automatikus letöltjük a megfelelő verziót *neked*.
  * Nem kell Java-t telepítened a kliens futtatásához.
* 📰 A hírek csatorna natívan bele van építve a kliensbe.
* ⚙️ Intuitív beállítások kezelés, beleértve a Java beállítások módosítását.
* Több Minecraft verzió.
  * Válassz másik Minecraft verziót pár kattintással.
* Automatikus kliens frissítések. A háttérben frissül a kliens.
*  Mojang státusz megtekintése.

De ez még nem minden! Töltsd le és telepítsd a kliensünket, hogy felfedezd, mit kínál még!

#### Segítségre van szükséged? [Csatlakozz Discord szerverünkre](https://dc.playclan.hu)

## Letöltés

A kliens-t letudod tölteni [innen](https://github.com/PlayClan/PCLauncher/releases).

#### Utolsó stabil verzió

[![](https://img.shields.io/github/release/PlayClan/PCLauncher.svg?style=flat-square)](https://github.com/PlayClan/PCLauncher/releases/latest)

#### Utolsó béta verzió
[![](https://img.shields.io/github/release/PlayClan/PCLauncher/all.svg?style=flat-square)](https://github.com/PlayClan/PCLauncher/releases)

**Támogatott platformok**

| Platform | Fájl |
| -------- | ---- |
| Windows x64 | `PlayClan_Launcher-setup-VERZIÓ.exe` |
| macOS x64 | `PlayClan_Launcher-setup-VERZIÓ-x64.dmg` |
| macOS arm64 | `PlayClan_Launcher-setup-VERZIÓ-arm64.dmg` |
| Linux x64 | `PlayClan_Launcher-setup-VERZIÓ.AppImage` |

## Konzol

Ahhoz, hogy megnyisd a konzolt, a következő billentyű kombinációt kell lenyomnod:

```console
CTRL + SHIFT + I
```

Győződj meg róla, hogy a Console oldalon vagy. Ne másolj be semmit a konzolba, ha mástól kaptál valamilyen kódot, csak akkor ha 100%-ban biztos vagy abban, hogy mit csinál a kód. **Ismeretlen kódok bemásolásával a fiókodat teszed kockára.**

#### Konzol kiexportálása


Ha ki akarod exportálni a Konzolod tartalmát, csak kattints jobb klikkel bárhová és válaszd a **Save as..** menüpontot.
![konzol példa](https://i.imgur.com/uu6BFtS.png)


## Fejlesztés

Amennyiben szeretnéd bővíteni a Launcher-t, vagy csak saját magadnak szeretnéd ki buildelni az alkalmazást.

### Hozzákezdés

**Rendszerkövetelmények**

* [Node.js][nodejs] v18

---

**Repó klónozása és szükséges kiegészítők telepítése**

```console
> git clone https://github.com/PlayClan/PCLauncher.git
> cd PCLauncher
> npm install
```

---

**Launcher elindítása**

```console
> npm start
```

---

**Telepítő készítése**

A  te által használt platformodra való buildelés

```console
> npm run dist
```

Telepítő készítése más platformokra

| Platform    | Parancs              |
| ----------- | -------------------- |
| Windows x64 | `npm run dist:win`   |
| macOS       | `npm run dist:mac`   |
| Linux x64   | `npm run dist:linux` |

MacOS-re való buildelés nem minden esetben működhet Windows/Linux rendszereken.

---

### Visual Studio Code

A Launcher fejlesztését a [Visual Studio Code][vscode] segítségével ajánlott elvégezni.

Másold be az alábbi kódot a `.vscode/launch.json` fájlba

```JSON
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main Process",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "program": "${workspaceFolder}/node_modules/electron/cli.js",
      "args" : ["."],
      "outputCapture": "std"
    },
    {
      "name": "Debug Renderer Process",
      "type": "chrome",
      "request": "launch",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "windows": {
        "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron.cmd"
      },
      "runtimeArgs": [
        "${workspaceFolder}/.",
        "--remote-debugging-port=9222"
      ],
      "webRoot": "${workspaceFolder}"
    }
  ]
}
```

Ez két debug konfigurációt hoz létre.

#### Főfolyamat debugolása (alapértelmezett)

Ez lehetővé teszi az Electron [főfolyamatának][mainprocess] debugolását. A DevTools ablak megnyitásával a [renderelő folyamat][rendererprocess] parancsfájlok debugolását végezheted el.

#### Renderelő folyamat debugolása

Ez lehetővé teszi az Electron [renderelő folyamat][rendererprocess] debugolását. Ehhez telepítenie kell a [Debugger for Chrome][chromedebugger] bővítményt.

Vedd figyelembe, hogy **nem** nyithatsz meg DevTools ablakot, miközben ezt a debug konfigurációt használod. A Chromium csak egy debugolót engedélyez, egy másik megnyitása után összeomlik a program.

---

### Megjegyzés a harmadik fél általi használathoz

Kérjük, nevezze meg az eredeti készítőt, és adjon meg egy linket az eredeti forráshoz. Ez egy ingyenes szoftver, kérjük, legalább ennyit tegyen meg. <small>*(Az [eredeti készítő][fork] kérése)*</small>

A Microsoft Authentication beállításához lásd: https://github.com/PlayClan/PCLauncher/blob/master/docs/MicrosoftAuth.md.

---

## Források

* [Eredeti Launcher][fork]
* [Eredeti Launcher Wiki][wiki]
* [Nebula (Distribution.json fájl készítése)][nebula]

Ha bármiben elkadtál, csatlakozz Discord szerverünkre, ahol segíthetünk.

[![discord](https://discordapp.com/api/guilds/216941565002645504/embed.png?style=banner3)][discord]

---

### Találkozunk a szerveren.

[nodejs]: https://nodejs.org/en/ 'Node.js'
[vscode]: https://code.visualstudio.com/ 'Visual Studio Code'
[mainprocess]: https://electronjs.org/docs/tutorial/application-architecture#main-and-renderer-processes 'Main Process'
[rendererprocess]: https://electronjs.org/docs/tutorial/application-architecture#main-and-renderer-processes 'Renderer Process'
[chromedebugger]: https://marketplace.visualstudio.com/items?itemName=msjsdiag.debugger-for-chrome 'Debugger for Chrome'
[discord]: https://dc.playclan.hu 'Discord'
[wiki]: https://github.com/dscalzi/HeliosLauncher/wiki 'wiki'
[fork]: https://github.com/dscalzi/HeliosLauncher 'fork'
[nebula]: https://github.com/dscalzi/Nebula 'dscalzi/Nebula'
