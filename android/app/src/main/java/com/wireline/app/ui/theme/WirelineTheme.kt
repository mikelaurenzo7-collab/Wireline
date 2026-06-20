package com.wireline.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat

/**
 * Wireline native foundation — quiet warm surfaces, direct typography, and one
 * high-contrast action color. Mirrors the active web product rather than the
 * retired dark-violet presentation.
 */
object Brand {
    // ── Surfaces ─────────────────────────────────────────────────────────────
    val Canvas = Color(0xFFF7F7F5)
    val Panel = Color(0xFFFFFFFF)
    val Panel2 = Color(0xFFF2F2EF)
    val Raised = Color(0xFFEAEAE6)

    // ── Text ─────────────────────────────────────────────────────────────────
    val Text = Color(0xFF1D1D1F)
    val Text2 = Color(0xFF54545B)
    val Text3 = Color(0xFF6E6E73)

    // ── Accent ───────────────────────────────────────────────────────────────
    val Accent = Color(0xFF1D1D1F)
    val AccentSoft = Color(0xFFEAEAE6)
    val AccentDeep = Color(0xFF000000)
    val AccentTint = Color(0x141D1D1F)

    // ── Semantic ─────────────────────────────────────────────────────────────
    val Destructive = Color(0xFFB42318)
    val Success = Color(0xFF267A52)
    val Signal = Text3

    // ── Compatibility aliases ───────────────────────────────────────────────
    val Violet = Accent
    val VioletSoft = AccentSoft
    val VioletDeep = AccentDeep
    val VioletGlass = AccentTint
    val Purple = Accent
    val PurpleDeep = AccentDeep
    val PurpleMuted = AccentSoft
    val Paper = Canvas
    val PaperWarm = Panel2
    val Ink = Text
    val Velvet = Canvas
    val VelvetSurface = Panel
    val VelvetInk = Text

    val Border = Color(0x1F1D1D1F)
    val BorderViolet = Color(0x241D1D1F)

    val RadiusSm = 10.dp
    val RadiusMd = 16.dp
    val RadiusLg = 24.dp
}

private val LightColors = lightColorScheme(
    primary = Brand.Accent,
    onPrimary = Color.White,
    primaryContainer = Brand.AccentSoft,
    onPrimaryContainer = Brand.Text,
    secondary = Brand.Panel2,
    onSecondary = Brand.Text,
    secondaryContainer = Brand.Raised,
    onSecondaryContainer = Brand.Text,
    tertiary = Brand.Text3,
    onTertiary = Color.White,
    background = Brand.Canvas,
    onBackground = Brand.Text,
    surface = Brand.Panel,
    onSurface = Brand.Text,
    surfaceVariant = Brand.Panel2,
    onSurfaceVariant = Brand.Text2,
    outline = Brand.Border,
    outlineVariant = Brand.Border,
    error = Brand.Destructive,
    onError = Color.White,
)

private val AppTypography = Typography(
    displayLarge = Typography().displayLarge.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    displayMedium = Typography().displayMedium.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    displaySmall = Typography().displaySmall.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    headlineLarge = Typography().headlineLarge.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    headlineMedium = Typography().headlineMedium.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    headlineSmall = Typography().headlineSmall.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    titleLarge = Typography().titleLarge.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    titleMedium = Typography().titleMedium.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    titleSmall = Typography().titleSmall.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    bodyLarge = Typography().bodyLarge.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    bodyMedium = Typography().bodyMedium.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    bodySmall = Typography().bodySmall.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    labelLarge = Typography().labelLarge.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    labelMedium = Typography().labelMedium.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
    labelSmall = Typography().labelSmall.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.SansSerif),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WirelineTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colorScheme = LightColors

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            window.statusBarColor = colorScheme.background.toArgb()
            window.navigationBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = true
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = true
        }
    }

    CompositionLocalProvider(LocalRippleConfiguration provides RippleConfiguration(color = Brand.Accent)) {
        MaterialTheme(
            colorScheme = colorScheme,
            shapes = Shapes(
                extraSmall = RoundedCornerShape(Brand.RadiusSm),
                small = RoundedCornerShape(10.dp),
                medium = RoundedCornerShape(Brand.RadiusMd),
                large = RoundedCornerShape(Brand.RadiusLg),
                extraLarge = RoundedCornerShape(28.dp),
            ),
            typography = AppTypography,
            content = content,
        )
    }
}