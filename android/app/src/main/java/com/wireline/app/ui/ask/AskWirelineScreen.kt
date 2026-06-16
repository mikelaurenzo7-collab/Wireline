package com.wireline.app.ui.ask

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.wireline.app.ui.theme.WirelineTheme

/**
 * Ask Wireline screen for Android
 * Mirrors the iOS AskWirelineView experience
 */
@Composable
fun AskWirelineScreen(
    onBack: () -> Unit = {}
) {
    var inputText by remember { mutableStateOf("") }

    WirelineTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            Text(
                "Ask Wireline",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(bottom = 24.dp)
            )

            OutlinedTextField(
                value = inputText,
                onValueChange = { inputText = it },
                label = { Text("What do you need help with?") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3
            )

            Spacer(Modifier.height(16.dp))

            Button(
                onClick = { /* TODO: Call backend */ },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Send to Wireline")
            }

            Spacer(Modifier.height(32.dp))

            Text(
                "Examples:",
                style = MaterialTheme.typography.titleSmall
            )
            Text("• Call the pharmacy and check my prescription", modifier = Modifier.padding(top = 8.dp))
            Text("• Reschedule my meeting with Acme Corp", modifier = Modifier.padding(top = 4.dp))
            Text("• Summarize today's calls", modifier = Modifier.padding(top = 4.dp))
        }
    }
}