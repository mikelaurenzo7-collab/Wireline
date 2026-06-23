package com.wireline.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PhoneInTalk
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.wireline.app.data.ActiveCall
import com.wireline.app.data.Agent
import com.wireline.app.data.RecentCall
import com.wireline.app.data.WalletEntry
import com.wireline.app.ui.ask.AskWirelineScreen
import com.wireline.app.ui.components.AskWirelineHeroCard
import com.wireline.app.ui.components.CallbackNumberPromptCard
import com.wireline.app.ui.components.MetricStatCard
import com.wireline.app.ui.components.AssistantCard
import com.wireline.app.ui.components.Medallion
import com.wireline.app.ui.setup.ActionsScreen
import com.wireline.app.ui.setup.KnowledgeScreen
import com.wireline.app.ui.theme.Brand

sealed class Screen(val route: String, val title: String) {
    object Studio : Screen("studio", "Studio")
    object Assistants : Screen("assistants", "Assistants")
    object Knowledge : Screen("knowledge", "Knowledge")
    object Actions : Screen("actions", "Actions")
    object Recaps : Screen("recaps", "Recaps")
    object Wallet : Screen("wallet", "Wallet")
    object Settings : Screen("settings", "Settings")
}

class NavigationActions(private val navController: NavHostController) {
    fun navigateTo(screen: Screen) {
        navController.navigate(screen.route) {
            popUpTo(navController.graph.startDestinationId) {
                saveState = true
            }
            launchSingleTop = true
            restoreState = true
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WirelineAndroidApp(model: WirelineViewModel = viewModel()) {
    val state = model.state
    if (!state.isSignedIn) {
        SignInScreen(state, model::signIn)
        return
    }

    val navController = rememberNavController()
    val navActions = remember(navController) { NavigationActions(navController) }
    var showAsk by rememberSaveable { mutableStateOf(false) }
    var showCreateAssistant by rememberSaveable { mutableStateOf(false) }

    Scaffold(
        containerColor = Brand.Canvas,
        topBar = {
            WirelineTopBar(
                title = "Wireline AI",
                onWallet = { navActions.navigateTo(Screen.Wallet) },
                onSettings = { navActions.navigateTo(Screen.Settings) },
            )
        },
        floatingActionButton = {
            val navBackStackEntry by navController.currentBackStackEntryAsState()
            val currentRoute = navBackStackEntry?.destination?.route ?: Screen.Studio.route

            when (currentRoute) {
                Screen.Studio.route -> FloatingActionButton(
                    onClick = { showAsk = true },
                    containerColor = Brand.Accent,
                    contentColor = Color.White,
                    shape = RoundedCornerShape(Brand.RadiusMd),
                ) { Icon(Icons.Default.Mic, contentDescription = "Ask Wireline") }
                Screen.Assistants.route -> FloatingActionButton(
                    onClick = { showCreateAssistant = true },
                    containerColor = Brand.Accent,
                    contentColor = Color.White,
                    shape = RoundedCornerShape(Brand.RadiusMd),
                ) { Icon(Icons.Default.Add, contentDescription = "Create assistant") }
                else -> Unit
            }
        },
        bottomBar = {
            val navBackStackEntry by navController.currentBackStackEntryAsState()
            val currentRoute = navBackStackEntry?.destination?.route ?: Screen.Studio.route

            NavigationBar(containerColor = Brand.Canvas) {
                NavigationBarItem(
                    selected = currentRoute == Screen.Studio.route,
                    onClick = { navActions.navigateTo(Screen.Studio) },
                    icon = { Icon(Icons.Default.Home, contentDescription = "Studio") },
                    label = { Text("Studio") },
                )
                NavigationBarItem(
                    selected = currentRoute == Screen.Assistants.route,
                    onClick = { navActions.navigateTo(Screen.Assistants) },
                    icon = { Icon(Icons.Default.PhoneInTalk, contentDescription = "Assistants") },
                    label = { Text("Assistants") },
                )
                NavigationBarItem(
                    selected = currentRoute == Screen.Knowledge.route,
                    onClick = { navActions.navigateTo(Screen.Knowledge) },
                    icon = { Icon(Icons.Default.Home, contentDescription = "Knowledge") },
                    label = { Text("Knowledge") },
                )
                NavigationBarItem(
                    selected = currentRoute == Screen.Actions.route,
                    onClick = { navActions.navigateTo(Screen.Actions) },
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Actions") },
                    label = { Text("Actions") },
                )
                NavigationBarItem(
                    selected = currentRoute == Screen.Recaps.route,
                    onClick = { navActions.navigateTo(Screen.Recaps) },
                    icon = { Icon(Icons.Default.Call, contentDescription = "Recaps") },
                    label = { Text("Recaps") },
                )
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Studio.route,
            modifier = Modifier.padding(padding)
        ) {
            composable(Screen.Studio.route) {
                StudioScreen(PaddingValues(0.dp), state, model, onNavigateToSettings = { navActions.navigateTo(Screen.Settings) })
            }
            composable(Screen.Assistants.route) {
                AssistantsScreen(PaddingValues(0.dp), state.agents, onCreate = { showCreateAssistant = true })
            }
            composable(Screen.Knowledge.route) {
                KnowledgeScreen(PaddingValues(0.dp))
            }
            composable(Screen.Actions.route) {
                ActionsScreen(PaddingValues(0.dp))
            }
            composable(Screen.Recaps.route) {
                RecapsScreen(PaddingValues(0.dp), state.activeCalls, state.recentCalls, model::takeCall)
            }
            composable(Screen.Wallet.route) {
                WalletScreen(PaddingValues(0.dp), state.wallet?.balanceUsd, state.wallet?.ledger.orEmpty())
            }
            composable(Screen.Settings.route) {
                SettingsScreen(PaddingValues(0.dp), state, model)
            }
        }
    }

    if (showAsk) {
        ModalBottomSheet(onDismissRequest = { showAsk = false }, containerColor = Brand.Canvas) {
            AskWirelineScreen(model = model, onBack = { showAsk = false })
        }
    }

    if (showCreateAssistant) {
        ModalBottomSheet(onDismissRequest = { if (!state.isWorking) showCreateAssistant = false }, containerColor = Brand.Canvas) {
            CreateAssistantSheet(
                state = state,
                onCreate = { name, role, isBusinessAgent ->
                    model.createAssistant(name, role, isBusinessAgent) { showCreateAssistant = false }
                },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WirelineTopBar(title: String, onWallet: () -> Unit, onSettings: () -> Unit) {
    TopAppBar(
        title = { Text(title, fontWeight = FontWeight.SemiBold, color = Brand.Text) },
        actions = {
            IconButton(onClick = onWallet) { Icon(Icons.Default.CreditCard, contentDescription = "Wallet") }
            IconButton(onClick = onSettings) { Icon(Icons.Default.Settings, contentDescription = "Settings") }
        },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = Brand.Canvas, titleContentColor = Brand.Text),
    )
}

@Composable
private fun SignInScreen(state: WirelineUiState, onSignIn: (String, String) -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    Column(
        modifier = Modifier.fillMaxSize().background(Brand.Canvas).padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.Start,
    ) {
        Medallion(Icons.Default.PhoneInTalk, size = 56.dp)
        Spacer(Modifier.height(16.dp))
        Text("WIRELINE", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = Brand.Text)
        Text("Your personal call assistant.", style = MaterialTheme.typography.bodyMedium, color = Brand.Text2)
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(Brand.RadiusSm))
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(value = password, onValueChange = { password = it }, label = { Text("Password") }, modifier = Modifier.fillMaxWidth(), singleLine = true, visualTransformation = PasswordVisualTransformation(), shape = RoundedCornerShape(Brand.RadiusSm))
        Spacer(Modifier.height(16.dp))
        Button(onClick = { onSignIn(email, password) }, enabled = !state.isWorking && email.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(Brand.RadiusSm)) {
            if (state.isWorking) CircularProgressIndicator(modifier = Modifier.height(20.dp), strokeWidth = 2.dp) else Text("Sign in")
        }
        ErrorText(state.error)
        Spacer(Modifier.height(24.dp))
        Text("New to Wireline? Create an account on the web.", style = MaterialTheme.typography.bodySmall, color = Brand.Text3, textAlign = TextAlign.Center)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StudioScreen(padding: PaddingValues, state: WirelineUiState, model: WirelineViewModel, onNavigateToSettings: () -> Unit) {
    var number by rememberSaveable { mutableStateOf("") }
    var context by rememberSaveable { mutableStateOf("") }
    var selectedAgentId by rememberSaveable { mutableStateOf("") }
    var showAsk by rememberSaveable { mutableStateOf(false) }
    val agent = state.agents.firstOrNull { it.id == selectedAgentId } ?: state.agents.firstOrNull()
    val followUps = state.recentCalls.count { it.outcomeTag == "followup" }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(Brand.Canvas).padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { AskWirelineHeroCard(onClick = { showAsk = true }) }
        if (state.handoffPhone.isBlank()) {
            item { CallbackNumberPromptCard(onClick = onNavigateToSettings) }
        }
        item {
            AssistantCard {
                Text("YOUR DAY", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    MetricStatCard(value = "${state.activeCalls.size}", label = "CALLS NOW", highlighted = state.activeCalls.isNotEmpty(), modifier = Modifier.weight(1f))
                    MetricStatCard(value = "$followUps", label = "FOLLOW-UPS", highlighted = followUps > 0, modifier = Modifier.weight(1f))
                    MetricStatCard(value = "${state.agents.size}", label = "ASSISTANTS", highlighted = false, modifier = Modifier.weight(1f))
                }
            }
        }
        state.me?.let { me ->
            item {
                AssistantCard {
                    Text(me.user.fullName ?: me.account.businessName ?: me.user.email, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = Brand.Text)
                    Text("${me.account.planName} · ${state.agents.size} assistants", style = MaterialTheme.typography.bodySmall, color = Brand.Text2)
                }
            }
        }
        item {
            AssistantCard {
                Text("PLACE A CALL", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3)
                AgentChips(state.agents, agent?.id, onSelect = { selectedAgentId = it })
                OutlinedTextField(value = number, onValueChange = { number = it }, label = { Text("Phone number") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(Brand.RadiusSm))
                OutlinedTextField(value = context, onValueChange = { context = it }, label = { Text("What should Wireline handle?") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(Brand.RadiusSm))
                Button(onClick = { agent?.let { model.placeCall(it.id, number, context) } }, enabled = agent != null && number.isNotBlank() && !state.isWorking, shape = RoundedCornerShape(Brand.RadiusSm)) { Text("Place call") }
            }
        }
        item { ErrorText(state.error) }
    }

    if (showAsk) {
        ModalBottomSheet(onDismissRequest = { showAsk = false }, containerColor = Brand.Canvas) {
            AskWirelineScreen(model = model, onBack = { showAsk = false })
        }
    }
}

@Composable
private fun AssistantsScreen(padding: PaddingValues, agents: List<Agent>, onCreate: () -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().background(Brand.Canvas).padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Assistants", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, color = Brand.Text)
                    Text("Personal assistants and business agents for your day.", style = MaterialTheme.typography.bodyMedium, color = Brand.Text2)
                }
                TextButton(onClick = onCreate) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("New")
                }
            }
        }
        if (agents.isEmpty()) {
            item {
                AssistantCard {
                    Text("Personal assistants and business agents", style = MaterialTheme.typography.titleMedium, color = Brand.Text)
                    Text("Start with a personal assistant for everyday calls, or add a business agent when work needs a professional line.", color = Brand.Text2)
                    Button(onClick = onCreate, shape = RoundedCornerShape(Brand.RadiusSm)) { Text("Create assistant") }
                }
            }
        } else {
            items(agents, key = { it.id }) { agent ->
                AssistantCard {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Medallion(Icons.Default.PhoneInTalk, size = 40.dp)
                        Column(Modifier.weight(1f)) {
                            Text(agent.name, fontWeight = FontWeight.SemiBold, color = Brand.Text)
                            Text(
                                if (agent.isBusinessAgent == true) "Business agent"
                                else agent.role?.replace("_", " ") ?: "Personal assistant",
                                style = MaterialTheme.typography.bodySmall,
                                color = Brand.Text2,
                            )
                        }
                        Text("Ready", style = MaterialTheme.typography.labelSmall, color = Brand.Success)
                    }
                }
            }
        }
    }
}

@Composable
private fun CreateAssistantSheet(state: WirelineUiState, onCreate: (String, String, Boolean) -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var role by rememberSaveable { mutableStateOf("scheduler") }
    var isBusinessAgent by rememberSaveable { mutableStateOf(false) }
    val choices = listOf(
        "scheduler" to "Personal assistant",
        "customer_service" to "Helpful caller",
        "receptionist" to "Call concierge",
        "custom" to "Something else",
    )

    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text("Full versatility", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            FilterChip(
                selected = !isBusinessAgent,
                onClick = { isBusinessAgent = false },
                label = { Text("Personal assistant") },
                modifier = Modifier.weight(1f),
            )
            FilterChip(
                selected = isBusinessAgent,
                onClick = {
                    isBusinessAgent = true
                    if (role == "scheduler") role = "receptionist"
                },
                label = { Text("Business agent") },
                modifier = Modifier.weight(1f),
            )
        }
        Text(
            if (isBusinessAgent) "New business agent" else "New assistant",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
            color = Brand.Text,
        )
        Text(
            if (isBusinessAgent) {
                "Name the agent and describe how it should represent your business. Refine policies in Studio next."
            } else {
                "Name the help you want. You can add its knowledge, actions, and voice in Studio next."
            },
            style = MaterialTheme.typography.bodyMedium,
            color = Brand.Text2,
        )
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text("Name") },
            placeholder = { Text("Casey") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(Brand.RadiusSm),
        )
        Text("What kind of help?", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3)
        choices.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                row.forEach { (value, label) ->
                    FilterChip(
                        selected = role == value,
                        onClick = { role = value },
                        label = { Text(label, maxLines = 1) },
                        modifier = Modifier.weight(1f),
                    )
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
        ErrorText(state.error)
        Button(
            onClick = { onCreate(name, role, isBusinessAgent) },
            enabled = name.isNotBlank() && !state.isWorking,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(Brand.RadiusSm),
        ) {
            if (state.isWorking) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
            } else {
                Icon(Icons.Default.Add, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Create assistant")
            }
        }
    }
}

@Composable
private fun RecapsScreen(padding: PaddingValues, activeCalls: List<ActiveCall>, recentCalls: List<RecentCall>, onTakeCall: (String) -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxSize().background(Brand.Canvas).padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("Recaps", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, color = Brand.Text) }
        item { Text("On a call", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3) }
        if (activeCalls.isEmpty()) item { Text("No calls in progress.", color = Brand.Text2) }
        items(activeCalls, key = { it.callId }) { call ->
            SectionCard {
                Text(call.label ?: call.customerNumber ?: "Wireline call", fontWeight = FontWeight.SemiBold, color = Brand.Text)
                Text(call.status?.replace("_", " ") ?: "In progress", color = Brand.Text2)
                Button(onClick = { onTakeCall(call.callId) }, shape = RoundedCornerShape(Brand.RadiusSm)) { Text("Take this call") }
            }
        }
        item { Text("Recent recaps", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3) }
        items(recentCalls, key = { it.id }) { call ->
            SectionCard {
                Text(call.customerNumber ?: "Unknown caller", fontWeight = FontWeight.SemiBold, color = Brand.Text)
                Text(call.summary ?: "No summary yet.", color = Brand.Text2)
                call.outcomeTag?.let { AssistChip(onClick = {}, label = { Text(it) }) }
            }
        }
    }
}

