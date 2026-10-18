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
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.orca.nfcauth.data.model.VerificationResponse
import com.orca.nfcauth.ui.theme.GoldAccent
import com.orca.nfcauth.ui.theme.TextMuted

@Composable
fun DigitalCertificateDialog(
    response: VerificationResponse?,
    onDismiss: () -> Unit
) {
    if (response == null) return

    val product = response.productInfo

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = Color(0xFF0F172A),
            border = androidx.compose.foundation.BorderStroke(
                1.5.dp,
                Brush.linearGradient(
                    colors = listOf(GoldAccent, Color(0xFF94A3B8), GoldAccent)
                )
            ),
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // 골드 실링 아이콘
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .background(GoldAccent.copy(alpha = 0.15f), CircleShape)
                        .border(1.5.dp, GoldAccent, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Verified,
                        contentDescription = "Official Certificate",
                        tint = GoldAccent,
                        modifier = Modifier.size(36.dp)
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                Text(
                    text = "CERTIFICATE OF AUTHENTICITY",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = GoldAccent,
                    letterSpacing = 2.sp
                )

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = "공식 디지털 정품 보증서",
                    fontSize = 19.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White
                )

                Spacer(modifier = Modifier.height(6.dp))

                Text(
                    text = "본 보증서는 하드웨어 암호화 보안 칩을 통해 본 제품이 위변조되지 않은 공식 정품임을 보증합니다.",
                    fontSize = 12.sp,
                    color = TextMuted,
                    textAlign = TextAlign.Center,
                    lineHeight = 17.sp
                )

                Spacer(modifier = Modifier.height(20.dp))

                // 보증서 스펙 카드
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF1E293B), RoundedCornerShape(16.dp))
                        .padding(16.dp)
                ) {
                    CertRow("제조사 / 브랜드", product?.brand ?: "ORCA Limited")
                    HorizontalDivider(color = Color(0xFF334155), thickness = 0.8.dp, modifier = Modifier.padding(vertical = 8.dp))

                    CertRow("공식 모델명", product?.model ?: (response.tagName ?: "정품 에디션"))
                    HorizontalDivider(color = Color(0xFF334155), thickness = 0.8.dp, modifier = Modifier.padding(vertical = 8.dp))

                    CertRow("정품 시리얼", product?.serialNumber ?: "SN-NFC-0001", isMono = true, color = GoldAccent)
                    HorizontalDivider(color = Color(0xFF334155), thickness = 0.8.dp, modifier = Modifier.padding(vertical = 8.dp))

                    CertRow("최초 정품 등록일", response.firstVerifiedAt?.take(10) ?: "2026-10-18")
                    HorizontalDivider(color = Color(0xFF334155), thickness = 0.8.dp, modifier = Modifier.padding(vertical = 8.dp))

                    CertRow("보증 상태", "평생 정품 보증 (ACTIVE)", color = Color(0xFF10B981))
                }

                Spacer(modifier = Modifier.height(20.dp))

                Button(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = GoldAccent, contentColor = Color(0xFF0F172A))
                ) {
                    Text("보증서 닫기", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun CertRow(label: String, value: String, isMono: Boolean = false, color: Color = Color.White) {
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
            color = color,
            fontFamily = if (isMono) FontFamily.Monospace else FontFamily.Default
        )
    }
}
