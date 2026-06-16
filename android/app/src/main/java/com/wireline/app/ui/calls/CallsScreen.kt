package com.wireline.app.ui.calls

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.wireline.app.ui.theme.WirelineTheme

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.History

/**
 * Calls screen for Android - mirrors iOS CallsView
 * Shows active calls + recent history
 */
@Composable
fun CallsScreen(
    onCallSelected: (String) -> Unit = {}
) {
    val activeCalls = remember {
        listOf(
            CallItem("1", "Acme Corp", "In Progress", true),
            CallItem("2", "Sarah Chen", "On Hold", true)
        )
    }

    val recentCalls = remember {
        listOf(
            CallItem("3", "Delta Logistics", "Completed - 14m", false),
            CallItem("4", "Vanguard Inc", "Completed - 2h", false),
            CallItem("5", "Acme Corp", "Completed - Yesterday", false)
        )
    }

    WirelineTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            Text(
                "Calls",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            // Active Calls
            if (activeCalls.isNotEmpty()) {
                Text("Active", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(8.dp))

                activeCalls.forEach { call ->
                    CallRow(call = call, onClick = { onCallSelected(call.id) })
                }

                Spacer(Modifier.height(24.dp))
            }

            // Recent History
            Text("Recent", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
            Spacer(Modifier.height(8.dp))

            LazyColumn {
                items(recentCalls) { call ->
                    CallRow(call = call, onClick = { onCallSelected(call.id) })
                }
            }
        }
    }
}

@Composable
private fun CallRow(call: CallItem, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clickable { onClick() },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(call.contact, style = MaterialTheme.typography.titleMedium)
                Text(call.status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }

            if (call.isActive) {
                Icon(
                    Icons.Default.Call,
                    contentDescription = "Active call",
                    tint = MaterialTheme.colorScheme.primary
                )
            } else {
                Icon(
                    Icons.Default.History,
                    contentDescription = "Past call",
                    tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                )
            }
        }
    }
}

data class CallItem(
    val id: String,
    val contact: String,
    val status: String,
    val isActive: Boolean
)