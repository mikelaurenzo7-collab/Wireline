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
 * Wireline Design System — Stitch Noir native.
 * Mirrors the web Stitch Studio migration and the iOS native tokens.
 */
object Brand {
    // ── Surfaces ─────────────────────────────────────────────────────────────
    val Canvas = Color(0xFF0A0A0C)
    val Panel = Color(0xFF131315)
    val Panel2 = Color(0xFF1B1B1D)
    val Raised = Color(0xFF242428)

    // ── Text ─────────────────────────────────────────────────────────────────
    val Text = Color(0xFFF4F2F7)
    val Text2 = Color(0xFFC7C4D8)
    val Text3 = Color(0xFF908FA1)

    // ── Violet accent ────────────────────────────────────────────────────────
    val Violet = Color(0xFF5D5CFF)
    val VioletSoft = Color(0xFFC1C1FF)
    val VioletDeep = Color(0xFF4643E9)
    val VioletGlass = Color(0x245D5CFF)

    // ── Semantic ───────────────────────────────────────────────────────────
    val Destructive = Color(0xFFEF4444)
    val Success = Color(0xFF3DDCBA)
    val Signal = VioletSoft

    // ── Legacy aliases ─────────────────────────────────────────────────────
    val Purple = Violet
    val PurpleDeep = VioletDeep
    val PurpleMuted = VioletSoft
    val Paper = Canvas
    val PaperWarm = Panel
    val Ink = Text
    val Velvet = Canvas
    val VelvetSurface = Panel
    val VelvetInk = Text

    val Border = Color(0x1AF4F2F7)
    val BorderViolet = Color(0x385D5CFF)

    val RadiusSm = 8.dp
    val RadiusMd = 14.dp
    val RadiusLg = 24.dp
}

private val DarkColors = darkColorScheme(
    primary = Brand.Violet,
    onPrimary = Color.White,
    primaryContainer = Brand.VioletDeep,
    onPrimaryContainer = Brand.Text,
    secondary = Brand.Panel2,
    onSecondary = Brand.Text,
    secondaryContainer = Brand.VioletDeep,
    onSecondaryContainer = Brand.Text,
    tertiary = Brand.VioletSoft,
    onTertiary = Color.White,
    background = Brand.Canvas,
    onBackground = Brand.Text,
    surface = Brand.Panel,
    onSurface = Brand.Text,
    surfaceVariant = Brand.Panel2,
    onSurfaceVariant = Brand.Text2,
    outline = Brand.BorderViolet,
    outlineVariant = Brand.VioletGlass,
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

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            window.statusBarColor = colorScheme.background.toArgb()
            window.navigationBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = false
        }
    }

    CompositionLocalProvider(LocalRippleConfiguration provides RippleConfiguration(color = Brand.Violet)) {
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
