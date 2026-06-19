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
 * Wireline Design System — **Lavender Noir** (native dark).
 * Tokens mirror `src/index.css` `.dark` + `:root` violet scale and
 * `ios/Wireline/Theme/WirelineTheme.swift`.
 */
object Brand {
    // ── Surfaces (`.dark`) ───────────────────────────────────────────────────
    val Canvas = Color(0xFF1E1B2E)
    val Panel = Color(0xFF2A2540)
    val Panel2 = Color(0xFF342E4C)
    val Raised = Color(0xFF3D3654)

    // ── Text ─────────────────────────────────────────────────────────────────
    val Text = Color(0xFFF3EFFA)
    val Text2 = Color(0xFFB8B0CA)
    val Text3 = Color(0xFF7A7194)

    // ── Violet accent ────────────────────────────────────────────────────────
    val Violet = Color(0xFF7C3AED)
    val VioletSoft = Color(0xFFA78BFA)
    val VioletDeep = Color(0xFF5B21B6)
    val VioletGlass = Color(0x1A7C3AED) // ~10% violet wash

    // ── Semantic ───────────────────────────────────────────────────────────
    val Destructive = Color(0xFFDC2626)
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

    val Border = Color(0x1AF3EFFA) // 10% lavender hairline
    val BorderViolet = Color(0x2E7C3AED) // 18% violet outline

    val RadiusSm = 6.dp
    val RadiusMd = 10.dp
    val RadiusLg = 14.dp
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
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
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
                extraLarge = RoundedCornerShape(18.dp),
            ),
            typography = AppTypography,
            content = content,
        )
    }
}
