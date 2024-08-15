const remoteMain = require('@electron/remote/main')
remoteMain.initialize()

// Requirements
const { app, BrowserWindow, ipcMain, Menu, shell, dialog, ipcRenderer } = require('electron')
const autoUpdater                       = require('electron-updater').autoUpdater
const ejse                              = require('ejs-electron')
const fs                                = require('fs')
const isDev                             = require('./app/assets/js/isdev')
const path                              = require('path')
const semver                            = require('semver')
const { pathToFileURL }                 = require('url')
const { AZURE_CLIENT_ID, MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR, PC_OPCODE, PC_REPLY_TYPE, PC_ERROR, SHELL_OPCODE } = require('./app/assets/js/ipcconstants')
const LangLoader                        = require('./app/assets/js/langloader')
const electronAppUniversalProtocolClient = require('electron-app-universal-protocol-client').default;
const http                              = require('http');

// Setup Lang
LangLoader.setupLanguage()

let isUpdateDownloaded = false
let localWebServerPort = 0
let loginSession = '';

// Setup auto updater.
function initAutoUpdater(event, data) {

    if(data){
        autoUpdater.allowPrerelease = true
    } else {
        // Defaults to true if application version contains prerelease components (e.g. 0.12.1-alpha.1)
        // autoUpdater.allowPrerelease = true
    }
    
    if(isDev){
        autoUpdater.autoInstallOnAppQuit = false
        autoUpdater.updateConfigPath = path.join(__dirname, 'dev-app-update.yml')
    }
    if(process.platform === 'darwin'){
        autoUpdater.autoDownload = false
    }
    autoUpdater.on('update-available', (info) => {
        event.sender.send('autoUpdateNotification', 'update-available', info)
    })
    autoUpdater.on('update-downloaded', (info) => {
        isUpdateDownloaded = true
        event.sender.send('autoUpdateNotification', 'update-downloaded', info)
    })
    autoUpdater.on('update-not-available', (info) => {
        event.sender.send('autoUpdateNotification', 'update-not-available', info)
    })
    autoUpdater.on('checking-for-update', () => {
        event.sender.send('autoUpdateNotification', 'checking-for-update')
    })
    autoUpdater.on('error', (err) => {
        event.sender.send('autoUpdateNotification', 'realerror', err)
    }) 
}

// Open channel to listen for update actions.
ipcMain.on('autoUpdateAction', (event, arg, data) => {
    switch(arg){
        case 'initAutoUpdater':
            console.log('Initializing auto updater.')
            initAutoUpdater(event, data)
            event.sender.send('autoUpdateNotification', 'ready')
            break
        case 'checkForUpdate':
            autoUpdater.checkForUpdates()
                .catch(err => {
                    event.sender.send('autoUpdateNotification', 'realerror', err)
                })
            break
        case 'allowPrereleaseChange':
            if(!data){
                const preRelComp = semver.prerelease(app.getVersion())
                if(preRelComp != null && preRelComp.length > 0){
                    autoUpdater.allowPrerelease = true
                } else {
                    autoUpdater.allowPrerelease = data
                }
            } else {
                autoUpdater.allowPrerelease = data
            }
            break
        case 'installUpdateNow':
            autoUpdater.quitAndInstall()
            break
        default:
            console.log('Unknown argument', arg)
            break
    }
})
// Redirect distribution index event from preloader to renderer.
ipcMain.on('distributionIndexDone', (event, res) => {
    event.sender.send('distributionIndexDone', res)
})

// Handle trash item.
ipcMain.handle(SHELL_OPCODE.TRASH_ITEM, async (event, ...args) => {
    try {
        await shell.trashItem(args[0])
        return {
            result: true
        }
    } catch(error) {
        return {
            result: false,
            error: error
        }
    }
})

// Disable hardware acceleration.
// https://electronjs.org/docs/tutorial/offscreen-rendering
app.disableHardwareAcceleration()


const REDIRECT_URI_PREFIX = 'https://login.microsoftonline.com/common/oauth2/nativeclient?'