@Composable
private fun WalletScreen(padding: PaddingValues, balance: Double?, ledger: List<WalletEntry>) {
    LazyColumn(modifier = Modifier.fillMaxSize().background(Brand.Canvas).padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { SectionCard { Text("Credit balance", style = MaterialTheme.typography.titleMedium, color = Brand.Text); Text("$${"%.2f".format(balance ?: 0.0)}", style = MaterialTheme.typography.headlineMedium, color = Brand.Text) } }
        items(ledger, key = { it.id }) { entry -> SectionCard { Text(entry.reason, fontWeight = FontWeight.SemiBold, color = Brand.Text); Text("${"%+.2f".format(entry.deltaUsd)} → ${"%.2f".format(entry.balanceAfterUsd)}", color = Brand.Text2) } }
    }
}

@Composable
private fun SettingsScreen(padding: PaddingValues, state: WirelineUiState, model: WirelineViewModel) {
    var phone by rememberSaveable(state.handoffPhone) { mutableStateOf(state.handoffPhone) }
    Column(modifier = Modifier.fillMaxSize().background(Brand.Canvas).padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionCard {
            Text("Callback number", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = Brand.Text)
            Text("Where Wireline should send a call when you take over.", style = MaterialTheme.typography.bodySmall, color = Brand.Text2)
            OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("E.164 phone number") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(Brand.RadiusSm))
            Button(onClick = { model.saveHandoffPhone(phone) }, enabled = !state.isWorking, shape = RoundedCornerShape(Brand.RadiusSm)) { Text("Save") }
        }
        Button(onClick = { model.signOut() }, enabled = !state.isWorking, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Brand.Panel2, contentColor = Brand.Text), shape = RoundedCornerShape(Brand.RadiusSm)) { Text("Sign out") }
        ErrorText(state.error)
    }
}

@Composable
fun SectionCard(content: @Composable () -> Unit) = AssistantCard { content() }

@Composable
private fun AgentChips(agents: List<Agent>, selectedId: String?, onSelect: (String) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        agents.take(3).forEach { agent ->
            AssistChip(onClick = { onSelect(agent.id) }, label = { Text(agent.name) }, modifier = Modifier.padding(vertical = 4.dp), colors = AssistChipDefaults.assistChipColors(containerColor = if (agent.id == selectedId) Brand.AccentSoft else Brand.Panel2))
        }
    }
}

@Composable
private fun ErrorText(error: String?) {
    if (!error.isNullOrBlank()) Text(text = error, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
}
