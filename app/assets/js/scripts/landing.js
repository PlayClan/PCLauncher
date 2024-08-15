/**
 * Script for landing.ejs
 */
// Requirements
const { URL }                 = require('url')
const {
    MojangRestAPI,
    getServerStatus
}                             = require('helios-core/mojang')
const {
    RestResponseStatus,
    isDisplayableError,
    validateLocalFile
}                             = require('helios-core/common')
const {
    FullRepair,
    DistributionIndexProcessor,
    MojangIndexProcessor,
    downloadFile
}                             = require('helios-core/dl')
const {
    validateSelectedJvm,
    ensureJavaDirIsRoot,
    javaExecFromRoot,
    discoverBestJvmInstallation,
    latestOpenJDK,
    extractJdk
}                             = require('helios-core/java')

// Internal Requirements
const DiscordWrapper          = require('./assets/js/discordwrapper')
const ProcessBuilder          = require('./assets/js/processbuilder')
const { dialog } = require('electron')

// Launch Elements
const launch_content          = document.getElementById('launch_content')
const launch_details          = document.getElementById('launch_details')
const launch_progress         = document.getElementById('launch_progress')
const launch_progress_label   = document.getElementById('launch_progress_label')
const launch_details_text     = document.getElementById('launch_details_text')
const server_selection_button = document.getElementById('server_selection_button')
const user_text               = document.getElementById('user_text')
const avatarOverlay           = document.getElementById('avatarOverlay')
const settingsMediaButton     = document.getElementById('settingsMediaButton')
const shopButton              = document.getElementById('shopButton')
const image_seal_container    = document.getElementById('image_seal_container')

const loggerLanding = LoggerUtil.getLogger('Landing')

let webPort; 

/* Launch Progress Wrapper Functions */

/**
 * Show/hide the loading area.
 * 
 * @param {boolean} loading True if the loading area should be shown, otherwise false.
 */
function toggleLaunchArea(loading){
    if(loading){
        launch_details.style.display = 'flex'
        launch_content.style.display = 'none'
        user_text.disabled = true
        avatarOverlay.disabled = true
        settingsMediaButton.disabled = true
        shopButton.disabled = true
        image_seal_container.disabled = true
    } else {
        launch_details.style.display = 'none'
        launch_content.style.display = 'inline-flex'
        user_text.disabled = false
        avatarOverlay.disabled = false
        settingsMediaButton.disabled = false
        shopButton.disabled = false
        image_seal_container.disabled = false
    }
}

/**
 * Set the details text of the loading area.
 * 
 * @param {string} details The new text for the loading details.
 */
function setLaunchDetails(details){
    launch_details_text.innerHTML = details
}

/**
 * Set the value of the loading progress bar and display that value.
 * 
 * @param {number} percent Percentage (0-100)
 */
function setLaunchPercentage(percent){
    launch_progress.setAttribute('max', 100)
    launch_progress.setAttribute('value', percent)
    launch_progress_label.innerHTML = percent + '%'
}

/**
 * Set the value of the OS progress bar and display that on the UI.
 * 
 * @param {number} percent Percentage (0-100)
 */
function setDownloadPercentage(percent){
    remote.getCurrentWindow().setProgressBar(percent/100)
    setLaunchPercentage(percent)
}

/**
 * Enable or disable the launch button.
 * 
 * @param {boolean} val True to enable, false to disable.
 */
function setLaunchEnabled(val){
    document.getElementById('launch_button').disabled = !val
}

// Bind launch button
document.getElementById('launch_button').addEventListener('click', async e => {
    loggerLanding.info('Launching game..')
    if (ConfigManager.getAutoConnect() && !ConfigManager.getAutoConnectAsked()) {
        setOverlayContent(
            Lang.queryJS('landing.autoConnectTitle'),
            Lang.queryJS('landing.autoConnectContent'),
            Lang.queryJS('landing.autoConnectYes'),
            Lang.queryJS('landing.autoConnectNo')
        )
        setOverlayHandler(() => {
            ConfigManager.setAutoConnect(false)
            ConfigManager.setAutoConnectAsked(true)
            toggleOverlay(false, false)
            launchGame()
        })
        setDismissHandler(() => {
            ConfigManager.setAutoConnect(true)
            ConfigManager.setAutoConnectAsked(true)
            toggleOverlay(false, false)
            launchGame()
        })
        toggleOverlay(true, true)
    } else {
        ConfigManager.setAutoConnectAsked(true)
        launchGame()
    }
})

async function launchGame() {
    try {
        if (validateSelectedAccount()) {
            const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
            const jExe = ConfigManager.getJavaExecutable(ConfigManager.getSelectedServer())
            if(jExe == null){
                await asyncSystemScan(server.effectiveJavaOptions)
            } else {
    
                setLaunchDetails(Lang.queryJS('landing.pleaseWait'))
                toggleLaunchArea(true)
                setLaunchPercentage(0, 100)
    
                const details = await validateSelectedJvm(ensureJavaDirIsRoot(jExe), server.effectiveJavaOptions.supported)
                if(details != null){
                    loggerLanding.info('Jvm Details', details)
                    await dlAsync()
    
                } else {
                    await asyncSystemScan(server.effectiveJavaOptions)
                }
            }
        }
    } catch(err) {
        loggerLanding.error('Unhandled error in during launch process.', err)
        showLaunchFailure(Lang.queryJS('landing.errorStartupTitle'), Lang.queryJS('landing.errorConsole'))
    }
}

// Bind settings button
document.getElementById('settingsMediaButton').onclick = async e => {
    if (!document.getElementById('settingsMediaButton').disabled) {
        await prepareSettings()
        switchView(getCurrentView(), VIEWS.settings)
    }
}

// Bind avatar overlay button.
document.getElementById('avatarOverlay').onclick = async e => {
    if (!document.getElementById('avatarOverlay').disabled) {
        await prepareSettings()
        switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
            settingsNavItemListener(document.getElementById('settingsNavAccount'), false)
        })
    }
}

user_text.onclick = async e => {
    if (!user_text.disabled) {
        prepareAccountSelectionList()
        bindOverlayKeys(true, 'accountSelectContent', true)
        setDismissHandler(() => {
            toggleOverlay(false)
        })
        toggleOverlay(true, true, 'accountSelectContent')
    }
}

// Bind selected account
function updateSelectedAccount(authUser){
    let username = Lang.queryJS('landing.noAccount')
    if(authUser != null){
        if(authUser.displayName != null){
            username = authUser.displayName
        }
        if (authUser.type == "playclan") {
            if(authUser.uuid != null){
                document.getElementById('avatarContainer').style.backgroundImage = `url('https://playclan.net/skin/resources/server/skinRender.php?format=png&headOnly=false&vr=-25&hr=45&displayHair=true&user=${authUser.displayName}&time=${Date.now()}')`
            }
        } else {
            if(authUser.uuid != null){
                document.getElementById('avatarContainer').style.backgroundImage = `url('https://mc-heads.net/body/${authUser.uuid}/right')`
            }
        }
        user_text.innerHTML = username + "\n(" + (authUser.type == "playclan" ? "PlayClan" : "Microsoft") + ")"
    } else {
        user_text.innerHTML = username
    }
}
validateSelectedAccount()
updateSelectedAccount(ConfigManager.getSelectedAccount())

// Bind selected server
function updateSelectedServer(serv){
    if(getCurrentView() === VIEWS.settings){
        fullSettingsSave()
    }
    ConfigManager.setSelectedServer(serv != null ? serv.rawServer.id : null)
    ConfigManager.save()
    server_selection_button.innerHTML = '\u2022 ' + (serv != null ? serv.rawServer.name + (serv.rawServer.mainServer ? "" : " <span class='warning'>(!)</span>") : Lang.queryJS('landing.noServer'))
    if(getCurrentView() === VIEWS.settings){
        animateSettingsTabRefresh()
    }
    setLaunchEnabled(serv != null)
}
// Real text is set in uibinder.js on distributionIndexDone.
server_selection_button.innerHTML = '\u2022 ' + Lang.queryJS('landing.loading')
server_selection_button.onclick = async e => {
    e.target.blur()
    await toggleServerSelection(true)
}

// Update PlayClan Status Color
const refreshPlayClanStatus = async function(){
    loggerLanding.info('Refreshing PlayClan Statuses..')

    let status = 'grey'
    let tooltipEssentialHTML = ''
    
    let statuses

    await fetch('https://api.playclan.net/kliens/status').then(response => {
        return response.json()
    }).then(data => {
        statuses = data
    }).catch(err => {
        console.log(err)
    })
    
    greenCount = 0
    greyCount = 0

    for(let i=0; i<statuses.length; i++){
        const service = statuses[i]

        let isOnline
        let players

        try {
            const response = await getServerStatus(47, service.ip, service.port)
            players = response.players.online + '/' + response.players.max
            isOnline = true
        } catch (err) {
            isOnline = false
            loggerLanding.warn('Unable to refresh server status, assuming offline.')
            loggerLanding.debug(err)
        }

        tooltipEssentialHTML += `<div class="mojangStatusContainer">
            <span class="mojangStatusIcon" style="color: ${MojangRestAPI.statusToHex(isOnline ? "green" : "red")};">&#8226;</span>
            <span class="mojangStatusName">${service.name}</span>
            <span class="mojangStatusPlayers">${players}</span>
        </div>`

        if(isOnline){
            status = 'green'
        } else {
            if(service.status === 'grey'){
                ++greyCount
            }
            ++greenCount
        }

    }

    if(greenCount === statuses.length){
        if(greyCount === statuses.length){
            status = 'grey'
        } else {
            status = 'green'
        }
    }
    
    document.getElementById('mojangStatusEssentialContainer').innerHTML = tooltipEssentialHTML
    document.getElementById('mojang_status_icon').style.color = MojangRestAPI.statusToHex(status)
}

const refreshServerStatus = async (fade = false) => {
    loggerLanding.info('Refreshing Server Status')
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())

    let pLabel = Lang.queryJS('landing.server')
    let pVal = Lang.queryJS('landing.offline')

    try {

        const servStat = await getServerStatus(47, serv.hostname, serv.port)
        //console.log(servStat)
        pLabel = Lang.queryJS('landing.players')
        pVal = servStat.players.online + '/' + servStat.players.max

    } catch (err) {
        loggerLanding.warn('Unable to refresh server status, assuming offline.')
        loggerLanding.debug(err)
    }
    if(fade){
        $('#server_status_wrapper').fadeOut(250, () => {
            document.getElementById('landingPlayerLabel').innerHTML = pLabel
            document.getElementById('player_count').innerHTML = pVal
            $('#server_status_wrapper').fadeIn(500)
        })
    } else {
        document.getElementById('landingPlayerLabel').innerHTML = pLabel
        document.getElementById('player_count').innerHTML = pVal
    }
    
}

//refreshMojangStatuses()
refreshPlayClanStatus()
// Server Status is refreshed in uibinder.js on distributionIndexDone.

// Refresh statuses every hour. The status page itself refreshes every day so...
//let mojangStatusListener = setInterval(() => refreshMojangStatuses(true), 60*60*1000)
// Set refresh rate to once every 30 seconds.
let serverStatusListener = setInterval(() => refreshServerStatus(true), 30000)
// Set refresh rate to once every 30 seconds.
let playclanStatusListener = setInterval(() => refreshPlayClanStatus(true), 30000)

