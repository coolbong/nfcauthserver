package com.orca.nfcauth.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.orca.nfcauth.data.model.NfcPayload
import com.orca.nfcauth.data.model.VerificationResponse
import com.orca.nfcauth.ui.theme.CardDark
import com.orca.nfcauth.ui.theme.PrimaryBlue
import com.orca.nfcauth.ui.theme.TextMuted

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TechnicalInspectorSheet(
    payload: NfcPayload?,
    response: VerificationResponse?,
    onDismiss: () -> Unit
) {
    if (payload == null) return

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = CardDark,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp)
        ) {
            Text(
                text = "🔬 기술 상세 검증 데이터 (Technical Inspector)",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = "NTAG 424 DNA 하드웨어 암호화 서명 및 서버 연산 지표입니다.",
                fontSize = 12.sp,
                color = TextMuted
            )

            Spacer(modifier = Modifier.height(16.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF0F172A), RoundedCornerShape(16.dp))
                    .padding(16.dp)
            ) {
                InspectorRow("UID (7-byte Hex)", payload.uid.uppercase())
                HorizontalDivider(color = Color(0xFF1E293B), thickness = 1.dp, modifier = Modifier.padding(vertical = 8.dp))

                InspectorRow("SDM 카운터 (Hex)", payload.counterHex)
                HorizontalDivider(color = Color(0xFF1E293B), thickness = 1.dp, modifier = Modifier.padding(vertical = 8.dp))

                InspectorRow("SDM 카운터 (Dec)", "#${response?.counter ?: "N/A"}")
                HorizontalDivider(color = Color(0xFF1E293B), thickness = 1.dp, modifier = Modifier.padding(vertical = 8.dp))

                InspectorRow("SDMMAC (8B Truncated)", payload.mac)
                HorizontalDivider(color = Color(0xFF1E293B), thickness = 1.dp, modifier = Modifier.padding(vertical = 8.dp))

                InspectorRow("적용 키 번호 (KID)", "#${payload.kid}")
                HorizontalDivider(color = Color(0xFF1E293B), thickness = 1.dp, modifier = Modifier.padding(vertical = 8.dp))

                InspectorRow("서버 응답 지연 (Latency)", "${response?.latencyMs ?: 0} ms", valueColor = PrimaryBlue)
                HorizontalDivider(color = Color(0xFF1E293B), thickness = 1.dp, modifier = Modifier.padding(vertical = 8.dp))

                InspectorRow("DB 암호화", "AES-256-GCM Envelope Encryption", valueColor = Color(0xFF10B981))
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "원시 NDEF URI:",
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = TextMuted
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = payload.rawUrl,
                fontSize = 11.sp,
                color = Color(0xFF94A3B8),
                fontFamily = FontFamily.Monospace,
                lineHeight = 15.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF0F172A), RoundedCornerShape(8.dp))
                    .padding(10.dp)
            )

            Spacer(modifier = Modifier.height(20.dp))

            Button(
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("확인 완료")
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
private fun InspectorRow(label: String, value: String, valueColor: Color = Color.White) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text = label, fontSize = 12.sp, color = TextMuted)
        Text(
            text = value,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = valueColor,
            fontFamily = FontFamily.Monospace
        )
    }
}
