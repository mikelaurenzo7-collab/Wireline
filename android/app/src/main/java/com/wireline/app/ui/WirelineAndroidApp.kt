package com.wireline.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.wireline.app.data.ActiveCall
import com.wireline.app.data.Agent
import com.wireline.app.data.RecentCall
import com.wireline.app.data.WalletEntry

private enum class Tab { Home, Calls, Wallet, Settings }

@Composable
fun WirelineAndroidApp(model: WirelineViewModel = viewModel()) {
    val state = model.state
    if (!state.isSignedIn) {
        SignInScreen(state, model::signIn)
        return
    }

    var tab by rememberSaveable { mutableStateOf(Tab.Home) }
    var showAskWireline by rememberSaveable { mutableStateOf(false) }

    Scaffold(
        topBar = { WirelineTopBar(state.me?.account?.businessName ?: "Wireline") },
        floatingActionButton = {
            if (tab == Tab.Home) {
                androidx.compose.material3.FloatingActionButton(
                    onClick = { showAskWireline = true },
                    containerColor = com.wireline.app.ui.theme.Brand.Purple
                ) {
                    Icon(
                        Icons.Default.Call, // fallback icon, could use sparkles
                        contentDescription = "Ask Wireline",
                        tint = androidx.compose.ui.graphics.Color.White
                    )
                }
            }
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = tab == Tab.Home,
                    onClick = { tab = Tab.Home },
                    icon = { Icon(Icons.Default.Home, contentDescription = null) },
                    label = { Text("Home") },
                )
                
                if (state.me?.account?.mode != "personal") {
                    NavigationBarItem(
                        selected = tab == Tab.Calls,
                        onClick = { tab = Tab.Calls },
                        icon = { Icon(Icons.Default.Call, contentDescription = null) },
                        label = { Text("Calls") },
                    )
                    NavigationBarItem(
                        selected = tab == Tab.Wallet,
                        onClick = { tab = Tab.Wallet },
                        icon = { Icon(Icons.Default.CreditCard, contentDescription = null) },
                        label = { Text("Wallet") },
                    )
                }

                NavigationBarItem(
                    selected = tab == Tab.Settings,
                    onClick = { tab = Tab.Settings },
                    icon = { Icon(Icons.Default.Settings, contentDescription = null) },
                    label = { Text("Settings") },
                )
            }
        },
    ) { padding ->
        when (tab) {
            Tab.Home -> HomeScreen(padding, state, model)
            Tab.Calls -> if (state.me?.account?.mode != "personal") CallsScreen(padding, state.activeCalls, state.recentCalls, model::takeCall) else HomeScreen(padding, state, model)
            Tab.Wallet -> if (state.me?.account?.mode != "personal") WalletScreen(padding, state.wallet?.balanceUsd, state.wallet?.ledger.orEmpty()) else HomeScreen(padding, state, model)
            Tab.Settings -> SettingsScreen(padding, state, model)
        }
    }
    
    if (showAskWireline) {
        androidx.compose.material3.ModalBottomSheet(
            onDismissRequest = { showAskWireline = false },
            containerColor = com.wireline.app.ui.theme.Brand.Paper
        ) {
            com.wireline.app.ui.ask.AskWirelineScreen(onBack = { showAskWireline = false })
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WirelineTopBar(title: String) {
    TopAppBar(title = { Text(title, fontWeight = FontWeight.SemiBold) })
}

@Composable
private fun SignInScreen(state: WirelineUiState, onSignIn: (String, String) -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Wireline", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        Text("Operator console", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
        )
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = { onSignIn(email, password) },
            enabled = !state.isWorking && email.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (state.isWorking) "Signing in" else "Sign in")
        }
        ErrorText(state.error)
    }
}

