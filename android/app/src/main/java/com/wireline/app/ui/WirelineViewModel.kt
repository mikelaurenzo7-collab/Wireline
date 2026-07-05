package com.wireline.app.ui

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.wireline.app.data.ActiveCall
import com.wireline.app.data.Agent
import com.wireline.app.data.MobileMe
import com.wireline.app.data.RecentCall
import com.wireline.app.data.WalletResponse
import com.wireline.app.data.WirelineApi
import kotlinx.coroutines.launch

data class WirelineUiState(
    val isSignedIn: Boolean = false,
    val isWorking: Boolean = false,
    val error: String? = null,
    val me: MobileMe? = null,
    val agents: List<Agent> = emptyList(),
    val activeCalls: List<ActiveCall> = emptyList(),
    val recentCalls: List<RecentCall> = emptyList(),
    val wallet: WalletResponse? = null,
    val handoffPhone: String = ""
)

class WirelineViewModel(application: Application) : AndroidViewModel(application) {
    private val api = WirelineApi(application)
    var state by mutableStateOf(WirelineUiState(isSignedIn = api.isSignedIn()))
        private set

    init {
        if (state.isSignedIn) refresh()
    }

    fun signIn(email: String, pass: String) = viewModelScope.launch {
        state = state.copy(isWorking = true, error = null)
        runCatching { api.signIn(email, pass) }
            .onSuccess {
                state = state.copy(isSignedIn = true, isWorking = false)
                refresh()
            }
            .onFailure { state = state.copy(isWorking = false, error = it.message) }
    }

    fun signOut() = viewModelScope.launch {
        state = state.copy(isWorking = true)
        runCatching { api.signOut() }
        state = WirelineUiState()
    }

    fun saveHandoffPhone(phone: String) = viewModelScope.launch {
        state = state.copy(isWorking = true, error = null)
        runCatching { api.setHandoffPhone(phone.ifBlank { null }) }
            .onSuccess {
                state = state.copy(isWorking = false, handoffPhone = phone)
            }
            .onFailure { state = state.copy(isWorking = false, error = it.message) }
    }

    fun createAssistant(
        name: String,
        role: String,
        isBusinessAgent: Boolean = false,
        onCreated: () -> Unit = {},
    ) = viewModelScope.launch {
        val cleanName = name.trim()
        if (cleanName.isEmpty()) return@launch
        state = state.copy(isWorking = true, error = null)
        runCatching { api.createAssistant(cleanName, role, isBusinessAgent) }
            .onSuccess { assistant ->
                state = state.copy(isWorking = false, agents = listOf(assistant) + state.agents)
                onCreated()
                refresh()
            }
            .onFailure { state = state.copy(isWorking = false, error = it.message) }
    }

    fun placeCall(agentId: String, customerNumber: String, context: String) = viewModelScope.launch {
        state = state.copy(isWorking = true, error = null)
        runCatching { api.placeCall(agentId, customerNumber, context) }
            .onSuccess {
                state = state.copy(isWorking = false)
                refresh()
            }
            .onFailure { state = state.copy(isWorking = false, error = it.message) }
    }

    fun takeCall(callId: String) = viewModelScope.launch {
        state = state.copy(isWorking = true, error = null)
        runCatching { api.handoffCall(callId) }
            .onSuccess {
                state = state.copy(isWorking = false)
                refresh()
            }
            .onFailure { state = state.copy(isWorking = false, error = it.message) }
    }

    private fun refresh() = viewModelScope.launch {
        state = state.copy(isWorking = true, error = null)
        runCatching {
            val me = api.me()
            state = state.copy(
                me = me,
                agents = api.agents().agents,
                activeCalls = api.activeCalls().calls,
                recentCalls = api.recentCalls().calls,
                wallet = api.wallet(),
                handoffPhone = me.settings?.handoffPhone ?: "",
                isWorking = false
            )
        }.onFailure {
            if (it.message?.contains("Not signed in") == true || it.message?.contains("401") == true) {
                api.signOut()
                state = WirelineUiState()
            } else {
                state = state.copy(isWorking = false, error = it.message)
            }
        }
    }
}
