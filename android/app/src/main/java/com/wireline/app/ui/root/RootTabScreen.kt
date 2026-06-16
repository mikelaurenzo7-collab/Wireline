package com.wireline.app.ui.root

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Call
import com.wireline.app.ui.theme.WirelineTheme
import com.wireline.app.ui.workspace.WorkspaceScreen
import com.wireline.app.ui.calls.CallsScreen

/**
 * Root bottom navigation for Android app
 * Mirrors iOS RootTabView structure
 */
@Composable
fun RootTabScreen() {
    var selectedTab by remember { mutableStateOf(0) }

    WirelineTheme {
        Scaffold(
            bottomBar = {
                NavigationBar {
                    NavigationBarItem(
                        selected = selectedTab == 0,
                        onClick = { selectedTab = 0 },
                        icon = { Icon(Icons.Default.Home, contentDescription = null) },
                        label = { Text("Workspace") }
                    )
                    NavigationBarItem(
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 },
                        icon = { Icon(Icons.Default.Call, contentDescription = null) },
                        label = { Text("Calls") }
                    )
                }
            }
        ) { innerPadding ->
            when (selectedTab) {
                0 -> WorkspaceScreen(
                    modifier = Modifier.padding(innerPadding),
                    onAgentSelected = { /* TODO: Navigate to agent detail */ }
                )
                1 -> CallsScreen(
                    modifier = Modifier.padding(innerPadding),
                    onCallSelected = { /* TODO: Navigate to call detail */ }
                )
            }
        }
    }
}