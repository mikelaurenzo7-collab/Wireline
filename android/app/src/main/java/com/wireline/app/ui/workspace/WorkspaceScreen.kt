package com.wireline.app.ui.workspace

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.wireline.app.networking.WirelineAPI
import com.wireline.app.ui.theme.WirelineTheme
import kotlinx.coroutines.launch

@Composable
fun WorkspaceScreen(
    modifier: Modifier = Modifier,
    onAgentSelected: (String) -> Unit = {}
) {
    var agents by remember { mutableStateOf<List<Map<String, Any>>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        scope.launch {
            try {
                agents = WirelineAPI.getAgents("personal")
            } catch (e: Exception) {
                // Handle error
            } finally {
                isLoading = false
            }
        }
    }

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

            if (isLoading) {
                CircularProgressIndicator()
            } else {
                agents.forEach { agent ->
                    val name = agent["name"] as? String ?: "Unknown"
                    val status = agent["status"] as? String ?: "unknown"

                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        onClick = { onAgentSelected(agent["id"] as String) }
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(name, style = MaterialTheme.typography.titleMedium)
                            Text(status, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                        }
                    }
                }
            }
        }
    }
}