package com.wireline.app.calls

import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager

object WirelineTelecom {
    private const val PHONE_ACCOUNT_ID = "wireline_self_managed"

    fun ensurePhoneAccount(context: Context) {
        val manager = context.getSystemService(TelecomManager::class.java) ?: return
        val handle = phoneAccountHandle(context)
        val account = PhoneAccount.builder(handle, "BotBound")
            .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
            .build()
        runCatching { manager.registerPhoneAccount(account) }
    }

    fun reportIncomingCall(context: Context, callId: String, from: String, agentName: String?) {
        ensurePhoneAccount(context)
        val manager = context.getSystemService(TelecomManager::class.java) ?: return
        val extras = Bundle().apply {
            putString(WirelineConnectionService.EXTRA_CALL_ID, callId)
            putString(WirelineConnectionService.EXTRA_FROM, from)
            putString(WirelineConnectionService.EXTRA_AGENT_NAME, agentName)
        }
        runCatching { manager.addNewIncomingCall(phoneAccountHandle(context), extras) }
    }

    private fun phoneAccountHandle(context: Context): PhoneAccountHandle =
        PhoneAccountHandle(
            ComponentName(context, WirelineConnectionService::class.java),
            PHONE_ACCOUNT_ID,
        )
}