/**
 * Shows an error overlay, toggles off the launch area.
 * 
 * @param {string} title The overlay title.
 * @param {string} desc The overlay description.
 */
function showLaunchFailure(title, desc){
    setOverlayContent(
        title,
        desc,
        'Ok'
    )
    setOverlayHandler(null)
    toggleOverlay(true)
    toggleLaunchArea(false)
}

/* System (Java) Scan */

/**
 * Asynchronously scan the system for valid Java installations.
 * 
 * @param {boolean} launchAfter Whether we should begin to launch after scanning. 
 */
async function asyncSystemScan(effectiveJavaOptions, launchAfter = true){

    setLaunchDetails(Lang.queryJS('landing.checkingJava'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const jvmDetails = await discoverBestJvmInstallation(
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.supported
    )

    if(jvmDetails == null) {
        // If the result is null, no valid Java installation was found.
        // Show this information to the user.
        setOverlayContent(
            Lang.queryJS('landing.javaNotFoundTitle'),
            Lang.queryJS('landing.javaNotFoundContent1') + ' ' + effectiveJavaOptions.suggestedMajor + ' ' + Lang.queryJS('landing.javaNotFoundContent2'),
            Lang.queryJS('landing.javaNotFoundButton'),
            Lang.queryJS('landing.javaNotFoundButtonAlt')
        )
        setOverlayHandler(() => {
            setLaunchDetails(Lang.queryJS('landing.downloadJava'))
            toggleOverlay(false)
            
            try {
                downloadJava(effectiveJavaOptions, launchAfter)
            } catch(err) {
                loggerLanding.error('Unhandled error in Java Download', err)
                showLaunchFailure(Lang.queryJS('landing.errorJavaTitle'), Lang.queryJS('landing.errorConsole'))
            }
        })
        setDismissHandler(() => {
            $('#overlayContent').fadeOut(250, () => {
                //$('#overlayDismiss').toggle(false)
                setOverlayContent(
                    Lang.queryJS('landing.javaManualTitle'),
                    Lang.queryJS('landing.javaManualContent1') + ' ' + effectiveJavaOptions.suggestedMajor +  ' ' + Lang.queryJS('landing.javaManualContent2'),
                    Lang.queryJS('landing.javaManualButton'),
                    Lang.queryJS('landing.javaManualButtonAlt')
                )
                setOverlayHandler(() => {
                    toggleLaunchArea(false)
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    toggleOverlay(false, true)

                    asyncSystemScan(effectiveJavaOptions, launchAfter)
                })
                $('#overlayContent').fadeIn(250)
            })
        })
        toggleOverlay(true, true)
    } else {
        // Java installation found, use this to launch the game.
        const javaExec = javaExecFromRoot(jvmDetails.path)
        ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), javaExec)
        ConfigManager.save()

        // We need to make sure that the updated value is on the settings UI.
        // Just incase the settings UI is already open.
        settingsJavaExecVal.value = javaExec
        await populateJavaExecDetails(settingsJavaExecVal.value)

        // TODO Callback hell, refactor
        // TODO Move this out, separate concerns.
        if(launchAfter){
            await dlAsync()
        }
    }

}

async function downloadJava(effectiveJavaOptions, launchAfter = true) {

    // TODO Error handling.
    // asset can be null.
    const asset = await latestOpenJDK(
        effectiveJavaOptions.suggestedMajor,
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.distribution)

    if(asset == null) {
        throw new Error('Failed to find OpenJDK distribution.')
    }

    let received = 0
    await downloadFile(asset.url, asset.path, ({ transferred }) => {
        received = transferred
        setDownloadPercentage(Math.trunc((transferred/asset.size)*100))
    })
    setDownloadPercentage(100)

    if(received != asset.size) {
        loggerLanding.warn(`Java Download: Expected ${asset.size} bytes but received ${received}`)
        if(!await validateLocalFile(asset.path, asset.algo, asset.hash)) {
            log.error(`Hashes do not match, ${asset.id} may be corrupted.`)
            // Don't know how this could happen, but report it.
            throw new Error('Downloaded JDK has bad hash, file may be corrupted.')
        }
    }

    // Extract
    // Show installing progress bar.
    remote.getCurrentWindow().setProgressBar(2)

    // Wait for extration to complete.
    const eLStr = Lang.queryJS('landing.extractingJava')
    let dotStr = ''
    setLaunchDetails(eLStr)
    const extractListener = setInterval(() => {
        if(dotStr.length >= 3){
            dotStr = ''
        } else {
            dotStr += '.'
        }
        setLaunchDetails(eLStr + dotStr)
    }, 750)

    const newJavaExec = await extractJdk(asset.path)

    // Extraction complete, remove the loading from the OS progress bar.
    remote.getCurrentWindow().setProgressBar(-1)

    // Extraction completed successfully.
    ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), newJavaExec)
    ConfigManager.save()

    clearInterval(extractListener)
    setLaunchDetails(Lang.queryJS('landing.javaComplete'))

    // TODO Callback hell
    // Refactor the launch functions
    asyncSystemScan(effectiveJavaOptions, launchAfter)

}

// Keep reference to Minecraft Process
let proc
// Is DiscordRPC enabled
let hasRPC = false
// Joined server regex
// Change this if your server uses something different.
const GAME_JOINED_REGEX = /\[.+\]: Hardware information/
const DISCONNECTED_REGEX = /\[.+\]: Disconnected from server/
const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+|Loading Minecraft .+ with Fabric Loader .+)$/
const WEB_SERVER_PORT = /\[.+\]: Web server started on port \d+/
const MIN_LINGER = 5000

