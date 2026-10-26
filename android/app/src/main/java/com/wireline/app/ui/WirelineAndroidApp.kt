package com.wireline.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PhoneInTalk
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.zIndex
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.navArgument
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
    object Studio : Screen("studio", "OVERVIEW")
    object Assistants : Screen("assistants", "BOTS")
    object Knowledge : Screen("knowledge", "KNOWLEDGE")
    object Actions : Screen("actions", "CONNECTIONS")
    object Recaps : Screen("recaps", "CALLS")
    object Wallet : Screen("wallet", "WALLET")
    object Settings : Screen("settings", "SETTINGS")

    companion object {
        const val CallDetailRoute = "call_detail/{callId}"
        fun callDetail(callId: String) = "call_detail/$callId"
    }
}

class NavigationActions(private val navController: NavHostController) {
    fun navigateTo(screen: Screen) {
        navController.navigate(screen.route) {
            popUpTo(navController.graph.startDestinationId) { saveState = true }
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
    var showCreateAgent by rememberSaveable { mutableStateOf(false) }
    val liveCallRequest by LiveCallNavigator.request.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        Scaffold(
            containerColor = Brand.Canvas,
            topBar = {
                WirelineTopBar(
                    title = "BotBound",
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
                    ) { Icon(Icons.Default.Mic, contentDescription = "ASK BOTBOUND") }
                    Screen.Assistants.route -> FloatingActionButton(
                        onClick = { showCreateAgent = true },
                        containerColor = Brand.Accent,
                        contentColor = Color.White,
                        shape = RoundedCornerShape(Brand.RadiusMd),
                    ) { Icon(Icons.Default.Add, contentDescription = "CREATE BOT") }
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
                        icon = { Icon(Icons.Default.Home, contentDescription = "OVERVIEW") },
                        label = { Text("OVERVIEW") },
                    )
                    NavigationBarItem(
                        selected = currentRoute == Screen.Assistants.route,
                        onClick = { navActions.navigateTo(Screen.Assistants) },
                        icon = { Icon(Icons.Default.PhoneInTalk, contentDescription = "BOTS") },
                        label = { Text("BOTS") },
                    )
                    NavigationBarItem(
                        selected = currentRoute == Screen.Knowledge.route,
                        onClick = { navActions.navigateTo(Screen.Knowledge) },
                        icon = { Icon(Icons.Default.MenuBook, contentDescription = "KNOWLEDGE") },
                        label = { Text("KNOWLEDGE") },
                    )
                    NavigationBarItem(
                        selected = currentRoute == Screen.Actions.route,
                        onClick = { navActions.navigateTo(Screen.Actions) },
                        icon = { Icon(Icons.Default.Settings, contentDescription = "CONNECTIONS") },
                        label = { Text("CONNECTIONS") },
                    )
                    NavigationBarItem(
                        selected = currentRoute == Screen.Recaps.route,
                        onClick = { navActions.navigateTo(Screen.Recaps) },
                        icon = { Icon(Icons.Default.Call, contentDescription = "CALLS") },
                        label = { Text("CALLS") },
                    )
                }
            },
        ) { padding ->
            NavHost(navController = navController, startDestination = Screen.Studio.route, modifier = Modifier.padding(padding)) {
                composable(Screen.Studio.route) { StudioScreen(PaddingValues(0.dp), state, model, onNavigateToSettings = { navActions.navigateTo(Screen.Settings) }) }
                composable(Screen.Assistants.route) { AssistantsScreen(PaddingValues(0.dp), state.agents, onCreate = { showCreateAgent = true }) }
                composable(Screen.Knowledge.route) { KnowledgeScreen(PaddingValues(0.dp)) }
                composable(Screen.Actions.route) { ActionsScreen(PaddingValues(0.dp)) }
                composable(Screen.Recaps.route) {
                    RecapsScreen(
                        padding = PaddingValues(0.dp),
                        activeCalls = state.activeCalls,
                        recentCalls = state.recentCalls,
                        onTakeCall = { callId -> LiveCallNavigator.present(callId, autoHandoff = true) },
                        onViewLiveCall = { callId -> LiveCallNavigator.present(callId) },
                        onOpenCallDetail = { callId -> navController.navigate(Screen.callDetail(callId)) },
                    )
                }
                composable(
                    route = Screen.CallDetailRoute,
                    arguments = listOf(navArgument("callId") { type = NavType.StringType }),
                ) { backStackEntry ->
                    val callId = backStackEntry.arguments?.getString("callId")
                    val call = state.recentCalls.firstOrNull { it.id == callId }
                    if (call != null) {
                        CallDetailScreen(call = call, model = model, onBack = { navController.popBackStack() })
                    }
                }
                composable(Screen.Wallet.route) { WalletScreen(PaddingValues(0.dp), state.wallet?.balanceUsd, state.wallet?.ledger.orEmpty()) }
                composable(Screen.Settings.route) { SettingsScreen(PaddingValues(0.dp), state, model) }
            }
        }

