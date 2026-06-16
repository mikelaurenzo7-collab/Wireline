package com.wireline.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Grok Certified Unified Design System
 * Matches Web (#0a0a0f + cyan/magenta sharp brutalist) and iOS
 */
object WirelineTokens {
    val DarkBase = Color(0xFF0A0A0F)
    val Cyan = Color(0xFF00F5FF)
    val Magenta = Color(0xFFFF00AA)
    val Glass = Color(0x14FFFFFF) // ~8% white for glassmorphism
    val SharpCorner = 4.dp
}

@Composable
fun WirelineTheme(content: @Composable () -> Unit) {
    val colorScheme = darkColorScheme(
        primary = WirelineTokens.Cyan,
        secondary = WirelineTokens.Magenta,
        background = WirelineTokens.DarkBase,
        surface = Color(0xFF121217),
        onPrimary = Color.Black,
        onSecondary = Color.White
    )

    MaterialTheme(
        colorScheme = colorScheme,
        shapes = Shapes(
            extraSmall = RoundedCornerShape(WirelineTokens.SharpCorner),
            small = RoundedCornerShape(WirelineTokens.SharpCorner),
            medium = RoundedCornerShape(8.dp),
            large = RoundedCornerShape(12.dp)
        ),
        content = content
    )
}