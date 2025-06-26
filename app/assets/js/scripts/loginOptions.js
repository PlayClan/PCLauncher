const loginOptionsCancelContainer = document.getElementById('loginOptionCancelContainer')
const loginOptionMicrosoft = document.getElementById('loginOptionMicrosoft')
const loginOptionPlayClan = document.getElementById('loginOptionPlayClan')
const loginOptionsCancelButton = document.getElementById('loginOptionCancelButton')

let loginOptionsCancellable = false

let loginOptionsViewOnLoginSuccess
let loginOptionsViewOnLoginCancel
let loginOptionsViewOnCancel
let loginOptionsViewCancelHandler

function loginOptionsCancelEnabled(val){
    if(val){
        $(loginOptionsCancelContainer).show()
        loginOptionsCancelButton.onclick = (e) => {
            switchView(getCurrentView(), VIEWS.landing, 500, 500, () => {
                updateSelectedAccount(ConfigManager.getSelectedAccount())
            })
        }
    } else {
        $(loginOptionsCancelContainer).hide()
    }
}

loginOptionMicrosoft.onclick = (e) => {
    switchView(getCurrentView(), VIEWS.waiting, 500, 500, () => {
        ipcRenderer.send(
            MSFT_OPCODE.OPEN_LOGIN,
            loginOptionsViewOnLoginSuccess,
            loginOptionsViewOnLoginCancel
        )
    })
}

loginOptionPlayClan.onclick = (e) => {
    switchView(getCurrentView(), VIEWS.waitingpc, 500, 500, () => {
        ipcRenderer.send(
            PC_OPCODE.OPEN_LOGIN,
            loginOptionsViewOnLoginSuccess,
            loginOptionsViewOnLoginCancel
        )
    })
}