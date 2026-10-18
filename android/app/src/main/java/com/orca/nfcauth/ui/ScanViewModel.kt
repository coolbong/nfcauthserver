package com.orca.nfcauth.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.orca.nfcauth.data.model.NfcPayload
import com.orca.nfcauth.data.model.VerificationResponse
import com.orca.nfcauth.data.remote.SupabaseApiClient
import com.orca.nfcauth.util.HapticFeedbackUtil
import com.orca.nfcauth.util.NdefUrlParser
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface ScanUiState {
    data object Idle : ScanUiState
    data class Verifying(val payload: NfcPayload) : ScanUiState
    data class Success(val response: VerificationResponse, val payload: NfcPayload) : ScanUiState
    data class Warning(val response: VerificationResponse, val payload: NfcPayload) : ScanUiState
    data class Error(val title: String, val message: String, val payload: NfcPayload? = null) : ScanUiState
}

data class ScanHistoryItem(
    val id: String = java.util.UUID.randomUUID().toString(),
    val payload: NfcPayload,
    val response: VerificationResponse?,
    val isSuccess: Boolean,
    val timestamp: Long = System.currentTimeMillis()
)

enum class MockType {
    AUTHENTIC,
    COUNTER_REPLAY,
    INVALID_MAC,
    UNREGISTERED
}

class ScanViewModel(
    private val apiClient: SupabaseApiClient = SupabaseApiClient()
) : ViewModel() {

    private val _uiState = MutableStateFlow<ScanUiState>(ScanUiState.Idle)
    val uiState: StateFlow<ScanUiState> = _uiState.asStateFlow()

    private val _history = MutableStateFlow<List<ScanHistoryItem>>(emptyList())
    val history: StateFlow<List<ScanHistoryItem>> = _history.asStateFlow()

    // 가상 시뮬레이터용 카운터
    private var mockCounter = 0x000070

    /**
     * NFC 태그 NDEF URL 감지 시 처리
     */
    fun processNfcUrl(rawUrl: String, context: Context) {
        val payload = NdefUrlParser.parse(rawUrl)
        if (payload == null) {
            HapticFeedbackUtil.vibrateError(context)
            _uiState.value = ScanUiState.Error(
                title = "잘못된 NFC 태그",
                message = "정품 인증 파라미터(uid, cnt, mac)가 포함되지 않은 URL입니다.\nRaw: $rawUrl"
            )
            return
        }

        verifyPayload(payload, context)
    }

    /**
     * 검증 API 호출 및 결과 상태 업데이트
     */
    fun verifyPayload(payload: NfcPayload, context: Context) {
        HapticFeedbackUtil.vibrateTap(context)
        _uiState.value = ScanUiState.Verifying(payload)

        viewModelScope.launch {
            val result = apiClient.verifyTag(payload)

            result.onSuccess { response ->
                when (response.resultCode) {
                    "SUCCESS" -> {
                        HapticFeedbackUtil.vibrateSuccess(context)
                        _uiState.value = ScanUiState.Success(response, payload)
                        addHistory(payload, response, true)
                    }
                    "COUNTER_REPLAY" -> {
                        HapticFeedbackUtil.vibrateWarning(context)
                        _uiState.value = ScanUiState.Warning(response, payload)
                        addHistory(payload, response, false)
                    }
                    "INVALID_MAC" -> {
                        HapticFeedbackUtil.vibrateError(context)
                        _uiState.value = ScanUiState.Error(
                            title = "위조 의심 경고 (서명 불일치)",
                            message = "NFC 보안 암호화 서명(CMAC)이 일치하지 않습니다. 복제 또는 위조된 태그입니다.",
                            payload = payload
                        )
                        addHistory(payload, response, false)
                    }
                    "TAG_NOT_FOUND" -> {
                        HapticFeedbackUtil.vibrateWarning(context)
                        _uiState.value = ScanUiState.Error(
                            title = "미등록 태그",
                            message = "시스템에 등록되지 않은 NFC 태그입니다. (UID: ${payload.uid})",
                            payload = payload
                        )
                        addHistory(payload, response, false)
                    }
                    else -> {
                        HapticFeedbackUtil.vibrateError(context)
                        _uiState.value = ScanUiState.Error(
                            title = "인증 거부 (${response.resultCode})",
                            message = response.message ?: "인증에 실패했습니다.",
                            payload = payload
                        )
                        addHistory(payload, response, false)
                    }
                }
            }.onFailure { error ->
                HapticFeedbackUtil.vibrateError(context)
                _uiState.value = ScanUiState.Error(
                    title = "서버 통신 오류",
                    message = error.localizedMessage ?: "서버와 연결할 수 없습니다.",
                    payload = payload
                )
            }
        }
    }

    private fun addHistory(payload: NfcPayload, response: VerificationResponse?, isSuccess: Boolean) {
        val item = ScanHistoryItem(
            payload = payload,
            response = response,
            isSuccess = isSuccess
        )
        _history.value = listOf(item) + _history.value
    }

    fun resetToIdle() {
        _uiState.value = ScanUiState.Idle
    }

    fun clearHistory() {
        _history.value = emptyList()
    }

    /**
     * 시연자용 원클릭 가상 태깅 (Mock Simulation)
     */
    fun triggerMock(type: MockType, context: Context) {
        when (type) {
            MockType.AUTHENTIC -> {
                mockCounter += 1
                val cntHex = String.format("%06X", mockCounter)
                // 실제 서버 키로 계산된 테스트 데이터
                val payload = NfcPayload(
                    uid = "04de5f1eacc040",
                    counterHex = cntHex,
                    mac = "94EED9EE65337086", // 데모용
                    kid = "1",
                    rawUrl = "https://coolbong.github.io/nfcauthserver/?uid=04de5f1eacc040&cnt=$cntHex&mac=94EED9EE65337086"
                )
                verifyPayload(payload, context)
            }
            MockType.COUNTER_REPLAY -> {
                // 이전 카운터 재전송
                val payload = NfcPayload(
                    uid = "04de5f1eacc040",
                    counterHex = "00003D",
                    mac = "94EED9EE65337086",
                    kid = "1",
                    rawUrl = "https://coolbong.github.io/nfcauthserver/?uid=04de5f1eacc040&cnt=00003D&mac=94EED9EE65337086"
                )
                verifyPayload(payload, context)
            }
            MockType.INVALID_MAC -> {
                val payload = NfcPayload(
                    uid = "04de5f1eacc040",
                    counterHex = "000099",
                    mac = "0000000000000000",
                    kid = "1",
                    rawUrl = "https://coolbong.github.io/nfcauthserver/?uid=04de5f1eacc040&cnt=000099&mac=0000000000000000"
                )
                verifyPayload(payload, context)
            }
            MockType.UNREGISTERED -> {
                val payload = NfcPayload(
                    uid = "04999999999999",
                    counterHex = "000001",
                    mac = "1122334455667788",
                    kid = "1",
                    rawUrl = "https://coolbong.github.io/nfcauthserver/?uid=04999999999999&cnt=000001&mac=1122334455667788"
                )
                verifyPayload(payload, context)
            }
        }
    }
}
