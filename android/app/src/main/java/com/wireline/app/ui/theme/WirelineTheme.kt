package com.wireline.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.CompositionLocalProvider
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
    /** Primary purple (`--primary` #8B5CF6). Global accent / tint. */
    val Purple = Color(0xFF8B5CF6)
    /** Deep purple (`--color-brand-deep` #4C1D95). Pressed states, gradient end. */
    val PurpleDeep = Color(0xFF4C1D95)
    /** Muted purple for tertiary accents. */
    val PurpleMuted = Color(0xFFC084FC)

    // ── Paper / Ink ─────────────────────────────────────────────────────
    /** Warm dark paper (`--paper` #09090B). Canvas. */
    val Paper = Color(0xFF09090B)
    /** Slightly warmer dark for cards (`--paper-warm` #020204). */
    val PaperWarm = Color(0xFF020204)
    /** Near-white ink (`--ink` #F8FAFC). Text. */
    val Ink = Color(0xFFF8FAFC)

    // ── Dark surfaces ───────────────────────────────────────────────────
    /** Deep velvet background (`--background` dark #000000). */
    val Velvet = Color(0xFF000000)
    /** Dark mode card surface. */
    val VelvetSurface = Color(0xFF09090B)
    /** Dark mode text. */
    val VelvetInk = Color(0xFFF8FAFC)

    // ── Semantic ────────────────────────────────────────────────────────
    /** Success / live signal (`--wl-signal` #10B981). */
    val Signal = Color(0xFF10B981)
    /** Destructive / error (`--destructive` #EF4444). */
    val Destructive = Color(0xFFEF4444)
}

private val LightColors = darkColorScheme(
    primary = Brand.Purple,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF1E1530),
    onPrimaryContainer = Color(0xFFD4B3FF),
    secondary = Brand.PurpleDeep,
    onSecondary = Color.White,
    secondaryContainer = Brand.PurpleDeep,
    onSecondaryContainer = Color(0xFFD4B3FF),
    tertiary = Brand.PurpleMuted,
    onTertiary = Color.White,
    background = Brand.Velvet,
    onBackground = Brand.VelvetInk,
    surface = Brand.VelvetSurface,
    onSurface = Brand.VelvetInk,
    surfaceVariant = Brand.PaperWarm,
    onSurfaceVariant = Brand.VelvetInk,
    outline = Color(0x2E8B5CF6),
    outlineVariant = Color(0x1E8B5CF6),
    error = Brand.Destructive,
    onError = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = Brand.Purple,
    onPrimary = Color.White,
    primaryContainer = Brand.PurpleDeep,
    onPrimaryContainer = Color(0xFFD4B3FF),
    secondary = Color(0xFF020204),
    onSecondary = Color(0xFFF8FAFC),
    secondaryContainer = Brand.PurpleDeep,
    onSecondaryContainer = Color(0xFFD4B3FF),
    tertiary = Brand.PurpleMuted,
    onTertiary = Color.White,
    background = Brand.Velvet,
    onBackground = Brand.VelvetInk,
    surface = Brand.VelvetSurface,
    onSurface = Brand.VelvetInk,
    surfaceVariant = Color(0xFF020204),
    onSurfaceVariant = Color(0xFFF8FAFC),
    outline = Color(0x2E8B5CF6),        // 18% purple
    outlineVariant = Color(0x1E8B5CF6), // 12% purple
    error = Brand.Destructive,
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WirelineTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colorScheme = DarkColors

    // Tint the system status bar to match the theme
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }

    val customRippleConfiguration = RippleConfiguration(
        color = Brand.Purple
    )

    CompositionLocalProvider(
        LocalRippleConfiguration provides customRippleConfiguration
    ) {
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
}