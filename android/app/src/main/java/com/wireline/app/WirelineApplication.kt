package com.wireline.app

import android.app.Application
import com.wireline.app.calls.WirelineTelecom
import com.wireline.app.push.WirelineNotifications

class WirelineApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        WirelineNotifications.ensureChannels(this)
        WirelineTelecom.ensurePhoneAccount(this)
    }
}
