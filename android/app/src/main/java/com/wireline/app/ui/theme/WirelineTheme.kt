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
 * Native Android translation of the current Wireline Precision source system.
 * Material remains native; Wireline supplies pale slate-blue surfaces,
 * precise outlines, compact geometry, and a single signal-blue action language.
 */
object Brand {
    val Canvas = Color(0xFFF8F9FF)
    val Panel = Color(0xFFFFFFFF)
    val Panel2 = Color(0xFFEFF4FF)
    val Raised = Color(0xFFE5EEFF)
    val Border = Color(0xFFC9C4D7)
    val BorderStrong = Color(0xFF797586)

    val Text = Color(0xFF0B1C30)
    val Text2 = Color(0xFF484554)
    val Text3 = Color(0xB8484554)

    val Accent = Color(0xFF5D3FD3)
    val AccentSoft = Color(0xFFD8CEFF)
    val AccentDeep = Color(0xFF1C0062)
    val AccentTint = Color(0x1A5D3FD3)

    val Destructive = Color(0xFFBA1A1A)
    val Success = Color(0xFF2E7D32)
    val Signal = Success

    val RadiusSm = 2.dp
    val RadiusMd = 4.dp
    val RadiusLg = 8.dp
}

private val LightColors: ColorScheme = lightColorScheme(
    primary = Brand.Accent,
    onPrimary = Color.White,
    primaryContainer = Brand.AccentSoft,
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

/** Native platform typography mirrors Signal Blue hierarchy through weight and tracking. */
private val AppTypography = Typography(
    displayLarge = Typography().displayLarge.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.64).sp),
    displayMedium = Typography().displayMedium.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.56).sp),
    displaySmall = Typography().displaySmall.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.48).sp),
    headlineLarge = Typography().headlineLarge.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.48).sp),
    headlineMedium = Typography().headlineMedium.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, letterSpacing = (-0.40).sp),
    headlineSmall = Typography().headlineSmall.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, letterSpacing = (-0.36).sp),
    titleLarge = Typography().titleLarge.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, letterSpacing = (-0.32).sp),
    titleMedium = Typography().titleMedium.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, letterSpacing = (-0.28).sp),
    titleSmall = Typography().titleSmall.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.20).sp),
    bodyLarge = Typography().bodyLarge.copy(fontFamily = FontFamily.SansSerif),
    bodyMedium = Typography().bodyMedium.copy(fontFamily = FontFamily.SansSerif),
    bodySmall = Typography().bodySmall.copy(fontFamily = FontFamily.SansSerif),
    labelLarge = Typography().labelLarge.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, letterSpacing = 0.55.sp),
    labelMedium = Typography().labelMedium.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, letterSpacing = 0.5.sp),
    labelSmall = Typography().labelSmall.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, letterSpacing = 0.45.sp),
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
                extraLarge = RoundedCornerShape(24.dp),
            ),
            typography = AppTypography,
            content = content,
        )
    }
}
