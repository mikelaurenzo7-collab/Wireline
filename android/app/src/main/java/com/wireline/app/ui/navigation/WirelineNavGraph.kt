package com.wireline.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.wireline.app.ui.root.RootTabScreen
import com.wireline.app.ui.ask.AskWirelineScreen

/**
 * Main navigation graph for Wireline Android app
 */
@Composable
fun WirelineNavGraph(navController: NavHostController) {
    NavHost(
        navController = navController,
        startDestination = "root"
    ) {
        composable("root") {
            RootTabScreen(
                onAskWireline = { navController.navigate("ask") }
            )
        }
        composable("ask") {
            AskWirelineScreen(
                onBack = { navController.popBackStack() }
            )
        }
    }
}