async function dlAsync(login = true) {

    // Login parameter is temporary for debug purposes. Allows testing the validation/downloads without
    // launching the game.

    const loggerLaunchSuite = LoggerUtil.getLogger('LaunchSuite')

    setLaunchDetails(Lang.queryJS('landing.loadingInfo'))

    let distro

    try {
        distro = await DistroAPI.refreshDistributionOrFallback()
        onDistroRefresh(distro)
    } catch(err) {
        loggerLaunchSuite.error('Unable to refresh distribution index.', err)
        showLaunchFailure(Lang.queryJS('landing.fatal'), Lang.queryJS('landing.errorConsole'))
        return
    }

    const serv = distro.getServerById(ConfigManager.getSelectedServer())

    if(login) {
        if(ConfigManager.getSelectedAccount() == null){
            loggerLanding.error('You must be logged into an account.')
            // No account, temporary fix
            toggleLaunchArea(false)
            switchView(getCurrentView(), VIEWS.loginOptions)
            return
        }
    }

    setLaunchDetails(Lang.queryJS('landing.verifying'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const fullRepairModule = new FullRepair(
        ConfigManager.getCommonDirectory(),
        ConfigManager.getInstanceDirectory(),
        ConfigManager.getLauncherDirectory(),
        ConfigManager.getSelectedServer(),
        DistroAPI.isDevMode()
    )

    fullRepairModule.spawnReceiver()

    fullRepairModule.childProcess.on('error', (err) => {
        loggerLaunchSuite.error('Error during launch', err)
        showLaunchFailure(Lang.queryJS('landing.errorLaunch'), err.message || Lang.queryJS('landing.errorConsole'))
    })
    fullRepairModule.childProcess.on('close', (code, _signal) => {
        if(code !== 0){
            loggerLaunchSuite.error(`Full Repair Module exited with code ${code}, assuming error.`)
            showLaunchFailure(Lang.queryJS('landing.errorLaunch'), Lang.queryJS('landing.errorConsole'))
        }
    })

    loggerLaunchSuite.info('Validating files.')
    setLaunchDetails(Lang.queryJS('landing.validating'))
    let invalidFileCount = 0
    try {
        invalidFileCount = await fullRepairModule.verifyFiles(percent => {
            setLaunchPercentage(percent)
        })
        setLaunchPercentage(100)
    } catch (err) {
        loggerLaunchSuite.error('Error during file validation.')
        showLaunchFailure(Lang.queryJS('landing.errorValidate'), err.displayable || Lang.queryJS('landing.errorConsole'))
        return
    }
    

    if(invalidFileCount > 0) {
        loggerLaunchSuite.info('Downloading files.')
        setLaunchDetails(Lang.queryJS('landing.downloading'))
        setLaunchPercentage(0)
        try {
            await fullRepairModule.download(percent => {
                setDownloadPercentage(percent)
            })
            setDownloadPercentage(100)
        } catch(err) {
            loggerLaunchSuite.error('Error during file download.')
            showLaunchFailure(Lang.queryJS('landing.errorDownload'), err.displayable || Lang.queryJS('landing.errorConsole'))
            return
        }
    } else {
        loggerLaunchSuite.info('No invalid files, skipping download.')
    }

    // Remove download bar.
    remote.getCurrentWindow().setProgressBar(-1)

    fullRepairModule.destroyReceiver()

    setLaunchDetails(Lang.queryJS('landing.finalizing'))

    const mojangIndexProcessor = new MojangIndexProcessor(
        ConfigManager.getCommonDirectory(),
        serv.rawServer.minecraftVersion)
    const distributionIndexProcessor = new DistributionIndexProcessor(
        ConfigManager.getCommonDirectory(),
        distro,
        serv.rawServer.id
    )

    const modLoaderData = await distributionIndexProcessor.loadModLoaderVersionJson(serv)
    const versionData = await mojangIndexProcessor.getVersionJson()

    if(login) {
        const authUser = ConfigManager.getSelectedAccount()
        loggerLaunchSuite.info(`Sending selected account (${authUser.displayName}) to ProcessBuilder.`)
        let pb = new ProcessBuilder(serv, versionData, modLoaderData, authUser, remote.app.getVersion())
        setLaunchDetails(Lang.queryJS('landing.launching'))

        // const SERVER_JOINED_REGEX = /\[.+\]: \[CHAT\] [a-zA-Z0-9_]{1,16} joined the game/
        const SERVER_JOINED_REGEX = new RegExp(`Sikeres bejelentkez`)

        const onLoadComplete = () => {
            toggleLaunchArea(false)
            if(hasRPC){
                DiscordWrapper.updateDetails(Lang.queryJS('discord.loading')) 
                proc.stdout.on('data', gameStateChange)
            }
            proc.stdout.on('data', webServerPort)
            proc.stdout.removeListener('data', tempListener)
            proc.stderr.removeListener('data', gameErrorListener)
        }
        const start = Date.now()

        // Attach a temporary listener to the client output.
        // Will wait for a certain bit of text meaning that
        // the client application has started, and we can hide
        // the progress bar stuff.
        const tempListener = function(data){
            if(GAME_LAUNCH_REGEX.test(data.trim())){
                const diff = Date.now()-start
                if(diff < MIN_LINGER) {
                    setTimeout(onLoadComplete, MIN_LINGER-diff)
                } else {
                    onLoadComplete()
                }
            }
        }

        // Listener for Discord RPC.
        const gameStateChange = function(data){
            data = data.trim()
            if(SERVER_JOINED_REGEX.test(data)){
                DiscordWrapper.updateDetails(Lang.queryJS('discord.playing'))
            } else if(GAME_JOINED_REGEX.test(data) || DISCONNECTED_REGEX.test(data)){
                DiscordWrapper.updateDetails(Lang.queryJS('discord.inMainMenu'))
            }
                
        }

        const webServerPort = function(data){
            data = data.trim()
            if (WEB_SERVER_PORT.test(data)) {
                webPort = data.split('port ')[1]
            }
        }

        const gameErrorListener = function(data){
            data = data.trim()
            if(data.indexOf('Could not find or load main class net.minecraft.launchwrapper.Launch') > -1){
                loggerLaunchSuite.error('Game launch failed, LaunchWrapper was not downloaded properly.')
                showLaunchFailure(Lang.queryJS('landing.errorLaunch'), Lang.queryJS('landing.errorLaunchWrapper'))
            }
            if (data.indexOf('Failed to load a library') > -1) {
                loggerLaunchSuite.error('Game launch failed, failed to load a library.')
                setOverlayContent(
                    Lang.queryJS('landing.errorLaunch'),
                    Lang.queryJS('landing.errorLaunchLibrary1') + path.join(ConfigManager.getInstanceDirectory(), serv.rawServer.id) + Lang.queryJS('landing.errorLaunchLibrary2') + path.join(ConfigManager.getCommonDirectory()) + Lang.queryJS('landing.errorLaunchLibrary3'),
                    Lang.queryJS('landing.errorLaunchLibraryButton'),
                    Lang.queryJS('landing.errorLaunchLibraryButtonAlt')
                )
                setOverlayHandler(() => {
                    const p = path.join(ConfigManager.getInstanceDirectory(), serv.rawServer.id, 'config')
                    DropinModUtil.validateDir(p)
                    shell.openPath(p)
                    toggleOverlay(false, false)
                })
                setDismissHandler(() => {
                    const p = path.join(ConfigManager.getCommonDirectory(), 'libraries')
                    DropinModUtil.validateDir(p)
                    shell.openPath(p)
                    toggleOverlay(false, false)
                })
                toggleOverlay(true, true)
                toggleLaunchArea(false)
            }
        }

        try {
            // Build Minecraft process.
            proc = pb.build()

            // Bind listeners to stdout.
            proc.stdout.on('data', tempListener)
            proc.stdout.on('data', gameErrorListener)

            setLaunchDetails(Lang.queryJS('landing.launched'))

            // Init Discord Hook
            DiscordWrapper.initRPC(distro.rawDistribution.discord, serv.rawServer.discord)
            hasRPC = true
            if (ConfigManager.getAllowLauncherHide()) {
                ipcRenderer.send('hide-window')
                toggleLaunchArea(false)
            } else {
                setTimeout(() => {
                    toggleLaunchArea(false)
                }, 3000);
            }
            proc.on('close', (code, signal) => {
                loggerLaunchSuite.info('Shutting down Discord Rich Presence..')
                DiscordWrapper.shutdownRPC()
                hasRPC = false
                proc = null
                toggleLaunchArea(false)
                if (ConfigManager.getAllowLauncherHide()) {
                    ipcRenderer.send('show-window')
                }
            })

        } catch(err) {

            loggerLaunchSuite.error('Error during launch', err)
            showLaunchFailure(Lang.queryJS('landing.errorLaunch'), Lang.queryJS('landing.errorConsole'))

        }
    }

}

/**
 * News Loading Functions
 */

// DOM Cache
const newsContent                   = document.getElementById('newsContent')
const newsArticleTitle              = document.getElementById('newsArticleTitle')
const newsArticleDate               = document.getElementById('newsArticleDate')
const newsArticleAuthor             = document.getElementById('newsArticleAuthor')
const newsArticleComments           = document.getElementById('newsArticleComments')
const newsNavigationStatus          = document.getElementById('newsNavigationStatus')
const newsArticleContentScrollable  = document.getElementById('newsArticleContentScrollable')
const nELoadSpan                    = document.getElementById('nELoadSpan')

//Shop slide
let shopActive = false
let shopPage = "profil"
let selectedSkinFile = null

// News slide caches.
let newsActive = false
let newsGlideCount = 0

/**
 * Show the news UI via a slide animation.
 * 
 * @param {boolean} up True to slide up, otherwise false. 
 */
function slide_(up){
    const lCUpper = document.querySelector('#landingContainer > #upper')
    const lCLLeft = document.querySelector('#landingContainer > #lower > #left')
    const lCLCenter = document.querySelector('#landingContainer > #lower > #center')
    const lCLRight = document.querySelector('#landingContainer > #lower > #right')
    const newsBtn = document.querySelector('#landingContainer > #lower > #center #content')
    const landingContainer = document.getElementById('landingContainer')
    const newsContainer = document.querySelector('#landingContainer > #newsContainer')

    newsGlideCount++

    if(up){
        lCUpper.style.top = '-200vh'
        lCLLeft.style.top = '-200vh'
        lCLCenter.style.top = '-200vh'
        lCLRight.style.top = '-200vh'
        newsBtn.style.top = '130vh'
        newsContainer.style.top = '0px'
        //date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})
        //landingContainer.style.background = 'rgba(29, 29, 29, 0.55)'
        landingContainer.style.background = 'rgba(0, 0, 0, 0.50)'
        setTimeout(() => {
            if(newsGlideCount === 1){
                lCLCenter.style.transition = 'none'
                newsBtn.style.transition = 'none'
            }
            newsGlideCount--
        }, 2000)
    } else {
        setTimeout(() => {
            newsGlideCount--
        }, 2000)
        landingContainer.style.background = null
        lCLCenter.style.transition = null
        newsBtn.style.transition = null
        newsContainer.style.top = '100%'
        lCUpper.style.top = '0px'
        lCLLeft.style.top = '0px'
        lCLCenter.style.top = '0px'
        lCLRight.style.top = '0px'
        newsBtn.style.top = '10px'
    }
}

function slideShop(down){
    const lCUpper = document.querySelector('#landingContainer > #upper')
    const lCLLeft = document.querySelector('#landingContainer > #lower > #left')
    const lCLCenter = document.querySelector('#landingContainer > #lower > #center')
    const lCLRight = document.querySelector('#landingContainer > #lower > #right')
    const shopBtn = document.querySelector('#landingContainer > #upper > .center_shop #content')
    const landingContainer = document.getElementById('landingContainer')
    const shopContainer = document.querySelector('#landingContainer > #shopContainer')
    const shopText = document.getElementById('shopButtonText')

    if(down){
        lCUpper.style.top = '+100vh'
        lCLLeft.style.top = '+100vh'
        lCLCenter.style.top = '+100vh'
        lCLRight.style.top = '+100vh'
        shopBtn.style.top = '-25vh'
        shopContainer.style.bottom = '0px'
        //date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})
        //landingContainer.style.background = 'rgba(29, 29, 29, 0.55)'
        landingContainer.style.background = 'rgba(0, 0, 0, 0.50)'
        $('#shopButtonText').fadeOut(500, function() {
            $('#shopButtonText').text(Lang.queryJS('shop.close')).fadeIn(500)
        })
    } else {
        landingContainer.style.background = null
        lCLCenter.style.transition = null
        shopContainer.style.bottom = '100%'
        lCUpper.style.top = '0px'
        lCLLeft.style.top = '0px'
        lCLCenter.style.top = '0px'
        lCLRight.style.top = '0px'
        shopBtn.style.top = '10px'
        $('#shopButtonText').fadeOut(500, function() {
            $('#shopButtonText').text(Lang.queryJS('shop.open')).fadeIn(500)
        })
    }
}

async function digestMessage(str) {
    const msgUint8 = new TextEncoder().encode(str)
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    return hashHex
}

async function requestShopData(token) {
    const formData = new FormData()
    formData.append('type', 'request')
    formData.append('data', 'all')

    const fullData = await fetch('https://playclan.net/shop/api', {
        method: "POST",
        body: formData,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    }).then(response => {
        return response.json()
    }).then(data => {
        return data
    }).catch(err => {
        console.log(err)
        showLaunchFailure(Lang.queryJS('shop.errorData'), Lang.queryJS('shop.errorConsole'))
    })

    return fullData
}

async function requestShopFriends(token) {
    const formData = new FormData()
    formData.append('type', 'request')
    formData.append('data', 'friends')

    const fullData = await fetch('https://playclan.net/shop/api', {
        method: "POST",
        body: formData,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    }).then(response => {
        return response.json()
    }).then(data => {
        return data
    }).catch(err => {
        console.log(err)
        showLaunchFailure(Lang.queryJS('shop.errorData'), Lang.queryJS('shop.errorConsole'))
    })

    return fullData
}

async function requestHasPermission(token) {
    const formData = new FormData()
    formData.append('type', 'request')
    formData.append('data', 'permission')
    formData.append('permission', 'playclan.kinezet')

    const fullData = await fetch('https://playclan.net/shop/api', {
        method: "POST",
        body: formData,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    }).then(response => {
        return response.json()
    }).then(data => {
        return data
    }).catch(err => {
        console.log(err)
        showLaunchFailure(Lang.queryJS('shop.errorData'), Lang.queryJS('shop.errorConsole'))
    })

    return fullData
}

async function updateSpecificSetting(token, data, data1, value1, data2, value2) {
    const formData = new FormData()
    formData.append('type', 'update')
    formData.append('data', data)
    formData.append(data1, value1)
    if (data2 != null) {
        formData.append(data2, value2)
    }

    const fullData = await fetch('https://playclan.net/shop/api', {
        method: "POST",
        body: formData,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    }).then(response => {
        return response.json()
    }).then(data => {
        return data
    }).catch(err => {
        console.log(err)
        showLaunchFailure(Lang.queryJS('shop.errorData'), Lang.queryJS('shop.errorConsole'))
    })

    return fullData
}

async function checkExistingPlayer(token, player) {
    const formData = new FormData()
    formData.append('type', 'request')
    formData.append('data', 'exists')
    formData.append('player', player)

    const fullData = await fetch('https://playclan.net/shop/api', {
        method: "POST",
        body: formData,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    }).then(response => {
        return response.json()
    }).then(data => {
        return data
    }).catch(err => {
        console.log(err)
        showLaunchFailure(Lang.queryJS('shop.errorData'), Lang.queryJS('shop.errorConsole'))
    })

    return fullData
}

async function sendPC(token, player, playcoin) {
    const formData = new FormData()
    formData.append('type', 'update')
    formData.append('data', 'sendpc')
    formData.append('player', player)
    formData.append('playcoin', playcoin)

    const fullData = await fetch('https://playclan.net/shop/api', {
        method: "POST",
        body: formData,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    }).then(response => {
        return response.json()
    }).then(data => {
        return data
    }).catch(err => {
        console.log(err)
        showLaunchFailure(Lang.queryJS('shop.errorData'), Lang.queryJS('shop.errorConsole'))
    })

    return fullData
}

function getPlaytimeHour(playtime) {
    return parseInt(playtime / 3600)
}

function getPlaytimeMinute(playtime) {
    return parseInt(playtime / 60 % 60)
}

async function loadShop(page) {
    const data = await requestShopData(ConfigManager.getSelectedAccount().accessToken)
    const friends = await requestShopFriends(ConfigManager.getSelectedAccount().accessToken)
    const kinezetPermission = await requestHasPermission(ConfigManager.getSelectedAccount().accessToken)
    const registerTime = new Date(data.data.request.create_date)
    const year = registerTime.getFullYear().toString().length == 1 ? '0' + registerTime.getFullYear() : registerTime.getFullYear()
    const month = registerTime.getMonth().toString().length == 1 ? '0' + (registerTime.getMonth() + 1) : registerTime.getMonth() + 1
    const day = registerTime.getDate().toString().length == 1 ? '0' + registerTime.getDate() : registerTime.getDate()
    const hours = registerTime.getHours().toString().length == 1 ? '0' + registerTime.getHours() : registerTime.getHours()
    const minutes = registerTime.getMinutes().toString().length == 1 ? '0' + registerTime.getMinutes() : registerTime.getMinutes()
    const seconds = registerTime.getSeconds().toString().length == 1 ? '0' + registerTime.getSeconds() : registerTime.getSeconds()
    const register = year + "-" + month + "-" + day + " " + hours + ":" + minutes + ":" + seconds
    let shopHTML = `
    <div class="shopContent">
        <div class="shop">
            <div class="shopDiv" style="width: 20rem">
                <div class="shopHeader">
                    <span>${Lang.queryJS('shop.loggedInAs')}<br>${data.data.request.name}</span>
                    <img src="https://playclan.net/skin/resources/server/skinRender.php?format=png&headOnly=true&vr=-25&hr=45&displayHair=true&user=${data.data.request.name}&aa=true&time=${Date.now()}">
                    <svg fill="#e6e6e6" height="30px" width="30px" version="1.1" id="shopRefresh" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="-48.96 -48.96 587.56 587.56" xml:space="preserve" transform="rotate(180)" stroke="#e6e6e6"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round" stroke="#CCCCCC" stroke-width="0.97929"></g><g id="SVGRepo_iconCarrier"> <g> <path d="M460.656,132.911c-58.7-122.1-212.2-166.5-331.8-104.1c-9.4,5.2-13.5,16.6-8.3,27c5.2,9.4,16.6,13.5,27,8.3 c99.9-52,227.4-14.9,276.7,86.3c65.4,134.3-19,236.7-87.4,274.6c-93.1,51.7-211.2,17.4-267.6-70.7l69.3,14.5 c10.4,2.1,21.8-4.2,23.9-15.6c2.1-10.4-4.2-21.8-15.6-23.9l-122.8-25c-20.6-2-25,16.6-23.9,22.9l15.6,123.8 c1,10.4,9.4,17.7,19.8,17.7c12.8,0,20.8-12.5,19.8-23.9l-6-50.5c57.4,70.8,170.3,131.2,307.4,68.2 C414.856,432.511,548.256,314.811,460.656,132.911z"></path> </g> </g></svg>
                </div>
                <hr>
                <h3>${Lang.queryJS('shop.accountInfo')}</h3>
                <p>${Lang.queryJS('shop.playtime')}: ${getPlaytimeHour(data.data.request.jatekido)} ${Lang.queryJS('shop.hour')} ${getPlaytimeMinute(data.data.request.jatekido)} ${Lang.queryJS('shop.minute')}</p>
                <p>${Lang.queryJS('shop.registration')}: ${register}</p>
                <p>${Lang.queryJS('shop.balance')}: ${data.data.request.playcoin} PlayCoin</p>
            </div>
            <div class="shopDiv" style="width: 20rem">
                <span class="shopMenu${page == 'profil' ? ' active' : ''}">${Lang.queryJS('shop.profile')}</span>
                <span class="shopMenu${page == 'beallitasok' ? ' active' : ''}">${Lang.queryJS('shop.settings')}</span>
                <span class="shopMenu${page == 'kinezet' ? ' active' : ''}">${Lang.queryJS('shop.appearance')}</span>
                <span class="shopMenu${page == 'playcoin' ? ' active' : ''}">${Lang.queryJS('shop.send')}</span>
            </div>
        </div>
        <div class="shop left">
            <div class="shopDiv" id="shop_profil" ${page == 'profil' ? '' : 'style="display: none"'}>
                <h2>${Lang.queryJS('shop.profile')}</h2>`
                let onlineFriends = 0
                for (let i = 0; i < friends.data.request.friends; i++) {
                    if (friends.data.request[i].online == 1) {
                        onlineFriends++
                    }
                }
                if (onlineFriends > 0) {
                    shopHTML += `<hr>
                    <h3>${Lang.queryJS('shop.profileFriends')}</h3>
                    <div class="shopPlayerList">`
                }
                for (let i = 0; i < friends.data.request.friends; i++) {
                    if (friends.data.request[i].online == 1) {
                        shopHTML += `<div class="shopPlayer">
                            <img src="https://playclan.net/shop/player_skin?nev=${friends.data.request[i].name}&time=${Date.now()}">
                            <div>
                                <h4>${friends.data.request[i].name}</h4>
                                <p>${Lang.queryJS('shop.profileOnline')}</p>
                                <p>${Lang.queryJS('shop.profileServer')}: ${friends.data.request[i].server}</p>
                                <p>${Lang.queryJS('shop.profilePlaytime')}: ${getPlaytimeHour(friends.data.request[i].playtime)} ${Lang.queryJS('shop.hour')} ${getPlaytimeMinute(friends.data.request[i].playtime)} ${Lang.queryJS('shop.minute')}</p>
                            </div>
                        </div>`
                    }
                }
                if (onlineFriends > 0) {
                    shopHTML += `</div>`
                }
                shopHTML += `
                <hr>
                <div class="shopUploadRow">
                    <div class="shopUploadColumn">
                        <h3>${Lang.queryJS('shop.skinHeader')}</h3>
                        <p>${Lang.queryJS('shop.skinDesc')}</p>
                        <button id="skinSelector">${Lang.queryJS('shop.skinSelect')}</button>
                        <button id="skinUpload">${Lang.queryJS('shop.skinUpload')}</button>
                    </div>
                    <div class="shopUploadColumn">
                        <img src="https://playclan.net/shop/player_skin?nev=${data.data.request.name}&format=skin3d&time=${Date.now()}" width="100px" height="200px">
                    </div>
                </div>
            </div>
            <div class="shopDiv" id="shop_beallitasok" ${page == 'beallitasok' ? '' : 'style="display: none"'}>
                <h2>${Lang.queryJS('shop.settings')}</h2>
                <hr>
                <h3>${Lang.queryJS('shop.ipProtHeader')}</h3>
                <p>${Lang.queryJS('shop.ipProtDesc')}</p>
                <div class="row">
                    <button class="shopButton" id="ipProtectionCurrent">${Lang.queryJS('shop.ipProtCurrent')}</button>
                    <button class="shopButton" id="ipProtectionOther">${Lang.queryJS('shop.ipProtOther')}</button>
                    <button class="shopButton" id="ipProtectionDelete">${Lang.queryJS('shop.ipProtDelete')}</button>
                </div>
                <div class="row" id="ipProtectionOtherRow" style="display: none">
                    <input type="text" class="shopInput" id="ipProtectionInput" placeholder="${Lang.queryJS('shop.ipAddress')}" maxlength="15" minlength="7">
                    <button class="shopButton" id="ipProtectionOtherSubmit">${Lang.queryJS('shop.ipSave')}</button>
                </div>
            </div>
            <div class="shopDiv" id="shop_kinezet" ${page == 'kinezet' ? '' : 'style="display: none"'}>
                <h2>${Lang.queryJS('shop.appearance')}</h2>
                <hr>`
                if (kinezetPermission.data.request) {
                    shopHTML += `<div class="row">
                    <div class="column shopDiv flexBasis">
                        <h3>${Lang.queryJS('shop.aRankHeader')}</h3>
                        <p>${Lang.queryJS('shop.aRankDesc')}</p>
                        <input class="shopInput" type="text" id="kinezetRangText" placeholder="${Lang.queryJS('shop.aRankHeader')}" value="${data.data.request.rang == null ? '' : data.data.request.rang}">
                        <div class="row">
                            <button class="shopButton" id="kinezetRangSubmit">${Lang.queryJS('shop.aRankHeader')} ${Lang.queryJS('shop.aUpdate')}</button>
                            <button class="shopButton" id="kinezetRangReset">${Lang.queryJS('shop.aRankHeader')} ${Lang.queryJS('shop.aRemove')}</button>
                        </div>
                    </div>
                    <div class="column shopDiv flexBasis">
                        <h3>${Lang.queryJS('shop.aPrefixSuffixHeader')}</h3>
                        <p>${Lang.queryJS('shop.aPrefixSuffixDesc')}</p>
                        <div id="render" class="ui container">
                            <div id="preview" class="ui">
                                <p id="kinezetPrefixSuffixOutput" class="render text-center" style="font-family: 'Minecraft'; font-weight: normal; font-style: normal; line-height: 1.5;"></p>
                            </div>
                        </div>
                        <div class="row noGap">
                            <input class="shopInput right" type="text" id="kinezetPrefixText" placeholder="${Lang.queryJS('shop.aPrefix')}" value="${data.data.request.prefix == null ? '' : data.data.request.prefix}">
                            <span class="shopInput center" style="padding: 8px">${data.data.request.name}</span>
                            <input class="shopInput" type="text" id="kinezetSuffixText" placeholder="${Lang.queryJS('shop.aSuffix')}" value="${data.data.request.suffix == null ? '' : data.data.request.suffix}">
                        </div>
                        <div class="row">
                            <button class="shopButton" id="kinezetPrefixSubmit">${Lang.queryJS('shop.aPrefixSuffixHeader')} ${Lang.queryJS('shop.aUpdate')}</button>
                            <button class="shopButton" id="kinezetPrefixReset">${Lang.queryJS('shop.aPrefixSuffixHeader')} ${Lang.queryJS('shop.aRemove')}</button>
                        </div>
                    </div>
                    <div class="column shopDiv flexBasis">
                        <h3>${Lang.queryJS('shop.aWelcomeMessageHeader')}</h3>
                        <p>${Lang.queryJS('shop.aWelcomeMessageDesc')}</p>
                        <div id="render" class="ui container">
                            <div id="preview" class="ui">
                                <p id="kinezetUdvozloUzenetOutput" class="render text-center" style="font-family: 'Minecraft'; font-weight: normal; font-style: normal; line-height: 1.5;"></p>
                            </div>
                        </div>
                        <div class="row noGap">
                            <input class="shopInput right" type="text" id="kinezetUdvozloUzenetElejeText" placeholder="${Lang.queryJS('shop.aWelcomeMessageStart')}" value="${data.data.request.udvozlo_uzenet == null ? '' : data.data.request.udvozlo_uzenet.substring(0, data.data.request.udvozlo_uzenet.indexOf('<nevem>')) == null ? '' : data.data.request.udvozlo_uzenet.substring(0, data.data.request.udvozlo_uzenet.indexOf('<nevem>'))}">
                            <span class="shopInput center" style="padding: 8px">${data.data.request.name}</span>
                            <input class="shopInput" type="text" id="kinezetUdvozloUzenetVegeText" placeholder="${Lang.queryJS('shop.aWelcomeMessageEnd')}" value="${data.data.request.udvozlo_uzenet == null ? '' : data.data.request.udvozlo_uzenet.substring(data.data.request.udvozlo_uzenet.indexOf('<nevem>') + '<nevem>'.length) == null ? '' : data.data.request.udvozlo_uzenet.substring(data.data.request.udvozlo_uzenet.indexOf('<nevem>') + '<nevem>'.length)}">
                        </div>
                        <div class="row">
                            <button class="shopButton" id="kinezetUdvozloUzenetSubmit">${Lang.queryJS('shop.aWelcomeMessageHeader')} ${Lang.queryJS('shop.aUpdate')}</button>
                            <button class="shopButton" id="kinezetUdvozloUzenetReset">${Lang.queryJS('shop.aWelcomeMessageHeader')} ${Lang.queryJS('shop.aRemove')}</button>
                        </div>
                    </div>
                    <div class="column shopDiv flexBasis">
                        <h3>${Lang.queryJS('shop.aLeaveMessageHeader')}</h3>
                        <p>${Lang.queryJS('shop.aLeaveMessageDesc')}</p>
                        <div id="render" class="ui container">
                            <div id="preview" class="ui">
                                <p id="kinezetKilepoUzenetOutput" class="render text-center" style="font-family: 'Minecraft'; font-weight: normal; font-style: normal; line-height: 1.5;"></p>
                            </div>
                        </div>
                        <div class="row noGap">
                            <input class="shopInput right" type="text" id="kinezetKilepoUzenetElejeText" placeholder="${Lang.queryJS('shop.aLeaveMessageStart')}" value="${data.data.request.kilepo_uzenet == null ? '' : data.data.request.kilepo_uzenet.substring(0, data.data.request.kilepo_uzenet.indexOf('<nevem>')) == null ? '' : data.data.request.kilepo_uzenet.substring(0, data.data.request.kilepo_uzenet.indexOf('<nevem>'))}">
                            <span class="shopInput center" style="padding: 8px">${data.data.request.name}</span>
                            <input class="shopInput" type="text" id="kinezetKilepoUzenetVegeText" placeholder="${Lang.queryJS('shop.aLeaveMessageEnd')}" value="${data.data.request.kilepo_uzenet == null ? '' : data.data.request.kilepo_uzenet.substring(data.data.request.kilepo_uzenet.indexOf('<nevem>') + '<nevem>'.length) == null ? '' : data.data.request.kilepo_uzenet.substring(data.data.request.kilepo_uzenet.indexOf('<nevem>') + '<nevem>'.length)}">
                        </div>
                        <div class="row">
                            <button class="shopButton" id="kinezetKilepoUzenetSubmit">${Lang.queryJS('shop.aLeaveMessageHeader')} ${Lang.queryJS('shop.aUpdate')}</button>
                            <button class="shopButton" id="kinezetKilepoUzenetReset">${Lang.queryJS('shop.aLeaveMessageHeader')} ${Lang.queryJS('shop.aRemove')}</button>
                        </div>
                    </div>
                    <div class="column shopDiv flexBasis">
                        <h3>${Lang.queryJS('shop.aWelcomeSoundHeader')}</h3>
                        <p>${Lang.queryJS('shop.aWelcomeSoundDesc')}</p>
                        <div class="settingsSelectContainer">
                            <div class="settingsSelectSelected" id="shopUdvozloHangSelectSelected">${Lang.queryJS('shop.aWelcomeSoundSelect')}</div>
                            <div class="settingsSelectOptions" id="shopUdvozloHangSelectOptions" style="background-color: rgba(0, 0, 0, 0.61); backdrop-filter: blur(5px);" hidden>
                            </div>
                        </div>
                        <button class="shopButton" id="kinezetUdvozloHangSubmit">${Lang.queryJS('shop.aWelcomeSoundHeader')} ${Lang.queryJS('shop.aUpdate')}</button>
                    </div>
                    <div class="column shopDiv flexBasis">
                        <h3>${Lang.queryJS('shop.aLeaveSoundHeader')}</h3>
                        <p>${Lang.queryJS('shop.aLeaveSoundDesc')}</p>
                        <div class="settingsSelectContainer">
                            <div class="settingsSelectSelected" id="shopKilepoHangSelectSelected">${Lang.queryJS('shop.aLeaveSoundSelect')}</div>
                            <div class="settingsSelectOptions" id="shopKilepoHangSelectOptions" style="background-color: rgba(0, 0, 0, 0.61); backdrop-filter: blur(5px);" hidden>
                            </div>
                        </div>
                        <button class="shopButton" id="kinezetKilepoHangSubmit">${Lang.queryJS('shop.aLeaveSoundHeader')} ${Lang.queryJS('shop.aUpdate')}</button>
                    </div>
                    <div class="column shopDiv flexBasis">
                        <h3>${Lang.queryJS('shop.aChatHeader')}</h3>
                        <p>${Lang.queryJS('shop.aChatDesc')}</p>
                        <div id="render" class="ui container">
                            <div id="preview" class="ui">
                                <p id="kinezetChatSzinOutput" class="render text-center" style="font-family: 'Minecraft'; font-weight: normal; font-style: normal; line-height: 1.5;"></p>
                            </div>
                        </div>
                        <div class="settingsSelectContainer">
                            <div class="settingsSelectSelected" id="shopChatSzinSelectSelected">${Lang.queryJS('shop.aChatSelect')}</div>
                            <div class="settingsSelectOptions" id="shopChatSzinSelectOptions" style="background-color: rgba(0, 0, 0, 0.61); backdrop-filter: blur(5px);" hidden>
                            </div>
                        </div>
                        <button class="shopButton" id="kinezetChatSzinSubmit">${Lang.queryJS('shop.aChatHeader')} ${Lang.queryJS('shop.aUpdate')}</button>
                    </div>
                </div>`
                } else {
                    shopHTML += `<h3>${Lang.queryJS('shop.noPermission')}</h3>`
                }
                
            shopHTML += `</div>
            <div class="shopDiv" id="shop_playcoin" ${page == 'playcoin' ? '' : 'style="display: none"'}>
                <h2>${Lang.queryJS('shop.send')}</h2>
                <hr>
                <p>${Lang.queryJS('shop.sendDesc')}</p>
                <div class="row">
                    <input type="text" class="shopInput" id="playcoinPlayer" placeholder="${Lang.queryJS('shop.playername')}" maxlength="16" minlength="3">
                    <button class="shopButton" id="playcoinPlayerCheck">${Lang.queryJS('shop.sendCheck')}</button>
                </div>
                <div class="row">
                    <input type="number" class="shopInput" id="playcoinValue" placeholder="${Lang.queryJS('shop.playcoin')}" value="200" min="200" max="${data.data.request.playcoin}">
                    <button class="shopButton" id="playcoinSend" disabled>${Lang.queryJS('shop.sendPC')}</button>
                </div>
            </div>
        </div>
        <h2 class="shopFooter" id="shopFooter">${Lang.queryJS('shop.footer')}</h2>
    </div>`

    document.getElementById("shopContainer").innerHTML = shopHTML;

    document.querySelectorAll(".shopMenu").forEach(element => {
        element.onclick = () => {
            document.querySelectorAll(".shopMenu").forEach(element => {
                element.classList.remove("active")
            })
            element.classList.add("active")
            if (element.innerHTML == Lang.queryJS('shop.profile')) {
                shopPage = "profil"
                $("#shop_beallitasok").slideUp("slow")
                $("#shop_kinezet").slideUp("slow")
                $("#shop_playcoin").slideUp("slow")
                $("#shop_profil").slideDown("slow")
            } else if (element.innerHTML == Lang.queryJS('shop.settings')) {
                shopPage = "beallitasok"
                $("#shop_profil").slideUp("slow")
                $("#shop_kinezet").slideUp("slow")
                $("#shop_playcoin").slideUp("slow")
                $("#shop_beallitasok").slideDown("slow")
            } else if (element.innerHTML == Lang.queryJS('shop.appearance')) {
                shopPage = "kinezet"
                $("#shop_profil").slideUp("slow")
                $("#shop_beallitasok").slideUp("slow")
                $("#shop_playcoin").slideUp("slow")
                $("#shop_kinezet").slideDown("slow")
            } else if (element.innerHTML == Lang.queryJS('shop.send')) {
                shopPage = "playcoin"
                $("#shop_profil").slideUp("slow")
                $("#shop_beallitasok").slideUp("slow")
                $("#shop_kinezet").slideUp("slow")
                $("#shop_playcoin").slideDown("slow")
            }
        }
    })

    selectedSkinFile = null

    document.getElementById('shopFooter').onclick = () => {
        shell.openExternal("https://playclan.net/shop/")
    }

    document.getElementById('skinSelector').onclick = () => {
        let options = {
            title: Lang.queryJS('shop.skinSelect'),
            properties: ['openFile'],
            defaultPath: remote.app.getPath('documents'),
        }
    
        // Show the open (folder) dialog.
        remote.dialog.showOpenDialog(remote.getCurrentWindow(), options)
            .then((result) => {
                // Bail early if user cancelled dialog.
                if (result.canceled) { return }

                selectedSkinFile = result.filePaths[0]
    
                // Get the selected path.
                let path = require('path').basename(selectedSkinFile);
    
                // More processing...
                document.getElementById("skinSelector").innerText = Lang.queryJS('shop.skinSelect') + " (" + path + ")"
            })
    }

    document.getElementById("skinUpload").onclick = () => {
        if (selectedSkinFile != null) {
            filePathToBlob(selectedSkinFile).then(blob => {
                let formData = new FormData();
                formData.append('image', blob, require('path').basename(selectedSkinFile));
                fetch('https://playclan.net/shop/skin_upload_api', {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Authorization': `Bearer ${ConfigManager.getSelectedAccount().accessToken}`
                    }
                }).then(res =>  { 
                    return res.text()
                }).then(res => {
                    if (res == "Success") {
                        showLaunchFailure(Lang.queryJS('shop.uploadSkinHeader'), Lang.queryJS('shop.uploadSkinDesc'))
                        loadShop(shopPage)
                    } else {
                        console.log(res)
                        showLaunchFailure(Lang.queryJS('shop.uploadSkinErrorHeader'), Lang.queryJS('shop.uploadSkinErrorDesc'))
                    }
                })
            })
        } else {
            showLaunchFailure(Lang.queryJS('shop.uploadSkinErrorHeader'), Lang.queryJS('shop.uploadSkinErrorDesc'))
        }
    }

    document.getElementById("ipProtectionCurrent").onclick = async () => {
        const ipFormData = new FormData()
        ipFormData.append('type', 'request')
        ipFormData.append('data', 'ip')

        const ipResponse = await fetch('https://playclan.net/shop/api', {
            method: "POST",
            body: ipFormData,
            headers: {
                'Authorization': `Bearer ${ConfigManager.getSelectedAccount().accessToken}`
            }
        }).then(response => {
            return response.json()
        }).then(data => {
            return data
        })

        const ipUpdateFormData = new FormData()
        ipUpdateFormData.append('type', 'update')
        ipUpdateFormData.append('data', 'ip')
        ipUpdateFormData.append('ip', ipResponse.response["token-ip"]);

        const data = await fetch('https://playclan.net/shop/api', {
            method: "POST",
            body: ipUpdateFormData,
            headers: {
                'Authorization': `Bearer ${ConfigManager.getSelectedAccount().accessToken}`
            }
        }).then(response => {
            return response.json()
        }).then(data => {
            return data
        })

        if (data.data.update) {
            showLaunchFailure(Lang.queryJS('shop.ipProtSuccessHeader'), Lang.queryJS('shop.ipProtSuccessDesc'))
        } else {
            showLaunchFailure(Lang.queryJS('shop.ipProtErrorHeader'), Lang.queryJS('shop.ipProtErrorDesc'))
        }
    }

    document.getElementById("ipProtectionOther").onclick = async () => {
        $("#ipProtectionOtherRow").slideToggle("slow")
    }

    document.getElementById("ipProtectionOtherSubmit").onclick = async () => {
        const ipUpdateFormData = new FormData()
        ipUpdateFormData.append('type', 'update')
        ipUpdateFormData.append('data', 'ip')
        ipUpdateFormData.append('ip', document.getElementById("ipProtectionInput").value);

        const data = await fetch('https://playclan.net/shop/api', {
            method: "POST",
            body: ipUpdateFormData,
            headers: {
                'Authorization': `Bearer ${ConfigManager.getSelectedAccount().accessToken}`
            }
        }).then(response => {
            return response.json()
        }).then(data => {
            return data
        })

        if (data.data.update) {
            showLaunchFailure(Lang.queryJS('shop.ipProtSuccessHeader'), Lang.queryJS('shop.ipProtSuccessDesc'))
        } else {
            showLaunchFailure(Lang.queryJS('shop.ipProtErrorHeader'), Lang.queryJS('shop.ipProtErrorDesc'))
        }
    }

    document.getElementById("ipProtectionDelete").onclick = async () => {
        const ipUpdateFormData = new FormData()
        ipUpdateFormData.append('type', 'update')
        ipUpdateFormData.append('data', 'ip')
        ipUpdateFormData.append('ip', '');

        const data = await fetch('https://playclan.net/shop/api', {
            method: "POST",
            body: ipUpdateFormData,
            headers: {
                'Authorization': `Bearer ${ConfigManager.getSelectedAccount().accessToken}`
            }
        }).then(response => {
            return response.json()
        }).then(data => {
            return data
        })

        if (data.data.update) {
            showLaunchFailure(Lang.queryJS('shop.ipProtSuccessDeleteHeader'), Lang.queryJS('shop.ipProtSuccessDesc'))
        } else {
            showLaunchFailure(Lang.queryJS('shop.ipProtErrorDeleteHeader'), Lang.queryJS('shop.ipProtErrorDesc'))
        }
    }

    for(let ele of document.getElementsByClassName('settingsSelectContainer')) {
        const selectedDiv = ele.getElementsByClassName('settingsSelectSelected')[0]

        selectedDiv.onclick = (e) => {
            e.stopPropagation()
            closeSettingsSelect(e.target)
            e.target.nextElementSibling.toggleAttribute('hidden')
            e.target.classList.toggle('select-arrow-active')
        }
    }

    document.addEventListener('click', closeSettingsSelect)

    if (kinezetPermission.data.request) {
        const color = {
            '1': 'blue',
            '2': 'green',
            '3': 'darkaqua',
            '4': 'red',
            '5': 'purple',
            '6': 'orange',
            '7': 'gray',
            '8': 'darkgray',
            '9': 'lightblue',
            '0': 'black',
            'a': 'lime',
            'b': 'aqua',
            'c': 'lightred',
            'd': 'pink',
            'e': 'yellow',
            'f': 'white'
        }

        const kinezetPrefixText = $('#kinezetPrefixText')
        const kinezetSuffixText = $('#kinezetSuffixText')
        const kinezetUdvozloUzenetElejeText = $('#kinezetUdvozloUzenetElejeText')
        const kinezetUdvozloUzenetVegeText = $('#kinezetUdvozloUzenetVegeText')
        const kinezetKilepoUzenetElejeText = $('#kinezetKilepoUzenetElejeText')
        const kinezetKilepoUzenetVegeText = $('#kinezetKilepoUzenetVegeText')
        const shopChatSzinSelectSelected = $('#shopChatSzinSelectSelected')

        const kinezetPrefixSuffixOutput = $('#kinezetPrefixSuffixOutput')
        const kinezetUdvozloUzenetOutput = $('#kinezetUdvozloUzenetOutput')
        const kinezetKilepoUzenetOutput = $('#kinezetKilepoUzenetOutput')
        const kinezetChatSzinOutput = $('#kinezetChatSzinOutput')
        let append

        kinezetPrefixText.keyup(function() {
            renderKinezetPrefixSuffixText()
        });

        kinezetSuffixText.keyup(function() {
            renderKinezetPrefixSuffixText()
        });

        function renderKinezetPrefixSuffixText() {
            append = ''
            kinezetPrefixSuffixOutput.html(replacers($(kinezetPrefixText).val().trim()) + data.data.request.name + replacers($(kinezetSuffixText).val().trim()))
        }

        kinezetUdvozloUzenetElejeText.keyup(function() {
            renderKinezetUdvozloUzenetText()
        });

        kinezetUdvozloUzenetVegeText.keyup(function() {
            renderKinezetUdvozloUzenetText()
        });

        function renderKinezetUdvozloUzenetText() {
            append = ''
            kinezetUdvozloUzenetOutput.html(replacers($(kinezetUdvozloUzenetElejeText).val() + data.data.request.name + $(kinezetUdvozloUzenetVegeText).val()))
        }

        kinezetKilepoUzenetElejeText.keyup(function() {
            renderKinezetKilepoUzenetText()
        });

        kinezetKilepoUzenetVegeText.keyup(function() {
            renderKinezetKilepoUzenetText()
        });

        function renderKinezetKilepoUzenetText() {
            append = ''
            kinezetKilepoUzenetOutput.html(replacers($(kinezetKilepoUzenetElejeText).val() + data.data.request.name +$(kinezetKilepoUzenetVegeText).val()))
        }

        shopChatSzinSelectSelected.change(function() {
            renderShopChatSzinSelectSelected()
        });

        function renderShopChatSzinSelectSelected() {
            append = ''
            if (getSelectedDropdown("shopChatSzinSelectOptions") == "off" || getSelectedDropdown("shopChatSzinSelectOptions") == undefined) {
                kinezetChatSzinOutput.html(replacers(`§f${data.data.request.name}§7: ` + "§b" + Lang.queryJS('shop.aChatTest')))
            } else {
                kinezetChatSzinOutput.html(replacers(`§f${data.data.request.name}§7: ` + "§" + getSelectedDropdown("shopChatSzinSelectOptions") + Lang.queryJS('shop.aChatTest')))
            }
        }

        function replacers(string) {
            replaced = string
                .replace(/&([a-f0-9])/gi, setColor)
                .replace(/§([a-f0-9])/gi, setColor)
                .replace(/&k/gi, setMagic)
                .replace(/§k/gi, setMagic)
                .replace(/&l/gi, '<strong>')
                .replace(/§l/gi, '<strong>')
                .replace(/&m/gi, '<s>')
                .replace(/§m/gi, '<s>')
                .replace(/&n/gi, '<u>')
                .replace(/§n/gi, '<u>')
                .replace(/&o/gi, '<em>')
                .replace(/§o/gi, '<em>')
                .replace(/§r/gi, resetFormat)
                .replace(/&r/gi, resetFormat)
                .replace(/<nevem>/gi, data.data.request.name)
            return replaced
        }

        function setColor(match) {
            const value = color[match.substr(1, match.length)]
            addClose;
            return '<span class="' + value + '">'
        }

        function setMagic(match) {
            return '<span class="magic"></span>'
        }

        function getMagic() {
            return Math.random().toString(16).substr(1,2).split('.').join("")
        }

        function runMagic() {
            $('.magic').text(getMagic)
                window.setTimeout(runMagic, 60)
            }
            runMagic()

        function resetFormat(match) {
            addClose
            return '</strong></s></u></em><span class="white">'
        }

        function addClose() {
            append = '</span>' + append
        }

        function setUdvozloHangOptions(arr, selected){
            const cont = document.getElementById('shopUdvozloHangSelectOptions')
            cont.innerHTML = ''
            for(let opt of arr) {
                const d = document.createElement('DIV')
                d.innerHTML = opt.name
                d.setAttribute('value', opt.fullName)
                if(opt.fullName === selected) {
                    d.setAttribute('selected', '')
                    document.getElementById('shopUdvozloHangSelectSelected').innerHTML = opt.name
                }
                d.addEventListener('click', function(e) {
                    this.parentNode.previousElementSibling.innerHTML = this.innerHTML
                    for(let sib of this.parentNode.children){
                        sib.removeAttribute('selected')
                    }
                    this.setAttribute('selected', '')
                    closeSettingsSelect()
                })
                cont.appendChild(d)
            }
        }
        
        function setKilepoHangOptions(arr, selected){
            const cont = document.getElementById('shopKilepoHangSelectOptions')
            cont.innerHTML = ''
            for(let opt of arr) {
                const d = document.createElement('DIV')
                d.innerHTML = opt.name
                d.setAttribute('value', opt.fullName)
                if(opt.fullName === selected) {
                    d.setAttribute('selected', '')
                    document.getElementById('shopKilepoHangSelectSelected').innerHTML = opt.name
                }
                d.addEventListener('click', function(e) {
                    this.parentNode.previousElementSibling.innerHTML = this.innerHTML
                    for(let sib of this.parentNode.children){
                        sib.removeAttribute('selected')
                    }
                    this.setAttribute('selected', '')
                    closeSettingsSelect()
                })
                cont.appendChild(d)
            }
        }
        
        function setChatSzinOptions(arr, selected){
            const cont = document.getElementById('shopChatSzinSelectOptions')
            cont.innerHTML = ''
            for(let opt of arr) {
                const d = document.createElement('DIV')
                d.innerHTML = opt.name
                d.setAttribute('value', opt.fullName)
                if(opt.fullName === selected) {
                    d.setAttribute('selected', '')
                    document.getElementById('shopChatSzinSelectSelected').innerHTML = opt.name
                }
                d.addEventListener('click', function(e) {
                    this.parentNode.previousElementSibling.innerHTML = this.innerHTML
                    for(let sib of this.parentNode.children){
                        sib.removeAttribute('selected')
                    }
                    this.setAttribute('selected', '')
                    closeSettingsSelect()
                    renderShopChatSzinSelectSelected()
                })
                cont.appendChild(d)
            }
        }

        setUdvozloHangOptions(
            [
                {fullName: 'off', name: Lang.queryJS('shop.aSoundOff')},
                {fullName: 'block.wooden_door.open', name: Lang.queryJS('shop.aSoundDoor')},
                {fullName: 'block.wooden_trapdoor.open', name: Lang.queryJS('shop.aSoundTrapdoor')},
                {fullName: 'entity.experience_orb.pickup', name: Lang.queryJS('shop.aSoundXp')},
                {fullName: 'entity.player.levelup', name: Lang.queryJS('shop.aSoundLevelup')},
                {fullName: 'entity.item.pickup', name: Lang.queryJS('shop.aSoundItem')},
            ],
            data.data.request.udvozlo_hang
        )

        setKilepoHangOptions(
            [
                {fullName: 'off', name: Lang.queryJS('shop.aSoundOff')},
                {fullName: 'block.wooden_door.open', name: Lang.queryJS('shop.aSoundDoor')},
                {fullName: 'block.wooden_trapdoor.open', name: Lang.queryJS('shop.aSoundTrapdoor')},
                {fullName: 'entity.experience_orb.pickup', name: Lang.queryJS('shop.aSoundXp')},
                {fullName: 'entity.player.levelup', name: Lang.queryJS('shop.aSoundLevelup')},
                {fullName: 'entity.item.pickup', name: Lang.queryJS('shop.aSoundItem')},
            ],
            data.data.request.kilepo_hang
        )

        setChatSzinOptions(
            [
                {fullName: '0', name: Lang.queryJS('shop.aBlack')},
                {fullName: '1', name: Lang.queryJS('shop.aDarkBlue')},
                {fullName: '2', name: Lang.queryJS('shop.aDarkGreen')},
                {fullName: '3', name: Lang.queryJS('shop.aDarkAqua')},
                {fullName: '4', name: Lang.queryJS('shop.aDarkRed')},
                {fullName: '5', name: Lang.queryJS('shop.aDarkPurple')},
                {fullName: '6', name: Lang.queryJS('shop.aGold')},
                {fullName: '7', name: Lang.queryJS('shop.aGray')},
                {fullName: '8', name: Lang.queryJS('shop.aDarkGray')},
                {fullName: '9', name: Lang.queryJS('shop.aBlue')},
                {fullName: 'a', name: Lang.queryJS('shop.aGreen')},
                {fullName: 'b', name: Lang.queryJS('shop.aAqua')},
                {fullName: 'c', name: Lang.queryJS('shop.aRed')},
                {fullName: 'd', name: Lang.queryJS('shop.aLightPurple')},
                {fullName: 'e', name: Lang.queryJS('shop.aYellow')},
                {fullName: 'f', name: Lang.queryJS('shop.aWhite')},
            ],
            data.data.request.chat_szin
        )

        renderKinezetPrefixSuffixText()
        renderKinezetUdvozloUzenetText()
        renderKinezetKilepoUzenetText()
        renderShopChatSzinSelectSelected()

        document.getElementById("kinezetRangSubmit").onclick = async () => {
            const rang = document.getElementById("kinezetRangText").value.trim()
            const callback = await updateSpecificSetting(ConfigManager.getSelectedAccount().accessToken, 'rang', 'rang', rang)
            if (callback.data.update.callback == "success") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceSuccess'), Lang.queryJS('shop.updateAppearanceSuccessDesc'))
            } else if (callback.data.update.callback == "limit") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc') + ' ' + callback.data.update.limit)
            } else {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc'))
            }
        }

        document.getElementById("kinezetPrefixSubmit").onclick = async () => {
            const prefix = document.getElementById("kinezetPrefixText").value.trim()
            const suffix = document.getElementById("kinezetSuffixText").value.trim()
            const callback = await updateSpecificSetting(ConfigManager.getSelectedAccount().accessToken, 'prefixsuffix', 'prefix', prefix, 'suffix', suffix)
            if (callback.data.update.callback == "success") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceSuccess'), Lang.queryJS('shop.updateAppearanceSuccessDesc'))
            } else if (callback.data.update.callback == "limit") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc') + ' ' + callback.data.update.limit)
            } else {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc'))
            }
        }

        document.getElementById("kinezetUdvozloUzenetSubmit").onclick = async () => {
            const udvozloUzenetEleje = document.getElementById("kinezetUdvozloUzenetElejeText").value.trim()
            const udvozloUzenetVege = document.getElementById("kinezetUdvozloUzenetVegeText").value.trim()
            const callback = await updateSpecificSetting(ConfigManager.getSelectedAccount().accessToken, 'udvozlouzenet', 'udvozlouzenet', udvozloUzenetEleje + "<nevem>" + udvozloUzenetVege)
            if (callback.data.update.callback == "success") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceSuccess'), Lang.queryJS('shop.updateAppearanceSuccessDesc'))
            } else if (callback.data.update.callback == "limit") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc') + ' ' + callback.data.update.limit)
            } else {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc'))
            }
        }

        document.getElementById("kinezetKilepoUzenetSubmit").onclick = async () => {
            const kilepoUzenetEleje = document.getElementById("kinezetKilepoUzenetElejeText").value.trim()
            const kilepoUzenetVege = document.getElementById("kinezetKilepoUzenetVegeText").value.trim()
            const callback = await updateSpecificSetting(ConfigManager.getSelectedAccount().accessToken, 'kilepouzenet', 'kilepouzenet', kilepoUzenetEleje + "<nevem>" + kilepoUzenetVege)
            if (callback.data.update.callback == "success") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceSuccess'), Lang.queryJS('shop.updateAppearanceSuccessDesc'))
            } else if (callback.data.update.callback == "limit") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc') + ' ' + callback.data.update.limit)
            } else {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc'))
            }
        }

        document.getElementById("kinezetUdvozloHangSubmit").onclick = async () => {
            const udvozloHang = getSelectedDropdown("shopUdvozloHangSelectOptions")
            const callback = await updateSpecificSetting(ConfigManager.getSelectedAccount().accessToken, 'udvozlohang', 'udvozlohang', udvozloHang)
            if (callback.data.update.callback == "success") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceSuccess'), Lang.queryJS('shop.updateAppearanceSuccessDesc'))
            } else if (callback.data.update.callback == "limit") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc') + ' ' + callback.data.update.limit)
            } else {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc'))
            }
        }

        document.getElementById("kinezetKilepoHangSubmit").onclick = async () => {
            const kilepoHang = getSelectedDropdown("shopKilepoHangSelectOptions")
            const callback = await updateSpecificSetting(ConfigManager.getSelectedAccount().accessToken, 'kilepohang', 'kilepohang', kilepoHang)
            if (callback.data.update.callback == "success") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceSuccess'), Lang.queryJS('shop.updateAppearanceSuccessDesc'))
            } else if (callback.data.update.callback == "limit") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc') + ' ' + callback.data.update.limit)
            } else {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc'))
            }
        }

        document.getElementById("kinezetChatSzinSubmit").onclick = async () => {
            const chatSzin = getSelectedDropdown("shopChatSzinSelectOptions")
            const callback = await updateSpecificSetting(ConfigManager.getSelectedAccount().accessToken, 'chatszin', 'chatszin', chatSzin)
            if (callback.data.update.callback == "success") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceSuccess'), Lang.queryJS('shop.updateAppearanceSuccessDesc'))
            } else if (callback.data.update.callback == "limit") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc') + ' ' + callback.data.update.limit)
            } else {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc'))
            }
        }

        document.getElementById("kinezetRangReset").onclick = async () => {
            const callback = await updateSpecificSetting(ConfigManager.getSelectedAccount().accessToken, 'rang', 'rang', '')
            if (callback.data.update.callback == "success") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceSuccess'), Lang.queryJS('shop.updateAppearanceSuccessDesc'))
            } else if (callback.data.update.callback == "limit") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc') + ' ' + callback.data.update.limit)
            } else {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc'))
            }
        }

        document.getElementById("kinezetPrefixReset").onclick = async () => {
            const callback = await updateSpecificSetting(ConfigManager.getSelectedAccount().accessToken, 'prefixsuffix', 'prefix', '', 'suffix', '')
            if (callback.data.update.callback == "success") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceSuccess'), Lang.queryJS('shop.updateAppearanceSuccessDesc'))
            } else if (callback.data.update.callback == "limit") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc') + ' ' + callback.data.update.limit)
            } else {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc'))
            }
        }

        document.getElementById("kinezetUdvozloUzenetReset").onclick = async () => {
            const callback = await updateSpecificSetting(ConfigManager.getSelectedAccount().accessToken, 'udvozlouzenet', 'udvozlouzenet', '')
            if (callback.data.update.callback == "success") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceSuccess'), Lang.queryJS('shop.updateAppearanceSuccessDesc'))
            } else if (callback.data.update.callback == "limit") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc') + ' ' + callback.data.update.limit)
            } else {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc'))
            }
        }

        document.getElementById("kinezetKilepoUzenetReset").onclick = async () => {
            const callback = await updateSpecificSetting(ConfigManager.getSelectedAccount().accessToken, 'kilepouzenet', 'kilepouzenet', '')
            if (callback.data.update.callback == "success") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceSuccess'), Lang.queryJS('shop.updateAppearanceSuccessDesc'))
            } else if (callback.data.update.callback == "limit") {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc') + ' ' + callback.data.update.limit)
            } else {
                showLaunchFailure(Lang.queryJS('shop.updateAppearanceError'), Lang.queryJS('shop.updateAppearanceErrorCharDesc'))
            }
        }
    }

    document.getElementById("playcoinPlayer").onkeyup = (e) => {
        const check = document.getElementById("playcoinPlayer")
        check.classList.remove('error')
        check.classList.remove('success')
        document.getElementById("playcoinSend").disabled = true
    }

    document.getElementById("playcoinPlayerCheck").onclick = async () => {
        const check = document.getElementById("playcoinPlayer")
        if (check.value.length >= 3 && check.value.length <= 16) {
            const callback = await checkExistingPlayer(ConfigManager.getSelectedAccount().accessToken, check.value)
            if (callback.data.request == 1) {
                check.classList.remove('error')
                check.classList.add('success')
                document.getElementById("playcoinSend").disabled = false
            } else {
                check.classList.add('error')
                check.classList.remove('success')
                document.getElementById("playcoinSend").disabled = true
            }
        }
    }

    document.getElementById("playcoinSend").onclick = async () => {
        const check = document.getElementById("playcoinPlayer")
        const player = document.getElementById("playcoinPlayer").value
        const playcoin = document.getElementById("playcoinValue").value
        const callback = await sendPC(ConfigManager.getSelectedAccount().accessToken, player, playcoin)
        check.classList.remove('error')
        check.classList.remove('success')
        document.getElementById("playcoinSend").disabled = true
        if (callback.data.update == true) {
            showLaunchFailure(Lang.queryJS('shop.sendPCSuccess'), Lang.queryJS('shop.sendPCSuccessDesc'))
            loadShop(shopPage)
        } else if (callback.data.update == "ratelimit") {
            showLaunchFailure(Lang.queryJS('shop.sendPCError'), Lang.queryJS('shop.sendPCErrorRateLimit'))
        } else {
            showLaunchFailure(Lang.queryJS('shop.sendPCError'), Lang.queryJS('shop.sendPCErrorDesc'))
        }
    }

    document.getElementById('shopRefresh').onclick = async () => loadShop(shopPage)
}

