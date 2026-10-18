package com.orca.nfcauth.ui.screen

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.orca.nfcauth.ui.ScanUiState
import com.orca.nfcauth.ui.ScanViewModel
import com.orca.nfcauth.ui.components.DigitalCertificateDialog
import com.orca.nfcauth.ui.components.RadarScanAnimation
import com.orca.nfcauth.ui.components.TechnicalInspectorSheet
import com.orca.nfcauth.ui.components.VerificationResultCard
import com.orca.nfcauth.ui.theme.BgDark
import com.orca.nfcauth.ui.theme.PrimaryBlue
import com.orca.nfcauth.ui.theme.TextMuted

@Composable
fun MainScannerScreen(
    viewModel: ScanViewModel,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()

    var showCertificate by remember { mutableStateOf(false) }
    var showInspector by remember { mutableStateOf(false) }

    val currentResponse = (uiState as? ScanUiState.Success)?.response
        ?: (uiState as? ScanUiState.Warning)?.response

    val currentPayload = (uiState as? ScanUiState.Success)?.payload
        ?: (uiState as? ScanUiState.Warning)?.payload
        ?: (uiState as? ScanUiState.Error)?.payload

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(BgDark)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // 상단 상태 바
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "NFC AUTHENTICATOR",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = PrimaryBlue,
                        letterSpacing = 2.sp
                    )
                    Text(
                        text = "정품 보안 인증 시스템",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }

                // 서버 상태 배지
                Row(
                    modifier = Modifier
                        .background(Color(0xFF1E293B), RoundedCornerShape(20.dp))
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .background(Color(0xFF10B981), CircleShape)
                    )
                    Text("Supabase Live", fontSize = 11.sp, color = Color.White, fontWeight = FontWeight.Medium)
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // 중앙 콘텐츠 (대기 상태 or 로딩 or 결과 카드)
            when (val state = uiState) {
                is ScanUiState.Idle -> {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(vertical = 32.dp)
                    ) {
                        RadarScanAnimation()

                        Spacer(modifier = Modifier.height(32.dp))

                        Text(
                            text = "NFC 카드를 스마트폰 뒷면에 태깅하세요",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            textAlign = TextAlign.Center
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        Text(
                            text = "하드웨어 암호 칩에서 생성된 동적 서명을\n실시간으로 분석하여 정품 여부를 판별합니다.",
                            fontSize = 13.sp,
                            color = TextMuted,
                            textAlign = TextAlign.Center,
                            lineHeight = 18.sp
                        )
                    }
                }
                is ScanUiState.Verifying -> {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(vertical = 60.dp)
                    ) {
                        CircularProgressIndicator(
                            color = PrimaryBlue,
                            strokeWidth = 3.dp,
                            modifier = Modifier.size(56.dp)
                        )

                        Spacer(modifier = Modifier.height(24.dp))

                        Text(
                            text = "보안 암호화 서명 검증 중...",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        Text(
                            text = "UID: ${state.payload.uid.uppercase()}",
                            fontSize = 12.sp,
                            color = PrimaryBlue,
                            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                        )
                    }
                }
                else -> {
                    VerificationResultCard(
                        uiState = state,
                        onShowCertificate = { showCertificate = true },
                        onShowInspector = { showInspector = true },
                        onReset = { viewModel.resetToIdle() }
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // 하단 팁 가이드
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF1E293B).copy(alpha = 0.6f), RoundedCornerShape(14.dp))
                    .padding(14.dp)
            ) {
                Text(
                    text = "💡 카드가 없으신가요? 하단 '시뮬레이터' 탭에서 복제/위조/정품 시나리오를 원클릭으로 테스트할 수 있습니다.",
                    fontSize = 11.sp,
                    color = TextMuted,
                    lineHeight = 16.sp
                )
            }
        }

        // 디지털 보증서 다이얼로그
        if (showCertificate) {
            DigitalCertificateDialog(
                response = currentResponse,
                onDismiss = { showCertificate = false }
            )
        }

        // 기술 데이터 인스펙터 바텀시트
        if (showInspector) {
            TechnicalInspectorSheet(
                payload = currentPayload,
                response = currentResponse,
                onDismiss = { showInspector = false }
            )
        }
    }
}
