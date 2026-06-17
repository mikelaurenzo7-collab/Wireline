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

            Box(
                modifier = Modifier.fillMaxWidth(),
                contentAlignment = androidx.compose.ui.Alignment.Center
            ) {
                // Blur halo
                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .androidx.compose.ui.draw.scale(1.05f)
                        .androidx.compose.ui.draw.blur(24.dp)
                        .androidx.compose.foundation.background(
                            com.wireline.app.ui.theme.Brand.Purple.copy(alpha = 0.4f),
                            androidx.compose.foundation.shape.RoundedCornerShape(8.dp)
                        )
                )
                
                Button(
                    onClick = { /* TODO: Call backend */ },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = androidx.compose.ui.graphics.Color.Transparent),
                    contentPadding = PaddingValues(0.dp),
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .androidx.compose.foundation.background(
                                brush = androidx.compose.ui.graphics.Brush.linearGradient(
                                    colors = listOf(
                                        com.wireline.app.ui.theme.Brand.Purple,
                                        com.wireline.app.ui.theme.Brand.PurpleDeep
                                    )
                                )
                            )
                            .padding(16.dp),
                        contentAlignment = androidx.compose.ui.Alignment.Center
                    ) {
                        Text(
                            "Send to Wireline",
                            color = androidx.compose.ui.graphics.Color.White,
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                }
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