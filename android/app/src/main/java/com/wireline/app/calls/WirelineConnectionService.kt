package com.wireline.app.calls

import android.net.Uri
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager

class WirelineConnectionService : ConnectionService() {
    override fun onCreateIncomingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest,
    ): Connection {
        val extras = request.extras
        val callId = extras.getString(EXTRA_CALL_ID).orEmpty()
        val from = extras.getString(EXTRA_FROM).orEmpty()
        val agentName = extras.getString(EXTRA_AGENT_NAME)
        return WirelineCallConnection(applicationContext, callId).apply {
            setAddress(Uri.fromParts("tel", from, null), TelecomManager.PRESENTATION_ALLOWED)
            setCallerDisplayName(agentName ?: "BotBound call", TelecomManager.PRESENTATION_ALLOWED)
            setRinging()
        }
    }

    companion object {
        const val EXTRA_CALL_ID = "com.wireline.app.extra.CALL_ID"
        const val EXTRA_FROM = "com.wireline.app.extra.FROM"
        const val EXTRA_AGENT_NAME = "com.wireline.app.extra.AGENT_NAME"
    }
}
