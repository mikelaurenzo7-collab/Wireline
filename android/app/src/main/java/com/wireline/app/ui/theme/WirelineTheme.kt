package com.wireline.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RippleConfiguration
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat

/**
 * Native Android translation of Wireline Letterpress.
 * Material remains native; Wireline supplies warm paper surfaces,
 * forest actions, compact geometry, and calm system hierarchy.
 */
object Brand {
    val Canvas = WirelineDesignTokens.ColorToken.colorCanvasDefault
    val Panel = WirelineDesignTokens.ColorToken.colorSurfaceDefault
    val Panel2 = WirelineDesignTokens.ColorToken.colorSurfaceSubtle
    val Raised = WirelineDesignTokens.ColorToken.colorSurfaceContainer
    val Border = WirelineDesignTokens.ColorToken.colorBorderDefault
    val BorderStrong = WirelineDesignTokens.ColorToken.colorBorderStrong

    val Text = WirelineDesignTokens.ColorToken.colorTextPrimary
    val Text2 = WirelineDesignTokens.ColorToken.colorTextSecondary
    val Text3 = WirelineDesignTokens.ColorToken.colorTextSecondary.copy(alpha = 0.72f)

    val Primary = WirelineDesignTokens.ColorToken.colorActionPrimaryDefault
    val PrimaryContainer = WirelineDesignTokens.ColorToken.colorActionPrimaryDefault
    val PrimaryFixed = WirelineDesignTokens.ColorToken.colorSurfaceSubtle
    val PrimaryFixedDim = WirelineDesignTokens.ColorToken.colorSurfaceContainer
    val Accent = PrimaryContainer
    val AccentSoft = WirelineDesignTokens.ColorToken.colorActionPrimaryContainer
    val AccentDeep = WirelineDesignTokens.ColorToken.colorTextPrimary
    val AccentTint = WirelineDesignTokens.ColorToken.colorActionPrimaryContainer
    val Wire = WirelineDesignTokens.ColorToken.colorActionSecondaryDefault
    val WireSoft = WirelineDesignTokens.ColorToken.colorActionSecondaryContainer

    val Destructive = WirelineDesignTokens.ColorToken.colorStatusError
    val Success = WirelineDesignTokens.ColorToken.colorStatusSuccess

    val RadiusSm = WirelineDesignTokens.Metric.radiusSm
    val RadiusMd = WirelineDesignTokens.Metric.radiusMd
    val RadiusLg = WirelineDesignTokens.Metric.radiusLg
    val RadiusXl = WirelineDesignTokens.Metric.radiusXl
}

private val LightColors: ColorScheme = lightColorScheme(
    primary = Brand.Primary,
    onPrimary = Color.White,
    primaryContainer = Brand.PrimaryContainer,
    onPrimaryContainer = Brand.AccentDeep,
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

val WirelineTypography = Typography(
    displayLarge = androidx.compose.ui.text.TextStyle(
        fontSize = WirelineDesignTokens.Metric.typographyDisplaySize.sp,
        fontWeight = FontWeight.SemiBold,
        lineHeight = (WirelineDesignTokens.Metric.typographyDisplaySize * 1.15f).sp,
    ),
    headlineLarge = androidx.compose.ui.text.TextStyle(
        fontSize = WirelineDesignTokens.Metric.typographyH1Size.sp,
        fontWeight = FontWeight.SemiBold,
        lineHeight = (WirelineDesignTokens.Metric.typographyH1Size * 1.2f).sp,
    ),
    bodyLarge = androidx.compose.ui.text.TextStyle(
        fontSize = WirelineDesignTokens.Metric.typographyBodySize.sp,
        fontWeight = FontWeight.Normal,
        lineHeight = WirelineDesignTokens.Metric.typographyBodyLineHeight.sp,
    ),
    bodyMedium = androidx.compose.ui.text.TextStyle(
        fontSize = WirelineDesignTokens.Metric.typographyBodySize.sp,
        fontWeight = FontWeight.SemiBold,
        lineHeight = WirelineDesignTokens.Metric.typographyBodyLineHeight.sp,
    ),
    labelSmall = androidx.compose.ui.text.TextStyle(
        fontSize = WirelineDesignTokens.Metric.typographyCaptionSize.sp,
        fontWeight = FontWeight.Normal,
        lineHeight = (WirelineDesignTokens.Metric.typographyCaptionSize * 1.4f).sp,
    ),
)

// Letterpress hierarchy on native: display/headline use the system serif (carrying
// Instrument Serif's serif-display character at regular weight), labels use the
// system monospace (echoing Space Mono), body stays in the system sans.
private val AppTypography = WirelineTypography.copy(
    displayLarge = WirelineTypography.displayLarge.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Normal, letterSpacing = (-0.64).sp),
    displayMedium = WirelineTypography.displayMedium.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Normal, letterSpacing = (-0.56).sp),
    headlineLarge = WirelineTypography.headlineLarge.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Normal, letterSpacing = (-0.4).sp),
    bodyLarge = WirelineTypography.bodyLarge.copy(fontFamily = FontFamily.SansSerif),
    bodyMedium = WirelineTypography.bodyMedium.copy(fontFamily = FontFamily.SansSerif),
    labelSmall = WirelineTypography.labelSmall.copy(fontFamily = FontFamily.Monospace, letterSpacing = (0.8).sp),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WirelineTheme(content: @Composable () -> Unit) {
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
                small = RoundedCornerShape(Brand.RadiusMd),
                medium = RoundedCornerShape(Brand.RadiusLg),
                large = RoundedCornerShape(Brand.RadiusLg),
                extraLarge = RoundedCornerShape(Brand.RadiusXl),
            ),
            typography = AppTypography,
            content = content,
        )
    }
}
