package com.example.wireline.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

/**
 * Wireline Rich Cream + Purple theme (Grok 4.3 + wireline-design contract).
 * Dark (velvet) is the editorial default. Desktop web is the primary viewport;
 * native iOS/Android are the canonical mobile surfaces.
 */
private val DarkColorScheme = darkColorScheme(
    primary = WirelineColors.BrandDark,
    onPrimary = androidx.compose.ui.graphics.Color.White,
    secondary = WirelineColors.Velvet,
    onSecondary = WirelineColors.InkDark,
    tertiary = WirelineColors.SignalDark,
    background = WirelineColors.BackgroundDark,
    onBackground = WirelineColors.InkDark,
    surface = WirelineColors.Velvet,
    onSurface = WirelineColors.InkDark,
    error = WirelineColors.DestructiveDark,
    onError = androidx.compose.ui.graphics.Color.White,
)

private val LightColorScheme = lightColorScheme(
    primary = WirelineColors.Brand,
    onPrimary = androidx.compose.ui.graphics.Color.White,
    secondary = WirelineColors.PaperWarm,
    onSecondary = WirelineColors.Ink,
    tertiary = WirelineColors.Signal,
    background = WirelineColors.Paper,
    onBackground = WirelineColors.Ink,
    surface = WirelineColors.PaperWarm,
    onSurface = WirelineColors.Ink,
    error = WirelineColors.Destructive,
    onError = androidx.compose.ui.graphics.Color.White,
)

@Composable
fun WirelineTheme(
  darkTheme: Boolean = isSystemInDarkTheme(),
  // Dynamic color is available on Android 12+
  dynamicColor: Boolean = true,
  content: @Composable () -> Unit,
) {
  val colorScheme =
    when {
      dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
        val context = LocalContext.current
        if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
      }
      darkTheme -> DarkColorScheme
      else -> LightColorScheme
    }

  MaterialTheme(colorScheme = colorScheme, typography = Typography, content = content)
}
