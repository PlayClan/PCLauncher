const loginOptionsCancelButton2 = document.getElementById('loginOptionCancelButton2')

loginOptionsCancelButton2.onclick = (e) => {
    switchView(getCurrentView(), loginOptionsViewOnLoginCancel, 500, 500, () => {})
}