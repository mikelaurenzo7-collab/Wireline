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
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat

/**
 * Native Android translation of the Stitch Precision system. It stays
 * Material-native while sharing the warm paper surfaces, compact geometry,
 * quiet borders, and forest action color used by web and iOS.
 */
object Brand {
    val Canvas = Color(0xFFF9F9F7)
    val Panel = Color(0xFFFFFFFF)
    val Panel2 = Color(0xFFF4F4F2)
    val Raised = Color(0xFFEEEEEC)
    val Border = Color(0xFFDADAD8)
    val BorderStrong = Color(0xFFAEB8B4)

    val Text = Color(0xFF1A1C1B)
    val Text2 = Color(0xFF414846)
    val Text3 = Color(0xFF717976)

    val Accent = Color(0xFF1A3C34)
    val AccentSoft = Color(0xFFE1E9E6)
    val AccentDeep = Color(0xFF01261F)
    val AccentTint = Color(0x1A1A3C34)

    val Destructive = Color(0xFFBA1A1A)
    val Success = Color(0xFF2D5A27)
    val Signal = Success

    // Legacy aliases keep existing screens compiling. They all resolve to the
    // Stitch forest palette rather than the retired violet palette.
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
    val BorderViolet = Border

    val RadiusSm = 4.dp
    val RadiusMd = 8.dp
    val RadiusLg = 12.dp
}

private val LightColors: ColorScheme = lightColorScheme(
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
                small = RoundedCornerShape(Brand.RadiusSm),
                medium = RoundedCornerShape(Brand.RadiusMd),
                large = RoundedCornerShape(Brand.RadiusLg),
                extraLarge = RoundedCornerShape(16.dp),
            ),
            typography = AppTypography,
            content = content,
        )
    }
}
