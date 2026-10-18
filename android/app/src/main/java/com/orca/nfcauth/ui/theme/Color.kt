package com.orca.nfcauth.ui.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.graphics.Color

val BgDark = Color(0xFF0F172A)
val CardDark = Color(0xFF1E293B)
val BorderDark = Color(0xFF334155)

val SuccessGreen = Color(0xFF10B981)
val WarningAmber = Color(0xFFF59E0B)
val DangerRed = Color(0xFFEF4444)
val PrimaryBlue = Color(0xFF38BDF8)
val TextMuted = Color(0xFF94A3B8)
val GoldAccent = Color(0xFFFBBF24)

val DarkColorScheme = darkColorScheme(
    primary = PrimaryBlue,
    background = BgDark,
    surface = CardDark,
    onPrimary = Color.Black,
    onBackground = Color.White,
    onSurface = Color.White
)
