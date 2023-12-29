// Work in progress
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('DiscordWrapper')

const { Client } = require('discord-rpc-patch')

let client
let activity

exports.initRPC = function(genSettings, servSettings, initialDetails = Lang.queryJS('discord.waiting')){
    client = new Client({ transport: 'ipc' })
    activity = {
        details: initialDetails,
        state: servSettings.shortId,
        largeImageKey: servSettings.largeImageKey,
        largeImageText: servSettings.largeImageText + " v" + remote.app.getVersion(),
        smallImageKey: "https://playclan.hu/shop/player_skin?nev=" + ConfigManager.getSelectedAccount().username + "&time=" + Date.now(),
        smallImageText: ConfigManager.getSelectedAccount().username,
        startTimestamp: new Date().getTime(),
        instance: false,
        buttons: [
            {
                label: Lang.queryJS('discord.discord'),
                url: 'https://discord.gg/uahcEgvKgX',
            },
            {
                label: Lang.queryJS('discord.website'),
                url: "https://playclan.hu",
            },
        ]
    }

    client.on('ready', () => {
        if (ConfigManager.getAllowDiscord()) {
            logger.info('Discord RPC Connected')
            client.setActivity(activity)
        }
    })
    
    client.login({clientId: genSettings.clientId}).catch(error => {
        if(error.message.includes('ENOENT')) {
            logger.info('Unable to initialize Discord Rich Presence, no client detected.')
        } else {
            logger.info('Unable to initialize Discord Rich Presence: ' + error.message, error)
        }
    })
}

exports.updateDetails = function(details){
    if (ConfigManager.getAllowDiscord()) {
        activity.details = details
        client.setActivity(activity)
    }
}

exports.shutdownRPC = function(){
    if(!client) return
    client.clearActivity()
    client.destroy()
    client = null
    activity = null
}