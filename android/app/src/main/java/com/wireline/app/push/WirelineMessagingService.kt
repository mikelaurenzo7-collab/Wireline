package com.wireline.app.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.wireline.app.calls.WirelineTelecom
import com.wireline.app.data.WirelineApi
import com.wireline.app.device.DeviceActionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class WirelineMessagingService : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        scope.launch {
            runCatching { WirelineApi(applicationContext).registerDevice(token) }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        when (data["type"]) {
            "incoming_call" -> WirelineTelecom.reportIncomingCall(
                context = applicationContext,
                callId = data["callId"].orEmpty(),
                from = data["from"].orEmpty(),
                agentName = data["agentName"],
            )

            "call_recap" -> WirelineNotifications.showCallRecap(
                context = applicationContext,
                callId = data["callId"],
                title = message.notification?.title ?: "Call recap",
                body = message.notification?.body,
            )

            "device_action" -> DeviceActionHandler.handle(
                context = applicationContext,
                action = data["action"].orEmpty(),
                argsJson = data["args"].orEmpty(),
            )
        }
    }
}