// Microsoft Auth Login
let msftAuthWindow
let msftAuthSuccess
let msftAuthViewSuccess
let msftAuthViewOnClose
ipcMain.on(MSFT_OPCODE.OPEN_LOGIN, (ipcEvent, ...arguments_) => {
    if (msftAuthWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN, msftAuthViewOnClose)
        return
    }
    msftAuthSuccess = false
    msftAuthViewSuccess = arguments_[0]
    msftAuthViewOnClose = arguments_[1]
    msftAuthWindow = new BrowserWindow({
        title: 'Microsoft Login',
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('SealCircle')
    })

    msftAuthWindow.on('closed', () => {
        msftAuthWindow = undefined
    })

    msftAuthWindow.on('close', () => {
        if(!msftAuthSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED, msftAuthViewOnClose)
        }
    })

    msftAuthWindow.webContents.on('did-navigate', (_, uri) => {
        if (uri.startsWith(REDIRECT_URI_PREFIX)) {
            let queries = uri.substring(REDIRECT_URI_PREFIX.length).split('#', 1).toString().split('&')
            let queryMap = {}

            queries.forEach(query => {
                const [name, value] = query.split('=')
                queryMap[name] = decodeURI(value)
            })

            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.SUCCESS, queryMap, msftAuthViewSuccess)

            msftAuthSuccess = true
            msftAuthWindow.close()
            msftAuthWindow = null
        }
    })

    msftAuthWindow.removeMenu()
    msftAuthWindow.loadURL(`https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?prompt=select_account&client_id=${AZURE_CLIENT_ID}&response_type=code&scope=XboxLive.signin%20offline_access&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient`)
})

// Microsoft Auth Logout
let msftLogoutWindow
let msftLogoutSuccess
let msftLogoutSuccessSent
ipcMain.on(MSFT_OPCODE.OPEN_LOGOUT, (ipcEvent, uuid, isLastAccount) => {
    if (msftLogoutWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN)
        return
    }

    msftLogoutSuccess = false
    msftLogoutSuccessSent = false
    msftLogoutWindow = new BrowserWindow({
        title: 'Microsoft Logout',
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('SealCircle')
    })

    msftLogoutWindow.on('closed', () => {
        msftLogoutWindow = undefined
    })

    msftLogoutWindow.on('close', () => {
        if(!msftLogoutSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED)
        } else if(!msftLogoutSuccessSent) {
            msftLogoutSuccessSent = true
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
        }
    })
    
    msftLogoutWindow.webContents.on('did-navigate', (_, uri) => {
        if(uri.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/logoutsession')) {
            msftLogoutSuccess = true
            setTimeout(() => {
                if(!msftLogoutSuccessSent) {
                    msftLogoutSuccessSent = true
                    ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
                }

                if(msftLogoutWindow) {
                    msftLogoutWindow.close()
                    msftLogoutWindow = null
                }
            }, 5000)
        }
    })
    
    msftLogoutWindow.removeMenu()
    msftLogoutWindow.loadURL('https://login.microsoftonline.com/common/oauth2/v2.0/logout')
})

const PLAYCLAN_URL = 'https://api.playclan.net/kliens/success?'
const SHOP_URL = 'https://playclan.net/shop/profil'
const LOGOUT_URL = 'https://playclan.net/shop/bejelentkezes'

// PlayClan Auth Login
let pcAuthWindow
let pcAuthSuccess
let pcAuthViewSuccess
let pcAuthViewOnClose
let ipcEventStored
ipcMain.on(PC_OPCODE.OPEN_LOGIN, (ipcEvent, ...arguments_) => {
    ipcEventStored = ipcEvent
    if (pcAuthWindow) {
        ipcEvent.reply(PC_OPCODE.REPLY_LOGIN, PC_REPLY_TYPE.ERROR, PC_ERROR.ALREADY_OPEN, pcAuthViewOnClose)
        return
    }

    pcAuthViewSuccess = arguments_[0]
    pcAuthViewOnClose = arguments_[1]

    loginSession = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < 100) {
        loginSession += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }

    require('electron').shell.openExternal("https://sso.playclan.net/accounts?window=pclauncher&session=" + loginSession + "&port=" + localWebServerPort);

})

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

