package com.wireline.app.ui.setup

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.wireline.app.data.Agent
import com.wireline.app.data.MobileAgentSetup
import com.wireline.app.data.WirelineApi
import com.wireline.app.ui.SectionCard
import com.wireline.app.ui.theme.Brand
import kotlinx.coroutines.launch

private data class AgentAction(val id: String, val title: String, val detail: String)

private val agentActions = listOf(
    AgentAction("view_recent_interactions", "Use recent context", "Keeps a request connected to what already happened."),
    AgentAction("escalate_to_human", "Ask me first", "Returns sensitive, unclear, or high-stakes work for approval."),
    AgentAction("create_followup_task", "Create a follow-up", "Saves a reminder when a customer, vendor, or caller needs action."),
    AgentAction("send_email", "Send an email", "Sends confirmations and approved follow-ups."),
    AgentAction("send_text_message", "Send a text", "Sends a text update when messaging is appropriate."),
    AgentAction("check_calendar_availability", "Check calendars", "Looks for a time before proposing it."),
    AgentAction("book_appointment", "Book an appointment", "Creates an event once the slot is approved."),
    AgentAction("navigate_to", "Open directions", "Sends navigation to your phone when a call gives you an address."),
    AgentAction("add_reminder", "Add a reminder", "Creates a reminder for follow-through."),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KnowledgeScreen(padding: PaddingValues) {
    val context = LocalContext.current
    val api = remember { WirelineApi(context) }
    val scope = rememberCoroutineScope()
    var agents by remember { mutableStateOf<List<Agent>>(emptyList()) }
    var selectedId by remember { mutableStateOf("") }
    var setup by remember { mutableStateOf<MobileAgentSetup?>(null) }
    var draft by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("knowledge") }
    var loading by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun loadSetup() {
        if (selectedId.isBlank()) {
            setup = null
            return
        }
        runCatching { api.agentSetup(selectedId) }
            .onSuccess { setup = it; error = null }
            .onFailure { error = it.message }
    }

    LaunchedEffect(Unit) {
        runCatching { api.agents().agents }
            .onSuccess { rows -> agents = rows; selectedId = rows.firstOrNull()?.id.orEmpty() }
            .onFailure { error = it.message }
        loading = false
    }
    LaunchedEffect(selectedId) { loadSetup() }

    Column(modifier = Modifier.fillMaxSize().background(Brand.Canvas).padding(padding)) {
        TopAppBar(
            title = { Text("KNOWLEDGE", fontWeight = FontWeight.SemiBold) },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Brand.Canvas, titleContentColor = Brand.Text),
        )
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.padding(24.dp), color = Brand.Accent)
        } else if (agents.isEmpty()) {
            Text("Create a Bot first, then add the facts, rules, and sources that make it useful.", modifier = Modifier.padding(20.dp), color = Brand.Text2)
        } else {
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (agents.size > 1) item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        agents.forEach { agent ->
                            FilterChip(selected = agent.id == selectedId, onClick = { selectedId = agent.id }, label = { Text(agent.name) })
                        }
                    }
                }
                item {
                    SectionCard {
                        Text("KNOWLEDGE", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3)
                        val facts = setup?.knowledge.orEmpty()
                        if (facts.isEmpty()) Text("No saved details yet.", color = Brand.Text2)
                        facts.forEach { Text(it.content, color = Brand.Text) }
                    }
                }
                item {
                    SectionCard {
                        Text("GUARDRAILS", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3)
                        val rules = setup?.directives.orEmpty()
                        if (rules.isEmpty()) Text("No saved rules yet.", color = Brand.Text2)
                        rules.forEach { Text(it.content, color = Brand.Text) }
                    }
                }
                item {
                    SectionCard {
                        Text("ADD A DETAIL", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(selected = kind == "knowledge", onClick = { kind = "knowledge" }, label = { Text("DETAIL") })
                            FilterChip(selected = kind == "directive", onClick = { kind = "directive" }, label = { Text("RULE") })
                        }
                        OutlinedTextField(
                            value = draft,
                            onValueChange = { draft = it },
                            label = { Text(if (kind == "knowledge") "FACT, PREFERENCE, ROUTINE, OR POLICY" else "WHAT SHOULD YOUR BOT DO OR AVOID?") },
                            modifier = Modifier.fillMaxWidth(),
                            minLines = 3,
                            shape = androidx.compose.foundation.shape.RoundedCornerShape(Brand.RadiusMd),
                        )
                        Button(
                            onClick = {
                                val value = draft.trim()
                                if (value.isBlank()) return@Button
                                saving = true
                                scope.launch {
                                    runCatching { api.saveSetupEntry(selectedId, kind, value) }
                                        .onSuccess { draft = ""; loadSetup() }
                                        .onFailure { error = it.message }
                                    saving = false
                                }
                            },
                            enabled = draft.isNotBlank() && !saving,
                            modifier = Modifier.fillMaxWidth(),
                            shape = androidx.compose.foundation.shape.RoundedCornerShape(Brand.RadiusMd),
                            colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = Brand.Accent),
                        ) { Text(if (saving) "SAVING…" else if (kind == "knowledge") "SAVE DETAIL" else "SAVE RULE") }
                    }
                }
                error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActionsScreen(padding: PaddingValues) {
    val context = LocalContext.current
    val api = remember { WirelineApi(context) }
    val scope = rememberCoroutineScope()
    var agents by remember { mutableStateOf<List<Agent>>(emptyList()) }
    var selectedId by remember { mutableStateOf("") }
    var enabled by remember { mutableStateOf<Set<String>>(emptySet()) }
    var loading by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun loadSetup() {
        if (selectedId.isBlank()) {
            enabled = emptySet()
            return
        }
        runCatching { api.agentSetup(selectedId) }
            .onSuccess { enabled = it.enabledTools.toSet(); error = null }
            .onFailure { error = it.message }
    }

    LaunchedEffect(Unit) {
        runCatching { api.agents().agents }
            .onSuccess { rows -> agents = rows; selectedId = rows.firstOrNull()?.id.orEmpty() }
            .onFailure { error = it.message }
        loading = false
    }
    LaunchedEffect(selectedId) { loadSetup() }

    Column(modifier = Modifier.fillMaxSize().background(Brand.Canvas).padding(padding)) {
        TopAppBar(
            title = { Text("CONNECTIONS", fontWeight = FontWeight.SemiBold) },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Brand.Canvas, titleContentColor = Brand.Text),
        )
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.padding(24.dp), color = Brand.Accent)
        } else if (agents.isEmpty()) {
            Text("Create a Bot first, then choose what it is allowed to do.", modifier = Modifier.padding(20.dp), color = Brand.Text2)
        } else {
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (agents.size > 1) item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        agents.forEach { agent ->
                            FilterChip(selected = agent.id == selectedId, onClick = { selectedId = agent.id }, label = { Text(agent.name) })
                        }
                    }
                }
                item {
                    SectionCard {
                        Text("WHAT YOUR BOT CAN DO", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Brand.Text3)
                        agentActions.forEach { action ->
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(action.title.uppercase(), color = Brand.Text)
                                    Text(action.detail, style = MaterialTheme.typography.bodySmall, color = Brand.Text2)
                                }
                                Switch(
                                    checked = enabled.contains(action.id),
                                    onCheckedChange = { checked ->
                                        val updated = enabled.toMutableSet().also { if (checked) it.add(action.id) else it.remove(action.id) }.toSet()
                                        enabled = updated
                                        saving = true
                                        scope.launch {
                                            runCatching { api.setEnabledTools(selectedId, updated.sorted()) }
                                                .onFailure { error = it.message; loadSetup() }
                                            saving = false
                                        }
                                    },
                                    enabled = !saving,
                                )
                            }
                        }
                    }
                }
                item {
                    Text(
                        "Use mobile for fast approvals and core call workflows. Configure deeper CRM, calendar, email, text, and billing connections in the web workspace.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Brand.Text2,
                    )
                }
                error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
            }
        }
    }
}
