package com.wireline.app.ui.ask

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Summarize
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.wireline.app.ui.OutboundConfirmationFields
import com.wireline.app.ui.OutboundPurposeCopy
import com.wireline.app.ui.WirelineViewModel
import com.wireline.app.ui.theme.Brand
import com.wireline.app.ui.theme.WirelineTheme

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AskWirelineScreen(
    model: WirelineViewModel,
    onBack: () -> Unit = {},
) {
    val state = model.state
    var query by remember { mutableStateOf("") }
    var answer by remember { mutableStateOf<String?>(null) }
    var showCall by remember { mutableStateOf(false) }
    var number by remember { mutableStateOf("") }
    var context by remember { mutableStateOf("") }
    var purpose by remember { mutableStateOf(OutboundPurposeCopy.APPOINTMENT) }
    var permissionConfirmed by remember { mutableStateOf(false) }
    var nonsalesConfirmed by remember { mutableStateOf(false) }
    var salesAttestationConfirmed by remember { mutableStateOf(false) }
    var selectedAgentId by remember { mutableStateOf("") }

    val selectedAgent = state.agents.firstOrNull { it.id == selectedAgentId }
        ?: state.agents.firstOrNull()
    val salesCall = purpose == OutboundPurposeCopy.SALES
    val confirmationsReady =
        permissionConfirmed && if (salesCall) salesAttestationConfirmed else nonsalesConfirmed
    fun selectPurpose(next: String) {
        purpose = next
        permissionConfirmed = false
        nonsalesConfirmed = false
        salesAttestationConfirmed = false
    }

    LaunchedEffect(state.agents, selectedAgentId) {
        if (selectedAgentId.isBlank() || state.agents.none { it.id == selectedAgentId }) {
            selectedAgentId = state.agents.firstOrNull()?.id.orEmpty()
        }
    }

    fun summarizeLastCall() {
        val call = state.recentCalls.firstOrNull()
        answer = if (call == null) {
            "No calls yet."
        } else {
            val who = call.customerNumber ?: "an unknown number"
            val summary = call.summary ?: "No summary is available yet."
            "Last call with $who\n\n$summary"
        }
    }

    fun attentionSummary() {
        val followUps = state.recentCalls.count { it.outcomeTag == "followup" }
        answer = if (followUps == 0) {
            "You're caught up. No recent calls are flagged for follow-up."
        } else {
            "$followUps recent call${if (followUps == 1) "" else "s"} need follow-up. Open Calls to review them."
        }
    }

    fun answerQuery(raw: String) {
        val normalized = raw.trim().lowercase()
        if (normalized.isBlank()) return
        answer = when {
            normalized.contains("balance") || normalized.contains("wallet") || normalized.contains("credit") ->
                "Runtime Balance: $${"%.2f".format(state.wallet?.balanceUsd ?: 0.0)}"
            normalized.contains("bot") || normalized.contains("agent") ->
                if (state.agents.isEmpty()) "No Bots yet." else state.agents.joinToString("\n") { "• ${it.name}" }
            normalized.contains("call") || normalized.contains("summary") -> {
                val call = state.recentCalls.firstOrNull()
                call?.summary ?: "No recent call summary is available yet."
            }
            normalized.contains("attention") || normalized.contains("follow") -> {
                val count = state.recentCalls.count { it.outcomeTag == "followup" }
                if (count == 0) "Nothing is flagged for follow-up." else "$count call${if (count == 1) "" else "s"} need follow-up."
            }
            else -> "I can check your Bots, recent calls, follow-ups, and Runtime Balance here."
        }
        query = ""
    }

    WirelineTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Brand.Canvas)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "ASK BOTBOUND",
                        style = MaterialTheme.typography.labelSmall,
                        color = Brand.Text3,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        "What do you need?",
                        style = MaterialTheme.typography.headlineSmall,
                        color = Brand.Text,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                TextButton(onClick = onBack) { Text("Done") }
            }

            answer?.let { value ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Brand.Panel),
                    shape = RoundedCornerShape(Brand.RadiusMd),
                    border = BorderStroke(1.dp, Brand.Border),
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Text(
                            value,
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.bodyMedium,
                            color = Brand.Text,
                        )
                        IconButton(onClick = { answer = null }, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Default.Close, contentDescription = "Dismiss", tint = Brand.Text3)
                        }
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                QuickAction(
                    title = "Last call",
                    icon = Icons.Default.Summarize,
                    onClick = ::summarizeLastCall,
                    modifier = Modifier.weight(1f),
                )
                QuickAction(
                    title = "Needs attention",
                    icon = Icons.Default.Notifications,
                    onClick = ::attentionSummary,
                    modifier = Modifier.weight(1f),
                )
            }

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Brand.Panel),
                shape = RoundedCornerShape(Brand.RadiusMd),
                border = BorderStroke(1.dp, Brand.Border),
            ) {
                Column {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showCall = !showCall }
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .background(Brand.AccentSoft, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Default.Call, contentDescription = null, tint = Brand.Accent)
                        }
                        Spacer(Modifier.size(12.dp))
                        Text(
                            "Place a call",
                            modifier = Modifier.weight(1f),
                            color = Brand.Text,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Icon(
                            if (showCall) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                            contentDescription = if (showCall) "Collapse" else "Expand",
                            tint = Brand.Text3,
                        )
                    }

                    AnimatedVisibility(showCall) {
                        Column(
                            modifier = Modifier.padding(horizontal = 16.dp).padding(bottom = 16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            HorizontalDivider(color = Brand.Border)

                            if (state.agents.isNotEmpty()) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    state.agents.take(3).forEach { bot ->
                                        AssistChip(
                                            onClick = { selectedAgentId = bot.id },
                                            label = { Text(bot.name) },
                                            colors = AssistChipDefaults.assistChipColors(
                                                containerColor = if (bot.id == selectedAgent?.id) Brand.AccentSoft else Brand.Raised,
                                                labelColor = Brand.Text,
                                            ),
                                        )
                                    }
                                }
                            }

                            OutlinedTextField(
                                value = number,
                                onValueChange = { number = it },
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Phone number") },
                                singleLine = true,
                                colors = fieldColors(),
                            )
                            OutlinedTextField(
                                value = context,
                                onValueChange = { context = it },
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("What should the Bot handle?") },
                                maxLines = 3,
                                colors = fieldColors(),
                            )

                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                FilterChip(
                                    selected = purpose == OutboundPurposeCopy.APPOINTMENT,
                                    onClick = { selectPurpose(OutboundPurposeCopy.APPOINTMENT) },
                                    label = { Text(OutboundPurposeCopy.APPOINTMENT_LABEL) },
                                )
                                FilterChip(
                                    selected = purpose == OutboundPurposeCopy.CALLBACK,
                                    onClick = { selectPurpose(OutboundPurposeCopy.CALLBACK) },
                                    label = { Text(OutboundPurposeCopy.CALLBACK_LABEL) },
                                )
                                FilterChip(
                                    selected = purpose == OutboundPurposeCopy.SALES,
                                    onClick = { selectPurpose(OutboundPurposeCopy.SALES) },
                                    label = { Text(OutboundPurposeCopy.SALES_LABEL) },
                                )
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
                                    selectedAgent?.let { bot ->
                                        val destination = number
                                        model.placeCall(
                                            bot.id,
                                            destination,
                                            context,
                                            purpose,
                                            permissionConfirmed,
                                            if (salesCall) false else nonsalesConfirmed,
                                            salesCall && salesAttestationConfirmed,
                                        )
                                        answer = "Call requested with ${bot.name} for $destination."
                                        number = ""
                                        context = ""
                                        selectPurpose(OutboundPurposeCopy.APPOINTMENT)
                                        showCall = false
                                    }
                                },
                                enabled = selectedAgent != null && number.isNotBlank() && confirmationsReady && !state.isWorking,
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.buttonColors(containerColor = Brand.Accent),
                            ) {
                                if (state.isWorking) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(18.dp),
                                        strokeWidth = 2.dp,
                                        color = Color.White,
                                    )
                                } else {
                                    Text("Place call", fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                    }
                }
            }

            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Ask about Bots, calls, follow-ups, or balance") },
                maxLines = 3,
                trailingIcon = {
                    IconButton(onClick = { answerQuery(query) }, enabled = query.isNotBlank()) {
                        Icon(Icons.Default.Send, contentDescription = "Send", tint = Brand.Accent)
                    }
                },
                colors = fieldColors(),
            )
        }
    }
}

@Composable
private fun QuickAction(
    title: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = Brand.Panel),
        border = BorderStroke(1.dp, Brand.Border),
        shape = RoundedCornerShape(Brand.RadiusMd),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null, tint = Brand.Accent, modifier = Modifier.size(18.dp))
            Spacer(Modifier.size(8.dp))
            Text(title, modifier = Modifier.weight(1f), color = Brand.Text, fontWeight = FontWeight.Medium)
            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Brand.Text3, modifier = Modifier.size(16.dp))
        }
    }
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Brand.Text,
    unfocusedTextColor = Brand.Text,
    focusedContainerColor = Brand.Panel,
    unfocusedContainerColor = Brand.Panel,
    focusedBorderColor = Brand.Accent,
    unfocusedBorderColor = Brand.Border,
)
