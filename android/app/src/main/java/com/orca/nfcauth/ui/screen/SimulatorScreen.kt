package com.orca.nfcauth.ui.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.orca.nfcauth.ui.MockType
import com.orca.nfcauth.ui.ScanViewModel
import com.orca.nfcauth.ui.theme.BgDark
import com.orca.nfcauth.ui.theme.CardDark
import com.orca.nfcauth.ui.theme.DangerRed
import com.orca.nfcauth.ui.theme.PrimaryBlue
import com.orca.nfcauth.ui.theme.SuccessGreen
import com.orca.nfcauth.ui.theme.TextMuted
import com.orca.nfcauth.ui.theme.WarningAmber

@Composable
fun SimulatorScreen(
    viewModel: ScanViewModel,
    onNavigateToScanner: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(BgDark)
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
    ) {
        Column(modifier = Modifier.padding(top = 8.dp, bottom = 16.dp)) {
            Text(
                text = "DEMO SIMULATOR",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = PrimaryBlue,
                letterSpacing = 2.sp
            )
            Text(
                text = "원클릭 가상 태깅 시뮬레이터",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
        }

        Text(
            text = "실물 NFC 카드가 없거나 다양한 에러 시나리오를 즉석에서 시연할 수 있는 데모 전용 도구입니다.",
            fontSize = 13.sp,
            color = TextMuted,
            lineHeight = 18.sp
        )

        Spacer(modifier = Modifier.height(20.dp))

        // 1. 정상 정품 태깅
        SimCard(
            title = "1. 정상 정품 카드 태깅",
            desc = "카운터가 1 증가된 정상 NTAG 424 DNA 카드가 탭되는 상황을 시연합니다.",
            buttonText = "🟢 정품 카드 태깅 시연",
            buttonColor = SuccessGreen,
            onClick = {
                viewModel.triggerMock(MockType.AUTHENTIC, context)
                onNavigateToScanner()
            }
        )

        Spacer(modifier = Modifier.height(14.dp))

        // 2. 복제 카드 (리플레이 공격)
        SimCard(
            title = "2. 복제 카드 (카운터 재전송)",
            desc = "이전에 이미 인증된 카운터 값을 복제하여 다시 태깅할 때 서버가 차단하는 모습을 시연합니다.",
            buttonText = "🟠 복제 태그 시연 (리플레이)",
            buttonColor = WarningAmber,
            onClick = {
                viewModel.triggerMock(MockType.COUNTER_REPLAY, context)
                onNavigateToScanner()
            }
        )

        Spacer(modifier = Modifier.height(14.dp))

        // 3. 위조 카드 (서명 불일치)
        SimCard(
            title = "3. 위조품 태그 (서명 불일치)",
            desc = "임의의 위조 카드로 태깅하여 AES-CMAC 서명이 불일치할 때 위조품으로 경고하는 모습을 시연합니다.",
            buttonText = "🔴 위조품 태그 시연",
            buttonColor = DangerRed,
            onClick = {
                viewModel.triggerMock(MockType.INVALID_MAC, context)
                onNavigateToScanner()
            }
        )

        Spacer(modifier = Modifier.height(14.dp))

        // 4. 미등록 카드
        SimCard(
            title = "4. 미등록 태그",
            desc = "시스템 DB에 등록되지 않은 외부 NFC 카드가 탭되었을 때의 안내 화면을 시연합니다.",
            buttonText = "⚪ 미등록 태그 시연",
            buttonColor = Color(0xFF64748B),
            onClick = {
                viewModel.triggerMock(MockType.UNREGISTERED, context)
                onNavigateToScanner()
            }
        )

        Spacer(modifier = Modifier.height(40.dp))
    }
}

@Composable
private fun SimCard(
    title: String,
    desc: String,
    buttonText: String,
    buttonColor: Color,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = title,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = desc,
                fontSize = 12.sp,
                color = TextMuted,
                lineHeight = 16.sp
            )

            Spacer(modifier = Modifier.height(12.dp))

            Button(
                onClick = onClick,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = buttonColor, contentColor = Color.White)
            ) {
                Text(buttonText, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            }
        }
    }
}