function closeSettingsSelect(el){
    for(let ele of document.getElementsByClassName('settingsSelectContainer')) {
        const selectedDiv = ele.getElementsByClassName('settingsSelectSelected')[0]
        const optionsDiv = ele.getElementsByClassName('settingsSelectOptions')[0]

        if(!(selectedDiv === el)) {
            selectedDiv.classList.remove('select-arrow-active')
            optionsDiv.setAttribute('hidden', '')
        }
    }
}

function getSelectedDropdown(id) {
    const dropdown = document.getElementById(id)
    for (let opt of dropdown.children) {
        if (opt.hasAttribute('selected')) {
            return opt.getAttribute('value')
        }
    }
}

function filePathToBlob(filePath) {
    return new Promise((resolve, reject) => {
      require('fs').readFile(filePath, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
  
        const blob = new Blob([data], { type: 'application/octet-stream' });
        resolve(blob);
      });
    });
  }

//Shop button
document.getElementById('shopButton').onclick = async () => {
    if (ConfigManager.getSelectedAccount().type == 'playclan') {
        $('#landingContainer *').removeAttr('tabindex')
        if (shopActive) {
            updateSelectedAccount(ConfigManager.getSelectedAccount())
            $('#landingContainer *').removeAttr('tabindex')
            $('#shopContainer *').attr('tabindex', '-1')
        } else {

            shopPage = "profil"
            loadShop(shopPage)

            $('#landingContainer *').attr('tabindex', '-1')
            $('#shopContainer, #shopContainer *').removeAttr('tabindex')
        }

        slideShop(!shopActive)
        shopActive = !shopActive
    } else {
        showLaunchFailure(Lang.queryJS('shop.loginError'), Lang.queryJS('shop.loginErrorDesc'))
    }
}