        if (showAsk) {
            ModalBottomSheet(onDismissRequest = { showAsk = false }, containerColor = Brand.Canvas) {
                AskWirelineScreen(model = model, onBack = { showAsk = false })
            }
        }

        if (showCreateAgent) {
            ModalBottomSheet(onDismissRequest = { if (!state.isWorking) showCreateAgent = false }, containerColor = Brand.Canvas) {
                CreateAgentSheet(
                    state = state,
                    onCreate = { name, role, isBusinessAgent ->
                        model.createAssistant(name, role, isBusinessAgent) { showCreateAgent = false }
                    },
                )
            }
        }

        liveCallRequest?.let { request ->
            Box(modifier = Modifier.fillMaxSize().zIndex(1f)) {
                LiveCallScreen(
                    callId = request.callId,
                    autoHandoff = request.autoHandoff,
                    model = model,
                    onDismiss = { LiveCallNavigator.dismiss() },
                    onOpenSettings = {
                        LiveCallNavigator.dismiss()
                        navActions.navigateTo(Screen.Settings)
                    },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WirelineTopBar(title: String, onWallet: () -> Unit, onSettings: () -> Unit) {
    TopAppBar(
        title = { Text(title, fontWeight = FontWeight.SemiBold, color = Brand.Text) },
        actions = {
            IconButton(onClick = onWallet) { Icon(Icons.Default.CreditCard, contentDescription = "WALLET") }
            IconButton(onClick = onSettings) { Icon(Icons.Default.Settings, contentDescription = "SETTINGS") }
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
        Text("BotBound", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = Brand.Text)
        Text("BOTS THAT GET THE WORK DONE", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = Brand.Text)
        Text("Voice-first Bots for calls, live conversations, text, and email.", style = MaterialTheme.typography.bodyMedium, color = Brand.Text2)
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("EMAIL") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(Brand.RadiusSm))
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(value = password, onValueChange = { password = it }, label = { Text("PASSWORD") }, modifier = Modifier.fillMaxWidth(), singleLine = true, visualTransformation = PasswordVisualTransformation(), shape = RoundedCornerShape(Brand.RadiusSm))
        Spacer(Modifier.height(16.dp))
        Button(onClick = { onSignIn(email, password) }, enabled = !state.isWorking && email.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(Brand.RadiusSm)) {
            if (state.isWorking) CircularProgressIndicator(modifier = Modifier.height(20.dp), strokeWidth = 2.dp) else Text("SIGN IN")
        }
        ErrorText(state.error)
        Spacer(Modifier.height(24.dp))
        Text("New to BotBound? Create an account on the web.", style = MaterialTheme.typography.bodySmall, color = Brand.Text3, textAlign = TextAlign.Center)
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun StudioScreen(padding: PaddingValues, state: WirelineUiState, model: WirelineViewModel, onNavigateToSettings: () -> Unit) {
    var number by rememberSaveable { mutableStateOf("") }
    var context by rememberSaveable { mutableStateOf("") }
    var permissionConfirmed by rememberSaveable { mutableStateOf(false) }
    var nonsalesConfirmed by rememberSaveable { mutableStateOf(false) }
    var salesAttestationConfirmed by rememberSaveable { mutableStateOf(false) }
    var callPurpose by rememberSaveable { mutableStateOf(OutboundPurposeCopy.APPOINTMENT) }
    var selectedAgentId by rememberSaveable { mutableStateOf("") }
    var showAsk by rememberSaveable { mutableStateOf(false) }
    val agent = state.agents.firstOrNull { it.id == selectedAgentId } ?: state.agents.firstOrNull()
    val followUps = state.recentCalls.count { it.outcomeTag == "followup" }
    val salesCall = callPurpose == OutboundPurposeCopy.SALES
    val confirmationsReady = permissionConfirmed && if (salesCall) salesAttestationConfirmed else nonsalesConfirmed
    fun selectPurpose(next: String) {
        callPurpose = next
        permissionConfirmed = false
        nonsalesConfirmed = false
        salesAttestationConfirmed = false
    }

    LazyColumn(modifier = Modifier.fillMaxSize().background(Brand.Canvas).padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { AskWirelineHeroCard(onClick = { showAsk = true }) }
        if (state.handoffPhone.isBlank()) { item { CallbackNumberPromptCard(onClick = onNavigateToSettings) } }
        item {
            AssistantCard {
                Text("OVERVIEW", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    MetricStatCard(value = "${state.activeCalls.size}", label = "CALLS NOW", highlighted = state.activeCalls.isNotEmpty(), modifier = Modifier.weight(1f))
                    MetricStatCard(value = "$followUps", label = "FOLLOW-UPS", highlighted = followUps > 0, modifier = Modifier.weight(1f))
                    MetricStatCard(value = "${state.agents.size}", label = "BOTS", highlighted = false, modifier = Modifier.weight(1f))
                }
            }
        }
        state.me?.let { me ->
            item { AssistantCard { Text(me.account.businessName ?: me.user.fullName ?: me.user.email, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = Brand.Text); Text("${me.account.planName} · ${state.agents.size} Bots", style = MaterialTheme.typography.bodySmall, color = Brand.Text2) } }
        }
        item {
            AssistantCard {
                Text("PLACE A CALL", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3)
                AgentChips(state.agents, agent?.id, onSelect = { selectedAgentId = it })
                OutlinedTextField(value = number, onValueChange = { number = it }, label = { Text("PHONE NUMBER") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(Brand.RadiusSm))
                OutlinedTextField(value = context, onValueChange = { context = it }, label = { Text("WHAT SHOULD YOUR BOT HANDLE?") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(Brand.RadiusSm))
                Text("WHY ARE YOU CONTACTING THEM?", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    FilterChip(selected = callPurpose == OutboundPurposeCopy.APPOINTMENT, onClick = { selectPurpose(OutboundPurposeCopy.APPOINTMENT) }, label = { Text(OutboundPurposeCopy.APPOINTMENT_LABEL) })
                    FilterChip(selected = callPurpose == OutboundPurposeCopy.CALLBACK, onClick = { selectPurpose(OutboundPurposeCopy.CALLBACK) }, label = { Text(OutboundPurposeCopy.CALLBACK_LABEL) })
                    FilterChip(selected = callPurpose == OutboundPurposeCopy.SALES, onClick = { selectPurpose(OutboundPurposeCopy.SALES) }, label = { Text(OutboundPurposeCopy.SALES_LABEL) })
                }
                OutboundConfirmationFields(
                    salesCall = salesCall,
                    permissionConfirmed = permissionConfirmed,
                    onPermissionConfirmed = { permissionConfirmed = it },
                    nonsalesConfirmed = nonsalesConfirmed,
                    onNonsalesConfirmed = { nonsalesConfirmed = it },
                    salesAttestationConfirmed = salesAttestationConfirmed,
                    onSalesAttestationConfirmed = { salesAttestationConfirmed = it },
                )
                Button(
                    onClick = {
                        agent?.let {
                            model.placeCall(
                                it.id,
                                number,
                                context,
                                callPurpose,
                                permissionConfirmed,
                                if (salesCall) false else nonsalesConfirmed,
                                salesCall && salesAttestationConfirmed,
                            )
                        }
                    },
                    enabled = agent != null && number.isNotBlank() && confirmationsReady && !state.isWorking,
                    shape = RoundedCornerShape(Brand.RadiusSm),
                ) { Text("PLACE CALL") }
            }
        }
        item { ErrorText(state.error) }
    }

    if (showAsk) {
        ModalBottomSheet(onDismissRequest = { showAsk = false }, containerColor = Brand.Canvas) { AskWirelineScreen(model = model, onBack = { showAsk = false }) }
    }
}

@Composable
private fun AssistantsScreen(padding: PaddingValues, agents: List<Agent>, onCreate: () -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxSize().background(Brand.Canvas).padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("BOTS", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, color = Brand.Text)
                    Text("Voice-first Bots for calls, live conversations, text, email, scheduling, sales, support, and follow-through.", style = MaterialTheme.typography.bodyMedium, color = Brand.Text2)
                }
                TextButton(onClick = onCreate) {
                    Icon(Icons.Default.Add, contentDescription = "CREATE BOT", modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("NEW BOT")
                }
            }
        }
        if (agents.isEmpty()) {
            item {
                AssistantCard {
                    Text("NO BOTS YET", style = MaterialTheme.typography.titleMedium, color = Brand.Text)
                    Spacer(Modifier.height(4.dp))
                    Text("Build your first Voice Bot, Conversation Bot, Human Bot, or role-based Bot. One workspace, every outcome logged.", color = Brand.Text2, style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = onCreate, shape = RoundedCornerShape(Brand.RadiusSm)) { Text("CREATE BOT") }
                }
            }
        } else {
            items(agents, key = { it.id }) { agent ->
                val roleLabel = agent.role
                    ?.replace("_", " ")
                    ?.replace("assistant", "bot", ignoreCase = true)
                    ?.split(" ")
                    ?.joinToString(" ") { part -> part.replaceFirstChar { char -> char.uppercase() } }
                    ?.let { if (it.endsWith("Bot", ignoreCase = true)) it else "$it Bot" }
                    ?: "Voice Bot"
                AssistantCard {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Medallion(Icons.Default.PhoneInTalk, size = 40.dp)
                        Column(Modifier.weight(1f)) {
                            Text(agent.name, fontWeight = FontWeight.SemiBold, color = Brand.Text)
                            Text(roleLabel, style = MaterialTheme.typography.bodySmall, color = Brand.Text2)
                        }
                        Text("READY", style = MaterialTheme.typography.labelSmall, color = Brand.Success)
                    }
                }
            }
        }
    }
}

@Composable
private fun CreateAgentSheet(state: WirelineUiState, onCreate: (String, String, Boolean) -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var role by rememberSaveable { mutableStateOf("scheduler") }
    val choices = state.agentRoles.takeIf { it.isNotEmpty() }?.map { it.id to it.label }
        ?: listOf("scheduler" to "Appointment setter", "customer_service" to "Support desk", "receptionist" to "Front desk", "custom" to "Operations")
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("NEW BOT", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text)
        Text("Choose a role starter and name your Bot. Voice, live conversation, text, email, knowledge, tools, and outcomes stay in the same workspace.", style = MaterialTheme.typography.bodyMedium, color = Brand.Text2)
        OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("BOT NAME") }, placeholder = { Text("Casey") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(Brand.RadiusSm))
        Text("ROLE", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3)
        if (state.agentRoles.isEmpty() && state.isWorking) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth(), color = Brand.Accent, trackColor = Brand.Border)
            Text("Loading roles…", style = MaterialTheme.typography.bodySmall, color = Brand.Text3)
        } else {
            choices.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    row.forEach { (value, label) ->
                        val customerLabel = if (value == "personal_assistant") "Assistant" else label
                        FilterChip(selected = role == value, onClick = { role = value }, label = { Text(customerLabel.uppercase(), maxLines = 1) }, modifier = Modifier.weight(1f))
                    }
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
        ErrorText(state.error)
        Button(onClick = { onCreate(name, role, role != "personal_assistant") }, enabled = name.isNotBlank() && !state.isWorking, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(Brand.RadiusSm)) {
            if (state.isWorking) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White) else {
                Icon(Icons.Default.Add, contentDescription = "CREATE BOT")
                Spacer(Modifier.width(8.dp))
                Text("CREATE BOT")
            }
        }
    }
}

