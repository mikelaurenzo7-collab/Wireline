package com.wireline.app.ui.theme

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Grok Certified - Unified robofuturistic design tokens
object WirelineTokens {
    val DarkBase = Color(0xFF0A0A0F)
    val Cyan = Color(0xFF00F5FF)
    val Magenta = Color(0xFFFF00AA)
    val SharpCorner = 4.dp // Sharp brutalist corners
}

@Composable
fun WirelineTheme(content: @Composable () -> Unit) {
    val colorScheme = darkColorScheme(
        primary = WirelineTokens.Cyan,
        secondary = WirelineTokens.Magenta,
        background = WirelineTokens.DarkBase
    )
    MaterialTheme(
        colorScheme = colorScheme,
        shapes = Shapes(
            extraSmall = RoundedCornerShape(WirelineTokens.SharpCorner),
            small = RoundedCornerShape(WirelineTokens.SharpCorner),
            medium = RoundedCornerShape(WirelineTokens.SharpCorner)
        ),
        content = content
    )
}