document.getElementById('image_seal_container').onclick = async () => {
    if (!document.getElementById('image_seal_container').disabled) {
        if (!document.getElementById('image_seal_container').getAttribute('update')) {
            await prepareSettings()
            switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
                settingsNavItemListener(document.getElementById('settingsNavAbount'), false)
            })
        }
    }
}

// Bind news button.
document.getElementById('newsButton').onclick = () => {
    // Toggle tabbing.
    if(newsActive){
        $('#landingContainer *').removeAttr('tabindex')
        $('#newsContainer *').attr('tabindex', '-1')
    } else {
        $('#landingContainer *').attr('tabindex', '-1')
        $('#newsContainer, #newsContainer *, #lower, #lower #center *').removeAttr('tabindex')
        if(newsAlertShown){
            $('#newsButtonAlert').fadeOut(2000)
            newsAlertShown = false
            ConfigManager.setNewsCacheDismissed(true)
            ConfigManager.save()
        }
    }
    slide_(!newsActive)
    newsActive = !newsActive
}

// Array to store article meta.
let newsArr = null

// News load animation listener.
let newsLoadingListener = null

/**
 * Set the news loading animation.
 * 
 * @param {boolean} val True to set loading animation, otherwise false.
 */
function setNewsLoading(val){
    if(val){
        const nLStr = Lang.queryJS('news.loading')
        let dotStr = '..'
        nELoadSpan.innerHTML = nLStr + dotStr
        newsLoadingListener = setInterval(() => {
            if(dotStr.length >= 3){
                dotStr = ''
            } else {
                dotStr += '.'
            }
            nELoadSpan.innerHTML = nLStr + dotStr
        }, 750)
    } else {
        if(newsLoadingListener != null){
            clearInterval(newsLoadingListener)
            newsLoadingListener = null
        }
    }
}

