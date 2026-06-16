package com.example.wireline.theme

import androidx.compose.ui.graphics.Color

/**
 * Wireline Rich Cream + Purple — exact tokens from src/index.css (web source of truth).
 * Desktop/laptop is the primary viewport on web; iOS/Android native apps are the
 * canonical mobile surfaces. Dark mode is the editorial default.
 */
object WirelineColors {
    // Light (Rich Cream paper)
    val Paper = Color(0xFFF5F1E8)
    val PaperWarm = Color(0xFFECE6D9)
    val Ink = Color(0xFF1A1614)
    val Brand = Color(0xFF8B3FD6)          // --primary light
    val BrandDeep = Color(0xFF6B2B99)
    val Signal = Color(0xFF10B981)
    val Destructive = Color(0xFFE8466A)
    val AccentTint = Color(0xFF8B3FD6).copy(alpha = 0.08f)
    val Border = Color(0xFF1A1614).copy(alpha = 0.10f)

    // Dark (Velvet editorial)
    val Velvet = Color(0xFF1A1225)
    val BackgroundDark = Color(0xFF0F0C17)
    val InkDark = Color(0xFFF3E8FF)
    val BrandDark = Color(0xFF9B5CE0)     // --primary dark
    val BrandDeepDark = Color(0xFF6B2B99)
    val SignalDark = Color(0xFF10B981)
    val DestructiveDark = Color(0xFFEF4444)
    val AccentTintDark = Color(0xFF9B5CE0).copy(alpha = 0x38 / 255f)
    val BorderDark = Color(0xFF9B5CE0).copy(alpha = 0.18f)
}