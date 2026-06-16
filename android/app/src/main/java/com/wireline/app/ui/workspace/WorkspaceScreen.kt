package com.wireline.app.ui.workspace

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.wireline.app.ui.theme.WirelineTheme

@Composable
fun WorkspaceScreen(
    modifier: Modifier = Modifier,
    onAgentSelected: (String) -> Unit = {}
) {
    WirelineTheme {
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            Text(
                "Workspace",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            // Placeholder content - will be expanded
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Your Agents", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(12.dp))
                    Text("Agent 1 - Idle", modifier = Modifier.padding(vertical = 4.dp))
                    Text("Agent 2 - On Call", modifier = Modifier.padding(vertical = 4.dp))
                    Text("Agent 3 - Training", modifier = Modifier.padding(vertical = 4.dp))

                    Spacer(Modifier.height(16.dp))
                    Button(onClick = { /* TODO */ }) {
                        Text("Manage Fleet")
                    }
                }
            }
        }
    }
}