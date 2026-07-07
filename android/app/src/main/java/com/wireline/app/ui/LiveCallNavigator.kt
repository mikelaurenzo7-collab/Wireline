package com.wireline.app.ui

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Bridges Telecom answer and the Calls tab into [LiveCallScreen]. */
object LiveCallNavigator {
    data class Request(
        val callId: String?,
        val autoHandoff: Boolean = false,
    )

    private val _request = MutableStateFlow<Request?>(null)
    val request: StateFlow<Request?> = _request.asStateFlow()

    fun present(callId: String?, autoHandoff: Boolean = false) {
        _request.value = Request(callId, autoHandoff)
    }

    fun dismiss() {
        _request.value = null
    }

    fun clearAutoHandoff() {
        val current = _request.value ?: return
        if (current.autoHandoff) {
            _request.value = current.copy(autoHandoff = false)
        }
    }
}
