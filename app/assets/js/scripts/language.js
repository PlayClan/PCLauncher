/**
 * Script for language.ejs
 */
document.getElementById('languageButtonHU').addEventListener('click', e => {
    let sel = 'hu_HU'

    if (ConfigManager.getLanguage() !== sel) {
        Lang.selectLanguage(sel, false)
        Lang.updateDOM()
        ConfigManager.setLanguage(sel)
    }
})

document.getElementById('languageButtonEN').addEventListener('click', e => {
    let sel = 'en_US'

    if (ConfigManager.getLanguage() !== sel) {
        Lang.selectLanguage(sel, false)
        Lang.updateDOM()
        ConfigManager.setLanguage(sel)
    }
})

document.getElementById('languageNext').addEventListener('click', e => {
    ConfigManager.setLanguageAsked(true)
    ConfigManager.save()
    if (ConfigManager.getSelectedAccount() == null) {
        switchView(VIEWS.language, VIEWS.welcome, 500, 500)
    } else {
        if (ConfigManager.getLauncherVersion() !== remote.app.getVersion()) {
            switchView(VIEWS.language, VIEWS.version, 500, 500)
        } else {
            switchView(VIEWS.language, VIEWS.landing, 500, 500)
        }
    }
})