package com.wireline.app.calls

import android.content.Context
import android.telecom.Connection
import android.telecom.DisconnectCause
import com.wireline.app.data.WirelineApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class WirelineCallConnection(
    context: Context,
    private val callId: String,
) : Connection() {
    private val appContext = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    init {
        connectionProperties = PROPERTY_SELF_MANAGED
        connectionCapabilities = CAPABILITY_MUTE or CAPABILITY_SUPPORT_HOLD
        audioModeIsVoip = true
    }

    override fun onAnswer() {
        scope.launch {
            val result = runCatching { WirelineApi(appContext).handoffCall(callId) }
            if (result.isSuccess) {
                setActive()
            } else {
                setDisconnected(DisconnectCause(DisconnectCause.ERROR, "Wireline handoff failed"))
                destroy()
            }
        }
    }

    override fun onReject() {
        setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
        destroy()
    }

    override fun onDisconnect() {
        setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
        destroy()
    }

    override fun destroy() {
        scope.cancel()
        super.destroy()
    }
}
