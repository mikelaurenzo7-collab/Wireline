package com.wireline.app.ui.ask

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.wireline.app.ui.OutboundConsentFields
import com.wireline.app.ui.WirelineViewModel
import com.wireline.app.ui.theme.Brand
import com.wireline.app.ui.theme.WirelineTheme

/**
 * High-Fidelity "Ask Wireline" Screen for Android
 * Perfectly mirrors the premium iOS AskWirelineView experience and layout.
 * Provides actual functional actions, place-call mechanisms, and query processing.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AskWirelineScreen(
    model: WirelineViewModel,
    onBack: () -> Unit = {}
) {
    val state = model.state
    var inputText by remember { mutableStateOf("") }
    var answerText by remember { mutableStateOf<String?>(null) }
    var isLocalWorking by remember { mutableStateOf(false) }
    
    // Outbound state
    var expandOutbound by remember { mutableStateOf(false) }
    var outboundNumber by remember { mutableStateOf("") }
    var outboundConsent by remember { mutableStateOf(false) }
    var outboundContext by remember { mutableStateOf("") }
    var outboundCallPurpose by remember { mutableStateOf("service_or_requested") }
    var selectedAgentId by remember { mutableStateOf("") }
    val selectedAgent = state.agents.firstOrNull { it.id == selectedAgentId }
        ?: state.agents.firstOrNull()
    val requiresMarketingConsent = outboundCallPurpose == "marketing_or_sales"

    LaunchedEffect(state.agents, selectedAgentId) {
        if (selectedAgentId.isBlank() || state.agents.none { it.id == selectedAgentId }) {
            selectedAgentId = state.agents.firstOrNull()?.id.orEmpty()
        }
    }

    // Functions mirroring iOS logic
    val onSummarizeLastCall: () -> Unit = {
        isLocalWorking = true
        val lastCall = state.recentCalls.firstOrNull()
        if (lastCall == null) {
            answerText = "You don't have any calls yet."
        } else {
            val who = lastCall.customerNumber ?: "an unknown number"
            val direction = lastCall.direction ?: "incoming"
            val summary = lastCall.summary ?: "No summary available."
            answerText = "Last $direction call with $who:\n\n$summary"
        }
        isLocalWorking = false
    }

    val onCheckAttention: () -> Unit = {
        isLocalWorking = true
        val totalRecent = state.recentCalls.size
        val needsFollowUp = state.recentCalls.count { it.outcomeTag == "followup" }
        if (totalRecent == 0) {
            answerText = "No recent calls to report."
        } else if (needsFollowUp == 0) {
            answerText = "You're all caught up - $totalRecent recent calls, none flagged for follow-up."
        } else {
            answerText = "$needsFollowUp of your $totalRecent recent calls need follow-up. Review them in Calls."
        }
        isLocalWorking = false
    }

    val onSendCustomQuery: (String) -> Unit = { query ->
        if (query.isNotBlank()) {
            isLocalWorking = true
            val cleanQuery = query.lowercase().trim()
            
            answerText = when {
                cleanQuery.contains("wallet") || cleanQuery.contains("credit") || cleanQuery.contains("balance") || cleanQuery.contains("money") -> {
                    val balance = state.wallet?.balanceUsd ?: 0.0
                    val planSummary = state.me?.account?.let { account ->
                        val status = account.subscriptionStatus.replace('_', ' ')
                        "Your ${account.planName} plan status is $status."
                    } ?: "Plan status is still loading."
                    "Your current prepaid balance is $${"%.2f".format(balance)}. $planSummary"
                }
                cleanQuery.contains("agent") || cleanQuery.contains("roster") || cleanQuery.contains("bot") || cleanQuery.contains("bots") -> {
                    if (state.agents.isEmpty()) {
                        "You don't have any agents on your roster currently."
                    } else {
                        val names = state.agents.joinToString("\n") { "• ${it.name} (${it.role ?: "Support"})" }
                        "Here are your active voice agents:\n\n$names"
                    }
                }
                cleanQuery.contains("summary") || cleanQuery.contains("last call") || cleanQuery.contains("summarize") -> {
                    val lastCall = state.recentCalls.firstOrNull()
                    if (lastCall == null) {
                        "You don't have any calls yet."
                    } else {
                        val who = lastCall.customerNumber ?: "an unknown number"
                        val summary = lastCall.summary ?: "No summary available."
                        "Last call with $who: $summary"
                    }
                }
                cleanQuery.contains("attention") || cleanQuery.contains("follow-up") || cleanQuery.contains("todo") -> {
                    val totalRecent = state.recentCalls.size
                    val needsFollowUp = state.recentCalls.count { it.outcomeTag == "followup" }
                    if (needsFollowUp == 0) {
                        "All caught up! $totalRecent recent calls, none flagged."
                    } else {
                        "$needsFollowUp of your $totalRecent recent calls need follow-up."
                    }
                }
                else -> {
                    "I can verify ${state.agents.size} configured agents and ${state.activeCalls.size} live calls right now. Try asking me 'Summarize last call', 'Show my agent roster', or 'What is my wallet balance?'."
                }
            }
            inputText = ""
            isLocalWorking = false
        }
    }

    WirelineTheme {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Brand.Canvas)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(24.dp)
            ) {
                // Header medallion & title
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier.size(68.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .size(56.dp)
                                .background(Brand.Accent, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Mic,
                                contentDescription = "Wireline",
                                tint = Color.White,
                                modifier = Modifier.size(28.dp)
                            )
                        }
                    }
                    
                    Spacer(Modifier.height(12.dp))
                    
                    Text(
                        text = "What can Wireline do?",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.Text
                    )
                }

                // Dynamic Answer Card with Purple Ambient Glow
                answerText?.let { answer ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 20.dp),
                        colors = CardDefaults.cardColors(containerColor = Brand.Panel),
                        shape = RoundedCornerShape(Brand.RadiusLg),
                        border = BorderStroke(1.dp, Brand.Border)
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    "Wireline response",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = Brand.Text2,
                                    fontWeight = FontWeight.Bold
                                )
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = "Dismiss",
                                    tint = Brand.Text3,
                                    modifier = Modifier
                                        .size(16.dp)
                                        .clickable { answerText = null }
                                )
                            }
                            Spacer(Modifier.height(10.dp))
                            Text(
                                text = answer,
                                style = MaterialTheme.typography.bodyMedium,
                                color = Brand.Text
                            )
                        }
                    }
                }

                // Loading Indicator
                if (isLocalWorking || state.isWorking) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = Brand.Accent, strokeWidth = 3.dp)
                    }
                }

                // Action Menu Cards
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // Action 1: Place a call (Expandable)
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Brand.Panel),
                        shape = RoundedCornerShape(Brand.RadiusLg),
                        border = BorderStroke(1.dp, Brand.Border)
                    ) {
                        Column {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { expandOutbound = !expandOutbound }
                                    .padding(horizontal = 16.dp, vertical = 14.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(36.dp)
                                        .background(Brand.AccentSoft, CircleShape),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Phone,
                                        contentDescription = "Place a call",
                                        tint = Brand.Accent,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                                Spacer(Modifier.width(14.dp))
                                Text(
                                    "Place a call",
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium,
                                    color = Brand.Text
                                )
                                Spacer(Modifier.weight(1f))
                                Icon(
                                    imageVector = if (expandOutbound) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                                    contentDescription = if (expandOutbound) "Collapse" else "Expand",
                                    tint = Brand.Text3
                                )
                            }

                            AnimatedVisibility(visible = expandOutbound) {
                                Column(
                                    modifier = Modifier
                                        .padding(horizontal = 16.dp)
                                        .padding(bottom = 16.dp),
                                    verticalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Divider(color = Brand.Border)
                                    
                                    Text("Select agent", style = MaterialTheme.typography.labelSmall, color = Brand.Text2)
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        state.agents.take(3).forEach { agent ->
                                            val isSelected = agent.id == selectedAgentId
                                            val containerColor = if (isSelected) Brand.Accent else Brand.Raised
                                            val contentColor = if (isSelected) Color.White else Brand.Text
                                            
                                            AssistChip(
                                                onClick = { selectedAgentId = agent.id },
                                                label = { Text(agent.name) },
                                                colors = AssistChipDefaults.assistChipColors(
                                                    containerColor = containerColor,
                                                    labelColor = contentColor
                                                ),
                                                border = AssistChipDefaults.assistChipBorder(borderColor = Brand.Border)
                                            )
                                        }
                                    }

                                    OutlinedTextField(
                                        value = outboundNumber,
                                        onValueChange = { outboundNumber = it },
                                        label = { Text("Customer phone number") },
                                        modifier = Modifier.fillMaxWidth(),
                                        singleLine = true,
                                        colors = OutlinedTextFieldDefaults.colors(
                                            focusedBorderColor = Brand.Accent,
                                            unfocusedBorderColor = Brand.Border
                                        )
                                    )

                                    OutlinedTextField(
                                        value = outboundContext,
                                        onValueChange = { outboundContext = it },
                                        label = { Text("Context or topic") },
                                        modifier = Modifier.fillMaxWidth(),
                                        singleLine = true,
                                        colors = OutlinedTextFieldDefaults.colors(
                                            focusedBorderColor = Brand.Accent,
                                            unfocusedBorderColor = Brand.Border
                                        )
                                    )

                                    Text("Call type", style = MaterialTheme.typography.labelSmall, color = Brand.Text2)
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        FilterChip(
                                            selected = outboundCallPurpose == "service_or_requested",
                                            onClick = {
                                                outboundCallPurpose = "service_or_requested"
                                                outboundConsent = false
                                            },
                                            label = { Text("Service") }
                                        )
                                        FilterChip(
                                            selected = outboundCallPurpose == "callback",
                                            onClick = {
                                                outboundCallPurpose = "callback"
                                                outboundConsent = false
                                            },
                                            label = { Text("Callback") }
                                        )
                                        FilterChip(
                                            selected = outboundCallPurpose == "marketing_or_sales",
                                            onClick = {
                                                outboundCallPurpose = "marketing_or_sales"
                                                outboundConsent = false
                                            },
                                            label = { Text("Marketing") }
                                        )
                                    }

                                    if (requiresMarketingConsent) {
                                        Row(
                                            verticalAlignment = Alignment.Top,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        ) {
                                            Checkbox(
                                                checked = outboundConsent,
                                                onCheckedChange = { outboundConsent = it },
                                            )
                                            OutboundConsentFields()
                                        }
                                    }

                                    Button(
                                        onClick = {
                                            selectedAgent?.let {
                                                val requestedNumber = outboundNumber
                                                model.placeCall(
                                                    it.id,
                                                    requestedNumber,
                                                    outboundContext,
                                                    outboundCallPurpose,
                                                    requiresMarketingConsent && outboundConsent
                                                )
                                                answerText = "Outbound call request submitted with ${it.name} for $requestedNumber."
                                                outboundNumber = ""
                                                outboundContext = ""
                                                outboundConsent = false
                                                outboundCallPurpose = "service_or_requested"
                                                expandOutbound = false
                                            }
                                        },
                                        enabled = selectedAgent != null && outboundNumber.isNotBlank() && (!requiresMarketingConsent || outboundConsent) && !state.isWorking,
                                        modifier = Modifier.fillMaxWidth(),
                                        colors = ButtonDefaults.buttonColors(containerColor = Brand.Accent),
                                        shape = RoundedCornerShape(Brand.RadiusMd)
                                    ) {
                                        Text("Place call", fontWeight = FontWeight.SemiBold)
                                    }
                                }
                            }
                        }
                    }

                    // Action 2: Summarize my last call
                    ActionRowCard(
                        title = "Summarize my last call",
                        icon = Icons.Default.Comment,
                        onClick = onSummarizeLastCall
                    )

                    // Action 3: What needs my attention
                    ActionRowCard(
                        title = "What needs my attention",
                        icon = Icons.Default.Notifications,
                        onClick = onCheckAttention
                    )
                }

                Spacer(Modifier.height(32.dp))

                // Custom Query Section
                Text(
                    text = "Or ask a custom question:",
                    style = MaterialTheme.typography.titleSmall,
                    color = Brand.Text2,
                    modifier = Modifier.padding(bottom = 12.dp)
                )

                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    
                    OutlinedTextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        placeholder = { Text("Ask about agents, wallet balance, or call digests...", color = Brand.Text3) },
                        modifier = Modifier.fillMaxWidth(),
                        maxLines = 1,
                        trailingIcon = {
                            IconButton(
                                onClick = { onSendCustomQuery(inputText) },
                                enabled = inputText.isNotBlank()
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Send,
                                    contentDescription = "Send",
                                    tint = if (inputText.isNotBlank()) Brand.Accent else Brand.Text3
                                )
                            }
                        },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Brand.Text,
                            unfocusedTextColor = Brand.Text,
                            containerColor = Brand.Panel,
                            focusedBorderColor = Brand.Accent,
                            unfocusedBorderColor = Brand.Border
                        ),
                        shape = RoundedCornerShape(Brand.RadiusMd)
                    )
                }

                Spacer(Modifier.height(24.dp))

                // Example Tips
                Text(
                    text = "Try these commands:",
                    style = MaterialTheme.typography.labelSmall,
                    color = Brand.Text2,
                    fontWeight = FontWeight.Bold
                )
                
                Spacer(Modifier.height(8.dp))
                
                Text("• \"Which agents do I have on my roster?\"", style = MaterialTheme.typography.bodySmall, color = Brand.Text3, modifier = Modifier.padding(vertical = 2.dp))
                Text("• \"What is my wallet credit balance?\"", style = MaterialTheme.typography.bodySmall, color = Brand.Text3, modifier = Modifier.padding(vertical = 2.dp))
                Text("• \"Show me which calls need attention\"", style = MaterialTheme.typography.bodySmall, color = Brand.Text3, modifier = Modifier.padding(vertical = 2.dp))
            }
        }
    }
}

@Composable
private fun ActionRowCard(
    title: String,
    icon: ImageVector,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Brand.Panel),
        shape = RoundedCornerShape(Brand.RadiusLg),
        border = BorderStroke(1.dp, Brand.Border)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onClick() }
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .background(Brand.AccentSoft, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = title,
                    tint = Brand.Accent,
                    modifier = Modifier.size(16.dp)
                )
            }
            Spacer(Modifier.width(14.dp))
            Text(
                title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = Brand.Text
            )
            Spacer(Modifier.weight(1f))
            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = Brand.Text3,
                modifier = Modifier.size(16.dp)
            )
        }
    }
}
