package com.wireline.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat

/**
 * Wireline Design System — Rich Cream + Purple
 *
 * Tokens mirror the web (`src/index.css`) and iOS (`WirelineTheme.swift`) so
 * all three platforms feel like the same product. Light mode uses the warm cream
 * paper with dark ink typography; dark mode uses deep velvet purple-blacks.
 */
object Brand {
    // ── Core brand ──────────────────────────────────────────────────────
    /** Primary purple (`--primary` #4F1E7B). Global accent / tint. */
    val Purple = Color(0xFF4F1E7B)
    /** Deep purple (`--color-brand-deep` #3B154C). Pressed states, gradient end. */
    val PurpleDeep = Color(0xFF3B154C)
    /** Muted purple for tertiary accents. */
    val PurpleMuted = Color(0xFF8B6FA8)

    // ── Paper / Ink ─────────────────────────────────────────────────────
    /** Warm cream paper (`--paper` #EFE9DC). Light mode canvas. */
    val Paper = Color(0xFFEFE9DC)
    /** Slightly warmer cream for cards (`--paper-warm` #E5DECE). */
    val PaperWarm = Color(0xFFE5DECE)
    /** Near-black ink (`--ink` #1A1614). Light mode text. */
    val Ink = Color(0xFF1A1614)

    // ── Dark surfaces ───────────────────────────────────────────────────
    /** Deep velvet background (`--background` dark #0F0C17). */
    val Velvet = Color(0xFF0F0C17)
    /** Dark mode card surface. */
    val VelvetSurface = Color(0xFF181226)
    /** Dark mode text. */
    val VelvetInk = Color(0xFFF3E8FF)

    // ── Semantic ────────────────────────────────────────────────────────
    /** Success / live signal (`--wl-signal` #10B981). */
    val Signal = Color(0xFF10B981)
    /** Destructive / error (`--destructive` #E8466A). */
    val Destructive = Color(0xFFE8466A)
}

private val LightColors = lightColorScheme(
    primary = Brand.Purple,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFEDE4F2),
    onPrimaryContainer = Brand.PurpleDeep,
    secondary = Brand.PurpleDeep,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFD9CCE8),
    onSecondaryContainer = Brand.PurpleDeep,
    tertiary = Brand.PurpleMuted,
    onTertiary = Color.White,
    background = Brand.Paper,
    onBackground = Brand.Ink,
    surface = Brand.Paper,
    onSurface = Brand.Ink,
    surfaceVariant = Brand.PaperWarm,
    onSurfaceVariant = Color(0xFF5A534A),
    outline = Color(0x1A1A1614),       // 10% ink
    outlineVariant = Color(0x0D1A1614), // 5% ink
    error = Brand.Destructive,
    onError = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF9B5CE0),        // slightly luminous for velvet contrast
    onPrimary = Color.White,
    primaryContainer = Brand.PurpleDeep,
    onPrimaryContainer = Color(0xFFD4B3FF),
    secondary = Color(0xFF261A38),
    onSecondary = Color(0xFFF3E8FF),
    secondaryContainer = Color(0xFF3B154C),
    onSecondaryContainer = Color(0xFFD4B3FF),
    tertiary = Brand.PurpleMuted,
    onTertiary = Color.White,
    background = Brand.Velvet,
    onBackground = Brand.VelvetInk,
    surface = Brand.VelvetSurface,
    onSurface = Brand.VelvetInk,
    surfaceVariant = Color(0xFF1E1530),
    onSurfaceVariant = Color(0xFFB89AD9),
    outline = Color(0x2E9B5CE0),        // 18% purple
    outlineVariant = Color(0x1E9B5CE0), // 12% purple
    error = Color(0xFFEF4444),
    onError = Color.White,
)

private val AppTypography = Typography(
    displayLarge = Typography().displayLarge.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Serif),
    displayMedium = Typography().displayMedium.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Serif),
    displaySmall = Typography().displaySmall.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Serif),
    headlineLarge = Typography().headlineLarge.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Serif),
    headlineMedium = Typography().headlineMedium.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Serif),
    headlineSmall = Typography().headlineSmall.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Serif),
    titleLarge = Typography().titleLarge.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    titleMedium = Typography().titleMedium.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    titleSmall = Typography().titleSmall.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    bodyLarge = Typography().bodyLarge.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    bodyMedium = Typography().bodyMedium.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    bodySmall = Typography().bodySmall.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    labelLarge = Typography().labelLarge.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace),
    labelMedium = Typography().labelMedium.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace),
    labelSmall = Typography().labelSmall.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace),
)

@Composable
fun WirelineTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColors else LightColors

    // Tint the system status bar to match the theme
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        shapes = Shapes(
            extraSmall = RoundedCornerShape(4.dp),
            small = RoundedCornerShape(6.dp),
            medium = RoundedCornerShape(8.dp),
            large = RoundedCornerShape(12.dp),
            extraLarge = RoundedCornerShape(16.dp),
        ),
        typography = AppTypography,
        content = content,
    )
}