package com.wireline.app.ui

/**
 * Legacy re-export — all new code should import from `com.wireline.app.ui.theme.WirelineTheme`.
 * This file exists only so old imports don't break during the migration.
 */
import androidx.compose.runtime.Composable
import com.wireline.app.ui.theme.WirelineTheme as ThemedWireline

@Composable
fun WirelineTheme(content: @Composable () -> Unit) {
    ThemedWireline(content = content)
}
