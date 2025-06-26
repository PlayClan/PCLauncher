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
    switchView(VIEWS.language, VIEWS.welcome, 500, 500)
})