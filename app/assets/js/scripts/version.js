/**
 * Script for version.ejs
 */
document.getElementById('versionClose').addEventListener('click', e => {
    ConfigManager.setLauncherVersion(remote.app.getVersion())
    ConfigManager.save()
    switchView(VIEWS.version, VIEWS.landing, 500, 500)
})