@Composable
private fun RecapsScreen(
    padding: PaddingValues,
    activeCalls: List<ActiveCall>,
    recentCalls: List<RecentCall>,
    onTakeCall: (String) -> Unit,
    onViewLiveCall: (String) -> Unit,
    onOpenCallDetail: (String) -> Unit,
) {
    LazyColumn(modifier = Modifier.fillMaxSize().background(Brand.Canvas).padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("CALLS", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, color = Brand.Text) }
        item { Text("ON A CALL", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3) }
        if (activeCalls.isEmpty()) item { Text("No calls in progress.", color = Brand.Text2) }
        items(activeCalls, key = { it.callId }) { call ->
            SectionCard {
                Text(call.label ?: call.customerNumber ?: "BotBound call", fontWeight = FontWeight.SemiBold, color = Brand.Text)
                Text(call.status?.replace("_", " ") ?: "In progress", color = Brand.Text2)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    Button(onClick = { onTakeCall(call.callId) }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(Brand.RadiusSm)) {
                        Text("TAKE CALL")
                    }
                    Button(
                        onClick = { onViewLiveCall(call.callId) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(Brand.RadiusSm),
                        colors = ButtonDefaults.buttonColors(containerColor = Brand.Panel2, contentColor = Brand.Text),
                    ) {
                        Text("VIEW")
                    }
                }
            }
        }
        item { Text("RECENT RECAPS", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3) }
        items(recentCalls, key = { it.id }) { call ->
            SectionCard {
                androidx.compose.foundation.layout.Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpenCallDetail(call.id) },
                ) {
                    Text(call.customerNumber ?: "Unknown caller", fontWeight = FontWeight.SemiBold, color = Brand.Text)
                    Text(call.summary ?: "No summary yet.", color = Brand.Text2)
                    call.outcomeTag?.let { AssistChip(onClick = {}, label = { Text(it) }) }
                }
            }
        }
    }
}