// Bind retry button.
newsErrorRetry.onclick = () => {
    $('#newsErrorFailed').fadeOut(250, () => {
        initNews()
        $('#newsErrorLoading').fadeIn(250)
    })
}

newsArticleContentScrollable.onscroll = (e) => {
    if(e.target.scrollTop > Number.parseFloat($('.newsArticleSpacerTop').css('height'))){
        newsContent.setAttribute('scrolled', '')
    } else {
        newsContent.removeAttribute('scrolled')
    }
}

/**
 * Reload the news without restarting.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
function reloadNews(){
    return new Promise((resolve, reject) => {
        $('#newsContent').fadeOut(250, () => {
            $('#newsErrorLoading').fadeIn(250)
            initNews().then(() => {
                resolve()
            })
        })
    })
}

let newsAlertShown = false

/**
 * Show the news alert indicating there is new news.
 */
function showNewsAlert(){
    newsAlertShown = true
    $(newsButtonAlert).fadeIn(250)
}

/**
 * Initialize News UI. This will load the news and prepare
 * the UI accordingly.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
async function initNews(){

    setNewsLoading(true)

    const news = await loadNews()

    newsArr = news?.articles || null

    if(newsArr == null){
        // News Loading Failed
        setNewsLoading(false)

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorFailed').fadeIn(250).promise()

    } else if(newsArr.length === 0) {
        // No News Articles
        setNewsLoading(false)

        ConfigManager.setNewsCache({
            date: null,
            content: null,
            dismissed: false
        })
        ConfigManager.save()

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorNone').fadeIn(250).promise()
    } else {
        // Success
        setNewsLoading(false)

        const lN = newsArr[0]
        const cached = ConfigManager.getNewsCache()
        let newHash = await digestMessage(lN.content)
        let newDate = new Date(lN.date)
        let isNew = false

        if(cached.date != null && cached.content != null){

            if(new Date(cached.date) >= newDate){

                // Compare Content
                if(cached.content !== newHash){
                    isNew = true
                    showNewsAlert()
                } else {
                    if(!cached.dismissed){
                        isNew = true
                        showNewsAlert()
                    }
                }

            } else {
                isNew = true
                showNewsAlert()
            }

        } else {
            isNew = true
            showNewsAlert()
        }

        if(isNew){
            ConfigManager.setNewsCache({
                date: newDate.getTime(),
                content: newHash,
                dismissed: false
            })
            ConfigManager.save()
        }

        const switchHandler = (forward) => {
            let cArt = parseInt(newsContent.getAttribute('article'))
            let nxtArt = forward ? (cArt >= newsArr.length-1 ? 0 : cArt + 1) : (cArt <= 0 ? newsArr.length-1 : cArt - 1)
    
            displayArticle(newsArr[nxtArt], nxtArt+1)
        }

        document.getElementById('newsNavigateRight').onclick = () => { switchHandler(true) }
        document.getElementById('newsNavigateLeft').onclick = () => { switchHandler(false) }
        await $('#newsErrorContainer').fadeOut(250).promise()
        displayArticle(newsArr[0], 1)
        await $('#newsContent').fadeIn(250).promise()
    }


}

/**
 * Add keyboard controls to the news UI. Left and right arrows toggle
 * between articles. If you are on the landing page, the up arrow will
 * open the news UI.
 */
