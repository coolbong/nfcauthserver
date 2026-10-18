package com.orca.nfcauth

import android.app.PendingIntent
import android.content.Intent
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material.icons.filled.Science
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.orca.nfcauth.ui.ScanViewModel
import com.orca.nfcauth.ui.screen.HistoryScreen
import com.orca.nfcauth.ui.screen.MainScannerScreen
import com.orca.nfcauth.ui.screen.SimulatorScreen
import com.orca.nfcauth.ui.theme.BgDark
import com.orca.nfcauth.ui.theme.CardDark
import com.orca.nfcauth.ui.theme.NfcAuthDemoTheme
import com.orca.nfcauth.ui.theme.PrimaryBlue
import com.orca.nfcauth.ui.theme.TextMuted
import com.orca.nfcauth.ui.theme.WarningAmber

enum class AppTab(val title: String, val icon: ImageVector) {
    SCANNER("스캔", Icons.Filled.Nfc),
    HISTORY("이력", Icons.Filled.History),
    SIMULATOR("시뮬레이터", Icons.Filled.Science)
}

class MainActivity : ComponentActivity() {

    private val viewModel: ScanViewModel by viewModels()
    private var nfcAdapter: NfcAdapter? = null
    private var pendingIntent: PendingIntent? = null

    private val currentTab = mutableStateOf(AppTab.SCANNER)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        nfcAdapter = NfcAdapter.getDefaultAdapter(this)

        val intentFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, javaClass).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            intentFlags
        )

        // 앱이 NFC 인텐트로 최초 시작된 경우 처리
        handleNfcIntent(intent)

        setContent {
            NfcAuthDemoTheme {
                MainAppScaffold(
                    viewModel = viewModel,
                    selectedTab = currentTab.value,
                    onTabSelected = { currentTab.value = it },
                    isNfcSupported = nfcAdapter != null,
                    isNfcEnabled = nfcAdapter?.isEnabled == true,
                    onOpenNfcSettings = {
                        try {
                            startActivity(Intent(Settings.ACTION_NFC_SETTINGS))
                        } catch (_: Exception) {
                            startActivity(Intent(Settings.ACTION_SETTINGS))
                        }
                    }
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        nfcAdapter?.let { adapter ->
            if (adapter.isEnabled) {
                adapter.enableForegroundDispatch(this, pendingIntent, null, null)
            }
        }
    }

    override fun onPause() {
        super.onPause()
        nfcAdapter?.disableForegroundDispatch(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleNfcIntent(intent)
    }

    private fun handleNfcIntent(intent: Intent?) {
        if (intent == null) return
        val url = extractUrlFromIntent(intent)
        if (!url.isNullOrBlank()) {
            currentTab.value = AppTab.SCANNER
            viewModel.processNfcUrl(url, this)
        }
    }

    private fun extractUrlFromIntent(intent: Intent?): String? {
        if (intent == null) return null

        // 1. Intent dataString 확인 (스킴 필터 등을 통해 전달된 경우)
        intent.dataString?.let { uriStr ->
            if (uriStr.startsWith("http://") || uriStr.startsWith("https://")) {
                return uriStr
            }
        }

        // 2. EXTRA_NDEF_MESSAGES 추출
        val rawMsgs = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableArrayExtra(
                NfcAdapter.EXTRA_NDEF_MESSAGES,
                android.os.Parcelable::class.java
            )
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES)
        }

        if (rawMsgs != null) {
            for (raw in rawMsgs) {
                val msg = raw as? NdefMessage ?: continue
                for (record in msg.records) {
                    try {
                        val uri = record.toUri()
                        if (uri != null && (uri.scheme == "http" || uri.scheme == "https")) {
                            return uri.toString()
                        }
                    } catch (_: Exception) {
                    }

                    // 수동 NDEF RTD_URI 레코드 파싱
                    if (record.tnf == NdefRecord.TNF_WELL_KNOWN &&
                        record.type.contentEquals(NdefRecord.RTD_URI)
                    ) {
                        val payload = record.payload
                        if (payload != null && payload.isNotEmpty()) {
                            val prefix = when (payload[0].toInt()) {
                                0x01 -> "http://www."
                                0x02 -> "https://www."
                                0x03 -> "http://"
                                0x04 -> "https://"
                                else -> ""
                            }
                            val body = String(payload, 1, payload.size - 1, Charsets.UTF_8)
                            val fullUrl = prefix + body
                            if (fullUrl.startsWith("http://") || fullUrl.startsWith("https://")) {
                                return fullUrl
                            }
                        }
                    }
                }
            }
        }

        return null
    }
}

@Composable
fun MainAppScaffold(
    viewModel: ScanViewModel,
    selectedTab: AppTab,
    onTabSelected: (AppTab) -> Unit,
    isNfcSupported: Boolean,
    isNfcEnabled: Boolean,
    onOpenNfcSettings: () -> Unit
) {
    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = CardDark,
                contentColor = Color.White
            ) {
                AppTab.values().forEach { tab ->
                    NavigationBarItem(
                        icon = { Icon(tab.icon, contentDescription = tab.title) },
                        label = {
                            Text(
                                text = tab.title,
                                fontSize = 12.sp,
                                fontWeight = if (selectedTab == tab) FontWeight.Bold else FontWeight.Normal
                            )
                        },
                        selected = selectedTab == tab,
                        onClick = {
                            if (tab == AppTab.SCANNER) {
                                viewModel.resetToIdle()
                            }
                            onTabSelected(tab)
                        },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = PrimaryBlue,
                            selectedTextColor = PrimaryBlue,
                            unselectedIconColor = TextMuted,
                            unselectedTextColor = TextMuted,
                            indicatorColor = Color(0xFF1E3A8A).copy(alpha = 0.5f)
                        )
                    )
                }
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(BgDark)
                .padding(innerPadding)
        ) {
            when (selectedTab) {
                AppTab.SCANNER -> {
                    MainScannerScreen(
                        viewModel = viewModel,
                        modifier = Modifier.fillMaxSize()
                    )
                }
                AppTab.HISTORY -> {
                    HistoryScreen(
                        viewModel = viewModel,
                        modifier = Modifier.fillMaxSize()
                    )
                }
                AppTab.SIMULATOR -> {
                    SimulatorScreen(
                        viewModel = viewModel,
                        onNavigateToScanner = { onTabSelected(AppTab.SCANNER) },
                        modifier = Modifier.fillMaxSize()
                    )
                }
            }

            // NFC 꺼짐 안내 배너
            if (isNfcSupported && !isNfcEnabled) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(WarningAmber.copy(alpha = 0.95f))
                        .clickable { onOpenNfcSettings() }
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                        .align(Alignment.TopCenter),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Filled.Warning,
                        contentDescription = "NFC 꺼짐",
                        tint = Color.Black,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "기기의 NFC가 꺼져 있습니다. 터치하여 켜기",
                        color = Color.Black,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}