@Composable
private fun WalletScreen(padding: PaddingValues, balance: Double?, ledger: List<WalletEntry>) {
    LazyColumn(modifier = Modifier.fillMaxSize().background(Brand.Canvas).padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { SectionCard { Text("CREDIT BALANCE", style = MaterialTheme.typography.titleMedium, color = Brand.Text); Text("$${"%.2f".format(balance ?: 0.0)}", style = MaterialTheme.typography.headlineMedium, color = Brand.Text) } }
        items(ledger, key = { it.id }) { entry -> SectionCard { Text(entry.reason, fontWeight = FontWeight.SemiBold, color = Brand.Text); Text("${"%+.2f".format(entry.deltaUsd)} → ${"%.2f".format(entry.balanceAfterUsd)}", color = Brand.Text2) } }
    }
}

@Composable
private fun SettingsScreen(padding: PaddingValues, state: WirelineUiState, model: WirelineViewModel) {
    var phone by rememberSaveable(state.handoffPhone) { mutableStateOf(state.handoffPhone) }
    Column(modifier = Modifier.fillMaxSize().background(Brand.Canvas).padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionCard {
            Text("CALLBACK NUMBER", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = Brand.Text)
            Text("Where BotBound should send a call when you take over.", style = MaterialTheme.typography.bodySmall, color = Brand.Text2)
            OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("E.164 PHONE NUMBER") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(Brand.RadiusSm))
            Button(onClick = { model.saveHandoffPhone(phone) }, enabled = !state.isWorking, shape = RoundedCornerShape(Brand.RadiusSm)) { Text("SAVE") }
        }
        Button(onClick = { model.signOut() }, enabled = !state.isWorking, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Brand.Panel2, contentColor = Brand.Text), shape = RoundedCornerShape(Brand.RadiusSm)) { Text("SIGN OUT") }
        ErrorText(state.error)
    }
}