document.addEventListener('keydown', (e) => {
    if(newsActive){
        if(e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
            document.getElementById(e.key === 'ArrowRight' ? 'newsNavigateRight' : 'newsNavigateLeft').click()
        }
        // Interferes with scrolling an article using the down arrow.
        // Not sure of a straight forward solution at this point.
        // if(e.key === 'ArrowDown'){
        //     document.getElementById('newsButton').click()
        // }
    } else {
        if(getCurrentView() === VIEWS.landing){
            if(e.key === 'ArrowUp'){
                document.getElementById('newsButton').click()
            }
        }
    }
})

/**
 * Display a news article on the UI.
 * 
 * @param {Object} articleObject The article meta object.
 * @param {number} index The article index.
 */
function displayArticle(articleObject, index){
    newsArticleTitle.innerHTML = articleObject.title
    newsArticleTitle.href = articleObject.link
    newsArticleAuthor.innerHTML = 'Írta: ' + articleObject.author
    newsArticleDate.innerHTML = articleObject.displayDate
    newsArticleComments.innerHTML = articleObject.comments
    newsArticleComments.href = articleObject.commentsLink
    newsArticleContentScrollable.innerHTML = '<div id="newsArticleContentWrapper"><div class="newsArticleSpacerTop"></div>' + articleObject.content + '<div class="newsArticleSpacerBot"></div></div>'
    Array.from(newsArticleContentScrollable.getElementsByClassName('bbCodeSpoilerButton')).forEach(v => {
        v.onclick = () => {
            const text = v.parentElement.getElementsByClassName('bbCodeSpoilerText')[0]
            text.style.display = text.style.display === 'block' ? 'none' : 'block'
        }
    })
    newsNavigationStatus.innerHTML = index + ' / ' + newsArr.length
    newsContent.setAttribute('article', index-1)
}