@Composable
private fun HomeScreen(padding: PaddingValues, state: WirelineUiState, model: WirelineViewModel) {
    var outboundNumber by rememberSaveable { mutableStateOf("") }
    var outboundContext by rememberSaveable { mutableStateOf("") }
    var selectedAgentId by rememberSaveable { mutableStateOf("") }
    val selectedAgent = state.agents.firstOrNull { it.id == selectedAgentId } ?: state.agents.firstOrNull()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            SectionCard {
                Text("Today", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                Text("${state.activeCalls.size} live calls")
                Text("${state.recentCalls.count { it.outcomeTag == "followup" }} follow-ups need attention")
                Text("${state.agents.size} agents on roster")
            }
        }
        item {
            SectionCard {
                Text("Outbound", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                AgentChips(state.agents, selectedAgent?.id, onSelect = { selectedAgentId = it })
                OutlinedTextField(
                    value = outboundNumber,
                    onValueChange = { outboundNumber = it },
                    label = { Text("Customer number") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = outboundContext,
                    onValueChange = { outboundContext = it },
                    label = { Text("Context") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = { selectedAgent?.let { model.placeCall(it.id, outboundNumber, outboundContext) } },
                    enabled = selectedAgent != null && outboundNumber.isNotBlank() && !state.isWorking,
                ) {
                    Text("Place call")
                }
            }
        }
        item { ErrorText(state.error) }
    }
}

@Composable
private fun CallsScreen(
    padding: PaddingValues,
    activeCalls: List<ActiveCall>,
    recentCalls: List<RecentCall>,
    onTakeCall: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Text("Live", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold) }
        if (activeCalls.isEmpty()) item { Text("No active calls.") }
        items(activeCalls, key = { it.callId }) { call ->
            SectionCard {
                Text(call.label ?: call.customerNumber ?: "Wireline call", fontWeight = FontWeight.SemiBold)
                Text(call.status ?: "Active")
                Button(onClick = { onTakeCall(call.callId) }) { Text("Take this call") }
            }
        }
        item { Text("Recent", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold) }
        items(recentCalls, key = { it.id }) { call ->
            SectionCard {
                Text(call.customerNumber ?: "Unknown caller", fontWeight = FontWeight.SemiBold)
                Text(call.summary ?: "No summary yet.")
                call.outcomeTag?.let { AssistChip(onClick = {}, label = { Text(it) }) }
            }
        }
    }
}

@Composable
private fun WalletScreen(padding: PaddingValues, balance: Double?, ledger: List<WalletEntry>) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            SectionCard {
                Text("Credit balance", style = MaterialTheme.typography.titleMedium)
                Text("$${"%.2f".format(balance ?: 0.0)}", style = MaterialTheme.typography.headlineMedium)
            }
        }
        items(ledger, key = { it.id }) { entry ->
            SectionCard {
                Text(entry.reason, fontWeight = FontWeight.SemiBold)
                Text("${"%+.2f".format(entry.deltaUsd)} -> ${"%.2f".format(entry.balanceAfterUsd)}")
            }
        }
    }
}

@Composable
private fun SettingsScreen(padding: PaddingValues, state: WirelineUiState, model: WirelineViewModel) {
    var phone by rememberSaveable(state.handoffPhone) { mutableStateOf(state.handoffPhone) }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SectionCard {
            Text("Callback number", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            OutlinedTextField(
                value = phone,
                onValueChange = { phone = it },
                label = { Text("E.164 phone number") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            Button(onClick = { model.saveHandoffPhone(phone) }, enabled = !state.isWorking) {
                Text("Save")
            }
        }
        Button(
            onClick = { model.signOut() },
            enabled = !state.isWorking,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Sign out")
        }
    }
}

@Composable
fun SectionCard(content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            content()
        }
    }
}

@Composable
fun AgentChips(agents: List<Agent>, selectedId: String?, onSelect: (String) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        agents.forEach { agent ->
            AssistChip(
                onClick = { onSelect(agent.id) },
                label = { Text(agent.name) },
                modifier = Modifier.padding(vertical = 4.dp)
            )
        }
    }
}

@Composable
fun ErrorText(error: String?) {
    if (!error.isNullOrBlank()) {
        Text(
            text = error,
            color = MaterialTheme.colorScheme.error,
            modifier = Modifier.padding(top = 8.dp)
        )
    }
}
