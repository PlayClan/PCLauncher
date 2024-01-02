const fs = require('fs-extra')
const path = require('path')
const toml = require('toml')
const merge = require('lodash.merge')

const sysRoot = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME)
const dataPath = path.join(sysRoot, '.pclauncher')
const launcherDir = path.join(sysRoot, 'PlayClan Launcher')

const configPath = path.join(launcherDir, 'config.json')
const configPathLEGACY = path.join(dataPath, 'config.json')
const firstLaunch = !fs.existsSync(configPath) && !fs.existsSync(configPathLEGACY)

let lang

exports.supportedLanguages = [
    {fullName: 'Magyar (HU)', code: 'hu_HU'},
    {fullName: 'English (US)', code: 'en_US'},
]

exports.loadLanguage = function(id){
    lang = merge(lang || {}, toml.parse(fs.readFileSync(path.join(__dirname, '..', 'lang', `${id}.toml`))) || {})
}

exports.query = function(id, placeHolders){
    let query = id.split('.')
    let res = lang
    for(let q of query){
        res = res[q]
    }
    let text = res === lang ? '' : res
    if (placeHolders) {
        Object.entries(placeHolders).forEach(([key, value]) => {
            text = text.replace(`{${key}}`, value)
        })
    }
    return text
}

exports.queryJS = function(id, placeHolders){
    return exports.query(`js.${id}`, placeHolders)
}

exports.queryEJS = function(id, placeHolders){
    return exports.query(`ejs.${id}`, placeHolders)
}

exports.setupLanguage = function(){
    // Load Language Files
    if (!firstLaunch) {
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'UTF-8'))
            exports.loadLanguage(config.settings.launcher.language)
        } catch (err){
            logger.error(err)
            logger.info('Configuration file contains malformed JSON or is corrupt.')
            exports.loadLanguage('hu_HU')
        }
    } else {
        exports.loadLanguage('hu_HU')
    }
    // Uncomment this when translations are ready
    //exports.loadLanguage('xx_XX')

    // Load Custom Language File for Launcher Customizer
    exports.loadLanguage('_custom')
}

exports.selectLanguage = function(langCode){
    // Load selected language
    exports.loadLanguage(langCode)
}