package com.orca.nfcauth.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.orca.nfcauth.data.model.NfcPayload
import com.orca.nfcauth.data.model.VerificationResponse
import com.orca.nfcauth.ui.ScanUiState
import com.orca.nfcauth.ui.theme.CardDark
import com.orca.nfcauth.ui.theme.DangerRed
import com.orca.nfcauth.ui.theme.GoldAccent
import com.orca.nfcauth.ui.theme.SuccessGreen
import com.orca.nfcauth.ui.theme.TextMuted
import com.orca.nfcauth.ui.theme.WarningAmber

@Composable
fun VerificationResultCard(
    uiState: ScanUiState,
    onShowCertificate: () -> Unit,
    onShowInspector: () -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier
) {
    val (themeColor, iconVector, badgeTitle, badgeSubtitle) = when (uiState) {
        is ScanUiState.Success -> {
            Quad(
                SuccessGreen,
                Icons.Default.Check,
                "정품 인증 완료",
                "NFC 보안 서명을 통과한 공식 정품입니다."
            )
        }
        is ScanUiState.Warning -> {
            Quad(
                WarningAmber,
                Icons.Default.Warning,
                "복제 의심 경고 (재전송 감지)",
                "이전에 이미 인증된 카운터입니다. 복제된 카드이거나 복사된 URL입니다."
            )
        }
        is ScanUiState.Error -> {
            Quad(
                DangerRed,
                Icons.Default.Close,
                uiState.title,
                uiState.message
            )
        }
        else -> return
    }

    val response = (uiState as? ScanUiState.Success)?.response
        ?: (uiState as? ScanUiState.Warning)?.response

    val payload = (uiState as? ScanUiState.Success)?.payload
        ?: (uiState as? ScanUiState.Warning)?.payload
        ?: (uiState as? ScanUiState.Error)?.payload

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark),
        border = androidx.compose.foundation.BorderStroke(1.dp, themeColor.copy(alpha = 0.4f))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // 상단 아이콘
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .background(themeColor.copy(alpha = 0.15f), CircleShape)
                    .border(2.dp, themeColor.copy(alpha = 0.5f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = iconVector,
                    contentDescription = null,
                    tint = themeColor,
                    modifier = Modifier.size(36.dp)
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = badgeTitle,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = badgeSubtitle,
                fontSize = 13.sp,
                color = TextMuted,
                textAlign = TextAlign.Center,
                lineHeight = 18.sp
            )

            Spacer(modifier = Modifier.height(20.dp))

            // 상세 데이터 박스
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF0F172A), RoundedCornerShape(16.dp))
                    .padding(16.dp)
            ) {
                response?.productInfo?.let { product ->
                    DataRow("브랜드", product.brand ?: "ORCA Limited")
                    HorizontalDivider(color = Color(0xFF1E293B), thickness = 1.dp, modifier = Modifier.padding(vertical = 6.dp))
                    DataRow("제품명", product.model ?: (response.tagName ?: "정품 인증 모델"))
                    HorizontalDivider(color = Color(0xFF1E293B), thickness = 1.dp, modifier = Modifier.padding(vertical = 6.dp))
                    DataRow("시리얼", product.serialNumber ?: "SN-NFC-0001")
                    HorizontalDivider(color = Color(0xFF1E293B), thickness = 1.dp, modifier = Modifier.padding(vertical = 6.dp))
                }

                payload?.let {
                    DataRow("UID", it.uid.uppercase(), isMono = true)
                    HorizontalDivider(color = Color(0xFF1E293B), thickness = 1.dp, modifier = Modifier.padding(vertical = 6.dp))
                    DataRow("보안 카운터", "#${response?.counter ?: it.counterHex}")
                }

                response?.totalScans?.let { scans ->
                    HorizontalDivider(color = Color(0xFF1E293B), thickness = 1.dp, modifier = Modifier.padding(vertical = 6.dp))
                    DataRow("총 인증 횟수", "${scans}회 인증됨")
                }

                response?.latencyMs?.let { ms ->
                    HorizontalDivider(color = Color(0xFF1E293B), thickness = 1.dp, modifier = Modifier.padding(vertical = 6.dp))
                    DataRow("서버 검증 속도", "${ms}ms", valueColor = PrimaryBlue)
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // 버튼 영역
            if (uiState is ScanUiState.Success) {
                Button(
                    onClick = onShowCertificate,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = GoldAccent, contentColor = Color(0xFF0F172A))
                ) {
                    Text("🏆 디지털 정품 보증서 열기", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                }
                Spacer(modifier = Modifier.height(8.dp))
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onShowInspector,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("🔍 기술 데이터", fontSize = 13.sp)
                }

                Button(
                    onClick = onReset,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF334155))
                ) {
                    Text("닫기", fontSize = 13.sp)
                }
            }
        }
    }
}

@Composable
private fun DataRow(
    label: String,
    value: String,
    isMono: Boolean = false,
    valueColor: Color = Color.White
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text = label, fontSize = 13.sp, color = TextMuted)
        Text(
            text = value,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = valueColor,
            fontFamily = if (isMono) FontFamily.Monospace else FontFamily.Default
        )
    }
}

private data class Quad<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)
val PrimaryBlue = Color(0xFF38BDF8)