/**
 * Load news information from the RSS feed specified in the
 * distribution index.
 */
async function loadNews(){

    const distroData = await DistroAPI.getDistribution()
    if(!distroData.rawDistribution.rss) {
        loggerLanding.debug('No RSS feed provided.')
        return null
    }

    const promise = new Promise((resolve, reject) => {
        
        const newsFeed = distroData.rawDistribution.rss
        const newsHost = new URL(newsFeed).origin + '/'
        $.ajax({
            url: newsFeed + '?time=' + Date.now(),
            success: (data) => {
                const items = $(data).find('item')
                const articles = []

                for(let i=0; i<items.length; i++){
                // JQuery Element
                    const el = $(items[i])

                    // Resolve date.
                    const date = new Date(el.find('pubDate').text()).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})

                    const displayDate = new Date(el.find('pubDate').text()).toLocaleDateString('hu-HU', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})

                    // Resolve comments.
                    let comments = el.find('slash\\:comments').text() || '0'
                    comments = comments + ' ' + Lang.queryJS('news.comments')

                    // Fix relative links in content.
                    let content = el.find('content\\:encoded').text()
                    let regex = /src="(?!http:\/\/|https:\/\/)(.+?)"/g
                    let matches
                    while((matches = regex.exec(content))){
                        content = content.replace(`"${matches[1]}"`, `"${newsHost + matches[1]}"`)
                    }

                    let link   = el.find('link').text()
                    let title  = el.find('title').text()
                    let author = el.find('dc\\:creator').text()

                    // Generate article.
                    articles.push(
                        {
                            link,
                            title,
                            date,
                            displayDate,
                            author,
                            content,
                            comments,
                            commentsLink: link + '#comments'
                        }
                    )
                }
                resolve({
                    articles
                })
            },
            timeout: 2500
        }).catch(err => {
            resolve({
                articles: null
            })
        })
    })

    return await promise
}

let isGameRunning = false

ipcRenderer.on('game-state', (event, arg) => {
    isGameRunning = arg
})

ipcRenderer.on('join-server', (event, server) => {
    joinServer(server)
})

function joinServer(server) {
    const accLen = Object.keys(ConfigManager.getAuthAccounts()).length
    if (accLen >= 1) {
        if (isGameRunning) {
            setOverlayContent(
                "game is running",
                server,
                "Ok"
            )
            setOverlayHandler(async () => {
                if (webPort != null) {
                    const myHeaders = new Headers();
                    myHeaders.append("Content-Type", "application/x-www-form-urlencoded");

                    const urlencoded = new URLSearchParams();
                    urlencoded.append("connect", "SkyBlock");
                    urlencoded.append("token", "ok");

                    const requestOptions = {
                        method: "POST",
                        headers: myHeaders,
                        body: urlencoded,
                        redirect: "follow"
                    };

                    fetch("http://127.0.0.1:" + webPort + "/connect", requestOptions)
                    .then((response) => response.text())
                    .then((result) => console.log(result))
                    .catch((error) => console.error(error));
                }
                proc
                toggleOverlay(false, false)
            })
            setDismissHandler(() => {
                toggleOverlay(false, false)
            })
            toggleOverlay(true, true)
            toggleLaunchArea(false)
        } else {
            setOverlayContent(
                "game is not running",
                server,
                "Ok"
            )
            setOverlayHandler(() => {
                document.getElementById('launch_button').click()
                toggleOverlay(false, false)
            })
            setDismissHandler(() => {
                toggleOverlay(false, false)
            })
            toggleOverlay(true, true)
            toggleLaunchArea(false)
        }
    }
}