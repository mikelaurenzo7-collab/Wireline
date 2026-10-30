import 'package:flutter/material.dart';
import 'wireline_tokens.generated.dart';

/// BotBound Clear System dark theme for Flutter.
class WirelineTheme {
  WirelineTheme._();

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: WirelineDesignTokens.colorCanvasDefault,
      colorScheme: const ColorScheme.dark(
        primary: WirelineDesignTokens.colorActionPrimaryDefault,
        onPrimary: WirelineDesignTokens.colorTextOnAction,
        surface: WirelineDesignTokens.colorSurfaceDefault,
        onSurface: WirelineDesignTokens.colorTextPrimary,
        error: WirelineDesignTokens.colorStatusError,
        onError: WirelineDesignTokens.colorTextOnAction,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: WirelineDesignTokens.colorCanvasDeeper,
        foregroundColor: WirelineDesignTokens.colorTextPrimary,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardTheme(
        color: WirelineDesignTokens.colorSurfaceDefault,
        shape: RoundedRectangleBorder(
          side: const BorderSide(color: WirelineDesignTokens.colorBorderDefault),
          borderRadius: BorderRadius.circular(WirelineDesignTokens.radiusMedium),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: WirelineDesignTokens.colorActionPrimaryDefault,
          foregroundColor: WirelineDesignTokens.colorTextOnAction,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(WirelineDesignTokens.radiusMedium),
          ),
          padding: const EdgeInsets.symmetric(
            horizontal: WirelineDesignTokens.space4,
            vertical: WirelineDesignTokens.space3,
          ),
        ),
      ),
    );
  }
}