async function createWindow() {

    win = new BrowserWindow({
        width: 980,
        height: 552,
        minWidth: 780,
        minHeight: 500,
        icon: getPlatformIcon('SealCircle'),
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'app', 'assets', 'js', 'preloader.js'),
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        backgroundColor: '#171614'
    })
    remoteMain.enable(win.webContents)

    const data = {
        bkid: Math.floor((Math.random() * fs.readdirSync(path.join(__dirname, 'app', 'assets', 'images', 'backgrounds')).length)),
        maxpic: fs.readdirSync(path.join(__dirname, 'app', 'assets', 'images', 'backgrounds')).length,
        lang: (str, placeHolders) => LangLoader.queryEJS(str, placeHolders)
    }
    Object.entries(data).forEach(([key, val]) => ejse.data(key, val))

    win.loadURL(pathToFileURL(path.join(__dirname, 'app', 'app.ejs')).toString())

    /*win.once('ready-to-show', () => {
        win.show()
    })*/

    win.removeMenu()

    win.resizable = true

    win.on('close', e => {
        if (process.platform !== 'darwin' && isUpdateDownloaded) {
            e.preventDefault()
            dialog.showMessageBox({
                type: 'warning',
                buttons: [LangLoader.queryJS('exit.updateButton')],
                defaultId: 0,
                title: LangLoader.queryJS('exit.updateTitle'),
                detail: LangLoader.queryJS('exit.updateDetail'),
            }).then(({ response, checkboxChecked }) => {
                win.destroy()
                app.quit()
            })
        }
    })

    win.on('closed', () => {
        win = null
    })

    // Create the HTTP server
    const server = http.createServer((req, res) => {
        if (req.url.startsWith('/background-image')) {
            let random = Math.floor(Math.random() * fs.readdirSync(path.join(__dirname, 'app', 'assets', 'images', 'backgrounds')).length);
            const image = fs.readFileSync(path.join(__dirname, 'app', 'assets', 'images', 'backgrounds', random + '.png'));
            res.statusCode = 200;
            res.setHeader('Content-Type', 'image/png');
            res.end(image);
            return;
        }
        if (req.url.startsWith('/login?token=')) {
            const data = req.url.split('/login?')[1].split('&');
            const token = data[0].split('=')[1];
            const sso = data[1].split('=')[1];
            const session = data[2].split('=')[1];

            let isTokenValid = true;

            if (session !== loginSession) {
                isTokenValid = false;
            }

            const favicon = fs.readFileSync(path.join(__dirname, 'app', 'assets', 'images', 'SealCircle.ico'));

            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
            res.write(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link rel="icon" href="data:image/x-icon;base64,${favicon.toString('base64')}">
                    <title>PlayClan Launcher</title>
                    <style>
                        body, h1, p {
                            margin: 0;
                            padding: 0;
                            font-family: Arial, sans-serif;
                        }

                        .container {
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            background-image: url('background-image');
                            background-size: cover;
                            background-position: center;
                        }

                        /* Message box with blur and transparency */
                        .message-box {
                            text-align: center;
                            background-color: rgba(60, 60, 60, 0.6); 
                            backdrop-filter: blur(10px);
                            padding: 30px 30px;
                            border-radius: 8px;
                            box-shadow: 0px 4px 15px rgba(0, 0, 0, 0.1);
                        }

                        .message-box h1 {
                            font-size: 24px;
                            color: #fff;
                            margin-bottom: 10px;
                        }

                        .message-box p {
                            font-size: 18px;
                            color: #fff;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="message-box">
                            <h1>` + (isTokenValid ? LangLoader.queryJS('login.successTitle') : LangLoader.queryJS('login.errorTitle')) + `</h1>
                            <p>` + (isTokenValid ? LangLoader.queryJS('login.successDesc') : LangLoader.queryJS('login.errorDesc')) + `</p>
                        </div>
                    </div>
                    <script>window.history.replaceState({}, document.title, "/");</script>
                </body>
                </html>
            `);
            res.end();

            if (isTokenValid) {

                let queryMap = {}
                data.forEach(query => {
                    const [name, value] = query.split('=')
                    queryMap[name] = decodeURI(value)
                })
                setTimeout(() => {
                    win.focus()
                    win.show()
                    ipcEventStored.reply(PC_OPCODE.REPLY_LOGIN, PC_REPLY_TYPE.SUCCESS, queryMap, pcAuthViewSuccess)
                }, 500);
            } else {
                ipcEventStored.reply(PC_OPCODE.REPLY_LOGIN, PC_REPLY_TYPE.ERROR, PC_ERROR.NOT_FINISHED, pcAuthViewOnClose)
            }
            return;
        } else {
            res.statusCode = 204;
            res.end();
            return;
        }
    });

    // Listen on a random port
    server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        localWebServerPort = port;
    });


    // Ensure the server closes when the app is closed
    app.on('before-quit', () => {
        server.close();
    });
}

ipcMain.on('hide-window', () => {
    win.hide()
    if (process.platform === 'darwin') {
        app.dock.hide()
    } else {
        win.setSkipTaskbar(true)
    }
})

ipcMain.on('show-window', () => {
    win.show()
    win.focus()
    if (process.platform === 'darwin') {
        app.dock.show()
    } else {
        win.setSkipTaskbar(false)
    }
})

ipcMain.on('restart_app', () => {
    dialog.showMessageBox({
        type: 'question',
        buttons: [LangLoader.queryJS('exit.stayButton'), LangLoader.queryJS('exit.closeButton')],
        cancelId: 1,
        defaultId: 0,
        title: LangLoader.queryJS('exit.restartTitle'),
        detail: LangLoader.queryJS('exit.restartDetail'),
    }).then(({ response, checkboxChecked }) => {
        if (response) {
            app.relaunch()
            app.exit()
        }
    })
})

function createMenu() {
    
    if(process.platform === 'darwin') {

        // Extend default included application menu to continue support for quit keyboard shortcut
        let applicationSubMenu = {
            label: 'Application',
            submenu: [{
                label: LangLoader.queryJS('macos.applicationLabel'),
                selector: 'orderFrontStandardAboutPanel:'
            }, {
                type: 'separator'
            }, {
                label: LangLoader.queryJS('macos.quitLabel'),
                accelerator: 'Command+Q',
                click: () => {
                    app.quit()
                }
            }]
        }

        // New edit menu adds support for text-editing keyboard shortcuts
        let editSubMenu = {
            label: LangLoader.queryJS('macos.editLabel'),
            submenu: [{
                label: LangLoader.queryJS('macos.undoLabel'),
                accelerator: 'CmdOrCtrl+Z',
                selector: 'undo:'
            }, {
                label: LangLoader.queryJS('macos.redoLabel'),
                accelerator: 'Shift+CmdOrCtrl+Z',
                selector: 'redo:'
            }, {
                type: 'separator'
            }, {
                label: LangLoader.queryJS('macos.cutLabel'),
                accelerator: 'CmdOrCtrl+X',
                selector: 'cut:'
            }, {
                label: LangLoader.queryJS('macos.copyLabel'),
                accelerator: 'CmdOrCtrl+C',
                selector: 'copy:'
            }, {
                label: LangLoader.queryJS('macos.pasteLabel'),
                accelerator: 'CmdOrCtrl+V',
                selector: 'paste:'
            }, {
                label: LangLoader.queryJS('macos.selectAllLabel'),
                accelerator: 'CmdOrCtrl+A',
                selector: 'selectAll:'
            }]
        }

        // Bundle submenus into a single template and build a menu object with it
        let menuTemplate = [applicationSubMenu, editSubMenu]
        let menuObject = Menu.buildFromTemplate(menuTemplate)

        // Assign it to the application
        Menu.setApplicationMenu(menuObject)

    }

}

function getPlatformIcon(filename){
    let ext
    switch(process.platform) {
        case 'win32':
            ext = 'ico'
            break
        case 'darwin':
        case 'linux':
        default:
            ext = 'png'
            break
    }

    return path.join(__dirname, 'app', 'assets', 'images', `${filename}.${ext}`)
}

ipcMain.on('game-state', (event, arg) => {
    event.sender.send('game-state', arg)
})

app.on('ready', async () => {
    createWindow()
    createMenu()

    electronAppUniversalProtocolClient.on(
        'request',
        async (requestUrl) => {
            let action = requestUrl.split('://')[1];
            let before = action.split('/')[0];
            let after = action.split('/')[1];
            if (before == 'join-server') {
                //win.webContents.send('join-server', after);
            }
        },
    );

    await electronAppUniversalProtocolClient.initialize({
        protocol: 'pclauncher',
        mode: 'production', // Make sure to use 'production' when script is executed in bundled app
    });
})

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow()
    }
})