@Composable
fun SectionCard(content: @Composable () -> Unit) = AssistantCard { content() }

@Composable
private fun AgentChips(agents: List<Agent>, selectedId: String?, onSelect: (String) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        agents.take(3).forEach { agent ->
            AssistChip(
                onClick = { onSelect(agent.id) },
                label = { Text(agent.name) },
                modifier = Modifier.padding(vertical = 4.dp),
                colors = AssistChipDefaults.assistChipColors(containerColor = if (agent.id == selectedId) Brand.AccentSoft else Brand.Panel2),
            )
        }
    }
}

@Composable
fun OutboundConfirmationFields(
    salesCall: Boolean,
    permissionConfirmed: Boolean,
    onPermissionConfirmed: (Boolean) -> Unit,
    nonsalesConfirmed: Boolean,
    onNonsalesConfirmed: (Boolean) -> Unit,
    salesAttestationConfirmed: Boolean,
    onSalesAttestationConfirmed: (Boolean) -> Unit,
) {
    val uriHandler = LocalUriHandler.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ConfirmationCheck(OutboundConsentCopy.PERMISSION, permissionConfirmed, onPermissionConfirmed)
        if (salesCall) {
            ConfirmationCheck(
                OutboundConsentCopy.SALES_ATTESTATION,
                salesAttestationConfirmed,
                onSalesAttestationConfirmed,
            )
        } else {
            ConfirmationCheck(OutboundConsentCopy.NONSALES, nonsalesConfirmed, onNonsalesConfirmed)
        }
        TextButton(
            onClick = { uriHandler.openUri(OutboundConsentCopy.LEGAL_URL) },
            contentPadding = PaddingValues(0.dp),
        ) {
            Text(OutboundConsentCopy.LEARN_MORE, style = MaterialTheme.typography.labelSmall, color = Brand.Accent)
        }
    }
}

@Composable
private fun ConfirmationCheck(label: String, checked: Boolean, onChecked: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Checkbox(checked = checked, onCheckedChange = onChecked)
        Text(label, style = MaterialTheme.typography.bodySmall, color = Brand.Text)
    }
}

@Composable
private fun ErrorText(error: String?) {
    if (!error.isNullOrBlank()) Text(text = error, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
}
