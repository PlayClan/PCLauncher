/**
 * Script for language.ejs
 */
document.getElementById('languageButtonHU').addEventListener('click', e => {
    let sel = 'hu_HU'

    if (ConfigManager.getLanguage() !== sel) {
        Lang.selectLanguage(sel)
        ConfigManager.setLanguage(sel)
    }
    switchView(VIEWS.language, VIEWS.welcome)
})

document.getElementById('languageButtonEN').addEventListener('click', e => {
    let sel = 'en_US'

    if (ConfigManager.getLanguage() !== sel) {
        Lang.selectLanguage(sel)
        ConfigManager.setLanguage(sel)
    }
    switchView(VIEWS.language, VIEWS.welcome)
})